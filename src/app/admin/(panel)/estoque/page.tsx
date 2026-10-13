import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/admin/form-kit";
import { AdminPage, Card, EmptyRow, StatusPill, Table, Td, Th } from "@/components/admin/ui";
import { Field, Input, Select } from "@/components/ui/form";
import { recordStockMovement } from "@/lib/admin/actions/inventory";
import { requireAdmin } from "@/lib/admin/auth";
import { MOVEMENT_LABEL } from "@/lib/admin/labels";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Estoque" };

type ProductRow = {
  id: string;
  name: string;
  status: string;
  availability: string;
  track_inventory: boolean;
  stock_quantity: number | null;
  reserved_quantity: number;
  low_stock_threshold: number;
  brand: { name: string } | null;
  variants: { id: string; name: string; track_inventory: boolean; stock_quantity: number | null; reserved_quantity: number }[];
};

export default async function InventoryPage() {
  const { supabase } = await requireAdmin();
  const [{ data: products }, { data: movements }] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, status, availability, track_inventory, stock_quantity, reserved_quantity, low_stock_threshold, brand:brands(name), variants:product_variants(id, name, track_inventory, stock_quantity, reserved_quantity)")
      .neq("status", "archived")
      .order("name"),
    supabase
      .from("inventory_movements")
      .select("id, movement_type, quantity, stock_after, reserved_after, reason, created_at, order_id, product:products(id, name), variant:product_variants(name)")
      .order("created_at", { ascending: false })
      .limit(80),
  ]);
  const rows = (products ?? []) as unknown as ProductRow[];

  return (
    <AdminPage title="Estoque" description="Entradas, saídas e ajustes ficam registrados no histórico. Abrir uma conversa no WhatsApp nunca altera o estoque.">
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Table>
          <thead>
            <tr>
              <Th>Produto</Th>
              <Th>Controle</Th>
              <Th className="text-right">Em estoque</Th>
              <Th className="text-right">Reservado</Th>
              <Th className="text-right">Disponível</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? <EmptyRow colSpan={5}>Nenhum produto.</EmptyRow> : null}
            {rows.flatMap((p) => {
              const available = p.track_inventory ? (p.stock_quantity ?? 0) - p.reserved_quantity : null;
              const low = available != null && available <= p.low_stock_threshold;
              return [
                <tr key={p.id} className="hover:bg-ivory/40">
                  <Td>
                    <Link href={`/admin/produtos/${p.id}`} className="font-medium hover:underline">
                      {p.name}
                    </Link>
                    <p className="text-xs text-muted">{p.brand?.name}</p>
                  </Td>
                  <Td className="text-xs">
                    {p.track_inventory ? "Numérico" : <span className="text-muted">{p.availability === "in_stock" ? "Em estoque (sem contagem)" : p.availability === "on_request" ? "Sob consulta" : "Esgotado"}</span>}
                  </Td>
                  <Td className="text-right tabular-nums">{p.track_inventory ? p.stock_quantity : "—"}</Td>
                  <Td className="text-right tabular-nums">{p.track_inventory ? p.reserved_quantity : "—"}</Td>
                  <Td className="text-right tabular-nums">{available == null ? "—" : low ? <StatusPill tone={available > 0 ? "amber" : "red"}>{available}</StatusPill> : available}</Td>
                </tr>,
                ...p.variants.map((v) => (
                  <tr key={v.id} className="bg-ivory/30 text-xs">
                    <Td className="pl-8">↳ {v.name}</Td>
                    <Td>{v.track_inventory ? "Numérico" : "Segue o produto"}</Td>
                    <Td className="text-right tabular-nums">{v.track_inventory ? v.stock_quantity : "—"}</Td>
                    <Td className="text-right tabular-nums">{v.track_inventory ? v.reserved_quantity : "—"}</Td>
                    <Td className="text-right tabular-nums">{v.track_inventory ? (v.stock_quantity ?? 0) - v.reserved_quantity : "—"}</Td>
                  </tr>
                )),
              ];
            })}
          </tbody>
        </Table>

        <Card title="Registrar movimentação" className="h-fit lg:sticky lg:top-6">
          <ActionForm action={recordStockMovement} resetOnSuccess className="space-y-4">
            <Field label="Produto" htmlFor="item">
              <Select id="item" name="item" required defaultValue="">
                <option value="" disabled>
                  Selecione…
                </option>
                {rows.map((p) => [
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>,
                  ...p.variants.map((v) => (
                    <option key={v.id} value={`${p.id}:${v.id}`}>
                      {"   "}↳ {p.name} — {v.name}
                    </option>
                  )),
                ])}
              </Select>
            </Field>
            <Field label="Tipo" htmlFor="kind">
              <Select id="kind" name="kind" defaultValue="in">
                <option value="in">Entrada de mercadoria</option>
                <option value="out">Saída manual (perda, uso, brinde)</option>
                <option value="adjustment">Ajuste (+/−) após contagem</option>
              </Select>
            </Field>
            <Field label="Quantidade" htmlFor="quantity" hint="Para ajustes, use valores negativos para reduzir.">
              <Input id="quantity" name="quantity" inputMode="numeric" required />
            </Field>
            <Field label="Motivo / observação" htmlFor="reason">
              <Input id="reason" name="reason" maxLength={300} placeholder="Ex.: Nota fiscal 1234" />
            </Field>
            <SubmitButton className="w-full">Registrar</SubmitButton>
            <p className="text-xs text-muted">A primeira entrada ativa o controle numérico do produto.</p>
          </ActionForm>
        </Card>
      </div>

      <h2 className="mb-3 mt-10 text-sm font-semibold">Histórico de movimentações</h2>
      <Table>
        <thead>
          <tr>
            <Th>Data</Th>
            <Th>Produto</Th>
            <Th>Tipo</Th>
            <Th className="text-right">Qtd.</Th>
            <Th className="text-right">Estoque após</Th>
            <Th>Motivo</Th>
          </tr>
        </thead>
        <tbody>
          {(movements ?? []).length === 0 ? <EmptyRow colSpan={6}>Nenhuma movimentação registrada.</EmptyRow> : null}
          {((movements ?? []) as unknown as { id: number; movement_type: string; quantity: number; stock_after: number | null; reserved_after: number | null; reason: string | null; created_at: string; order_id: string | null; product: { id: string; name: string } | null; variant: { name: string } | null }[]).map((m) => (
            <tr key={m.id}>
              <Td className="text-xs text-muted">{formatDateTime(m.created_at)}</Td>
              <Td className="text-sm">
                {m.product?.name ?? "Produto removido"}
                {m.variant ? <span className="text-muted"> — {m.variant.name}</span> : null}
              </Td>
              <Td className="text-xs">{MOVEMENT_LABEL[m.movement_type]}</Td>
              <Td className="text-right tabular-nums">{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</Td>
              <Td className="text-right tabular-nums">
                {m.stock_after}
                {m.reserved_after ? <span className="text-xs text-muted"> ({m.reserved_after} res.)</span> : null}
              </Td>
              <Td className="text-xs">
                {m.reason}
                {m.order_id ? (
                  <Link href={`/admin/pedidos/${m.order_id}`} className="ml-1 underline">
                    ver pedido
                  </Link>
                ) : null}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </AdminPage>
  );
}
