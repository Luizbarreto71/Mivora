"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { dbErrorMessage, fail, formBool, formInt, formNullable, formString, success, type ActionState } from "@/lib/admin/action-state";
import { requireAdminAction } from "@/lib/admin/auth";
import { reviewPost, readLine } from "@/lib/vip/core";
import { approveBatch, createBatch, keepPostPhoto, perfumeProducts, preparePost, sendPreview, updatePost, type VipPostRow } from "@/lib/vip/pipeline";
import { instanceStatus, listCommunities, type Community } from "@/lib/vip/zapi";

const uuid = z.uuid();

/** Pastes the day's list: the AI splits it into perfumes, each becomes a pending post. */
export async function createVipBatch(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, user } = await requireAdminAction();
  const list = formString(fd, "list_text");
  if (list.length < 3) return fail("Cole a lista de perfumes do dia.");
  if (list.length > 20000) return fail("A lista é grande demais. Divida em listas menores.");
  const res = await createBatch(supabase, list, user.id);
  if (!res.ok) return fail(res.message);
  redirect(`/admin/comunidade-vip/${res.batchId}`);
}

/** Researches and writes one post (the page calls it for each pending post, one after the other). */
export async function prepareVipPost(postId: string, forceResearch = false) {
  const { supabase } = await requireAdminAction();
  const res = await preparePost(supabase, uuid.parse(postId), { forceResearch });
  return res.ok ? { ok: true, status: res.status } : { ok: false, message: res.message };
}

/**
 * The admin's edit of the text and photo counts as their review: the post becomes ready. The photo
 * can be the research's bottle photo, a store product's photo, one the admin sends, or none.
 */
export async function saveVipPost(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireAdminAction();
  const id = uuid.safeParse(formString(fd, "id"));
  if (!id.success) return fail("Post inválido.");
  const body = formString(fd, "body");
  if (body.length < 10) return fail("Escreva o texto do post.");
  if (body.length > 4000) return fail("O texto passou de 4.000 caracteres.");
  const { data } = await supabase.from("vip_posts").select("*, batch:vip_batches(status), fragrance:vip_fragrances(*)").eq("id", id.data).maybeSingle();
  const post = data as (VipPostRow & { batch: { status: string } | null; fragrance: Record<string, unknown> | null }) | null;
  if (!post) return fail("Post não encontrado.");
  if (post.batch?.status !== "rascunho" || !["pronto", "revisar", "erro", "pendente"].includes(post.status)) return fail("Este post já foi aprovado ou não pode mais ser editado.");

  let imageUrl = post.image_url;
  let imageSource = post.image_source ?? (post.image_url && post.product_id ? "loja" : null);
  let productId = post.product_id;
  const file = fd.get("photo_file");
  const choice = formString(fd, "photo");
  if (file instanceof File && file.size > 0) {
    if (file.size > 6 * 1024 * 1024) return fail("A foto passou de 6 MB.");
    const kept = await keepPostPhoto(supabase, id.data, Buffer.from(await file.arrayBuffer()));
    if (!kept) return fail("Não foi possível usar esta foto (use JPG, PNG ou WebP com pelo menos 300 px).");
    imageUrl = kept;
    imageSource = "enviada";
  } else if (choice === "none") {
    imageUrl = null;
    imageSource = "nenhuma";
  } else if (choice === "research") {
    const researched = (post.fragrance?.image_url as string | null | undefined) ?? null;
    if (!researched) return fail("A pesquisa não encontrou foto para este perfume. Envie uma foto ou escolha uma da loja.");
    imageUrl = researched;
    imageSource = (post.fragrance?.image_source as string | null | undefined) ?? "pesquisa";
  } else if (choice.startsWith("product:")) {
    const pid = choice.slice("product:".length);
    if (!uuid.safeParse(pid).success) return fail("Foto inválida.");
    const product = (await perfumeProducts(supabase)).find((p) => p.id === pid);
    if (!product?.image) return fail("Produto sem foto entre os perfumes da loja.");
    imageUrl = product.image;
    imageSource = "loja";
    productId = product.id;
  }
  const { data: settings } = await supabase.from("vip_settings").select("footer").eq("id", 1).maybeSingle();
  const performanceSourced = Boolean(post.fragrance?.longevity || post.fragrance?.sillage);
  const warnings = reviewPost(body, { sourceLine: post.source_line, priceCents: readLine(post.source_line).priceCents, details: post.details }, { footer: (settings?.footer as string | null) ?? null, performanceSourced });
  if (!imageUrl) warnings.push("Post sem foto.");
  const { error } = await updatePost(supabase, id.data, { body, image_url: imageUrl, image_source: imageSource, product_id: productId, status: "pronto", problems: warnings });
  if (error) return fail(dbErrorMessage(error));
  return success(warnings.length ? "Post salvo e marcado como revisado. Confira os avisos em amarelo." : "Post salvo e marcado como revisado.");
}

async function setStatus(postId: string, from: VipPostRow["status"][], to: VipPostRow["status"], extra: Record<string, unknown> = {}) {
  const { supabase } = await requireAdminAction();
  const { data, error } = await supabase.from("vip_posts").update({ status: to, ...extra }).eq("id", uuid.parse(postId)).in("status", from).select("id");
  if (error) return fail(dbErrorMessage(error));
  if (!data?.length) return fail("Este post mudou de situação. Atualize a página.");
  return success();
}

export async function ignoreVipPost(postId: string) {
  return setStatus(postId, ["pendente", "pronto", "revisar", "erro", "agendado", "falhou"], "ignorado");
}

export async function restoreVipPost(postId: string) {
  const { supabase } = await requireAdminAction();
  const { data } = await supabase.from("vip_posts").select("body, batch:vip_batches(status)").eq("id", uuid.parse(postId)).maybeSingle();
  const batch = data?.batch as { status: string } | null | undefined;
  if (batch?.status !== "rascunho") return fail("Só dá para trazer de volta posts de uma lista ainda não aprovada.");
  return setStatus(postId, ["ignorado"], data?.body ? "revisar" : "pendente");
}

/** A failed send goes back to the queue: it leaves at the next clock tick inside the window. */
export async function retryVipPost(postId: string) {
  return setStatus(postId, ["falhou"], "agendado", { scheduled_for: new Date().toISOString(), problems: [] });
}

export async function approveVipBatch(batchId: string) {
  const { supabase, user } = await requireAdminAction();
  const res = await approveBatch(supabase, uuid.parse(batchId), user.id);
  if (!res.ok) return fail(res.message);
  const first = res.first ? new Date(res.first).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "";
  return success(`${res.count} ${res.count === 1 ? "post agendado" : "posts agendados"}${first ? `; o primeiro sai em ${first}` : ""}.`);
}

/** Stops everything of a list that has not gone out yet. Posts already sent stay as they are. */
export async function cancelVipBatch(batchId: string) {
  const { supabase } = await requireAdminAction();
  const id = uuid.parse(batchId);
  const { error } = await supabase.from("vip_posts").update({ status: "ignorado" }).eq("batch_id", id).in("status", ["pendente", "pronto", "revisar", "erro", "agendado", "falhou"]);
  if (error) return fail(dbErrorMessage(error));
  await supabase.from("vip_batches").update({ status: "cancelado" }).eq("id", id);
  return success("Lista cancelada. O que ainda não tinha saído não será enviado.");
}

export async function previewVipPost(postId: string) {
  const { supabase } = await requireAdminAction();
  const res = await sendPreview(supabase, uuid.parse(postId));
  return res.ok ? success("Prévia enviada para o seu WhatsApp.") : fail(res.message);
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use o formato 00:00.");

export async function saveVipSettings(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireAdminAction();
  const first = time.safeParse(formString(fd, "first_post_time"));
  const last = time.safeParse(formString(fd, "last_post_time"));
  if (!first.success || !last.success) return fail("Informe os horários no formato 00:00.");
  if (first.data >= last.data) return fail("O último horário deve ser depois do primeiro.");
  const interval = formInt(fd, "interval_minutes", 90);
  if (interval < 15 || interval > 720) return fail("O intervalo entre posts deve ficar entre 15 e 720 minutos.");
  const dedupe = formInt(fd, "dedupe_days", 7);
  if (dedupe < 0 || dedupe > 90) return fail("O período sem repetir deve ficar entre 0 e 90 dias.");
  const group = formNullable(fd, "announcement_group_id");
  if (group && !/^[0-9]{6,40}(-group)?$/.test(group)) return fail("O código do grupo de avisos deve ter só números (com ou sem “-group” no fim).");
  const previewRaw = formString(fd, "preview_phone").replace(/\D/g, "");
  if (previewRaw && (previewRaw.length < 10 || previewRaw.length > 15)) return fail("Informe o WhatsApp das prévias com DDI e DDD, por exemplo 5511999999999.");
  const footer = formNullable(fd, "footer");
  if (footer && footer.length > 300) return fail("O fechamento deve ter até 300 caracteres.");
  const enabled = formBool(fd, "sending_enabled");
  if (enabled && !group) return fail("Para ligar o envio, escolha o grupo de avisos da comunidade.");
  const { error } = await supabase
    .from("vip_settings")
    .update({
      sending_enabled: enabled,
      community_name: formNullable(fd, "community_name")?.slice(0, 120) ?? null,
      announcement_group_id: group,
      first_post_time: first.data,
      last_post_time: last.data,
      interval_minutes: interval,
      dedupe_days: dedupe,
      footer,
      preview_phone: previewRaw || null,
    })
    .eq("id", 1);
  if (error) return fail(dbErrorMessage(error));
  return success(enabled ? "Configurações salvas. O envio automático está ligado." : "Configurações salvas. O envio automático está desligado.");
}

export async function chooseVipCommunity(name: string, groupId: string) {
  const { supabase } = await requireAdminAction();
  if (!/^[0-9]{6,40}(-group)?$/.test(groupId)) return fail("Código de grupo inválido.");
  const { error } = await supabase.from("vip_settings").update({ community_name: name.slice(0, 120), announcement_group_id: groupId }).eq("id", 1);
  if (error) return fail(dbErrorMessage(error));
  return success(`Comunidade “${name}” escolhida.`);
}

export async function checkVipConnection(): Promise<{ ok: boolean; message: string; communities?: Community[] }> {
  await requireAdminAction();
  const status = await instanceStatus();
  if (!status.ok) return { ok: false, message: status.error };
  if (!status.data.connected) return { ok: false, message: "O número não está conectado na Z-API. Abra o painel da Z-API e leia o QR Code com o WhatsApp do chip da comunidade." };
  const communities = await listCommunities();
  if (!communities.ok) return { ok: true, message: `Número conectado, mas não consegui listar as comunidades: ${communities.error}` };
  return {
    ok: true,
    message: communities.data.length ? "Número conectado. Escolha abaixo a comunidade que vai receber os posts." : "Número conectado, mas ele não participa de nenhuma comunidade. Adicione o número como administrador da comunidade.",
    communities: communities.data,
  };
}
