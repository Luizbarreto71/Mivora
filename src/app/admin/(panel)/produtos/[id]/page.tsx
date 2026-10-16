import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/admin/action-button";
import { ImageManager } from "@/components/admin/image-manager";
import { ProductForm } from "@/components/admin/product-form";
import { SkinProfileCard, type SkinProfileRow } from "@/components/admin/skin-profile-card";
import { AdminPage, Card, StatusPill } from "@/components/admin/ui";
import { deleteProduct, duplicateProduct, setProductStatus } from "@/lib/admin/actions/products";
import { requireAdmin } from "@/lib/admin/auth";
import { categoryAncestors } from "@/lib/catalog/rules";
import { productNeeds, productStep, productTime } from "@/lib/skin/recommend";
import { NEED_LABEL } from "@/lib/skin/taxonomy";
import { COMMERCIAL_STATUS_LABEL, commercialStatus } from "@/lib/types";
import { loadFormOptions, loadProductForEdit } from "@/lib/admin/product-loader";

export const metadata: Metadata = { title: "Editar produto" };

export default async function EditProductPage({ params, searchParams }: PageProps<"/admin/produtos/[id]">) {
  const { supabase } = await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [loaded, options, { data: categoryRows }, { data: skinRow }] = await Promise.all([
    loadProductForEdit(supabase, id),
    loadFormOptions(supabase),
    supabase.from("categories").select("id, slug, parent_id"),
    supabase.from("product_skin_profiles").select("recommendable, routine_step, routine_time, precautions, alternative_product_id").eq("product_id", id).maybeSingle(),
  ]);
  if (!loaded) notFound();
  const { product, values, images } = loaded;
  // what the skin analysis derives from the categories (same rules as the store)
  const categories = categoryRows ?? [];
  const slugOf = new Map(categories.map((c) => [c.id, c.slug as string]));
  const categorySlugs = [
    ...new Set(values.categoryIds.flatMap((cid) => [cid, ...categoryAncestors(cid, categories)]).map((cid) => slugOf.get(cid) ?? "")),
  ].filter(Boolean);
  const skinProfile = (skinRow ?? null) as SkinProfileRow | null;
  const profileForRules = skinProfile ? { recommendable: skinProfile.recommendable, step: null, time: null, precautions: null, alternativeId: null } : null;
  const derivedStep = productStep({ categorySlugs, profile: profileForRules });
  const derived = {
    needs: productNeeds({ categorySlugs }).map((n) => NEED_LABEL[n]),
    step: derivedStep,
    time: derivedStep ? productTime({ tags: values.tags.split(",").map((t) => t.trim()).filter(Boolean), profile: null }, derivedStep) : null,
    benefits: values.benefits.split("\n").filter((b) => b.trim()).length,
    warnings: Boolean(values.warnings.trim()),
  };

  return (
    <AdminPage
      title={product.name}
      description={
        <span className="flex items-center gap-2">
          <StatusPill tone={({ available: "green", coming_soon: "blue", on_request: "dark", draft: "gray", archived: "red", sold_out: "amber" } as const)[commercialStatus(product.status, product.availability)]}>
            {COMMERCIAL_STATUS_LABEL[commercialStatus(product.status, product.availability)]}
          </StatusPill>
          <span className="text-xs text-muted">{product.code}</span>
          {product.status === "published" ? (
            <Link href={`/produtos/${product.slug}`} target="_blank" className="text-xs underline">
              Ver na loja
            </Link>
          ) : null}
        </span>
      }
      back={{ href: "/admin/produtos", label: "Produtos" }}
      actions={
        <>
          {product.status === "published" ? (
            <ActionButton action={setProductStatus.bind(null, product.id, "draft")}>Despublicar</ActionButton>
          ) : (
            <ActionButton action={setProductStatus.bind(null, product.id, "published")} variant="primary">
              Publicar
            </ActionButton>
          )}
          <ActionButton action={duplicateProduct.bind(null, product.id)}>Duplicar</ActionButton>
          {product.status !== "archived" ? (
            <ActionButton action={setProductStatus.bind(null, product.id, "archived")} confirm="Arquivar este produto? Ele sai da loja, mas o histórico é mantido.">
              Arquivar
            </ActionButton>
          ) : null}
          {product.status !== "published" ? (
            <ActionButton action={deleteProduct.bind(null, product.id)} variant="danger" confirm="Excluir definitivamente? Esta ação não pode ser desfeita.">
              Excluir
            </ActionButton>
          ) : null}
        </>
      }
    >
      {sp.criado ? <p className="mb-4 rounded-md bg-success/10 px-3 py-2 text-sm text-success">Produto criado. Agora envie as fotos.</p> : null}
      {sp.duplicado ? <p className="mb-4 rounded-md bg-success/10 px-3 py-2 text-sm text-success">Cópia criada como rascunho. Revise nome, URL e preço antes de publicar.</p> : null}
      <Card title="Fotos" description="A primeira marcada como principal aparece nos cards e no compartilhamento." className="mb-6">
        <ImageManager productId={product.id} images={images} />
      </Card>
      <ProductForm
        initial={values}
        {...options}
        stock={{ tracked: product.track_inventory, quantity: product.stock_quantity, reserved: product.reserved_quantity }}
      />
      <SkinProfileCard
        productId={product.id}
        profile={skinProfile}
        derived={derived}
        alternatives={options.allProducts.filter((p) => p.id !== product.id && p.status === "published").map(({ id: pid, name }) => ({ id: pid, name }))}
      />
    </AdminPage>
  );
}
