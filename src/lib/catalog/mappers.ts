import type { Availability, ImageRef, ProductSummary, ProductVariant } from "@/lib/types";

/* Rows returned by PostgREST are untyped; these mappers are the single place that
   turns them into domain objects. */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

export const PRODUCT_SUMMARY_SELECT =
  "id, slug, code, name, volume, short_description, price_cents, compare_at_price_cents, availability, track_inventory, stock_quantity, reserved_quantity, is_available, is_new, is_featured, featured_order, sort_order, published_at, brand:brands!inner(id, slug, name), images:product_images(url, alt, width, height, sort_order, is_primary, fit), variants:product_variants(id)";

export function availableQuantity(row: { track_inventory: boolean; stock_quantity: number | null; reserved_quantity: number }) {
  if (!row.track_inventory) return null;
  return Math.max(0, (row.stock_quantity ?? 0) - (row.reserved_quantity ?? 0));
}

export function sortImages(images: Row[] | null | undefined): ImageRef[] {
  return [...(images ?? [])]
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order)
    .map((i) => ({ url: i.url, alt: i.alt, width: i.width, height: i.height, fit: i.fit === "cover" ? ("cover" as const) : ("contain" as const) }));
}

export function toProductSummary(row: Row): ProductSummary {
  const images = sortImages(row.images);
  return {
    id: row.id,
    slug: row.slug,
    code: row.code,
    name: row.name,
    brand: { id: row.brand.id, slug: row.brand.slug, name: row.brand.name },
    volume: row.volume,
    shortDescription: row.short_description,
    priceCents: row.price_cents,
    compareAtCents: validCompareAt(row.price_cents, row.compare_at_price_cents),
    availability: row.availability as Availability,
    isAvailable: Boolean(row.is_available),
    maxQuantity: availableQuantity(row as { track_inventory: boolean; stock_quantity: number | null; reserved_quantity: number }),
    isNew: Boolean(row.is_new),
    isFeatured: Boolean(row.is_featured),
    image: images[0] ?? null,
    hasVariants: Array.isArray(row.variants) && row.variants.length > 0,
  };
}

/** A "was" price is only shown when it is real and higher than the current price. */
export function validCompareAt(price: number | null, compareAt: number | null) {
  if (price == null || compareAt == null) return null;
  return compareAt > price ? compareAt : null;
}

export function toVariant(row: Row, productAvailable: boolean, productAvailability: Availability): ProductVariant {
  const max = row.track_inventory ? Math.max(0, (row.stock_quantity ?? 0) - (row.reserved_quantity ?? 0)) : null;
  return {
    id: row.id,
    name: row.name,
    priceCents: row.price_cents,
    compareAtCents: row.compare_at_price_cents,
    maxQuantity: max,
    // Untracked variants follow the product; tracked variants follow their own stock.
    isAvailable: productAvailability === "in_stock" && (max == null ? productAvailable : max > 0),
  };
}
