import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/admin/action-button";
import { ActionForm, SubmitButton } from "@/components/admin/form-kit";
import { AdminPage, Card, StatusPill } from "@/components/admin/ui";
import { missingTables, NotMigrated } from "@/components/admin/vip/not-migrated";
import { PrepareRunner } from "@/components/admin/vip/prepare-runner";
import { Field, Select, Textarea } from "@/components/ui/form";
import {
  approveVipBatch,
  cancelVipBatch,
  ignoreVipPost,
  prepareVipPost,
  previewVipPost,
  restoreVipPost,
  retryVipPost,
  saveVipPost,
} from "@/lib/admin/actions/vip";
import { requireAdmin } from "@/lib/admin/auth";
import { composeMessage } from "@/lib/vip/core";
import { describePrice, loadVipSettings, perfumeProducts, sendingBlockers, type VipPostRow } from "@/lib/vip/pipeline";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Lista do dia · Comunidade VIP" };
// each post is researched on the web and written in one request
export const maxDuration = 300;

type Fragrance = {
  id: string;
  status: "confirmada" | "parcial" | "nao_encontrada";
  identified_as: string | null;
  family: string | null;
  top_notes: string[];
  heart_notes: string[];
  base_notes: string[];
  general_notes: string[];
  remarks: string | null;
  sources: { title: string; url: string }[];
  researched_at: string;
};

const POST_STATUS: Record<VipPostRow["status"], { label: string; tone: "green" | "gray" | "amber" | "red" | "blue" | "dark" }> = {
  pendente: { label: "Preparando", tone: "gray" },
  pronto: { label: "Pronto", tone: "green" },
  revisar: { label: "Revisar", tone: "amber" },
  erro: { label: "Erro", tone: "red" },
  ignorado: { label: "Ignorado", tone: "gray" },
  agendado: { label: "Agendado", tone: "blue" },
  enviando: { label: "Enviando", tone: "blue" },
  enviado: { label: "Enviado", tone: "dark" },
  falhou: { label: "Falhou", tone: "red" },
};

const SHEET_STATUS = { confirmada: "Ficha confirmada", parcial: "Ficha parcial", nao_encontrada: "Perfume não encontrado" } as const;

function Sheet({ f }: { f: Fragrance }) {
  const pyramid = [
    ["Topo", f.top_notes],
    ["Coração", f.heart_notes],
    ["Fundo", f.base_notes],
    ["Notas", f.general_notes],
  ] as const;
  return (
    <details className="rounded-md border border-line bg-ivory/40 px-3 py-2 text-xs">
      <summary className="cursor-pointer font-medium">
        {SHEET_STATUS[f.status]}
        {f.identified_as ? `: ${f.identified_as}` : ""}
      </summary>
      <div className="mt-2 space-y-1">
        {f.family ? <p>Família: {f.family}</p> : null}
        {pyramid.map(([label, notes]) => (notes.length ? <p key={label}>{label}: {notes.join(", ")}</p> : null))}
        {f.remarks ? <p className="text-warning">Ressalvas: {f.remarks}</p> : null}
        {f.sources.length ? (
          <p>
            Fontes:{" "}
            {f.sources.map((s, i) => (
              <span key={s.url}>
                {i > 0 ? " · " : ""}
                <a href={s.url} target="_blank" rel="noreferrer" className="underline">
                  {s.title || new URL(s.url).hostname}
                </a>
              </span>
            ))}
          </p>
        ) : null}
        <p className="text-muted">Pesquisada em {formatDateTime(f.researched_at)}.</p>
      </div>
    </details>
  );
}

export default async function VipBatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireAdmin();
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { data: batch, error } = await supabase.from("vip_batches").select("id, status, created_at, approved_at, list_text").eq("id", id).maybeSingle();
  if (missingTables(error)) return <NotMigrated />;
  if (!batch) notFound();
  const [{ data: postData }, settings, products] = await Promise.all([
    supabase.from("vip_posts").select("*").eq("batch_id", id).order("position"),
    loadVipSettings(supabase),
    perfumeProducts(supabase),
  ]);
  const posts = (postData ?? []) as VipPostRow[];
  const fragranceIds = [...new Set(posts.map((p) => p.fragrance_id).filter((f): f is string => Boolean(f)))];
  const { data: fragranceData } = fragranceIds.length ? await supabase.from("vip_fragrances").select("*").in("id", fragranceIds) : { data: [] };
  const fragrances = new Map(((fragranceData ?? []) as Fragrance[]).map((f) => [f.id, f]));

  const draft = batch.status === "rascunho";
  const pending = draft ? posts.filter((p) => p.status === "pendente").map((p) => ({ id: p.id, name: p.name })) : [];
  const open = posts.filter((p) => ["pendente", "revisar", "erro"].includes(p.status)).length;
  const ready = posts.filter((p) => p.status === "pronto").length;
  const blockers = sendingBlockers(settings);

  return (
    <AdminPage
      title={`Lista de ${formatDateTime(batch.created_at as string)}`}
      back={{ href: "/admin/comunidade-vip", label: "Comunidade VIP" }}
      description={
        draft
          ? `${posts.length} perfumes · ${ready} prontos · ${open} para resolver. Revise os textos; quando não houver nada para resolver, aprove o dia.`
          : batch.status === "aprovado"
            ? `Aprovada em ${formatDateTime(batch.approved_at as string)}. Os posts saem nos horários abaixo.`
            : "Lista cancelada."
      }
      actions={
        batch.status !== "cancelado" ? (
          <>
            {draft ? (
              <ActionButton
                action={approveVipBatch.bind(null, id)}
                variant="primary"
                confirm={`Aprovar o dia? ${ready} ${ready === 1 ? "post será publicado" : "posts serão publicados"} automaticamente na comunidade, um por vez.`}
              >
                Aprovar o dia
              </ActionButton>
            ) : null}
            <ActionButton action={cancelVipBatch.bind(null, id)} variant="danger" confirm="Cancelar esta lista? O que ainda não saiu não será enviado.">
              Cancelar lista
            </ActionButton>
          </>
        ) : null
      }
    >
      <div className="space-y-4">
        {draft && blockers.length > 0 ? (
          <p className="rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">Para aprovar, falta: {blockers.join(" ")}</p>
        ) : null}
        <PrepareRunner posts={pending} />

        {posts.map((p) => {
          const status = POST_STATUS[p.status];
          const fragrance = p.fragrance_id ? fragrances.get(p.fragrance_id) : undefined;
          const editable = draft && ["pronto", "revisar", "erro", "pendente"].includes(p.status);
          const facts = [p.concentration, p.volume_ml ? `${p.volume_ml} ml` : null, describePrice(p.price_cents)].filter(Boolean).join(" · ");
          return (
            <Card
              key={p.id}
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {p.position}. {p.name}
                  <StatusPill tone={status.tone}>{status.label}</StatusPill>
                </span>
              }
              description={facts}
              actions={
                <div className="flex flex-wrap justify-end gap-2">
                  {editable && p.status !== "pendente" ? (
                    <>
                      <ActionButton action={prepareVipPost.bind(null, p.id, false)}>Reescrever</ActionButton>
                      <ActionButton action={prepareVipPost.bind(null, p.id, true)} confirm="Pesquisar este perfume de novo na web? A ficha atual será substituída.">
                        Pesquisar de novo
                      </ActionButton>
                    </>
                  ) : null}
                  {p.body && settings?.preview_phone && p.status !== "ignorado" ? <ActionButton action={previewVipPost.bind(null, p.id)}>Prévia no meu WhatsApp</ActionButton> : null}
                  {p.status === "falhou" ? (
                    <ActionButton action={retryVipPost.bind(null, p.id)} confirm="Confira no grupo se este post não saiu. Tentar enviar de novo?">
                      Tentar de novo
                    </ActionButton>
                  ) : null}
                  {["pendente", "pronto", "revisar", "erro", "agendado", "falhou"].includes(p.status) ? (
                    <ActionButton action={ignoreVipPost.bind(null, p.id)} variant="danger">
                      {p.status === "agendado" ? "Não enviar" : "Ignorar"}
                    </ActionButton>
                  ) : null}
                  {p.status === "ignorado" && draft ? <ActionButton action={restoreVipPost.bind(null, p.id)}>Trazer de volta</ActionButton> : null}
                </div>
              }
            >
              <div className="space-y-3">
                <p className="text-xs text-muted">Linha da lista: {p.source_line}</p>
                {p.problems.length > 0 ? (
                  <ul className={`list-disc space-y-0.5 rounded-md px-3 py-2 pl-7 text-sm ${p.status === "erro" || p.status === "falhou" ? "bg-danger/10 text-danger" : "bg-warning/10 text-warning"}`}>
                    {p.problems.map((problem) => (
                      <li key={problem}>{problem}</li>
                    ))}
                  </ul>
                ) : null}
                {p.scheduled_for && ["agendado", "enviando"].includes(p.status) ? <p className="text-sm">Sai em {formatDateTime(p.scheduled_for)}.</p> : null}
                {p.status === "enviado" && p.sent_at ? <p className="text-sm">Enviado em {formatDateTime(p.sent_at)} (confirmado pela Z-API).</p> : null}
                {fragrance ? <Sheet f={fragrance} /> : null}

                <div className="grid gap-4 md:grid-cols-[1fr_9rem]">
                  {editable && (p.body != null || p.status === "erro") ? (
                    <ActionForm action={saveVipPost} className="space-y-3">
                      <input type="hidden" name="id" value={p.id} />
                      <Field label="Texto do post" htmlFor={`body-${p.id}`} hint={settings?.footer ? "O fechamento das Configurações do envio entra no fim de cada post." : undefined}>
                        <Textarea id={`body-${p.id}`} name="body" rows={10} defaultValue={p.body ?? ""} maxLength={4000} required />
                      </Field>
                      <Field label="Foto" htmlFor={`photo-${p.id}`}>
                        <Select id={`photo-${p.id}`} name="photo_product_id" defaultValue={p.product_id ?? "none"}>
                          <option value="none">Sem foto (só texto)</option>
                          {products.map((prod) => (
                            <option key={prod.id} value={prod.id} disabled={!prod.image}>
                              {prod.name}
                              {prod.image ? "" : " (sem foto)"}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <SubmitButton variant="outline">Salvar e marcar como revisado</SubmitButton>
                    </ActionForm>
                  ) : p.body ? (
                    <pre className="whitespace-pre-wrap rounded-md border border-line bg-ivory/40 p-3 font-sans text-sm">{composeMessage(p.body, settings?.footer ?? null)}</pre>
                  ) : (
                    <p className="text-sm text-muted">{p.status === "pendente" ? "Aguardando a pesquisa e o texto." : "Sem texto."}</p>
                  )}
                  {p.image_url ? (
                    <div className="relative h-36 w-36 overflow-hidden rounded-md border border-line bg-white">
                      <Image src={p.image_url} alt="" fill sizes="144px" className="object-contain p-1" />
                    </div>
                  ) : null}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </AdminPage>
  );
}
