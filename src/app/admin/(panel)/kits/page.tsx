import type { Metadata } from "next";
import Link from "next/link";
import { AdminPage, EmptyRow, StatusPill, Table, Td, Th } from "@/components/admin/ui";
import { buttonClasses } from "@/components/ui/button";
import { requireAdmin } from "@/lib/admin/auth";
import { PRODUCT_STATUS_LABEL } from "@/lib/admin/labels";
import { formatBRL } from "@/lib/money";

export const metadata: Metadata = { title: "Kits" };

export default async function AdminKitsPage() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.from("kits").select("id, name, slug, status, price_cents, items:kit_items(quantity)").order("sort_order").order("name");
  return (
    <AdminPage
      title="Kits e combinações"
      description="Combine produtos com um preço definido. A disponibilidade do kit respeita o estoque de cada item."
      actions={
        <Link href="/admin/kits/novo" className={buttonClasses("primary", "md", "normal-case tracking-normal")}>
          Novo kit
        </Link>
      }
    >
      <Table>
        <thead>
          <tr>
            <Th>Kit</Th>
            <Th>Itens</Th>
            <Th>Preço</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).length === 0 ? <EmptyRow colSpan={4}>Nenhum kit criado.</EmptyRow> : null}
          {(data ?? []).map((k) => (
            <tr key={k.id} className="hover:bg-ivory/40">
              <Td>
                <Link href={`/admin/kits/${k.id}`} className="font-medium hover:underline">
                  {k.name}
                </Link>
              </Td>
              <Td>{(k.items as { quantity: number }[]).reduce((s, i) => s + i.quantity, 0)}</Td>
              <Td>{k.price_cents == null ? <span className="text-xs text-warning">Sem preço</span> : formatBRL(k.price_cents)}</Td>
              <Td>
                <StatusPill tone={k.status === "published" ? "green" : "gray"}>{PRODUCT_STATUS_LABEL[k.status as keyof typeof PRODUCT_STATUS_LABEL]}</StatusPill>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </AdminPage>
  );
}
