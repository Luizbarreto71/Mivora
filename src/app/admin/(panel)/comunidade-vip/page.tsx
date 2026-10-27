import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/admin/action-button";
import { ActionForm, SubmitButton } from "@/components/admin/form-kit";
import { missingTables, NotMigrated } from "@/components/admin/vip/not-migrated";
import { AdminPage, Card, EmptyRow, StatusPill, Table, Td, Th } from "@/components/admin/ui";
import { LinkButton } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/form";
import { createVipBatch, sendVipPostNow } from "@/lib/admin/actions/vip";
import { requireAdmin } from "@/lib/admin/auth";
import { vipAiConfigured } from "@/lib/vip/ai";
import { loadVipSettings, sendingBlockers } from "@/lib/vip/pipeline";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Comunidade VIP" };
// the list is split by the AI while the admin waits
export const maxDuration = 120;

type BatchRow = { id: string; status: "rascunho" | "aprovado" | "cancelado"; created_at: string; list_text: string; posts: { status: string }[] };
type UpcomingRow = { id: string; name: string; scheduled_for: string; batch_id: string };

const BATCH_STATUS = {
  rascunho: { label: "Em preparação", tone: "amber" },
  aprovado: { label: "Aprovada", tone: "green" },
  cancelado: { label: "Cancelada", tone: "gray" },
} as const;

function count(posts: { status: string }[], ...statuses: string[]) {
  return posts.filter((p) => statuses.includes(p.status)).length;
}

export default async function VipCommunityPage() {
  const { supabase } = await requireAdmin();
  const [batches, upcoming, settings] = await Promise.all([
    supabase.from("vip_batches").select("id, status, created_at, list_text, posts:vip_posts(status)").order("created_at", { ascending: false }).limit(30),
    supabase.from("vip_posts").select("id, name, scheduled_for, batch_id").eq("status", "agendado").order("scheduled_for").limit(12),
    loadVipSettings(supabase),
  ]);
  if (missingTables(batches.error)) return <NotMigrated />;
  const rows = (batches.data ?? []) as BatchRow[];
  const next = (upcoming.data ?? []) as UpcomingRow[];
  const blockers = sendingBlockers(settings);

  return (
    <AdminPage
      title="Comunidade VIP"
      description="Cole a lista de perfumes do dia: a IA pesquisa cada perfume e escreve os posts, você revisa e aprova, e eles saem sozinhos no grupo de avisos da comunidade do WhatsApp."
      actions={
        <LinkButton href="/admin/comunidade-vip/configuracoes" variant="outline" size="sm" className="normal-case tracking-normal">
          Configurações do envio
        </LinkButton>
      }
    >
      <div className="space-y-6">
        {blockers.length > 0 ? (
          <Card title="Para os posts saírem sozinhos, falta:" className="border-warning/40">
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">Você já pode colar listas e revisar os posts; a aprovação do dia fica liberada quando tudo acima estiver pronto.</p>
          </Card>
        ) : (
          <Card>
            <p className="text-sm">
              Envio automático <strong>ligado</strong> para {settings?.community_name ? <strong>{settings.community_name}</strong> : "o grupo de avisos escolhido"}: um post a cada {settings?.interval_minutes} minutos, entre{" "}
              {settings?.first_post_time.slice(0, 5)} e {settings?.last_post_time.slice(0, 5)}.
            </p>
          </Card>
        )}

        <Card title="Lista do dia" description="Um perfume por linha, com marca, nome, versão (EDP, EDT…), tamanho e preço, do jeito que você já escreve.">
          {!vipAiConfigured() ? (
            <p className="mb-4 rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
              A IA não está configurada no servidor (ANTHROPIC_API_KEY): a lista será lida linha a linha e os posts não poderão ser pesquisados nem escritos automaticamente.
            </p>
          ) : null}
          <ActionForm action={createVipBatch} className="space-y-4">
            <Field label="Lista" htmlFor="list_text" hint="Ex.: Lattafa Asad EDP 100ml — R$ 189,90. Linhas de título ou saudação são ignoradas.">
              <Textarea id="list_text" name="list_text" rows={10} maxLength={20000} required placeholder={"Lattafa Asad EDP 100ml R$ 189,90\nArmaf Club de Nuit Intense Man EDT 105ml R$ 229,90"} />
            </Field>
            <SubmitButton pendingLabel="Lendo a lista…">Preparar posts</SubmitButton>
          </ActionForm>
        </Card>

        <Card title="Próximos envios">
          {next.length === 0 ? (
            <p className="text-sm text-muted">Nenhum post agendado.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {next.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
                  <Link href={`/admin/comunidade-vip/${p.batch_id}`} className="min-w-0 truncate hover:underline">
                    {p.name}
                  </Link>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="tabular-nums text-muted">{formatDateTime(p.scheduled_for)}</span>
                    <ActionButton action={sendVipPostNow.bind(null, p.id)} variant="primary" confirm={`Publicar agora na comunidade: ${p.name}?`}>
                      Enviar agora
                    </ActionButton>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Table>
          <thead>
            <tr>
              <Th>Lista</Th>
              <Th>Situação</Th>
              <Th className="text-right">Perfumes</Th>
              <Th className="text-right">Para revisar</Th>
              <Th className="text-right">Agendados</Th>
              <Th className="text-right">Enviados</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? <EmptyRow colSpan={6}>Nenhuma lista ainda.</EmptyRow> : null}
            {rows.map((b) => (
              <tr key={b.id}>
                <Td>
                  <Link href={`/admin/comunidade-vip/${b.id}`} className="font-medium hover:underline">
                    {formatDateTime(b.created_at)}
                  </Link>
                  <p className="max-w-md truncate text-xs text-muted">{b.list_text.split("\n").find((l) => l.trim()) ?? ""}</p>
                </Td>
                <Td>
                  <StatusPill tone={BATCH_STATUS[b.status].tone}>{BATCH_STATUS[b.status].label}</StatusPill>
                </Td>
                <Td className="text-right tabular-nums">{b.posts.length}</Td>
                <Td className="text-right tabular-nums">{count(b.posts, "pendente", "revisar", "erro")}</Td>
                <Td className="text-right tabular-nums">{count(b.posts, "agendado", "enviando")}</Td>
                <Td className="text-right tabular-nums">{count(b.posts, "enviado")}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </AdminPage>
  );
}
