"use server";

import { randomUUID } from "node:crypto";
import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import sharp, { type OutputInfo } from "sharp";
import { z } from "zod";
import { dbErrorMessage, fail, success, zodErrors, type ActionState } from "@/lib/admin/action-state";
import { requireAdminAction, type AdminSession } from "@/lib/admin/auth";
import { productSchema, type ProductFormValues } from "@/lib/admin/schemas";
import { TAGS } from "@/lib/catalog/tags";
import { MEDIA_BUCKET } from "@/lib/env";
import { parseBRLToCents } from "@/lib/money";
import { commaListToArray, linesToArray } from "@/lib/utils";

const nullIfEmpty = (v: string) => (v.trim() === "" ? null : v.trim());
const intOr = (v: string, fallback: number) => (v.trim() === "" ? fallback : Number.parseInt(v, 10));

export type SaveProductResult = ActionState & { id?: string };

export async function saveProduct(values: ProductFormValues): Promise<SaveProductResult> {
  let session: AdminSession;
  try {
    session = await requireAdminAction();
  } catch {
    return fail("Sessão expirada. Entre novamente.");
  }
  const parsed = productSchema.safeParse(values);
  if (!parsed.success) return fail("Revise os campos destacados.", zodErrors(parsed.error));
  const v = parsed.data;
  const { supabase } = session;

  const row = {
    name: v.name,
    slug: v.slug,
    brand_id: v.brandId,
    product_line: nullIfEmpty(v.productLine),
    volume: nullIfEmpty(v.volume),
    short_description: nullIfEmpty(v.shortDescription),
    description: nullIfEmpty(v.description),
    benefits: linesToArray(v.benefits),
    key_ingredients: linesToArray(v.keyIngredients),
    ingredients_full: nullIfEmpty(v.ingredientsFull),
    how_to_use: nullIfEmpty(v.howToUse),
    warnings: nullIfEmpty(v.warnings),
    skin_types: v.skinTypes,
    tags: commaListToArray(v.tags),
    price_cents: parseBRLToCents(v.price),
    compare_at_price_cents: parseBRLToCents(v.compareAtPrice),
    status: v.status,
    availability: v.availability,
    coming_soon_note: nullIfEmpty(v.comingSoonNote),
    low_stock_threshold: intOr(v.lowStockThreshold, 3),
    is_featured: v.isFeatured,
    featured_order: intOr(v.featuredOrder, 0),
    is_new: v.isNew,
    sort_order: intOr(v.sortOrder, 0),
    video_url: nullIfEmpty(v.videoUrl),
    media_pending: v.mediaPending,
    seo_title: nullIfEmpty(v.seoTitle),
    seo_description: nullIfEmpty(v.seoDescription),
  };

  const privateRow = {
    sku: nullIfEmpty(v.sku),
    barcode: nullIfEmpty(v.barcode),
    cost_cents: parseBRLToCents(v.cost),
    supplier: nullIfEmpty(v.supplier),
    content_verified: v.contentVerified,
    internal_notes: nullIfEmpty(v.internalNotes),
    sourcing_status: v.sourcingStatus,
    regulatory_status: v.regulatoryStatus,
    regulatory_reference: nullIfEmpty(v.regulatoryReference),
    supplier_document: nullIfEmpty(v.supplierDocument),
    batch_number: nullIfEmpty(v.batchNumber),
    expiry_date: nullIfEmpty(v.expiryDate),
    documentation_notes: nullIfEmpty(v.documentationNotes),
  };
  const writePrivate = async (productId: string) => {
    const { error } = await supabase.from("product_private").upsert({ product_id: productId, ...privateRow });
    return error ? fail(dbErrorMessage(error), error.code === "23505" ? { sku: "SKU já utilizado." } : undefined) : null;
  };
  // The database only lets a product go on sale when its documentation is verified
  // (or it belongs to the confirmed initial stock), so the internal record must be
  // written before the product becomes sellable and after it stops being sellable.
  const willSell = v.status === "published" && v.availability === "in_stock";

  let id = v.id;
  let current: { track_inventory: boolean; stock_quantity: number | null; reserved_quantity: number } | null = null;
  if (id) {
    const { data } = await supabase.from("products").select("track_inventory, stock_quantity, reserved_quantity").eq("id", id).maybeSingle();
    if (!data) return fail("Produto não encontrado.");
    current = data;
    if (willSell) {
      const privateFail = await writePrivate(id);
      if (privateFail) return privateFail;
    }
    const { error } = await supabase.from("products").update(row).eq("id", id);
    if (error) return fail(dbErrorMessage(error));
    if (!willSell) {
      const privateFail = await writePrivate(id);
      if (privateFail) return privateFail;
    }
  } else {
    const { data, error } = await supabase
      .from("products")
      .insert({ ...row, status: willSell ? "draft" : row.status })
      .select("id")
      .single();
    if (error) return fail(dbErrorMessage(error), error.code === "23505" ? { slug: "URL já utilizada." } : undefined);
    id = data.id as string;
    const privateFail = await writePrivate(id);
    if (privateFail) return privateFail;
    if (willSell) {
      const { error: statusError } = await supabase.from("products").update({ status: row.status }).eq("id", id);
      if (statusError) return fail(dbErrorMessage(statusError));
    }
  }

  // Inventory tracking: quantities change only through the movement ledger
  const initial = intOr(v.initialStock, 0);
  if (v.trackInventory && !current?.track_inventory) {
    if (initial > 0) {
      const { error } = await supabase.rpc("admin_adjust_stock", { p_product_id: id, p_variant_id: null, p_kind: "in", p_quantity: initial, p_reason: "Estoque inicial" });
      if (error) return fail(dbErrorMessage(error));
    } else {
      await supabase.from("products").update({ track_inventory: true, stock_quantity: current?.stock_quantity ?? 0 }).eq("id", id);
    }
  } else if (!v.trackInventory && current?.track_inventory) {
    if (current.reserved_quantity > 0) return fail("Há unidades reservadas para pedidos confirmados. Conclua ou cancele esses pedidos antes de desativar o controle de estoque.");
    await supabase.from("products").update({ track_inventory: false }).eq("id", id);
  }

  // Categories: replace the set
  await supabase.from("product_categories").delete().eq("product_id", id);
  if (v.categoryIds.length) {
    const { error } = await supabase.from("product_categories").insert(v.categoryIds.map((category_id) => ({ product_id: id, category_id })));
    if (error) return fail(dbErrorMessage(error));
  }

  // Manually curated related products: replace the set, keeping the chosen order
  await supabase.from("product_relations").delete().eq("product_id", id);
  const related = [...new Set(v.relatedIds)].filter((rid) => rid !== id);
  if (related.length) {
    const { error } = await supabase.from("product_relations").insert(related.map((related_product_id, sort_order) => ({ product_id: id, related_product_id, sort_order })));
    if (error) return fail(dbErrorMessage(error));
  }

  // Variants: upsert submitted, delete removed
  const { data: existingVariants } = await supabase.from("product_variants").select("id, track_inventory, stock_quantity").eq("product_id", id);
  const keep = new Set(v.variants.map((x) => x.id).filter(Boolean));
  const removed = (existingVariants ?? []).filter((x) => !keep.has(x.id)).map((x) => x.id);
  if (removed.length) {
    const { error } = await supabase.from("product_variants").delete().in("id", removed);
    if (error) return fail(dbErrorMessage(error));
  }
  for (const [index, variant] of v.variants.entries()) {
    const base = {
      product_id: id,
      name: variant.name,
      sku: nullIfEmpty(variant.sku),
      price_cents: parseBRLToCents(variant.price),
      compare_at_price_cents: parseBRLToCents(variant.compareAtPrice),
      is_active: variant.isActive,
      sort_order: index,
    };
    let variantId = variant.id;
    const before = (existingVariants ?? []).find((x) => x.id === variantId);
    if (variantId && before) {
      const { error } = await supabase.from("product_variants").update(base).eq("id", variantId);
      if (error) return fail(dbErrorMessage(error));
    } else {
      const { data, error } = await supabase.from("product_variants").insert(base).select("id").single();
      if (error) return fail(dbErrorMessage(error));
      variantId = data.id as string;
    }
    const target = intOr(variant.stockQuantity, 0);
    if (variant.trackInventory) {
      const delta = target - (before?.track_inventory ? (before.stock_quantity ?? 0) : 0);
      if (delta !== 0) {
        const { error } = await supabase.rpc("admin_adjust_stock", { p_product_id: id, p_variant_id: variantId, p_kind: "adjustment", p_quantity: delta, p_reason: "Ajuste pelo cadastro da variante" });
        if (error) return fail(dbErrorMessage(error));
      } else if (!before?.track_inventory) {
        await supabase.from("product_variants").update({ track_inventory: true, stock_quantity: 0 }).eq("id", variantId);
      }
    } else if (before?.track_inventory) {
      await supabase.from("product_variants").update({ track_inventory: false }).eq("id", variantId);
    }
  }

  updateTag(TAGS.catalog);
  return { ...success(v.id ? "Produto salvo." : "Produto criado."), id };
}

export async function setProductStatus(id: string, status: "draft" | "published" | "archived") {
  const { supabase } = await requireAdminAction();
  if (status === "published") {
    const { count } = await supabase.from("product_categories").select("product_id", { count: "exact", head: true }).eq("product_id", id);
    if (!count) return fail("Associe uma categoria antes de publicar.");
  }
  const { error } = await supabase.from("products").update({ status }).eq("id", id);
  if (error) return fail(dbErrorMessage(error));
  updateTag(TAGS.catalog);
  return success(status === "published" ? "Produto publicado." : status === "archived" ? "Produto arquivado." : "Produto despublicado.");
}

export async function duplicateProduct(id: string) {
  const { supabase } = await requireAdminAction();
  const { data: p, error } = await supabase.from("products").select("*").eq("id", id).single();
  if (error || !p) return fail("Produto não encontrado.");
  let slug = `${p.slug}-copia`;
  for (let i = 2; i < 50; i++) {
    const { count } = await supabase.from("products").select("id", { count: "exact", head: true }).eq("slug", slug);
    if (!count) break;
    slug = `${p.slug}-copia-${i}`;
  }
  /* eslint-disable @typescript-eslint/no-unused-vars */
  const { id: _id, code, search_text, is_available, created_at, updated_at, published_at, archived_at, stock_quantity, reserved_quantity, track_inventory, ...rest } = p;
  /* eslint-enable @typescript-eslint/no-unused-vars */
  const { data: copy, error: insertError } = await supabase
    .from("products")
    .insert({ ...rest, slug, name: `${p.name} (cópia)`, status: "draft", is_featured: false })
    .select("id")
    .single();
  if (insertError) return fail(dbErrorMessage(insertError));
  const [cats, imgs, priv] = await Promise.all([
    supabase.from("product_categories").select("category_id").eq("product_id", id),
    supabase.from("product_images").select("url, storage_path, alt, width, height, sort_order, is_primary").eq("product_id", id),
    supabase.from("product_private").select("supplier, internal_notes").eq("product_id", id).maybeSingle(),
  ]);
  if (cats.data?.length) await supabase.from("product_categories").insert(cats.data.map((c) => ({ product_id: copy.id, category_id: c.category_id })));
  if (imgs.data?.length) await supabase.from("product_images").insert(imgs.data.map((i) => ({ ...i, product_id: copy.id })));
  await supabase.from("product_private").insert({ product_id: copy.id, supplier: priv.data?.supplier ?? null, internal_notes: priv.data?.internal_notes ?? null });
  redirect(`/admin/produtos/${copy.id}?duplicado=1`);
}

export async function deleteProduct(id: string) {
  const { supabase } = await requireAdminAction();
  const { data: p } = await supabase.from("products").select("status").eq("id", id).maybeSingle();
  if (!p) return fail("Produto não encontrado.");
  if (p.status === "published") return fail("Despublique ou arquive o produto antes de excluí-lo.");
  const { data: images } = await supabase.from("product_images").select("storage_path").eq("product_id", id);
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) return fail(dbErrorMessage(error));
  await removeUnreferencedObjects(supabase, (images ?? []).map((i) => i.storage_path).filter(Boolean) as string[]);
  updateTag(TAGS.catalog);
  redirect("/admin/produtos?excluido=1");
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** Detects the real file type from magic bytes (never trust the extension or the browser MIME). */
function sniffImage(buf: Buffer): "jpeg" | "png" | "webp" | "avif" | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  if (buf.subarray(4, 12).toString("ascii").startsWith("ftypavi")) return "avif";
  return null;
}

export async function uploadProductImages(formData: FormData): Promise<ActionState> {
  const { supabase } = await requireAdminAction();
  const productId = z.uuid().safeParse(formData.get("productId"));
  if (!productId.success) return fail("Produto inválido.");
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return fail("Selecione ao menos uma imagem.");
  if (files.length > 10) return fail("Envie no máximo 10 imagens por vez.");

  const { data: product } = await supabase.from("products").select("name").eq("id", productId.data).maybeSingle();
  if (!product) return fail("Produto não encontrado.");
  const { data: existing } = await supabase.from("product_images").select("sort_order, is_primary").eq("product_id", productId.data);
  let order = Math.max(-1, ...(existing ?? []).map((i) => i.sort_order)) + 1;
  let hasPrimary = (existing ?? []).some((i) => i.is_primary);
  const errors: string[] = [];

  for (const file of files) {
    if (file.size > MAX_UPLOAD_BYTES) {
      errors.push(`${file.name}: arquivo maior que 8 MB.`);
      continue;
    }
    const input = Buffer.from(await file.arrayBuffer());
    if (!sniffImage(input)) {
      errors.push(`${file.name}: formato não suportado (use JPG, PNG, WebP ou AVIF).`);
      continue;
    }
    let output: { data: Buffer; info: OutputInfo };
    try {
      // Re-encoding strips metadata and any embedded payloads
      output = await sharp(input, { limitInputPixels: 50_000_000 })
        .rotate()
        .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 86 })
        .toBuffer({ resolveWithObject: true });
    } catch {
      errors.push(`${file.name}: imagem inválida ou corrompida.`);
      continue;
    }
    const path = `products/${productId.data}/${randomUUID()}.webp`;
    const { error: uploadError } = await supabase.storage.from(MEDIA_BUCKET).upload(path, output.data, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
    if (uploadError) {
      errors.push(`${file.name}: falha no envio (${uploadError.message}).`);
      continue;
    }
    const { data: pub } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
    const { error } = await supabase.from("product_images").insert({
      product_id: productId.data,
      url: pub.publicUrl,
      storage_path: path,
      alt: product.name,
      width: output.info.width,
      height: output.info.height,
      sort_order: order++,
      is_primary: !hasPrimary,
    });
    if (error) {
      await supabase.storage.from(MEDIA_BUCKET).remove([path]);
      errors.push(`${file.name}: ${dbErrorMessage(error)}`);
      continue;
    }
    hasPrimary = true;
  }

  await supabase.from("products").update({ media_pending: false }).eq("id", productId.data).eq("media_pending", true);
  updateTag(TAGS.catalog);
  if (errors.length === files.length) return fail(errors.join(" "));
  return errors.length ? { ok: true, message: `Algumas imagens não foram enviadas: ${errors.join(" ")}`, at: Date.now() } : success(files.length > 1 ? "Imagens enviadas." : "Imagem enviada.");
}

/** Uploads a banner / brand / kit image and returns its public URL. */
export async function uploadContentImage(formData: FormData): Promise<{ ok: boolean; message?: string; url?: string }> {
  const { supabase } = await requireAdminAction();
  const file = formData.get("file");
  const folder = z.enum(["banners", "brands", "kits", "categories"]).safeParse(formData.get("folder"));
  if (!(file instanceof File) || file.size === 0 || !folder.success) return { ok: false, message: "Selecione uma imagem." };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, message: "Arquivo maior que 8 MB." };
  const input = Buffer.from(await file.arrayBuffer());
  if (!sniffImage(input)) return { ok: false, message: "Formato não suportado (use JPG, PNG, WebP ou AVIF)." };
  let data: Buffer;
  try {
    data = await sharp(input, { limitInputPixels: 50_000_000 }).rotate().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
  } catch {
    return { ok: false, message: "Imagem inválida ou corrompida." };
  }
  const path = `${folder.data}/${randomUUID()}.webp`;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, data, { contentType: "image/webp", cacheControl: "31536000" });
  if (error) return { ok: false, message: `Falha no envio: ${error.message}` };
  return { ok: true, url: supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl };
}

export async function reorderProductImages(productId: string, orderedIds: string[]) {
  const { supabase } = await requireAdminAction();
  const ids = z.array(z.uuid()).max(50).parse(orderedIds);
  for (const [index, imageId] of ids.entries()) {
    await supabase.from("product_images").update({ sort_order: index }).eq("id", imageId).eq("product_id", productId);
  }
  updateTag(TAGS.catalog);
  return success("Ordem atualizada.");
}

export async function setPrimaryImage(productId: string, imageId: string) {
  const { supabase } = await requireAdminAction();
  await supabase.from("product_images").update({ is_primary: false }).eq("product_id", productId).eq("is_primary", true);
  const { error } = await supabase.from("product_images").update({ is_primary: true }).eq("id", imageId).eq("product_id", productId);
  if (error) return fail(dbErrorMessage(error));
  updateTag(TAGS.catalog);
  return success("Imagem principal definida.");
}

export async function updateImageAlt(imageId: string, alt: string) {
  const { supabase } = await requireAdminAction();
  const { error } = await supabase.from("product_images").update({ alt: alt.trim().slice(0, 200) || null }).eq("id", imageId);
  if (error) return fail(dbErrorMessage(error));
  updateTag(TAGS.catalog);
  return success("Descrição da imagem salva.");
}

export async function deleteProductImage(imageId: string) {
  const { supabase } = await requireAdminAction();
  const { data: img } = await supabase.from("product_images").select("product_id, storage_path, is_primary").eq("id", imageId).maybeSingle();
  if (!img) return fail("Imagem não encontrada.");
  const { error } = await supabase.from("product_images").delete().eq("id", imageId);
  if (error) return fail(dbErrorMessage(error));
  if (img.storage_path) await removeUnreferencedObjects(supabase, [img.storage_path]);
  if (img.is_primary) {
    const { data: next } = await supabase.from("product_images").select("id").eq("product_id", img.product_id).order("sort_order").limit(1).maybeSingle();
    if (next) await supabase.from("product_images").update({ is_primary: true }).eq("id", next.id);
  }
  updateTag(TAGS.catalog);
  return success("Imagem removida.");
}

/** Storage objects can be shared by duplicated products: only delete when unused. */
async function removeUnreferencedObjects(supabase: AdminSession["supabase"], paths: string[]) {
  const unused: string[] = [];
  for (const path of new Set(paths)) {
    const { count } = await supabase.from("product_images").select("id", { count: "exact", head: true }).eq("storage_path", path);
    if (!count) unused.push(path);
  }
  if (unused.length) await supabase.storage.from(MEDIA_BUCKET).remove(unused);
}

