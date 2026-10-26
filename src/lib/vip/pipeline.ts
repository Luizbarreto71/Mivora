import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { SITE_URL } from "@/lib/env";
import { formatBRL } from "@/lib/money";
import { isServiceRoleConfigured } from "@/lib/supabase/service";
import { aiFailureMessage, researchFragrance, splitList, vipAiConfigured, writePost } from "./ai";
import {
  composeMessage,
  dedupeKey,
  fragranceKey,
  matchProduct,
  readLine,
  reviewPost,
  scheduleSlots,
  simpleListDrafts,
  verifyItem,
  type FragranceSheet,
  type ListItem,
} from "./core";
import { sendToGroup, zapiConfigured } from "./zapi";

type Sb = SupabaseClient;
type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };

export type VipSettings = {
  sending_enabled: boolean;
  community_name: string | null;
  announcement_group_id: string | null;
  first_post_time: string;
  last_post_time: string;
  interval_minutes: number;
  footer: string | null;
  dedupe_days: number;
  preview_phone: string | null;
};

export type VipPostRow = {
  id: string;
  batch_id: string;
  position: number;
  source_line: string;
  brand: string | null;
  name: string;
  concentration: string | null;
  volume_ml: number | null;
  price_cents: number | null;
  details: string | null;
  dedupe_key: string;
  product_id: string | null;
  fragrance_id: string | null;
  image_url: string | null;
  body: string | null;
  status: "pendente" | "pronto" | "revisar" | "erro" | "ignorado" | "agendado" | "enviando" | "enviado" | "falhou";
  problems: string[];
  scheduled_for: string | null;
  sent_at: string | null;
  provider_message_id: string | null;
  attempts: number;
};

export async function loadVipSettings(sb: Sb): Promise<VipSettings | null> {
  const { data } = await sb.from("vip_settings").select("*").eq("id", 1).maybeSingle();
  return (data as VipSettings | null) ?? null;
}

/** What is still missing for the posts to go out by themselves. */
export function sendingBlockers(settings: VipSettings | null) {
  const out: string[] = [];
  if (!zapiConfigured()) out.push("Cadastrar no servidor as chaves da Z-API (ZAPI_INSTANCE_ID e ZAPI_INSTANCE_TOKEN).");
  if (!isServiceRoleConfigured()) out.push("Cadastrar no servidor a chave SUPABASE_SERVICE_ROLE_KEY (o envio automático usa essa chave).");
  if (!settings?.announcement_group_id) out.push("Escolher o grupo de avisos da comunidade em Configurações do envio.");
  if (!settings?.sending_enabled) out.push("Ligar o envio automático em Configurações do envio.");
  return out;
}

const ITEM_FIELDS = (p: VipPostRow): ListItem => ({
  sourceLine: p.source_line,
  brand: p.brand,
  name: p.name,
  details: p.details,
  ...readLine(p.source_line),
});

/** The same perfume (version and size) posted or scheduled in the last days. */
async function recentDuplicate(sb: Sb, key: string, days: number, excludeBatch: string | null) {
  if (days <= 0) return null;
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  let query = sb
    .from("vip_posts")
    .select("status, sent_at, scheduled_for, batch_id")
    .eq("dedupe_key", key)
    .in("status", ["agendado", "enviando", "enviado"])
    .or(`sent_at.gte."${since}",scheduled_for.gte."${since}"`)
    .limit(1);
  if (excludeBatch) query = query.neq("batch_id", excludeBatch);
  const { data } = await query;
  const row = data?.[0] as { status: string; sent_at: string | null; scheduled_for: string | null } | undefined;
  if (!row) return null;
  const when = new Date(row.sent_at ?? row.scheduled_for ?? Date.now()).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return row.status === "enviado"
    ? `Este perfume (mesma versão e tamanho) já foi publicado em ${when}. Ignore para não repetir, ou aprove se for intencional.`
    : `Este perfume (mesma versão e tamanho) já está agendado para ${when}. Ignore para não repetir.`;
}

type PerfumeProduct = { id: string; name: string; image: string | null };

export async function perfumeProducts(sb: Sb): Promise<PerfumeProduct[]> {
  const { data } = await sb
    .from("product_categories")
    .select("product:products(id, name, status, images:product_images(url, is_primary, sort_order)), category:categories!inner(slug)")
    .eq("category.slug", "perfumes");
  const out: PerfumeProduct[] = [];
  for (const row of (data ?? []) as unknown as { product: { id: string; name: string; status: string; images: { url: string; is_primary: boolean; sort_order: number }[] } | null }[]) {
    const p = row.product;
    if (!p || p.status === "archived") continue;
    const images = [...(p.images ?? [])].sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order);
    out.push({ id: p.id, name: p.name, image: images[0]?.url ?? null });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1. The day's list → a batch of pending posts
// ---------------------------------------------------------------------------

export async function createBatch(sb: Sb, listText: string, userId: string): Promise<Result<{ batchId: string; count: number; skipped: number; simpleReader: boolean }>> {
  let drafts;
  let simpleReader = false;
  if (vipAiConfigured()) {
    const split = await splitList(listText);
    if (!split.ok) return { ok: false, message: aiFailureMessage(split.reason) };
    drafts = split.drafts;
  } else {
    drafts = simpleListDrafts(listText);
    simpleReader = true;
  }
  const items = drafts.map((d) => verifyItem(d, listText)).filter((i): i is ListItem => i != null);
  const skipped = drafts.length - items.length;
  if (items.length === 0) return { ok: false, message: "Não encontrei perfumes na lista. Escreva um perfume por linha, com o nome e o preço." };
  if (items.length > 60) return { ok: false, message: "A lista tem mais de 60 perfumes. Divida em listas menores." };

  const [settings, products] = await Promise.all([loadVipSettings(sb), perfumeProducts(sb)]);
  const { data: batch, error } = await sb.from("vip_batches").insert({ list_text: listText, created_by: userId }).select("id").single();
  if (error || !batch) return { ok: false, message: "Não foi possível salvar a lista. Tente novamente." };

  const seen = new Set<string>();
  const rows = [];
  for (const [index, item] of items.entries()) {
    const key = dedupeKey(item);
    const problems = [...item.problems];
    if (seen.has(key)) problems.push("Este perfume aparece mais de uma vez nesta lista.");
    seen.add(key);
    const duplicate = await recentDuplicate(sb, key, settings?.dedupe_days ?? 7, null);
    if (duplicate) problems.push(duplicate);
    const product = matchProduct(item, products);
    rows.push({
      batch_id: batch.id,
      position: index + 1,
      source_line: item.sourceLine.slice(0, 2000),
      brand: item.brand?.slice(0, 120) ?? null,
      name: item.name.slice(0, 200),
      concentration: item.concentration,
      volume_ml: item.volumeMl,
      price_cents: item.priceCents,
      details: item.details?.slice(0, 500) ?? null,
      dedupe_key: key,
      product_id: product?.id ?? null,
      image_url: product?.image ?? null,
      problems,
    });
  }
  const { error: postsError } = await sb.from("vip_posts").insert(rows);
  if (postsError) {
    await sb.from("vip_batches").delete().eq("id", batch.id);
    return { ok: false, message: "Não foi possível salvar os perfumes da lista. Tente novamente." };
  }
  return { ok: true, batchId: batch.id as string, count: rows.length, skipped, simpleReader };
}

// ---------------------------------------------------------------------------
// 2. Research (cached per perfume and version) + writing + checking
// ---------------------------------------------------------------------------

type FragranceRow = {
  id: string;
  status: FragranceSheet["status"];
  identified_as: string | null;
  concentration: string | null;
  gender: string | null;
  family: string | null;
  top_notes: string[];
  heart_notes: string[];
  base_notes: string[];
  general_notes: string[];
  profile: string | null;
  occasions: string[];
  remarks: string | null;
  sources: { title: string; url: string }[];
  researched_at: string;
};

function rowToSheet(r: FragranceRow): FragranceSheet {
  return {
    status: r.status,
    identifiedAs: r.identified_as,
    concentration: r.concentration,
    gender: r.gender,
    family: r.family,
    topNotes: r.top_notes,
    heartNotes: r.heart_notes,
    baseNotes: r.base_notes,
    generalNotes: r.general_notes,
    profile: r.profile,
    occasions: r.occasions,
    remarks: r.remarks,
    sources: r.sources,
  };
}

/** A confirmed sheet is reused for 6 months; one not found is tried again after a week. */
function stillFresh(r: FragranceRow) {
  const age = Date.now() - Date.parse(r.researched_at);
  return age < (r.status === "nao_encontrada" ? 7 : 180) * 86_400_000;
}

async function sheetFor(sb: Sb, item: ListItem, force: boolean): Promise<Result<{ id: string; sheet: FragranceSheet }>> {
  const key = fragranceKey(item);
  const { data: cached } = await sb.from("vip_fragrances").select("*").eq("lookup_key", key).maybeSingle();
  if (cached && !force && stillFresh(cached as FragranceRow)) return { ok: true, id: (cached as FragranceRow).id, sheet: rowToSheet(cached as FragranceRow) };
  const research = await researchFragrance(item);
  if (!research.ok) return { ok: false, message: aiFailureMessage(research.reason) };
  const s = research.sheet;
  const row = {
    lookup_key: key,
    status: s.status,
    identified_as: s.identifiedAs,
    concentration: s.concentration,
    gender: s.gender,
    family: s.family,
    top_notes: s.topNotes,
    heart_notes: s.heartNotes,
    base_notes: s.baseNotes,
    general_notes: s.generalNotes,
    profile: s.profile,
    occasions: s.occasions,
    remarks: s.remarks,
    sources: s.sources,
    researched_at: new Date().toISOString(),
  };
  const { data: saved, error } = await sb.from("vip_fragrances").upsert(row, { onConflict: "lookup_key" }).select("id").single();
  if (error || !saved) return { ok: false, message: "Não foi possível salvar a ficha pesquisada. Tente novamente." };
  return { ok: true, id: saved.id as string, sheet: s };
}

function sheetProblem(sheet: FragranceSheet) {
  if (sheet.status === "nao_encontrada")
    return "Não encontrei este perfume com segurança no Fragrantica, no Parfumo ou no site da marca: o texto não cita notas. Confira o nome.";
  if (sheet.status === "parcial") return `Ficha parcial: ${sheet.remarks ?? "confira se a versão é a mesma da lista"}`;
  return null;
}

/** Researches (or reuses the sheet), writes the post and checks it. Only for posts of a draft batch. */
export async function preparePost(sb: Sb, postId: string, opts: { forceResearch?: boolean } = {}): Promise<Result<{ status: VipPostRow["status"] }>> {
  const { data } = await sb.from("vip_posts").select("*, batch:vip_batches(status)").eq("id", postId).maybeSingle();
  const post = data as (VipPostRow & { batch: { status: string } | null }) | null;
  if (!post) return { ok: false, message: "Post não encontrado." };
  if (post.batch?.status !== "rascunho") return { ok: false, message: "Esta lista já foi aprovada ou cancelada." };
  if (!["pendente", "erro", "revisar", "pronto"].includes(post.status)) return { ok: false, message: "Este post não pode mais ser refeito." };

  const item = ITEM_FIELDS(post);
  const sheet = await sheetFor(sb, item, opts.forceResearch ?? false);
  if (!sheet.ok) {
    await sb.from("vip_posts").update({ status: "erro", problems: [sheet.message] }).eq("id", postId);
    return { ok: false, message: sheet.message };
  }
  const written = await writePost(item, sheet.sheet);
  if (!written.ok) {
    const message = aiFailureMessage(written.reason);
    await sb.from("vip_posts").update({ status: "erro", fragrance_id: sheet.id, problems: [message] }).eq("id", postId);
    return { ok: false, message };
  }
  const settings = await loadVipSettings(sb);
  const duplicate = await recentDuplicate(sb, post.dedupe_key, settings?.dedupe_days ?? 7, post.batch_id);
  const { data: siblings } = await sb.from("vip_posts").select("id").eq("batch_id", post.batch_id).eq("dedupe_key", post.dedupe_key).lt("position", post.position).neq("status", "ignorado").limit(1);
  const problems = [
    ...item.problems,
    ...(siblings?.length ? ["Este perfume aparece mais de uma vez nesta lista."] : []),
    ...(duplicate ? [duplicate] : []),
    ...[sheetProblem(sheet.sheet)].filter((p): p is string => p != null),
    ...reviewPost(written.text, item, settings?.footer ?? null),
  ];
  const status = problems.length > 0 ? "revisar" : "pronto";
  const { error } = await sb.from("vip_posts").update({ body: written.text.slice(0, 4000), fragrance_id: sheet.id, status, problems }).eq("id", postId);
  if (error) return { ok: false, message: "Não foi possível salvar o texto. Tente novamente." };
  return { ok: true, status };
}

// ---------------------------------------------------------------------------
// 3. Approving the day: ready posts get their sending times
// ---------------------------------------------------------------------------

export async function approveBatch(sb: Sb, batchId: string, userId: string): Promise<Result<{ count: number; first: string | null }>> {
  const settings = await loadVipSettings(sb);
  const blockers = sendingBlockers(settings);
  if (blockers.length > 0 || !settings) return { ok: false, message: `Antes de aprovar, falta: ${blockers.join(" ")}` };
  const { data: batch } = await sb.from("vip_batches").select("status").eq("id", batchId).maybeSingle();
  if (batch?.status !== "rascunho") return { ok: false, message: "Esta lista já foi aprovada ou cancelada." };
  const { data } = await sb.from("vip_posts").select("id, status, position, body").eq("batch_id", batchId).order("position");
  const posts = (data ?? []) as Pick<VipPostRow, "id" | "status" | "position" | "body">[];
  const open = posts.filter((p) => ["pendente", "erro", "revisar"].includes(p.status));
  if (open.length > 0)
    return { ok: false, message: `Ainda há ${open.length} ${open.length === 1 ? "post" : "posts"} para resolver (preparar, revisar ou ignorar) antes de aprovar o dia.` };
  const ready = posts.filter((p) => p.status === "pronto" && p.body);
  if (ready.length === 0) return { ok: false, message: "Nenhum post pronto para aprovar." };

  const { data: last } = await sb.from("vip_posts").select("scheduled_for").eq("status", "agendado").order("scheduled_for", { ascending: false }).limit(1);
  const lastScheduled = last?.[0]?.scheduled_for ? new Date(last[0].scheduled_for as string) : null;
  const slots = scheduleSlots(
    ready.length,
    new Date(),
    { firstTime: settings.first_post_time, lastTime: settings.last_post_time, intervalMinutes: settings.interval_minutes },
    lastScheduled,
  );
  for (const [i, post] of ready.entries()) {
    const { error } = await sb.from("vip_posts").update({ status: "agendado", scheduled_for: slots[i].toISOString() }).eq("id", post.id).eq("status", "pronto");
    if (error) return { ok: false, message: "Não foi possível agendar todos os posts. Confira a lista e tente de novo." };
  }
  await sb.from("vip_batches").update({ status: "aprovado", approved_by: userId, approved_at: new Date().toISOString() }).eq("id", batchId);
  return { ok: true, count: ready.length, first: slots[0]?.toISOString() ?? null };
}

// ---------------------------------------------------------------------------
// 4. Sending
// ---------------------------------------------------------------------------

/** WhatsApp shows WebP as a sticker, so store photos go as PNG (base64, as Z-API accepts). */
async function photoForWhatsApp(imageUrl: string): Promise<string | null> {
  try {
    const url = new URL(imageUrl, SITE_URL);
    const site = new URL(SITE_URL);
    if (url.host !== site.host && !url.host.endsWith(".supabase.co")) return null;
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > 10_000_000) return null;
    const png = await sharp(buffer).resize({ width: 1000, height: 1000, fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

async function deliver(phone: string, body: string, footer: string | null, imageUrl: string | null) {
  const photo = imageUrl ? await photoForWhatsApp(imageUrl) : null;
  const sent = await sendToGroup(phone, composeMessage(body, footer), photo);
  return { sent, photoMissing: Boolean(imageUrl && !photo) };
}

/** Called by the clock every 5 minutes: sends at most one due post and records the confirmation. */
export async function sendNextDuePost(service: Sb): Promise<{ state: "idle" } | { state: "sent" | "failed"; postId: string; detail?: string }> {
  const { data, error } = await service.rpc("vip_claim_next_post");
  if (error) {
    console.error("[comunidade vip] falha ao buscar o próximo post", error.code ?? "", error.message.slice(0, 120));
    return { state: "idle" };
  }
  const post = ((data ?? []) as VipPostRow[])[0];
  if (!post) return { state: "idle" };
  const settings = await loadVipSettings(service);
  if (!settings?.announcement_group_id || !post.body) {
    await service.from("vip_posts").update({ status: "falhou", problems: ["Grupo de avisos ou texto ausente no momento do envio."] }).eq("id", post.id);
    return { state: "failed", postId: post.id };
  }
  const { sent, photoMissing } = await deliver(settings.announcement_group_id, post.body, settings.footer, post.image_url);
  if (!sent.ok) {
    await service.from("vip_posts").update({ status: "falhou", problems: [sent.error] }).eq("id", post.id);
    return { state: "failed", postId: post.id, detail: sent.error };
  }
  await service
    .from("vip_posts")
    .update({
      status: "enviado",
      sent_at: new Date().toISOString(),
      provider_message_id: sent.data.messageId.slice(0, 200),
      problems: photoMissing ? ["A foto não pôde ser preparada; o post saiu só com o texto."] : [],
    })
    .eq("id", post.id);
  return { state: "sent", postId: post.id };
}

/** Sends one post to the admin's own WhatsApp, exactly as the community would see it. */
export async function sendPreview(sb: Sb, postId: string): Promise<Result> {
  const settings = await loadVipSettings(sb);
  if (!zapiConfigured()) return { ok: false, message: "A Z-API ainda não está configurada no servidor." };
  if (!settings?.preview_phone) return { ok: false, message: "Cadastre o seu WhatsApp para prévias em Configurações do envio." };
  const { data } = await sb.from("vip_posts").select("body, image_url").eq("id", postId).maybeSingle();
  if (!data?.body) return { ok: false, message: "Este post ainda não tem texto." };
  const { sent, photoMissing } = await deliver(settings.preview_phone, data.body as string, settings.footer, data.image_url as string | null);
  if (!sent.ok) return { ok: false, message: sent.error };
  return photoMissing ? { ok: false, message: "O texto chegou, mas a foto não pôde ser preparada." } : { ok: true };
}

export function describePrice(cents: number | null) {
  return cents == null ? "sem preço" : formatBRL(cents);
}
