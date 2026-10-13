import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ActionButton } from "@/components/admin/action-button";
import { AdminPage, EmptyRow, StatusPill, Table, Td, Th } from "@/components/admin/ui";
import { buttonClasses } from "@/components/ui/button";
import { duplicateProduct, setProductStatus } from "@/lib/admin/actions/products";
import { requireAdmin } from "@/lib/admin/auth";
import { COMMERCIAL_STATUS_LABEL, commercialStatus, type Availability } from "@/lib/types";
import { formatBRL } from "@/lib/money";
import { searchTerms } from "@/lib/search";

export const metadata: Metadata = { title: "Produtos" };

const FILTERS = [
  { value: "", label: "Todos" },
  { value: "disponiveis", label: "Disponíveis" },
  { value: "em-breve", label: "Em breve" },
  { value: "publicados", label: "Publicados" },
  { value: "rascunhos", label: "Rascunhos" },
  { value: "arquivados", label: "Arquivados" },
  { value: "planejados", label: "Aquisição planejada" },
  { value: "avaliacao", label: "Em avaliação" },
  { value: "documentacao", label: "Documentação pendente" },
  { value: "sem-preco", label: "Sem preço" },
  { value: "indisponiveis", label: "Indisponíveis" },
  { value: "midia", label: "Mídia pendente" },
  { value: "revisar", label: "Conteúdo a revisar" },
];

type Row = {
  id: string;
  slug: string;
  name: string;
  status: "draft" | "published" | "archived";
  price_cents: number | null;
  compare_at_price_cents: number | null;
  is_available: boolean;
  availability: string;
  track_inventory: boolean;
  stock_quantity: number | null;
  reserved_quantity: number;
  media_pending: boolean;
  is_featured: boolean;
  brand: { name: string };
  images: { url: string; is_primary: boolean }[];
  code: string;
  private: { content_verified: boolean; sku: string | null; sourcing_status: string; regulatory_status: string } | null;
};

const SOURCING_LABEL: Record<string, string> = { stock_confirmed: "Estoque confirmado", planned: "Aquisição planejada", evaluating: "Em avaliação" };
const TONE = { available: "green", coming_soon: "blue", draft: "gray", archived: "red", sold_out: "amber" } as const;

export default async function AdminProductsPage({ searchParams }: PageProps<"/admin/produtos">) {
  const { supabase } = await requireAdmin();
  const sp = await searchParams;
  const filtro = typeof sp.filtro === "string" ? sp.filtro : "";
  const q = typeof sp.q === "string" ? sp.q : "";

  let query = supabase
    .from("products")
    .select("id, slug, code, name, status, price_cents, compare_at_price_cents, is_available, availability, track_inventory, stock_quantity, reserved_quantity, media_pending, is_featured, brand:brands(name), images:product_images(url, is_primary), private:product_private(content_verified, sku, sourcing_status, regulatory_status)")
    .order("updated_at", { ascending: false })
    .limit(300);
  if (filtro === "publicados") query = query.eq("status", "published");
  if (filtro === "rascunhos") query = query.eq("status", "draft");
  if (filtro === "arquivados") query = query.eq("status", "archived");
  else if (filtro !== "rascunhos" && filtro !== "publicados") query = query.neq("status", "archived");
  if (filtro === "sem-preco") query = query.is("price_cents", null);
  if (filtro === "indisponiveis") query = query.eq("status", "published").in("availability", ["out_of_stock", "on_request"]);
  if (filtro === "disponiveis") query = query.eq("status", "published").eq("is_available", true);
  if (filtro === "em-breve") query = query.eq("availability", "coming_soon");
  for (const t of searchTerms(q)) query = query.ilike("search_text", `%${t}%`);

  const { data } = await query;
  let rows = (data ?? []) as unknown as Row[];
  if (filtro === "midia") rows = rows.filter((r) => r.media_pending || r.images.length === 0);
  if (filtro === "revisar") rows = rows.filter((r) => !r.private?.content_verified);
  if (filtro === "planejados") rows = rows.filter((r) => r.private?.sourcing_status === "planned");
  if (filtro === "avaliacao") rows = rows.filter((r) => r.private?.sourcing_status === "evaluating");
  if (filtro === "documentacao") rows = rows.filter((r) => r.private?.regulatory_status !== "verified");

  return (
    <AdminPage
      title="Produtos"
      description="Cadastre, edite e publique os produtos da loja."
      actions={
        <>
          <Link href="/admin/produtos/importar" className={buttonClasses("outline", "md", "normal-case tracking-normal")}>
            Importar / exportar
          </Link>
          <Link href="/admin/produtos/novo" className={buttonClasses("primary", "md", "normal-case tracking-normal")}>
            Novo produto
          </Link>
        </>
      }
    >
      {sp.excluido ? <p className="mb-4 rounded-md bg-success/10 px-3 py-2 text-sm text-success">Produto excluído.</p> : null}
      <form className="mb-4 flex flex-wrap items-center gap-2" role="search">
        <input name="q" defaultValue={q} placeholder="Buscar por nome, marca ou ativo" className="h-9 w-full max-w-xs rounded-md border border-line bg-paper px-3 text-sm focus:border-ink focus:outline-none" />
        {filtro ? <input type="hidden" name="filtro" value={filtro} /> : null}
        <button className="h-9 rounded-md border border-line px-3 text-sm hover:border-ink">Buscar</button>
      </form>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={`/admin/produtos${f.value ? `?filtro=${f.value}` : ""}`}
            className={filtro === f.value ? "rounded-full bg-ink px-3 py-1 text-xs text-paper" : "rounded-full border border-line px-3 py-1 text-xs hover:border-ink"}
          >
            {f.label}
          </Link>
        ))}
      </div>
      <Table>
        <thead>
          <tr>
            <Th className="w-14" />
            <Th>Produto</Th>
            <Th>Preço</Th>
            <Th>Estoque</Th>
            <Th>Status</Th>
            <Th className="text-right">Ações</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? <EmptyRow colSpan={6}>Nenhum produto encontrado.</EmptyRow> : null}
          {rows.map((r) => {
            const img = r.images.find((i) => i.is_primary) ?? r.images[0];
            const available = r.track_inventory ? (r.stock_quantity ?? 0) - r.reserved_quantity : null;
            return (
              <tr key={r.id} className="hover:bg-ivory/40">
                <Td>
                  <div className="relative h-11 w-11 overflow-hidden rounded bg-ivory">
                    {img ? <Image src={img.url} alt="" fill sizes="44px" className="product-photo object-contain p-1" /> : null}
                  </div>
                </Td>
                <Td>
                  <Link href={`/admin/produtos/${r.id}`} className="font-medium hover:underline">
                    {r.name}
                  </Link>
                  <p className="text-xs text-muted">
                    {r.code} · {r.brand?.name}
                    {r.private?.sku ? ` · SKU ${r.private.sku}` : ""}
                    {r.is_featured ? " · Destaque" : ""}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {r.media_pending || r.images.length === 0 ? <StatusPill tone="amber">Mídia pendente</StatusPill> : null}
                    {!r.private?.content_verified ? <StatusPill tone="gray">Revisar conteúdo</StatusPill> : null}
                    {r.private ? <StatusPill tone="gray">{SOURCING_LABEL[r.private.sourcing_status]}</StatusPill> : null}
                    {r.private && r.private.regulatory_status !== "verified" ? <StatusPill tone="amber">Documentação pendente</StatusPill> : null}
                  </div>
                </Td>
                <Td className="tabular-nums">
                  {r.price_cents == null ? <span className="text-xs text-warning">Sem preço</span> : formatBRL(r.price_cents)}
                  {r.compare_at_price_cents ? <p className="text-xs text-muted line-through">{formatBRL(r.compare_at_price_cents)}</p> : null}
                </Td>
                <Td className="text-xs">
                  {available == null ? (
                    <span className={r.is_available ? "text-success" : "text-muted"}>{r.is_available ? "Em estoque (sem contagem)" : r.availability === "on_request" ? "Sob consulta" : "Esgotado"}</span>
                  ) : (
                    <span className={available > 0 ? "" : "text-danger"}>
                      {available} disp.{r.reserved_quantity ? ` · ${r.reserved_quantity} reserv.` : ""}
                    </span>
                  )}
                </Td>
                <Td>
                  <StatusPill tone={TONE[commercialStatus(r.status, r.availability as Availability)]}>{COMMERCIAL_STATUS_LABEL[commercialStatus(r.status, r.availability as Availability)]}</StatusPill>
                </Td>
                <Td>
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {r.status === "published" ? (
                      <>
                        <a href={`/produtos/${r.slug}`} target="_blank" className="inline-flex h-8 items-center rounded-md border border-line px-3 text-xs hover:border-ink/40">
                          Ver
                        </a>
                        <ActionButton action={setProductStatus.bind(null, r.id, "draft")}>Despublicar</ActionButton>
                      </>
                    ) : (
                      <ActionButton action={setProductStatus.bind(null, r.id, "published")} variant="primary">
                        Publicar
                      </ActionButton>
                    )}
                    <ActionButton action={duplicateProduct.bind(null, r.id)}>Duplicar</ActionButton>
                  </div>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </AdminPage>
  );
}
