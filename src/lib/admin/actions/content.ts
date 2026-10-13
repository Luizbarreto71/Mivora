"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { dbErrorMessage, fail, formBool, formInt, formNullable, formString, success, type ActionState } from "@/lib/admin/action-state";
import { requireAdminAction } from "@/lib/admin/auth";
import { TAGS } from "@/lib/catalog/tags";
import { parseBRLToCents } from "@/lib/money";
import { slugify } from "@/lib/utils";
import { normalizeWhatsAppNumber } from "@/lib/whatsapp";

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const uuid = z.uuid();

function slugFrom(fd: FormData, fallbackKey = "name") {
  const raw = formString(fd, "slug") || slugify(formString(fd, fallbackKey));
  return SLUG_RE.test(raw) ? raw : null;
}

function moneyField(fd: FormData, key: string): { ok: true; value: number | null } | { ok: false } {
  const cents = parseBRLToCents(formString(fd, key));
  return Number.isNaN(cents) ? { ok: false } : { ok: true, value: cents };
}

const safeHref = (v: string | null) => (v && (v.startsWith("/") || v.startsWith("https://")) ? v : null);
const safeUrl = (v: string | null) => (v && /^https:\/\//.test(v) ? v : null);
/** Images may be uploaded (https storage URL) or bundled with the site (/path). */
const safeImage = (v: string | null) => (v && (/^https:\/\//.test(v) || /^\/[\w\-./]+$/.test(v)) ? v : null);

// ---------------------------------------------------------------------------
// Brands
// ---------------------------------------------------------------------------
export async function saveBrand(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireAdminAction();
  const id = formNullable(fd, "id");
  const name = formString(fd, "name");
  const slug = slugFrom(fd);
  if (name.length < 2) return fail("Informe o nome da marca.", { name: "Obrigatório" });
  if (!slug) return fail("URL inválida.", { slug: "Use letras minúsculas, números e hífens." });
  const row = {
    name,
    slug,
    tagline: formNullable(fd, "tagline"),
    description: formNullable(fd, "description"),
    origin_country: formNullable(fd, "origin_country"),
    website_url: safeUrl(formNullable(fd, "website_url")),
    image_url: safeImage(formNullable(fd, "image_url")),
    is_published: formBool(fd, "is_published"),
    sort_order: formInt(fd, "sort_order"),
    seo_title: formNullable(fd, "seo_title"),
    seo_description: formNullable(fd, "seo_description"),
  };
  const { error } = id ? await supabase.from("brands").update(row).eq("id", id) : await supabase.from("brands").insert(row);
  if (error) return fail(dbErrorMessage(error));
  updateTag(TAGS.catalog);
  if (!id) redirect("/admin/marcas?criada=1");
  return success("Marca salva.");
}

export async function deleteBrand(id: string) {
  const { supabase } = await requireAdminAction();
  const { count } = await supabase.from("products").select("id", { count: "exact", head: true }).eq("brand_id", uuid.parse(id));
  if (count) return fail("Esta marca possui produtos. Despublique-a em vez de excluir.");
  const { error } = await supabase.from("brands").delete().eq("id", id);
  if (error) return fail(dbErrorMessage(error));
  updateTag(TAGS.catalog);
  redirect("/admin/marcas");
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
export async function saveCategory(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireAdminAction();
  const id = formNullable(fd, "id");
  const name = formString(fd, "name");
  const slug = slugFrom(fd);
  const kind = formString(fd, "kind");
  if (name.length < 2) return fail("Informe o nome da categoria.");
  if (!slug) return fail("URL inválida.");
  if (kind !== "product_type" && kind !== "concern") return fail("Tipo inválido.");
  const row = {
    name,
    slug,
    kind,
    description: formNullable(fd, "description"),
    image_url: safeImage(formNullable(fd, "image_url")),
    is_published: formBool(fd, "is_published"),
    is_featured: formBool(fd, "is_featured"),
    sort_order: formInt(fd, "sort_order"),
    seo_title: formNullable(fd, "seo_title"),
    seo_description: formNullable(fd, "seo_description"),
  };
  const { error } = id ? await supabase.from("categories").update(row).eq("id", id) : await supabase.from("categories").insert(row);
  if (error) return fail(dbErrorMessage(error));
  updateTag(TAGS.catalog);
  updateTag(TAGS.content);
  if (!id) redirect("/admin/categorias?criada=1");
  return success("Categoria salva.");
}

export async function deleteCategory(id: string) {
  const { supabase } = await requireAdminAction();
  const { error } = await supabase.from("categories").delete().eq("id", uuid.parse(id));
  if (error) return fail(dbErrorMessage(error));
  updateTag(TAGS.catalog);
  updateTag(TAGS.content);
  redirect("/admin/categorias");
}

// ---------------------------------------------------------------------------
// Kits
// ---------------------------------------------------------------------------
export async function saveKit(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireAdminAction();
  const id = formNullable(fd, "id");
  const name = formString(fd, "name");
  const slug = slugFrom(fd);
  const price = moneyField(fd, "price");
  const compare = moneyField(fd, "compare_at_price");
  if (name.length < 2) return fail("Informe o nome do kit.");
  if (!slug) return fail("URL inválida.");
  if (!price.ok || !compare.ok) return fail("Valor inválido. Ex.: 199,90");
  if (compare.value != null && (price.value == null || compare.value <= price.value)) return fail("O preço anterior deve ser maior que o preço do kit.");

  const productIds = fd.getAll("item_product").map(String);
  const quantities = fd.getAll("item_quantity").map((q) => Number.parseInt(String(q), 10));
  const items = productIds
    .map((product_id, i) => ({ product_id, quantity: quantities[i] }))
    .filter((i) => uuid.safeParse(i.product_id).success && i.quantity >= 1 && i.quantity <= 20);
  const status = formString(fd, "status");
  if (!["draft", "published", "archived"].includes(status)) return fail("Status inválido.");
  if (status === "published" && items.length < 2) return fail("Um kit publicado precisa de pelo menos 2 produtos.");
  if (new Set(items.map((i) => i.product_id)).size !== items.length) return fail("Há produtos repetidos no kit. Ajuste a quantidade em vez de repetir.");

  const row = {
    name,
    slug,
    short_description: formNullable(fd, "short_description"),
    description: formNullable(fd, "description"),
    image_url: safeImage(formNullable(fd, "image_url")),
    price_cents: price.value,
    compare_at_price_cents: compare.value,
    status,
    is_featured: formBool(fd, "is_featured"),
    sort_order: formInt(fd, "sort_order"),
    seo_title: formNullable(fd, "seo_title"),
    seo_description: formNullable(fd, "seo_description"),
  };
  let kitId = id;
  if (id) {
    const { error } = await supabase.from("kits").update(row).eq("id", id);
    if (error) return fail(dbErrorMessage(error));
  } else {
    const { data, error } = await supabase.from("kits").insert(row).select("id").single();
    if (error) return fail(dbErrorMessage(error));
    kitId = data.id;
  }
  await supabase.from("kit_items").delete().eq("kit_id", kitId);
  if (items.length) {
    const { error } = await supabase.from("kit_items").insert(items.map((i, sort_order) => ({ ...i, kit_id: kitId, sort_order })));
    if (error) return fail(dbErrorMessage(error));
  }
  updateTag(TAGS.catalog);
  if (!id) redirect(`/admin/kits/${kitId}?criado=1`);
  return success("Kit salvo.");
}

export async function deleteKit(id: string) {
  const { supabase } = await requireAdminAction();
  const { error } = await supabase.from("kits").delete().eq("id", uuid.parse(id));
  if (error) return fail(dbErrorMessage(error));
  updateTag(TAGS.catalog);
  redirect("/admin/kits");
}

// ---------------------------------------------------------------------------
// Banners & ritual
// ---------------------------------------------------------------------------
export async function saveBanner(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireAdminAction();
  const id = formNullable(fd, "id");
  const title = formString(fd, "title");
  const placement = formString(fd, "placement");
  if (title.length < 2) return fail("Informe o título.");
  if (placement !== "hero" && placement !== "editorial") return fail("Posição inválida.");
  const row = {
    placement,
    eyebrow: formNullable(fd, "eyebrow"),
    title,
    subtitle: formNullable(fd, "subtitle"),
    cta_label: formNullable(fd, "cta_label"),
    cta_href: safeHref(formNullable(fd, "cta_href")),
    cta2_label: formNullable(fd, "cta2_label"),
    cta2_href: safeHref(formNullable(fd, "cta2_href")),
    image_desktop_url: safeImage(formNullable(fd, "image_desktop_url")),
    image_mobile_url: safeImage(formNullable(fd, "image_mobile_url")),
    image_alt: formNullable(fd, "image_alt"),
    is_active: formBool(fd, "is_active"),
    sort_order: formInt(fd, "sort_order"),
  };
  const { error } = id ? await supabase.from("banners").update(row).eq("id", id) : await supabase.from("banners").insert(row);
  if (error) return fail(dbErrorMessage(error));
  updateTag(TAGS.content);
  return success(id ? "Banner salvo." : "Banner criado.");
}

export async function deleteBanner(id: string) {
  const { supabase } = await requireAdminAction();
  const { error } = await supabase.from("banners").delete().eq("id", uuid.parse(id));
  if (error) return fail(dbErrorMessage(error));
  updateTag(TAGS.content);
  return success("Banner removido.");
}

export async function saveRitualStep(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireAdminAction();
  const id = formNullable(fd, "id");
  const title = formString(fd, "title");
  if (title.length < 2) return fail("Informe o título da etapa.");
  const categoryId = formNullable(fd, "category_id");
  const row = {
    step_number: formInt(fd, "step_number", 1),
    title,
    description: formNullable(fd, "description"),
    category_id: categoryId && uuid.safeParse(categoryId).success ? categoryId : null,
    sort_order: formInt(fd, "step_number", 1),
  };
  const { error } = id ? await supabase.from("ritual_steps").update(row).eq("id", id) : await supabase.from("ritual_steps").insert(row);
  if (error) return fail(dbErrorMessage(error));
  updateTag(TAGS.content);
  return success("Etapa salva.");
}

export async function deleteRitualStep(id: string) {
  const { supabase } = await requireAdminAction();
  const { error } = await supabase.from("ritual_steps").delete().eq("id", uuid.parse(id));
  if (error) return fail(dbErrorMessage(error));
  updateTag(TAGS.content);
  return success("Etapa removida.");
}

// ---------------------------------------------------------------------------
// FAQ & pages
// ---------------------------------------------------------------------------
export async function saveFaq(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireAdminAction();
  const id = formNullable(fd, "id");
  const question = formString(fd, "question");
  const answer = formString(fd, "answer");
  if (question.length < 3 || answer.length < 3) return fail("Preencha pergunta e resposta.");
  const productId = formNullable(fd, "product_id");
  const row = {
    question,
    answer,
    product_id: productId && uuid.safeParse(productId).success ? productId : null,
    show_on_home: formBool(fd, "show_on_home"),
    is_published: formBool(fd, "is_published"),
    sort_order: formInt(fd, "sort_order"),
  };
  const { error } = id ? await supabase.from("faqs").update(row).eq("id", id) : await supabase.from("faqs").insert(row);
  if (error) return fail(dbErrorMessage(error));
  updateTag(TAGS.content);
  updateTag(TAGS.catalog);
  return success(id ? "Pergunta salva." : "Pergunta criada.");
}

export async function deleteFaq(id: string) {
  const { supabase } = await requireAdminAction();
  const { error } = await supabase.from("faqs").delete().eq("id", uuid.parse(id));
  if (error) return fail(dbErrorMessage(error));
  updateTag(TAGS.content);
  updateTag(TAGS.catalog);
  return success("Pergunta removida.");
}

export async function savePage(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireAdminAction();
  const slug = formString(fd, "slug");
  const title = formString(fd, "title");
  if (!SLUG_RE.test(slug) || title.length < 2) return fail("Dados inválidos.");
  const { error } = await supabase
    .from("pages")
    .update({
      title,
      body: formString(fd, "body").slice(0, 60000),
      is_published: formBool(fd, "is_published"),
      needs_review: formBool(fd, "needs_review"),
      seo_title: formNullable(fd, "seo_title"),
      seo_description: formNullable(fd, "seo_description"),
    })
    .eq("slug", slug);
  if (error) return fail(dbErrorMessage(error));
  updateTag(TAGS.content);
  return success("Página salva.");
}

// ---------------------------------------------------------------------------
// Store settings & delivery
// ---------------------------------------------------------------------------
export async function saveSettings(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireAdminAction();
  const rawWhatsapp = formString(fd, "whatsapp_number");
  const whatsapp = rawWhatsapp ? normalizeWhatsAppNumber(rawWhatsapp) : null;
  if (rawWhatsapp && !whatsapp) return fail("Número de WhatsApp inválido. Use DDD + número, ex.: 11 91234-5678.", { whatsapp_number: "Inválido" });
  const threshold = moneyField(fd, "free_shipping_threshold");
  const minimum = moneyField(fd, "minimum_order");
  if (!threshold.ok || !minimum.ok) return fail("Valor inválido. Ex.: 199,90");
  const welcomePercent = formInt(fd, "welcome_offer_percent", 10);
  const welcomeCode = formString(fd, "welcome_offer_code").toUpperCase() || "BEMVINDA10";
  if (welcomePercent < 1 || welcomePercent > 50) return fail("O desconto de boas-vindas deve ficar entre 1% e 50%.");
  if (!/^[A-Z0-9]{3,20}$/.test(welcomeCode)) return fail("O código do cupom deve ter de 3 a 20 letras ou números.");
  const email = formNullable(fd, "contact_email");
  if (email && !z.email().safeParse(email).success) return fail("E-mail de contato inválido.");

  const { error } = await supabase
    .from("store_settings")
    .update({
      store_name: formString(fd, "store_name") || "MIVORA",
      tagline: formNullable(fd, "tagline"),
      whatsapp_number: whatsapp,
      whatsapp_greeting: formString(fd, "whatsapp_greeting") || "Olá, MIVORA!",
      business_hours: formNullable(fd, "business_hours"),
      contact_email: email,
      contact_phone: formNullable(fd, "contact_phone"),
      instagram_url: safeUrl(formNullable(fd, "instagram_url")),
      tiktok_url: safeUrl(formNullable(fd, "tiktok_url")),
      facebook_url: safeUrl(formNullable(fd, "facebook_url")),
      legal_name: formNullable(fd, "legal_name"),
      cnpj: formNullable(fd, "cnpj"),
      address: formNullable(fd, "address"),
      announcement_enabled: formBool(fd, "announcement_enabled"),
      announcement_text: formNullable(fd, "announcement_text"),
      announcement_href: safeHref(formNullable(fd, "announcement_href")),
      delivery_summary: formNullable(fd, "delivery_summary"),
      pickup_enabled: formBool(fd, "pickup_enabled"),
      pickup_details: formNullable(fd, "pickup_details"),
      free_shipping_enabled: formBool(fd, "free_shipping_enabled"),
      free_shipping_threshold_cents: threshold.value,
      minimum_order_cents: minimum.value,
      show_registered_mark: formBool(fd, "show_registered_mark"),
      coming_soon_inquiry_enabled: formBool(fd, "coming_soon_inquiry_enabled"),
      welcome_offer_enabled: formBool(fd, "welcome_offer_enabled"),
      welcome_offer_percent: welcomePercent,
      welcome_offer_code: welcomeCode,
      about_headline: formNullable(fd, "about_headline"),
      about_text: formNullable(fd, "about_text"),
      whatsapp_section_title: formNullable(fd, "whatsapp_section_title"),
      whatsapp_section_text: formNullable(fd, "whatsapp_section_text"),
      seo_title: formNullable(fd, "seo_title"),
      seo_description: formNullable(fd, "seo_description"),
    })
    .eq("id", 1);
  if (error) return fail(dbErrorMessage(error));
  updateTag(TAGS.settings);
  return success("Configurações salvas.");
}

export async function saveDeliveryZone(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireAdminAction();
  const id = formNullable(fd, "id");
  const name = formString(fd, "name");
  const method = formString(fd, "method");
  if (name.length < 2) return fail("Informe o nome da opção de entrega.");
  if (!["pickup", "local_delivery", "shipping", "to_arrange"].includes(method)) return fail("Modalidade inválida.");
  const fee = moneyField(fd, "fee");
  const freeOver = moneyField(fd, "free_over");
  const minOrder = moneyField(fd, "min_order");
  if (!fee.ok || !freeOver.ok || !minOrder.ok) return fail("Valor inválido. Ex.: 15,00");
  const row = {
    name,
    method,
    region: formNullable(fd, "region"),
    fee_cents: fee.value,
    free_over_cents: freeOver.value,
    min_order_cents: minOrder.value,
    estimate: formNullable(fd, "estimate"),
    notes: formNullable(fd, "notes"),
    is_active: formBool(fd, "is_active"),
    sort_order: formInt(fd, "sort_order"),
  };
  const { error } = id ? await supabase.from("delivery_zones").update(row).eq("id", id) : await supabase.from("delivery_zones").insert(row);
  if (error) return fail(dbErrorMessage(error));
  updateTag(TAGS.settings);
  return success(id ? "Opção de entrega salva." : "Opção de entrega criada.");
}

export async function deleteDeliveryZone(id: string) {
  const { supabase } = await requireAdminAction();
  const { error } = await supabase.from("delivery_zones").delete().eq("id", uuid.parse(id));
  if (error) return fail(dbErrorMessage(error));
  updateTag(TAGS.settings);
  return success("Opção removida.");
}

// ---------------------------------------------------------------------------
// Product suggestions (never public)
// ---------------------------------------------------------------------------
export async function saveSuggestion(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireAdminAction();
  const id = formNullable(fd, "id");
  const name = formString(fd, "name");
  const status = formString(fd, "status") || "idea";
  if (name.length < 2) return fail("Informe o nome do produto.");
  if (!["idea", "evaluating", "approved", "rejected"].includes(status)) return fail("Status inválido.");
  const row = { name, brand_name: formNullable(fd, "brand_name"), notes: formNullable(fd, "notes"), reference_url: safeUrl(formNullable(fd, "reference_url")), status };
  const { error } = id ? await supabase.from("product_suggestions").update(row).eq("id", id) : await supabase.from("product_suggestions").insert(row);
  if (error) return fail(dbErrorMessage(error));
  return success(id ? "Sugestão salva." : "Sugestão adicionada.");
}

export async function deleteSuggestion(id: string) {
  const { supabase } = await requireAdminAction();
  const { error } = await supabase.from("product_suggestions").delete().eq("id", uuid.parse(id));
  if (error) return fail(dbErrorMessage(error));
  return success("Sugestão removida.");
}
