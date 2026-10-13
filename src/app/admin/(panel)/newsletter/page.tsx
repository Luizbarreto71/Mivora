import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/admin/action-button";
import { AdminPage, Card, EmptyRow, Table, Td, Th } from "@/components/admin/ui";
import { deleteSubscriber } from "@/lib/admin/actions/community";
import { requireAdmin } from "@/lib/admin/auth";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Newsletter" };

export default async function NewsletterPage() {
  const { supabase } = await requireAdmin();
  const [{ data, count }, { data: settings }] = await Promise.all([
    supabase.from("newsletter_subscribers").select("id, email, source, consented_at", { count: "exact" }).order("consented_at", { ascending: false }).limit(500),
    supabase.from("store_settings").select("newsletter_enabled").eq("id", 1).maybeSingle(),
  ]);
  const rows = (data ?? []) as { id: string; email: string; source: string; consented_at: string }[];
  const total = count ?? rows.length;

  return (
    <AdminPage
      title="Newsletter"
      description="E-mails cadastrados no rodapé do site para receber novidades. Use a lista na sua ferramenta de e-mail e remova quem pedir o cancelamento."
      actions={
        <a href="/api/admin/newsletter/csv" className="inline-flex h-9 items-center rounded-md border border-line bg-paper px-3 text-sm hover:border-ink">
          Exportar CSV
        </a>
      }
    >
      <Card>
        <p className="text-sm">
          <strong className="tabular-nums">{total}</strong> {total === 1 ? "inscrição" : "inscrições"} ·{" "}
          {settings?.newsletter_enabled === false ? "inscrições fechadas no site" : "formulário ativo no rodapé"} (altere em{" "}
          <Link href="/admin/configuracoes" className="underline">
            Configurações
          </Link>
          ).
        </p>
      </Card>
      <Table className="mt-6">
        <thead>
          <tr>
            <Th>E-mail</Th>
            <Th>Origem</Th>
            <Th>Inscrição</Th>
            <Th className="w-28" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? <EmptyRow colSpan={4}>Nenhuma inscrição ainda.</EmptyRow> : null}
          {rows.map((r) => (
            <tr key={r.id}>
              <Td className="font-medium">{r.email}</Td>
              <Td className="text-muted">{r.source}</Td>
              <Td className="text-muted">{formatDateTime(r.consented_at)}</Td>
              <Td className="text-right">
                <ActionButton action={deleteSubscriber.bind(null, r.id)} variant="danger" confirm={`Remover ${r.email} da lista?`}>
                  Remover
                </ActionButton>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      {total > rows.length ? <p className="mt-3 text-xs text-muted">Mostrando as 500 inscrições mais recentes. O CSV traz a lista completa.</p> : null}
    </AdminPage>
  );
}
