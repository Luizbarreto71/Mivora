import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminPage, Card, StatCard, StatusPill, Table, Td, Th, EmptyRow } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin/auth";
import { MOVEMENT_LABEL, ORDER_STATUS_TONE } from "@/lib/admin/labels";
import { formatBRL } from "@/lib/money";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Painel" };

type Stats = Record<string, number> & { top_cart_products: { id: string; name: string; adds: number }[] };

export default async function DashboardPage() {
  const { supabase } = await requireAdmin();
  const [stats, orders, movements, settings, pages] = await Promise.all([
    supabase.rpc("admin_dashboard_stats"),
    supabase.from("order_intents").select("id, code, status, subtotal_cents, has_unpriced_items, item_count, created_at").order("created_at", { ascending: false }).limit(6),
    supabase.from("inventory_movements").select("id, movement_type, quantity, reason, created_at, product:products(id, name)").order("created_at", { ascending: false }).limit(6),
    supabase.from("store_settings").select("whatsapp_number, legal_name, cnpj, contact_email").eq("id", 1).maybeSingle(),
    supabase.from("pages").select("slug").eq("needs_review", true),
  ]);
  const s = (stats.data ?? {}) as Stats;

  const checklist = [
    { done: Boolean(settings.data?.whatsapp_number), label: "Número do WhatsApp configurado", href: "/admin/configuracoes" },
    { done: (s.products_without_price ?? 0) === 0, label: `Preços definidos (${s.products_without_price ?? 0} produtos sem preço)`, href: "/admin/produtos?filtro=sem-preco" },
    { done: (s.products_media_pending ?? 0) === 0, label: `Fotos dos produtos (${s.products_media_pending ?? 0} com mídia pendente)`, href: "/admin/produtos?filtro=midia" },
    { done: (s.products_content_unverified ?? 0) === 0, label: `Conteúdo técnico revisado (${s.products_content_unverified ?? 0} a revisar)`, href: "/admin/produtos?filtro=revisar" },
    { done: (s.products_compliance_pending ?? 0) === 0, label: `Documentação e regularização (${s.products_compliance_pending ?? 0} pendentes)`, href: "/admin/produtos?filtro=documentacao" },
    { done: Boolean(settings.data?.legal_name && settings.data?.cnpj), label: "Dados legais da empresa (razão social e CNPJ)", href: "/admin/configuracoes" },
    { done: (pages.data ?? []).length === 0, label: `Páginas institucionais revisadas (${(pages.data ?? []).length} pendentes)`, href: "/admin/paginas" },
  ];

  return (
    <AdminPage title="Painel" description="Visão geral da loja. Pedidos iniciados no site não são vendas: as vendas são confirmadas manualmente.">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Produtos cadastrados" value={s.products_total ?? 0} hint={`${s.products_published ?? 0} publicados · ${s.products_draft ?? 0} rascunhos`} href="/admin/produtos" />
        <StatCard label="Disponíveis para compra" value={s.products_available ?? 0} hint="Publicados e em estoque" href="/admin/produtos?filtro=disponiveis" tone="success" />
        <StatCard label="Em breve" value={s.products_coming_soon ?? 0} hint="Planejados (sem venda)" href="/admin/produtos?filtro=em-breve" />
        <StatCard label="Sob consulta" value={s.products_on_request ?? 0} hint="Visíveis, preço pelo WhatsApp" href="/admin/produtos?filtro=sob-consulta" />
        <StatCard label="Esgotados" value={s.products_unavailable ?? 0} hint="Publicados sem estoque" href="/admin/produtos?filtro=indisponiveis" tone={(s.products_unavailable ?? 0) > 0 ? "warning" : "default"} />
        <StatCard label="Estoque baixo" value={s.products_low_stock ?? 0} hint="Com controle numérico" href="/admin/estoque" tone={(s.products_low_stock ?? 0) > 0 ? "warning" : "default"} />
        <StatCard label="Pedidos em aberto" value={s.orders_started ?? 0} hint={`${s.orders_started_30d ?? 0} iniciados nos últimos 30 dias`} href="/admin/pedidos" />
        <StatCard label="Pedidos confirmados" value={s.orders_confirmed ?? 0} hint="Aguardando conclusão" href="/admin/pedidos?status=confirmed" />
        <StatCard label="Vendas concluídas" value={s.orders_completed ?? 0} hint="Confirmadas manualmente" href="/admin/pedidos?status=completed" tone="success" />
        <StatCard label="Receita confirmada (30 dias)" value={formatBRL(s.sales_completed_30d_cents ?? 0)} hint={`Total: ${formatBRL(s.sales_completed_cents ?? 0)}`} />
        <StatCard label="Sem preço" value={s.products_without_price ?? 0} hint="Exibidos como “Consultar preço”" href="/admin/produtos?filtro=sem-preco" tone={(s.products_without_price ?? 0) > 0 ? "warning" : "default"} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Últimos pedidos iniciados" actions={<Link href="/admin/pedidos" className="text-xs underline">Ver todos</Link>}>
          <Table className="-m-5 rounded-none border-0">
            <thead>
              <tr>
                <Th>Pedido</Th>
                <Th>Data</Th>
                <Th>Itens</Th>
                <Th>Subtotal</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {(orders.data ?? []).length === 0 ? <EmptyRow colSpan={5}>Nenhum pedido ainda.</EmptyRow> : null}
              {(orders.data ?? []).map((o) => (
                <tr key={o.id} className="hover:bg-ivory/50">
                  <Td>
                    <Link href={`/admin/pedidos/${o.id}`} className="font-medium underline-offset-2 hover:underline">
                      {o.code}
                    </Link>
                  </Td>
                  <Td className="text-muted">{formatDateTime(o.created_at)}</Td>
                  <Td>{o.item_count}</Td>
                  <Td className="tabular-nums">
                    {formatBRL(o.subtotal_cents)}
                    {o.has_unpriced_items ? <span className="text-xs text-muted"> + a consultar</span> : null}
                  </Td>
                  <Td>
                    <StatusPill tone={ORDER_STATUS_TONE[o.status as OrderStatus]}>{ORDER_STATUS_LABEL[o.status as OrderStatus]}</StatusPill>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <Card title="Preparação para o lançamento">
          <ul className="space-y-3">
            {checklist.map((c) => (
              <li key={c.label}>
                <Link href={c.href} className="flex items-start gap-2.5 text-sm hover:underline">
                  {c.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />}
                  <span className={c.done ? "text-muted" : ""}>{c.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Mais adicionados ao carrinho" description="Últimos 90 dias (contagem anônima)">
          {s.top_cart_products?.length ? (
            <ol className="space-y-2 text-sm">
              {s.top_cart_products.map((p, i) => (
                <li key={p.id} className="flex justify-between gap-4">
                  <Link href={`/admin/produtos/${p.id}`} className="hover:underline">
                    {i + 1}. {p.name}
                  </Link>
                  <span className="tabular-nums text-muted">{p.adds}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted">Ainda não há dados suficientes.</p>
          )}
        </Card>
        <Card title="Últimas movimentações de estoque" actions={<Link href="/admin/estoque" className="text-xs underline">Estoque</Link>}>
          {(movements.data ?? []).length ? (
            <ul className="space-y-2 text-sm">
              {(movements.data as unknown as { id: number; movement_type: string; quantity: number; reason: string | null; created_at: string; product: { id: string; name: string } | null }[]).map((m) => (
                <li key={m.id} className="flex justify-between gap-4">
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{MOVEMENT_LABEL[m.movement_type]}</span> · {m.product?.name ?? "Produto removido"}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted">
                    {m.quantity > 0 ? `+${m.quantity}` : m.quantity} · {formatDateTime(m.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Nenhuma movimentação registrada.</p>
          )}
        </Card>
      </div>
    </AdminPage>
  );
}
