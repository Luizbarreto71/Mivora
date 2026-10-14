import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/admin/action-button";
import { AdminPage, Card, EmptyRow, StatusPill, Table, Td, Th } from "@/components/admin/ui";
import { deleteCustomer } from "@/lib/admin/actions/community";
import { requireAdmin } from "@/lib/admin/auth";
import { formatBrPhone } from "@/lib/store/customer";
import { formatDateTime } from "@/lib/utils";
import { buildWhatsAppUrl, normalizeWhatsAppNumber } from "@/lib/whatsapp";

export const metadata: Metadata = { title: "Clientes" };

type Row = {
  id: string;
  name: string;
  email: string;
  phone: string;
  marketing_consent: boolean;
  city: string | null;
  uf: string | null;
  orders_count: number;
  last_order_at: string | null;
  created_at: string;
};

/** Search term safe for a PostgREST "or" filter. */
function cleanTerm(q: string) {
  return q.replace(/[%,()*\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

export default async function CustomersPage({ searchParams }: PageProps<"/admin/clientes">) {
  const { supabase } = await requireAdmin();
  const sp = await searchParams;
  const q = cleanTerm(typeof sp.q === "string" ? sp.q : "");
  const digits = q.replace(/\D/g, "");

  let query = supabase
    .from("customers")
    .select("id, name, email, phone, marketing_consent, city, uf, orders_count, last_order_at, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(500);
  if (q) query = query.or([`name.ilike.*${q}*`, `email.ilike.*${q}*`, ...(digits.length >= 3 ? [`phone.ilike.*${digits}*`] : [])].join(","));
  const [{ data, count }, { count: total }, { count: optIn }] = await Promise.all([
    query,
    supabase.from("customers").select("id", { count: "exact", head: true }),
    supabase.from("customers").select("id", { count: "exact", head: true }).eq("marketing_consent", true),
  ]);
  const rows = (data ?? []) as Row[];

  return (
    <AdminPage
      title="Clientes"
      description="Cadastros feitos na finalização da compra e em Minha conta (o cadastro é obrigatório para comprar). Use os contatos de acordo com o consentimento de cada cliente."
      actions={
        <a href={`/api/admin/clientes/csv${q ? `?q=${encodeURIComponent(q)}` : ""}`} className="inline-flex h-9 items-center rounded-md border border-line bg-paper px-3 text-sm hover:border-ink">
          Exportar CSV
        </a>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card>
          <p className="text-xs font-medium text-muted">Clientes cadastrados</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{total ?? 0}</p>
        </Card>
        <Card>
          <p className="text-xs font-medium text-muted">Aceitam novidades e ofertas</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-success">{optIn ?? 0}</p>
        </Card>
      </div>

      <form className="mt-6 flex gap-2" role="search">
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar por nome, e-mail ou WhatsApp"
          aria-label="Buscar clientes"
          className="h-10 min-w-0 flex-1 rounded-md border border-line bg-paper px-3 text-sm focus:border-ink focus:outline-none"
        />
        <button type="submit" className="h-10 rounded-md bg-ink px-4 text-sm font-medium text-paper">
          Buscar
        </button>
        {q ? (
          <Link href="/admin/clientes" className="inline-flex h-10 items-center px-2 text-sm text-muted underline">
            Limpar
          </Link>
        ) : null}
      </form>

      <Table className="mt-4">
        <thead>
          <tr>
            <Th>Cliente</Th>
            <Th>WhatsApp</Th>
            <Th>Cidade</Th>
            <Th>Novidades</Th>
            <Th>Pedidos</Th>
            <Th>Cadastro</Th>
            <Th className="w-24" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? <EmptyRow colSpan={7}>{q ? "Nenhum cliente encontrado." : "Nenhum cadastro ainda."}</EmptyRow> : null}
          {rows.map((r) => {
            const wa = normalizeWhatsAppNumber(r.phone);
            return (
              <tr key={r.id} className="hover:bg-ivory/50">
                <Td>
                  <p className="font-medium">{r.name}</p>
                  <a href={`mailto:${r.email}`} className="text-xs text-muted hover:underline">
                    {r.email}
                  </a>
                </Td>
                <Td className="whitespace-nowrap">
                  {wa ? (
                    <a href={buildWhatsAppUrl(wa, `Olá, ${r.name.split(" ")[0]}! Aqui é da MIVORA.`)} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {formatBrPhone(r.phone)}
                    </a>
                  ) : (
                    formatBrPhone(r.phone)
                  )}
                </Td>
                <Td className="text-muted">{r.city ? `${r.city}${r.uf ? `/${r.uf}` : ""}` : "—"}</Td>
                <Td>{r.marketing_consent ? <StatusPill tone="green">Sim</StatusPill> : <StatusPill tone="gray">Não</StatusPill>}</Td>
                <Td className="tabular-nums">
                  {r.orders_count > 0 ? (
                    <Link href={`/admin/pedidos?q=${encodeURIComponent(r.name)}`} className="hover:underline">
                      {r.orders_count}
                    </Link>
                  ) : (
                    0
                  )}
                  {r.last_order_at ? <span className="block text-xs text-muted">último em {formatDateTime(r.last_order_at)}</span> : null}
                </Td>
                <Td className="text-muted">{formatDateTime(r.created_at)}</Td>
                <Td className="text-right">
                  <ActionButton
                    action={deleteCustomer.bind(null, r.id)}
                    variant="danger"
                    confirm={`Excluir o cadastro de ${r.name}? Use quando o cliente pedir. Os pedidos continuam registrados, sem vínculo com o cadastro.`}
                  >
                    Excluir
                  </ActionButton>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      {(count ?? 0) > rows.length ? <p className="mt-3 text-xs text-muted">Mostrando os 500 cadastros mais recentes. Use a busca ou o CSV para ver todos.</p> : null}
    </AdminPage>
  );
}
