import type { Metadata } from "next";
import Link from "next/link";
import { AdminPage, EmptyRow, StatusPill, Table, Td, Th } from "@/components/admin/ui";
import { buttonClasses } from "@/components/ui/button";
import { requireAdmin } from "@/lib/admin/auth";

export const metadata: Metadata = { title: "Marcas" };

export default async function AdminBrandsPage({ searchParams }: PageProps<"/admin/marcas">) {
  const { supabase } = await requireAdmin();
  const sp = await searchParams;
  const { data } = await supabase.from("brands").select("id, name, slug, is_published, sort_order, products(count)").order("sort_order").order("name");
  return (
    <AdminPage
      title="Marcas"
      description="Novas marcas podem ser adicionadas a qualquer momento, sem alterar o código."
      actions={
        <Link href="/admin/marcas/nova" className={buttonClasses("primary", "md", "normal-case tracking-normal")}>
          Nova marca
        </Link>
      }
    >
      {sp.criada ? <p className="mb-4 rounded-md bg-success/10 px-3 py-2 text-sm text-success">Marca criada.</p> : null}
      <Table>
        <thead>
          <tr>
            <Th>Ordem</Th>
            <Th>Marca</Th>
            <Th>Produtos</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).length === 0 ? <EmptyRow colSpan={4}>Nenhuma marca.</EmptyRow> : null}
          {(data ?? []).map((b) => (
            <tr key={b.id} className="hover:bg-ivory/40">
              <Td className="w-16 tabular-nums text-muted">{b.sort_order}</Td>
              <Td>
                <Link href={`/admin/marcas/${b.id}`} className="font-medium hover:underline">
                  {b.name}
                </Link>
                <p className="text-xs text-muted">/marcas/{b.slug}</p>
              </Td>
              <Td>{(b.products as unknown as { count: number }[])[0]?.count ?? 0}</Td>
              <Td>{b.is_published ? <StatusPill tone="green">Publicada</StatusPill> : <StatusPill tone="gray">Oculta</StatusPill>}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </AdminPage>
  );
}
