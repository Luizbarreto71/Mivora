import type { Metadata } from "next";
import Link from "next/link";
import { AdminPage, StatusPill, Table, Td, Th } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin/auth";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Páginas" };

export default async function AdminPagesPage() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.from("pages").select("slug, title, needs_review, is_published, updated_at").order("title");
  return (
    <AdminPage title="Páginas institucionais" description="Sobre, políticas, termos e contato. Revise os textos com os dados reais da empresa antes do lançamento.">
      <Table>
        <thead>
          <tr>
            <Th>Página</Th>
            <Th>Atualizada</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((p) => (
            <tr key={p.slug} className="hover:bg-ivory/40">
              <Td>
                <Link href={`/admin/paginas/${p.slug}`} className="font-medium hover:underline">
                  {p.title}
                </Link>
                <p className="text-xs text-muted">/{p.slug}</p>
              </Td>
              <Td className="text-xs text-muted">{formatDateTime(p.updated_at)}</Td>
              <Td className="space-x-1">
                {p.needs_review ? <StatusPill tone="amber">Revisar</StatusPill> : <StatusPill tone="green">Revisada</StatusPill>}
                {!p.is_published ? <StatusPill tone="gray">Oculta</StatusPill> : null}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </AdminPage>
  );
}
