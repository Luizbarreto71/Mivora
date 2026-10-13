/** Pure cart helpers shared by the client cart, the checkout and tests. */

export type CartLine = {
  /** product:<id>[:<variantId>] or kit:<id> */
  key: string;
  productId: string | null;
  variantId: string | null;
  kitId: string | null;
  slug: string;
  href: string;
  name: string;
  brand: string | null;
  variantName: string | null;
  volume: string | null;
  imageUrl: string | null;
  unitPriceCents: number | null;
  quantity: number;
  /** Max units allowed by tracked stock; null = not tracked numerically. */
  maxQuantity: number | null;
  isAvailable: boolean;
};

export const MAX_LINE_QUANTITY = 99;

export function lineKey(input: { productId?: string | null; variantId?: string | null; kitId?: string | null }) {
  if (input.kitId) return `kit:${input.kitId}`;
  return input.variantId ? `product:${input.productId}:${input.variantId}` : `product:${input.productId}`;
}

export function clampQuantity(quantity: number, maxQuantity: number | null) {
  const upper = Math.min(MAX_LINE_QUANTITY, maxQuantity ?? MAX_LINE_QUANTITY);
  if (!Number.isFinite(quantity)) return 1;
  return Math.max(1, Math.min(Math.floor(quantity), Math.max(upper, 1)));
}

export function lineTotal(line: Pick<CartLine, "unitPriceCents" | "quantity">) {
  return line.unitPriceCents == null ? null : line.unitPriceCents * line.quantity;
}

export type CartTotals = {
  itemCount: number;
  subtotalCents: number;
  hasUnpricedItems: boolean;
  hasUnavailableItems: boolean;
  purchasableLines: CartLine[];
};

/** Subtotal only sums priced, available lines. Unpriced lines are flagged, never estimated. */
export function computeTotals(lines: CartLine[]): CartTotals {
  let itemCount = 0;
  let subtotalCents = 0;
  let hasUnpricedItems = false;
  let hasUnavailableItems = false;
  const purchasableLines: CartLine[] = [];
  for (const line of lines) {
    if (!line.isAvailable || (line.maxQuantity != null && line.maxQuantity < 1)) {
      hasUnavailableItems = true;
      continue;
    }
    purchasableLines.push(line);
    itemCount += line.quantity;
    if (line.unitPriceCents == null) hasUnpricedItems = true;
    else subtotalCents += line.unitPriceCents * line.quantity;
  }
  return { itemCount, subtotalCents, hasUnpricedItems, hasUnavailableItems, purchasableLines };
}

export type DeliveryQuoteInput = {
  feeCents: number | null;
  freeOverCents: number | null;
  minOrderCents: number | null;
};

/** Estimated delivery fee for a zone. null = to be confirmed by the store. */
export function deliveryQuote(zone: DeliveryQuoteInput | null, totals: Pick<CartTotals, "subtotalCents" | "hasUnpricedItems">) {
  if (!zone) return { feeCents: null as number | null, belowMinimum: false, isFree: false };
  const belowMinimum = zone.minOrderCents != null && !totals.hasUnpricedItems && totals.subtotalCents < zone.minOrderCents;
  const isFree = zone.freeOverCents != null && !totals.hasUnpricedItems && totals.subtotalCents >= zone.freeOverCents;
  return { feeCents: isFree ? 0 : zone.feeCents, belowMinimum, isFree };
}
