import type { Metadata } from "next";
import Link from "next/link";
import { AdminPage, EmptyRow, StatusPill, Table, Td, Th } from "@/components/admin/ui";
import { buttonClasses } from "@/components/ui/button";
import { requireAdmin } from "@/lib/admin/auth";

export const metadata: Metadata = { title: "Categorias" };

export default async function AdminCategoriesPage({ searchParams }: PageProps<"/admin/categorias">) {
  const { supabase } = await requireAdmin();
  const sp = await searchParams;
  const { data } = await supabase.from("categories").select("id, name, slug, kind, is_published, is_featured, sort_order, links:product_categories(count)").order("kind").order("sort_order");
  const groups = [
    { kind: "product_type", title: "Tipos de produto" },
    { kind: "concern", title: "Necessidades (Encontre seu cuidado)" },
  ];
  return (
    <AdminPage
      title="Categorias"
      actions={
        <Link href="/admin/categorias/nova" className={buttonClasses("primary", "md", "normal-case tracking-normal")}>
          Nova categoria
        </Link>
      }
    >
      {sp.criada ? <p className="mb-4 rounded-md bg-success/10 px-3 py-2 text-sm text-success">Categoria criada.</p> : null}
      <div className="space-y-8">
        {groups.map((g) => {
          const rows = (data ?? []).filter((c) => c.kind === g.kind);
          return (
            <div key={g.kind}>
              <h2 className="mb-3 text-sm font-semibold">{g.title}</h2>
              <Table>
                <thead>
                  <tr>
                    <Th>Ordem</Th>
                    <Th>Categoria</Th>
                    <Th>Produtos</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? <EmptyRow colSpan={4}>Nenhuma categoria.</EmptyRow> : null}
                  {rows.map((c) => (
                    <tr key={c.id} className="hover:bg-ivory/40">
                      <Td className="w-16 tabular-nums text-muted">{c.sort_order}</Td>
                      <Td>
                        <Link href={`/admin/categorias/${c.id}`} className="font-medium hover:underline">
                          {c.name}
                        </Link>
                        <p className="text-xs text-muted">/categorias/{c.slug}</p>
                      </Td>
                      <Td>{(c.links as unknown as { count: number }[])[0]?.count ?? 0}</Td>
                      <Td className="space-x-1">
                        {c.is_published ? <StatusPill tone="green">Publicada</StatusPill> : <StatusPill tone="gray">Oculta</StatusPill>}
                        {c.is_featured ? <StatusPill tone="dark">Destaque</StatusPill> : null}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          );
        })}
      </div>
    </AdminPage>
  );
}
