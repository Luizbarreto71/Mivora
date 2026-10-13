import type { Metadata } from "next";
import Link from "next/link";
import { AdminPage, EmptyRow, StatusPill, Table, Td, Th } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin/auth";
import { ORDER_STATUS_TONE } from "@/lib/admin/labels";
import { formatBRL } from "@/lib/money";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Pedidos" };

const PAGE = 50;

export default async function OrdersPage({ searchParams }: PageProps<"/admin/pedidos">) {
  const { supabase } = await requireAdmin();
  const sp = await searchParams;
  const status = typeof sp.status === "string" && sp.status in ORDER_STATUS_LABEL ? (sp.status as OrderStatus) : null;
  const q = typeof sp.q === "string" ? sp.q.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "") : "";
  const page = Math.max(1, Number(sp.pagina) || 1);

  let query = supabase
    .from("order_intents")
    .select("id, code, status, item_count, subtotal_cents, has_unpriced_items, customer_name, customer_phone, source, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1);
  if (status) query = query.eq("status", status);
  if (q) query = query.ilike("code", `%${q}%`);
  const { data, count } = await query;
  const total = count ?? 0;
  const qs = (p: number) => `?${new URLSearchParams({ ...(status ? { status } : {}), ...(q ? { q } : {}), pagina: String(p) })}`;

  return (
    <AdminPage
      title="Pedidos"
      description="Intenções de pedido criadas pelo site. Atualize o status manualmente conforme a negociação no WhatsApp."
      actions={
        <a href={`/api/admin/pedidos/csv${status ? `?status=${status}` : ""}`} className="inline-flex h-9 items-center rounded-md border border-line bg-paper px-3 text-sm hover:border-ink">
          Exportar CSV
        </a>
      }
    >
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <input name="q" defaultValue={q} placeholder="Código (ex.: MIV-000123)" className="h-9 w-56 rounded-md border border-line bg-paper px-3 text-sm focus:border-ink focus:outline-none" />
        {status ? <input type="hidden" name="status" value={status} /> : null}
        <button className="h-9 rounded-md border border-line px-3 text-sm hover:border-ink">Buscar</button>
      </form>
      <div className="mb-4 flex flex-wrap gap-1.5">
        <Link href="/admin/pedidos" className={!status ? "rounded-full bg-ink px-3 py-1 text-xs text-paper" : "rounded-full border border-line px-3 py-1 text-xs"}>
          Todos
        </Link>
        {Object.entries(ORDER_STATUS_LABEL).map(([k, label]) => (
          <Link key={k} href={`/admin/pedidos?status=${k}`} className={status === k ? "rounded-full bg-ink px-3 py-1 text-xs text-paper" : "rounded-full border border-line px-3 py-1 text-xs"}>
            {label}
          </Link>
        ))}
      </div>
      <Table>
        <thead>
          <tr>
            <Th>Pedido</Th>
            <Th>Data</Th>
            <Th>Contato</Th>
            <Th>Itens</Th>
            <Th>Subtotal</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).length === 0 ? <EmptyRow colSpan={6}>Nenhum pedido encontrado.</EmptyRow> : null}
          {(data ?? []).map((o) => (
            <tr key={o.id} className="hover:bg-ivory/40">
              <Td>
                <Link href={`/admin/pedidos/${o.id}`} className="font-medium hover:underline">
                  {o.code}
                </Link>
                <p className="text-xs text-muted">{o.source === "site" ? "Site" : o.source}</p>
              </Td>
              <Td className="text-muted">{formatDateTime(o.created_at)}</Td>
              <Td className="text-xs">{[o.customer_name, o.customer_phone].filter(Boolean).join(" · ") || <span className="text-muted">Não informado</span>}</Td>
              <Td>{o.item_count}</Td>
              <Td className="tabular-nums">
                {formatBRL(o.subtotal_cents)}
                {o.has_unpriced_items ? <p className="text-xs text-muted">+ itens a consultar</p> : null}
              </Td>
              <Td>
                <StatusPill tone={ORDER_STATUS_TONE[o.status as OrderStatus]}>{ORDER_STATUS_LABEL[o.status as OrderStatus]}</StatusPill>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      {total > PAGE ? (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted">
            {total} pedidos · página {page} de {Math.ceil(total / PAGE)}
          </span>
          <div className="flex gap-2">
            {page > 1 ? <Link href={qs(page - 1)} className="rounded-md border border-line px-3 py-1.5">Anterior</Link> : null}
            {page * PAGE < total ? <Link href={qs(page + 1)} className="rounded-md border border-line px-3 py-1.5">Próxima</Link> : null}
          </div>
        </div>
      ) : null}
    </AdminPage>
  );
}
