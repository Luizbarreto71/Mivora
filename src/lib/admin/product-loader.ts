import "server-only";
import type { AdminSession } from "@/lib/admin/auth";
import type { ProductFormValues } from "@/lib/admin/schemas";
import { centsToInput } from "@/lib/money";

export const EMPTY_PRODUCT: ProductFormValues = {
  name: "",
  slug: "",
  brandId: "",
  productLine: "",
  volume: "",
  shortDescription: "",
  description: "",
  benefits: "",
  keyIngredients: "",
  ingredientsFull: "",
  howToUse: "",
  warnings: "",
  skinTypes: [],
  tags: "",
  categoryIds: [],
  price: "",
  compareAtPrice: "",
  cost: "",
  sku: "",
  barcode: "",
  supplier: "",
  contentVerified: false,
  internalNotes: "",
  status: "draft",
  availability: "coming_soon",
  comingSoonNote: "",
  sourcingStatus: "planned",
  regulatoryStatus: "not_verified",
  regulatoryReference: "",
  supplierDocument: "",
  batchNumber: "",
  expiryDate: "",
  documentationNotes: "",
  relatedIds: [],
  trackInventory: false,
  initialStock: "",
  lowStockThreshold: "3",
  isFeatured: false,
  featuredOrder: "0",
  isNew: false,
  sortOrder: "0",
  videoUrl: "",
  mediaPending: false,
  seoTitle: "",
  seoDescription: "",
  variants: [],
};

export async function loadFormOptions(supabase: AdminSession["supabase"]) {
  const [brands, categories, products] = await Promise.all([
    supabase.from("brands").select("id, name").order("name"),
    supabase.from("categories").select("id, name, kind, parent_id, is_published").order("sort_order").order("name"),
    supabase.from("products").select("id, name, status, availability").neq("status", "archived").order("name"),
  ]);
  const cats = (categories.data ?? []).filter((c) => c.is_published);
  const types = cats.filter((c) => c.kind === "product_type");
  const roots = types.filter((c) => !c.parent_id);
  return {
    brands: brands.data ?? [],
    // Parent groups followed by their subcategories (depth 1)
    productTypes: roots.flatMap((r) => [
      { id: r.id, name: r.name, depth: 0 },
      ...types.filter((c) => c.parent_id === r.id).map((c) => ({ id: c.id, name: c.name, depth: 1 })),
    ]),
    concerns: cats.filter((c) => c.kind === "concern").map(({ id, name }) => ({ id, name, depth: 0 })),
    allProducts: (products.data ?? []) as { id: string; name: string; status: string; availability: string }[],
  };
}

export async function loadProductForEdit(supabase: AdminSession["supabase"], id: string) {
  const { data: p } = await supabase
    .from("products")
    .select("*, private:product_private(*), links:product_categories(category_id), relations:product_relations!product_relations_product_id_fkey(related_product_id, sort_order), images:product_images(id, url, alt, is_primary, sort_order), variants:product_variants(*)")
    .eq("id", id)
    .maybeSingle();
  if (!p) return null;
  const priv = (Array.isArray(p.private) ? p.private[0] : p.private) ?? {};
  const values: ProductFormValues = {
    id: p.id,
    name: p.name,
    slug: p.slug,
    brandId: p.brand_id,
    productLine: p.product_line ?? "",
    volume: p.volume ?? "",
    shortDescription: p.short_description ?? "",
    description: p.description ?? "",
    benefits: (p.benefits ?? []).join("\n"),
    keyIngredients: (p.key_ingredients ?? []).join("\n"),
    ingredientsFull: p.ingredients_full ?? "",
    howToUse: p.how_to_use ?? "",
    warnings: p.warnings ?? "",
    skinTypes: p.skin_types ?? [],
    tags: (p.tags ?? []).join(", "),
    categoryIds: (p.links ?? []).map((l: { category_id: string }) => l.category_id),
    price: centsToInput(p.price_cents),
    compareAtPrice: centsToInput(p.compare_at_price_cents),
    cost: centsToInput(priv.cost_cents),
    sku: priv.sku ?? "",
    barcode: priv.barcode ?? "",
    supplier: priv.supplier ?? "",
    contentVerified: Boolean(priv.content_verified),
    internalNotes: priv.internal_notes ?? "",
    status: p.status,
    availability: p.availability,
    comingSoonNote: p.coming_soon_note ?? "",
    sourcingStatus: priv.sourcing_status ?? "planned",
    regulatoryStatus: priv.regulatory_status ?? "not_verified",
    regulatoryReference: priv.regulatory_reference ?? "",
    supplierDocument: priv.supplier_document ?? "",
    batchNumber: priv.batch_number ?? "",
    expiryDate: priv.expiry_date ?? "",
    documentationNotes: priv.documentation_notes ?? "",
    relatedIds: [...(p.relations ?? [])]
      .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order)
      .map((r: { related_product_id: string }) => r.related_product_id),
    trackInventory: p.track_inventory,
    initialStock: "",
    lowStockThreshold: String(p.low_stock_threshold ?? 3),
    isFeatured: p.is_featured,
    featuredOrder: String(p.featured_order ?? 0),
    isNew: p.is_new,
    sortOrder: String(p.sort_order ?? 0),
    videoUrl: p.video_url ?? "",
    mediaPending: p.media_pending,
    seoTitle: p.seo_title ?? "",
    seoDescription: p.seo_description ?? "",
    variants: [...(p.variants ?? [])]
      .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order)
      .map((v: { id: string; name: string; sku: string | null; price_cents: number | null; compare_at_price_cents: number | null; track_inventory: boolean; stock_quantity: number | null; is_active: boolean }) => ({
        id: v.id,
        name: v.name,
        sku: v.sku ?? "",
        price: centsToInput(v.price_cents),
        compareAtPrice: centsToInput(v.compare_at_price_cents),
        trackInventory: v.track_inventory,
        stockQuantity: v.stock_quantity == null ? "" : String(v.stock_quantity),
        isActive: v.is_active,
      })),
  };
  return {
    values,
    product: p as { id: string; slug: string; code: string; name: string; availability: "in_stock" | "out_of_stock" | "on_request" | "coming_soon"; status: "draft" | "published" | "archived"; track_inventory: boolean; stock_quantity: number | null; reserved_quantity: number; media_pending: boolean },
    images: (p.images ?? []) as { id: string; url: string; alt: string | null; is_primary: boolean; sort_order: number }[],
  };
}
