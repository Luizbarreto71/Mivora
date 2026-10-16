import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { getPublicSupabase } from "@/lib/supabase/public";
import { normalizeSearch, searchTerms } from "@/lib/search";
import type {
  Banner,
  Brand,
  Category,
  CategoryKind,
  DeliveryZone,
  Faq,
  ImageRef,
  Kit,
  ProductDetail,
  ProductSummary,
  RitualStep,
  StoreSettings,
  Testimonial,
} from "@/lib/types";
import { NEW_ARRIVAL_DAYS, PAGE_SIZE, type CatalogFilters } from "./filters";
import { PRODUCT_SUMMARY_SELECT, sortImages, toProductSummary, toVariant, validCompareAt, type Row } from "./mappers";
import { categoryAncestors, expandCategorySlugs, isIrritatingPair } from "./rules";
import { TAGS } from "./tags";

function fail(context: string, error: { message: string }): never {
  throw new Error(`[catalog] ${context}: ${error.message}`);
}

export const DEFAULT_SETTINGS: StoreSettings = {
  store_name: "MIVORA",
  tagline: null,
  whatsapp_number: null,
  whatsapp_greeting: "Olá, MIVORA!",
  business_hours: null,
  contact_email: null,
  contact_phone: null,
  instagram_url: null,
  tiktok_url: null,
  facebook_url: null,
  legal_name: null,
  cnpj: null,
  address: null,
  announcement_enabled: false,
  announcement_text: null,
  announcement_href: null,
  delivery_summary: null,
  pickup_enabled: false,
  pickup_details: null,
  free_shipping_enabled: false,
  free_shipping_threshold_cents: null,
  minimum_order_cents: null,
  show_registered_mark: false,
  coming_soon_inquiry_enabled: true,
  welcome_offer_enabled: false,
  welcome_offer_percent: 10,
  welcome_offer_code: "BEMVINDA10",
  shipping_calculator_enabled: true,
  shipping_origin_cep: null,
  carrier_quotes_enabled: false,
  shipping_handling_days: 1,
  shipping_markup_percent: 0,
  shipping_extra_cents: 0,
  shipping_default_weight_g: 300,
  shipping_default_height_cm: 6,
  shipping_default_width_cm: 11,
  shipping_default_length_cm: 16,
  shipping_max_carrier_options: 4,
  top_bar_messages: ["Skincare coreano e cosméticos importados", "Frete e prazo calculados pelo CEP", "Atendimento via WhatsApp"],
  newsletter_enabled: true,
  online_payment_enabled: false,
  online_payment_max_installments: 12,
  apple_pay_enabled: false,
  apple_pay_merchant_id: null,
  apple_pay_certificate_id: null,
  apple_pay_product_id: null,
  mercadopago_public_key: null,
  apple_pay_domain_association: null,
  skin_analysis_enabled: true,
  skin_popup_interval_days: 0,
  skin_analysis_daily_limit: 200,
  about_headline: null,
  about_text: null,
  whatsapp_section_title: null,
  whatsapp_section_text: null,
  seo_title: null,
  seo_description: null,
};

// ---------------------------------------------------------------------------
// Settings & content
// ---------------------------------------------------------------------------

export async function getStoreSettings(): Promise<StoreSettings> {
  "use cache";
  cacheLife("hours");
  cacheTag(TAGS.settings);
  const sb = getPublicSupabase();
  if (!sb) return DEFAULT_SETTINGS;
  const { data, error } = await sb.from("store_settings").select("*").eq("id", 1).maybeSingle();
  if (error) fail("settings", error);
  return { ...DEFAULT_SETTINGS, ...(data ?? {}) };
}

export async function getDeliveryZones(): Promise<DeliveryZone[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(TAGS.settings);
  const sb = getPublicSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("delivery_zones")
    .select("id, name, region, method, fee_cents, free_over_cents, min_order_cents, estimate, notes, cep_ranges, cities")
    .eq("is_active", true)
    .order("sort_order");
  if (error) fail("delivery zones", error);
  return (data ?? []) as DeliveryZone[];
}

type HomeContent = {
  hero: Banner[];
  editorial: Banner[];
  routines: Banner | null;
  comingSoon: Banner | null;
  skinPopup: Banner | null;
  skinHome: Banner | null;
  ritual: RitualStep[];
  faqs: Faq[];
};

export async function getHomeContent(): Promise<HomeContent> {
  "use cache";
  cacheLife("hours");
  cacheTag(TAGS.content);
  const sb = getPublicSupabase();
  if (!sb) return { hero: [], editorial: [], routines: null, comingSoon: null, skinPopup: null, skinHome: null, ritual: [], faqs: [] };
  const [banners, ritual, faqs] = await Promise.all([
    // RLS hides inactive banners, campaigns outside their period and unpublished products
    sb.from("banners").select("*, product:products(slug, name, images:product_images(url, alt, is_primary, sort_order))").order("sort_order"),
    sb.from("ritual_steps").select("id, step_number, title, description, category:categories(slug, name)").order("sort_order"),
    sb.from("faqs").select("id, question, answer").is("product_id", null).eq("show_on_home", true).order("sort_order"),
  ]);
  if (banners.error) fail("banners", banners.error);
  if (ritual.error) fail("ritual", ritual.error);
  if (faqs.error) fail("faqs", faqs.error);
  const all = ((banners.data ?? []) as Row[]).map((b) => {
    const product = b.product as Row | null;
    return {
      ...(b as Banner),
      product: product ? { slug: product.slug as string, name: product.name as string, image: sortImages(product.images)[0] ?? null } : null,
    };
  });
  return {
    hero: all.filter((b) => b.placement === "hero"),
    editorial: all.filter((b) => b.placement === "editorial"),
    routines: all.find((b) => b.placement === "routines") ?? null,
    comingSoon: all.find((b) => b.placement === "coming_soon") ?? null,
    skinPopup: all.find((b) => b.placement === "skin_popup") ?? null,
    skinHome: all.find((b) => b.placement === "skin_home") ?? null,
    ritual: (ritual.data ?? []) as unknown as RitualStep[],
    faqs: (faqs.data ?? []) as Faq[],
  };
}

export type HomeNeed = { slug: string; name: string; productCount: number; categoryImage: ImageRef | null; productImages: ImageRef[] };

/** "Cuidados para cada necessidade": needs marked for the home, with their own photo or a product photo. */
export async function getHomeNeeds(): Promise<HomeNeed[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(TAGS.catalog);
  const sb = getPublicSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("categories")
    .select("slug, name, image_url, sort_order, links:product_categories(product:products(status, sort_order, is_featured, images:product_images(url, alt, is_primary, sort_order)))")
    .eq("kind", "concern")
    .eq("show_on_home", true)
    .order("sort_order")
    .order("name");
  if (error) fail("home needs", error);
  return ((data ?? []) as Row[]).map((c) => {
    const products = ((c.links ?? []) as Row[])
      .map((l) => l.product as Row | null)
      .filter((p): p is Row => Boolean(p && p.status === "published"))
      .sort((a, b) => Number(b.is_featured) - Number(a.is_featured) || a.sort_order - b.sort_order);
    return {
      slug: c.slug as string,
      name: c.name as string,
      productCount: products.length,
      categoryImage: c.image_url ? { url: c.image_url as string, alt: null } : null,
      productImages: products.map((p) => sortImages(p.images)[0]).filter((i): i is ImageRef => Boolean(i)).slice(0, 8),
    };
  });
}

/** Published testimonials (real and authorised; the section is hidden while there are none). */
export async function getTestimonials(): Promise<Testimonial[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(TAGS.content);
  const sb = getPublicSupabase();
  if (!sb) return [];
  const { data, error } = await sb.from("testimonials").select("id, author_name, author_detail, body, rating").order("sort_order").order("created_at", { ascending: false }).limit(8);
  if (error) fail("testimonials", error);
  return (data ?? []) as Testimonial[];
}

export async function getFaqs(): Promise<Faq[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(TAGS.content);
  const sb = getPublicSupabase();
  if (!sb) return [];
  const { data, error } = await sb.from("faqs").select("id, question, answer").is("product_id", null).order("sort_order");
  if (error) fail("faqs", error);
  return (data ?? []) as Faq[];
}

export async function getPage(slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(TAGS.content);
  const sb = getPublicSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("pages")
    .select("slug, title, body, seo_title, seo_description, updated_at")
    .eq("slug", slug)
    .maybeSingle();
  if (error) fail("page", error);
  return data as { slug: string; title: string; body: string; seo_title: string | null; seo_description: string | null; updated_at: string } | null;
}

// ---------------------------------------------------------------------------
// Brands & categories
// ---------------------------------------------------------------------------

export type BrandWithCount = Brand & { productCount: number; coverImage: string | null };

export async function getBrands(): Promise<BrandWithCount[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(TAGS.catalog);
  const sb = getPublicSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("brands")
    .select("*, products(id, status, sort_order, images:product_images(url, is_primary, sort_order))")
    .order("sort_order")
    .order("name");
  if (error) fail("brands", error);
  return (data ?? []).map((b: Row) => {
    const products = ((b.products ?? []) as Row[]).filter((p) => p.status === "published").sort((x, y) => x.sort_order - y.sort_order);
    const cover = products.map((p) => sortImages(p.images)[0]?.url).find(Boolean) ?? null;
    const { products: _omit, ...brand } = b;
    void _omit;
    return { ...(brand as Brand), productCount: products.length, coverImage: brand.image_url ?? cover };
  });
}

export async function getBrandBySlug(slug: string): Promise<Brand | null> {
  const brands = await getBrands();
  return brands.find((b) => b.slug === slug) ?? null;
}

export type CategoryWithCount = Category & { productCount: number };

/**
 * Published categories. productCount counts distinct published products in the
 * category or any subcategory, so empty branches can be hidden from navigation.
 */
export async function getCategories(kind?: CategoryKind): Promise<CategoryWithCount[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(TAGS.catalog);
  const sb = getPublicSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("categories")
    .select("id, parent_id, slug, name, kind, description, image_url, is_featured, show_on_home, sort_order, seo_title, seo_description, links:product_categories(product_id)")
    .order("sort_order")
    .order("name");
  if (error) fail("categories", error);
  const rows = (data ?? []) as Row[];
  const plain = rows as unknown as Category[];
  const direct = new Map(rows.map((c) => [c.id as string, new Set(((c.links ?? []) as Row[]).map((l) => l.product_id as string))]));
  const all = rows.map((c) => {
    const { links: _links, ...category } = c;
    void _links;
    const ids = new Set(direct.get(c.id));
    for (const other of plain) if (categoryAncestors(other.id, plain).includes(c.id)) direct.get(other.id)?.forEach((id) => ids.add(id));
    return { ...(category as Category), productCount: ids.size };
  });
  return kind ? all.filter((c) => c.kind === kind) : all;
}

export async function getCategoryBySlug(slug: string): Promise<CategoryWithCount | null> {
  const categories = await getCategories();
  return categories.find((c) => c.slug === slug) ?? null;
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export type ProductPage = { items: ProductSummary[]; total: number; page: number; pageCount: number };

async function productIdsInCategories(requested: string[]): Promise<Set<string>> {
  const sb = getPublicSupabase()!;
  const slugs = expandCategorySlugs(requested, await getCategories());
  const { data, error } = await sb
    .from("product_categories")
    .select("product_id, category:categories!inner(slug)")
    .in("category.slug", slugs);
  if (error) fail("category filter", error);
  return new Set((data ?? []).map((r: Row) => r.product_id as string));
}

export async function listProducts(filters: CatalogFilters, pageSize = PAGE_SIZE): Promise<ProductPage> {
  "use cache";
  cacheLife("hours");
  cacheTag(TAGS.catalog);
  const page = filters.pagina ?? 1;
  const sb = getPublicSupabase();
  if (!sb) return { items: [], total: 0, page, pageCount: 0 };

  // Category and need filters are resolved to product ids (AND across groups, OR within a group).
  const groups = [filters.categoria, filters.necessidade].filter((g): g is string[] => Boolean(g?.length));
  const found = await Promise.all(groups.map(productIdsInCategories));
  const ids =
    found.length === 0 ? null : found.reduce<Set<string>>((acc, set) => new Set([...acc].filter((id) => set.has(id))), found[0]);
  if (ids && ids.size === 0) return { items: [], total: 0, page, pageCount: 0 };

  let query = sb.from("products").select(PRODUCT_SUMMARY_SELECT, { count: "exact" }).eq("status", "published");
  if (ids) query = query.in("id", [...ids]);
  if (filters.marca?.length) query = query.in("brand.slug", filters.marca);
  for (const term of searchTerms(filters.q)) query = query.ilike("search_text", `%${term}%`);
  if (filters.pele) query = query.or(`skin_types.cs.{${filters.pele}},skin_types.cs.{todos}`);
  if (filters.disponibilidade === "disponivel") query = query.eq("is_available", true);
  if (filters.disponibilidade === "em-breve") query = query.eq("availability", "coming_soon");
  if (filters.disponibilidade === "sob-consulta") query = query.eq("availability", "on_request");
  if (filters.novidades) {
    const since = new Date(Date.now() - NEW_ARRIVAL_DAYS * 86_400_000).toISOString();
    query = query.or(`is_new.eq.true,published_at.gte.${since}`);
  }
  if (filters.min != null) query = query.gte("price_cents", Math.round(filters.min * 100));
  if (filters.max != null) query = query.lte("price_cents", Math.round(filters.max * 100));
  if (filters.colecao === "destaques") query = query.eq("is_featured", true);
  if (filters.colecao === "ofertas") query = query.not("price_cents", "is", null).not("compare_at_price_cents", "is", null);

  switch (filters.ordem) {
    case "novidades":
      query = query.order("published_at", { ascending: false, nullsFirst: false });
      break;
    case "preco-asc":
      query = query.order("price_cents", { ascending: true, nullsFirst: false });
      break;
    case "preco-desc":
      query = query.order("price_cents", { ascending: false, nullsFirst: false });
      break;
    case "az":
      query = query.order("name");
      break;
    default:
      query = query
        .order("is_featured", { ascending: false })
        .order("featured_order")
        .order("sort_order")
        .order("name");
  }

  const from = (page - 1) * pageSize;
  const { data, count, error } = await query.range(from, from + pageSize - 1);
  if (error) fail("products", error);
  const total = count ?? 0;
  return { items: (data ?? []).map(toProductSummary), total, page, pageCount: Math.ceil(total / pageSize) };
}

export async function getProductsByIds(ids: string[]): Promise<ProductSummary[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(TAGS.catalog);
  const sb = getPublicSupabase();
  if (!sb || ids.length === 0) return [];
  const { data, error } = await sb.from("products").select(PRODUCT_SUMMARY_SELECT).eq("status", "published").in("id", ids.slice(0, 100));
  if (error) fail("products by id", error);
  const map = new Map((data ?? []).map((r: Row) => [r.id as string, toProductSummary(r)]));
  return ids.map((id) => map.get(id)).filter((p): p is ProductSummary => Boolean(p));
}

export async function getFeaturedProducts(limit = 8): Promise<ProductSummary[]> {
  const featured = await listProducts({ colecao: "destaques" }, limit);
  if (featured.items.length > 0) return featured.items;
  return (await listProducts({}, limit)).items;
}

/** Best sellers come from manually confirmed/completed orders. Falls back to the curated selection. */
export async function getBestSellers(limit = 8): Promise<{ products: ProductSummary[]; basedOnSales: boolean }> {
  "use cache";
  cacheLife("hours");
  cacheTag(TAGS.catalog);
  const sb = getPublicSupabase();
  if (!sb) return { products: [], basedOnSales: false };
  const { data, error } = await sb.rpc("best_selling_products", { p_limit: limit });
  if (error) fail("best sellers", error);
  const ids = ((data ?? []) as { product_id: string }[]).map((r) => r.product_id);
  if (ids.length > 0) return { products: await getProductsByIds(ids), basedOnSales: true };
  return { products: await getFeaturedProducts(limit), basedOnSales: false };
}

const PRODUCT_DETAIL_SELECT = `
  id, slug, code, name, product_line, volume, coming_soon_note, short_description, description, benefits, key_ingredients, ingredients_full,
  how_to_use, warnings, skin_types, tags, price_cents, compare_at_price_cents, availability, track_inventory,
  stock_quantity, reserved_quantity, is_available, is_new, is_featured, video_url, seo_title, seo_description,
  published_at, updated_at,
  brand:brands!inner(id, slug, name),
  images:product_images(url, alt, width, height, sort_order, is_primary),
  variants:product_variants(id, name, price_cents, compare_at_price_cents, track_inventory, stock_quantity, reserved_quantity, is_active, sort_order),
  links:product_categories(category:categories(id, parent_id, slug, name, kind, is_published)),
  faqs(id, question, answer, sort_order, is_published)
`;

export async function getProductBySlug(slug: string): Promise<ProductDetail | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(TAGS.catalog);
  const sb = getPublicSupabase();
  if (!sb) return null;
  const { data, error } = await sb.from("products").select(PRODUCT_DETAIL_SELECT).eq("slug", slug).eq("status", "published").maybeSingle();
  if (error) fail("product", error);
  if (!data) return null;
  const row = data as Row;
  const summary = toProductSummary(row);
  const variants = ((row.variants ?? []) as Row[])
    .filter((v) => v.is_active)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((v) => toVariant(v, summary.isAvailable, summary.availability));
  return {
    ...summary,
    hasVariants: variants.length > 0,
    productLine: row.product_line,
    comingSoonNote: row.coming_soon_note,
    description: row.description,
    benefits: row.benefits ?? [],
    keyIngredients: row.key_ingredients ?? [],
    ingredientsFull: row.ingredients_full,
    howToUse: row.how_to_use,
    warnings: row.warnings,
    skinTypes: row.skin_types ?? [],
    tags: row.tags ?? [],
    videoUrl: row.video_url,
    images: sortImages(row.images),
    variants,
    categories: ((row.links ?? []) as Row[])
      .map((l) => l.category)
      .filter((c) => c && c.is_published)
      .map((c) => ({ id: c.id, parent_id: c.parent_id, slug: c.slug, name: c.name, kind: c.kind })),
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    faqs: ((row.faqs ?? []) as Row[])
      .filter((f) => f.is_published)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((f) => ({ id: f.id, question: f.question, answer: f.answer })),
  };
}

type IndexEntry = {
  id: string;
  brandId: string;
  tags: string[];
  available: boolean;
  featured: boolean;
  typeIds: Set<string>;
  groupIds: Set<string>;
  concernIds: Set<string>;
  typeSlugs: string[];
};

/** Lightweight index of every published product: categories (with ancestors), tags and availability. */
async function getCatalogIndex(): Promise<IndexEntry[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(TAGS.catalog);
  const sb = getPublicSupabase();
  if (!sb) return [];
  const [{ data, error }, categories] = await Promise.all([
    sb.from("products").select("id, brand_id, tags, is_available, is_featured, links:product_categories(category_id)").eq("status", "published").limit(2000),
    getCategories(),
  ]);
  if (error) fail("catalog index", error);
  const byId = new Map(categories.map((c) => [c.id, c]));
  return ((data ?? []) as Row[]).map((p) => {
    const typeIds = new Set<string>();
    const groupIds = new Set<string>();
    const concernIds = new Set<string>();
    for (const l of (p.links ?? []) as Row[]) {
      const c = byId.get(l.category_id);
      if (!c) continue;
      if (c.kind === "concern") {
        concernIds.add(c.id);
        continue;
      }
      const ancestors = categoryAncestors(c.id, categories);
      typeIds.add(c.id);
      ancestors.forEach((a) => typeIds.add(a));
      groupIds.add(ancestors.at(-1) ?? c.id);
    }
    return {
      id: p.id,
      brandId: p.brand_id,
      tags: p.tags ?? [],
      available: Boolean(p.is_available),
      featured: Boolean(p.is_featured),
      typeIds,
      groupIds,
      concernIds,
      typeSlugs: [...typeIds].map((id) => byId.get(id)?.slug).filter((x): x is string => Boolean(x)),
    };
  });
}

/**
 * Rule-based recommendations (no paid AI). Each product appears in one section only,
 * available products come first and irritating combinations are never suggested.
 */
export async function getRecommendations(productId: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(TAGS.catalog);
  const empty = { similar: [] as ProductSummary[], routine: [] as ProductSummary[], sameBrand: [] as ProductSummary[], discover: [] as ProductSummary[] };
  const sb = getPublicSupabase();
  if (!sb) return empty;
  const [index, manualRes] = await Promise.all([
    getCatalogIndex(),
    sb.from("product_relations").select("related_product_id, sort_order").eq("product_id", productId).order("sort_order"),
  ]);
  const me = index.find((p) => p.id === productId);
  if (!me) return empty;

  const overlap = (a: Set<string>, b: Set<string>) => [...a].filter((x) => b.has(x)).length;
  const candidates = index.filter((p) => p.id !== productId && !isIrritatingPair(me.tags, p.tags));
  const used = new Set<string>();
  const take = (score: (p: IndexEntry) => number, limit = 4) => {
    const picked = candidates
      .filter((p) => !used.has(p.id) && score(p) > 0)
      .sort((a, b) => Number(b.available) - Number(a.available) || score(b) - score(a))
      .slice(0, limit);
    picked.forEach((p) => used.add(p.id));
    return picked.map((p) => p.id);
  };

  // Manually curated relations lead "Você também pode gostar"
  const manual = ((manualRes.data ?? []) as Row[])
    .map((r) => r.related_product_id as string)
    .filter((id) => candidates.some((c) => c.id === id))
    .slice(0, 4);
  manual.forEach((id) => used.add(id));

  // "Complete seu ritual": other ritual steps (product groups) sharing a need; cleansing and moisturising always fit
  const routineIds = take((p) => {
    if ([...p.groupIds].some((g) => me.groupIds.has(g))) return 0;
    const basics = p.typeSlugs.some((slug) => slug === "limpeza" || slug === "hidratantes") ? 0.5 : 0;
    return overlap(me.concernIds, p.concernIds) + basics + (p.brandId === me.brandId ? 0.25 : 0);
  });
  const similarIds = [...manual, ...take((p) => overlap(me.concernIds, p.concernIds) + overlap(me.typeIds, p.typeIds) * 0.5, 4 - manual.length)];
  const brandIds = take((p) => (p.brandId === me.brandId ? 1 : 0));
  const discoverIds = take((p) => ([...p.groupIds].some((g) => !me.groupIds.has(g)) ? 1 + Number(p.featured) : 0));

  const [similar, routine, sameBrand, discover] = await Promise.all([
    getProductsByIds(similarIds),
    getProductsByIds(routineIds),
    getProductsByIds(brandIds),
    getProductsByIds(discoverIds),
  ]);
  return { similar, routine, sameBrand, discover };
}

export type RitualProduct = ProductSummary & { categorySlugs: string[]; skinTypes: string[]; tags: string[] };

/** Products with their category slugs (including parent groups), for ritual building. */
export async function getRitualCatalog(): Promise<RitualProduct[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(TAGS.catalog);
  const sb = getPublicSupabase();
  if (!sb) return [];
  const [{ data, error }, categories] = await Promise.all([
    sb
      .from("products")
      .select(`${PRODUCT_SUMMARY_SELECT}, skin_types, tags, links:product_categories(category_id)`)
      .eq("status", "published")
      .order("is_featured", { ascending: false })
      .order("sort_order")
      .limit(300),
    getCategories(),
  ]);
  if (error) fail("ritual catalog", error);
  const slugOf = new Map(categories.map((c) => [c.id, c.slug]));
  return (data ?? []).map((r: Row) => {
    const ids = ((r.links ?? []) as Row[]).flatMap((l) => [l.category_id as string, ...categoryAncestors(l.category_id, categories)]);
    return {
      ...toProductSummary(r),
      skinTypes: r.skin_types ?? [],
      tags: r.tags ?? [],
      categorySlugs: [...new Set(ids.map((id) => slugOf.get(id)).filter((x): x is string => Boolean(x)))],
    };
  });
}

/**
 * Ready-made ritual for the home page: one AVAILABLE product per ritual step,
 * never combining irritating actives.
 */
export async function getSuggestedRitual(steps: RitualStep[]) {
  const catalog = (await getRitualCatalog()).filter((p) => p.isAvailable);
  const chosen: { step: RitualStep; product: RitualProduct }[] = [];
  for (const step of steps) {
    if (!step.category) continue;
    const slug = step.category.slug;
    const product = catalog.find((p) => p.categorySlugs.includes(slug) && !chosen.some((c) => c.product.id === p.id || isIrritatingPair(c.product.tags, p.tags)));
    if (product) chosen.push({ step, product });
  }
  return chosen;
}

// ---------------------------------------------------------------------------
// Kits
// ---------------------------------------------------------------------------

const KIT_SELECT = `id, slug, name, short_description, description, image_url, price_cents, compare_at_price_cents, seo_title, seo_description, sort_order,
  items:kit_items(quantity, sort_order, product:products(${PRODUCT_SUMMARY_SELECT}))`;

function toKit(row: Row): Kit {
  const items = ((row.items ?? []) as Row[])
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((i) => ({ quantity: i.quantity as number, product: i.product ? toProductSummary(i.product) : null }));
  const complete = items.length > 0 && items.every((i) => i.product);
  const valid = items.filter((i): i is { quantity: number; product: ProductSummary } => Boolean(i.product));
  const isAvailable = complete && valid.every((i) => i.product.isAvailable && (i.product.maxQuantity == null || i.product.maxQuantity >= i.quantity));
  const limits = valid.filter((i) => i.product.maxQuantity != null).map((i) => Math.floor((i.product.maxQuantity ?? 0) / i.quantity));
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    shortDescription: row.short_description,
    description: row.description,
    imageUrl: row.image_url ?? valid[0]?.product.image?.url ?? null,
    priceCents: row.price_cents,
    compareAtCents: validCompareAt(row.price_cents, row.compare_at_price_cents),
    isAvailable,
    maxQuantity: limits.length ? Math.min(...limits) : null,
    items: valid,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
  };
}

export async function getKits(): Promise<Kit[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(TAGS.catalog);
  const sb = getPublicSupabase();
  if (!sb) return [];
  const { data, error } = await sb.from("kits").select(KIT_SELECT).eq("status", "published").order("sort_order").order("name");
  if (error) fail("kits", error);
  return (data ?? []).map(toKit);
}

export async function getKitBySlug(slug: string): Promise<Kit | null> {
  return (await getKits()).find((k) => k.slug === slug) ?? null;
}

// ---------------------------------------------------------------------------
// Search suggestions & sitemap
// ---------------------------------------------------------------------------

export async function getSearchSuggestions(q: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(TAGS.catalog);
  const needle = normalizeSearch(q.trim());
  if (needle.length < 2) return { products: [], brands: [], categories: [] };
  const [page, brands, categories] = await Promise.all([listProducts({ q }, 6), getBrands(), getCategories()]);
  const match = (s: string) => normalizeSearch(s).includes(needle);
  return {
    products: page.items,
    brands: brands.filter((b) => b.productCount > 0 && match(b.name)).slice(0, 4).map((b) => ({ slug: b.slug, name: b.name })),
    categories: categories
      .filter((c) => c.productCount > 0 && match(c.name))
      .slice(0, 4)
      .map((c) => ({ slug: c.slug, name: c.name })),
  };
}

export async function getSitemapData() {
  "use cache";
  cacheLife("hours");
  cacheTag(TAGS.catalog);
  const sb = getPublicSupabase();
  if (!sb) return { products: [], brands: [], categories: [], kits: [] };
  const [products, brands, categories, kits] = await Promise.all([
    sb.from("products").select("slug, updated_at").eq("status", "published"),
    sb.from("brands").select("slug, updated_at"),
    sb.from("categories").select("slug, updated_at"),
    sb.from("kits").select("slug, updated_at").eq("status", "published"),
  ]);
  type Entry = { slug: string; updated_at: string };
  return {
    products: (products.data ?? []) as Entry[],
    brands: (brands.data ?? []) as Entry[],
    categories: (categories.data ?? []) as Entry[],
    kits: (kits.data ?? []) as Entry[],
  };
}
