import type { Metadata } from "next";
import { AdminPage, EmptyRow, Table, Td, Th } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin/auth";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Auditoria" };

const ENTITY: Record<string, string> = {
  products: "Produto",
  product_private: "Dados internos do produto",
  product_images: "Imagem",
  product_variants: "Variante",
  brands: "Marca",
  categories: "Categoria",
  kits: "Kit",
  store_settings: "Configurações",
  delivery_zones: "Entrega",
  banners: "Banner",
  ritual_steps: "Ritual",
  faqs: "FAQ",
  pages: "Página",
  product_suggestions: "Sugestão",
  order_intents: "Pedido",
  admin_users: "Administrador",
};
const ACTION: Record<string, string> = { insert: "Criou", update: "Alterou", delete: "Excluiu" };

export default async function AuditPage() {
  const { supabase } = await requireAdmin();
  const [{ data }, { data: admins }] = await Promise.all([
    supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(200),
    supabase.from("admin_users").select("user_id, display_name, role"),
  ]);
  const who = (id: string | null) => {
    if (!id) return "Sistema / site";
    const a = admins?.find((x) => x.user_id === id);
    return a?.display_name ?? `Admin ${id.slice(0, 8)}`;
  };
  return (
    <AdminPage title="Auditoria" description="Últimas 200 operações relevantes registradas automaticamente pelo banco de dados.">
      <Table>
        <thead>
          <tr>
            <Th>Data</Th>
            <Th>Quem</Th>
            <Th>Ação</Th>
            <Th>Registro</Th>
            <Th>Campos alterados</Th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).length === 0 ? <EmptyRow colSpan={5}>Nenhum registro.</EmptyRow> : null}
          {(data ?? []).map((a) => (
            <tr key={a.id}>
              <Td className="whitespace-nowrap text-xs text-muted">{formatDateTime(a.created_at)}</Td>
              <Td className="text-xs">{who(a.actor_id)}</Td>
              <Td className="text-xs">{ACTION[a.action] ?? a.action}</Td>
              <Td className="text-xs">
                {ENTITY[a.entity] ?? a.entity}
                {a.details?.name || a.details?.title ? <span className="text-muted"> · {a.details.name ?? a.details.title}</span> : null}
              </Td>
              <Td className="max-w-xs truncate text-xs text-muted" title={(a.changed_fields ?? []).join(", ")}>
                {(a.changed_fields ?? []).join(", ")}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </AdminPage>
  );
}
