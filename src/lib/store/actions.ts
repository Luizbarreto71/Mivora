"use server";

import { z } from "zod";
import { getKits, getProductsByIds, getStoreSettings } from "@/lib/catalog/queries";
import { getPublicSupabase } from "@/lib/supabase/public";
import { lineKey } from "@/lib/cart/math";
import { DELIVERY_METHOD_LABEL, type DeliveryMethod } from "@/lib/types";
import { buildOrderWhatsAppLink, normalizeWhatsAppNumber } from "@/lib/whatsapp";

const lineRef = z.object({
  productId: z.uuid().nullable(),
  variantId: z.uuid().nullable(),
  kitId: z.uuid().nullable(),
});

export type CartLineUpdate = {
  key: string;
  exists: boolean;
  name?: string;
  unitPriceCents?: number | null;
  maxQuantity?: number | null;
  isAvailable?: boolean;
  imageUrl?: string | null;
};

/** Re-reads prices and availability for the lines in a visitor's cart. */
export async function refreshCartLines(input: unknown): Promise<CartLineUpdate[]> {
  const parsed = z.array(lineRef).max(60).safeParse(input);
  if (!parsed.success) return [];
  const refs = parsed.data;

  const productIds = [...new Set(refs.filter((r) => r.productId && !r.kitId).map((r) => r.productId!))];
  const variantIds = refs.filter((r) => r.variantId).map((r) => r.variantId!);
  const [products, kits] = await Promise.all([
    getProductsByIds(productIds),
    refs.some((r) => r.kitId) ? getKits() : Promise.resolve([]),
  ]);

  const variants = new Map<string, { name: string; price_cents: number | null; track_inventory: boolean; stock_quantity: number | null; reserved_quantity: number; is_active: boolean }>();
  const sb = getPublicSupabase();
  if (sb && variantIds.length) {
    const { data } = await sb
      .from("product_variants")
      .select("id, name, price_cents, track_inventory, stock_quantity, reserved_quantity, is_active")
      .in("id", variantIds);
    for (const v of data ?? []) variants.set(v.id, v);
  }

  return refs.map((ref) => {
    const key = lineKey(ref);
    if (ref.kitId) {
      const kit = kits.find((k) => k.id === ref.kitId);
      if (!kit) return { key, exists: false };
      return { key, exists: true, name: `Kit ${kit.name}`, unitPriceCents: kit.priceCents, maxQuantity: kit.maxQuantity, isAvailable: kit.isAvailable, imageUrl: kit.imageUrl };
    }
    const product = products.find((p) => p.id === ref.productId);
    if (!product) return { key, exists: false };
    if (ref.variantId) {
      const v = variants.get(ref.variantId);
      if (!v || !v.is_active) return { key, exists: false };
      const max = v.track_inventory ? Math.max(0, (v.stock_quantity ?? 0) - v.reserved_quantity) : null;
      return {
        key,
        exists: true,
        name: product.name,
        unitPriceCents: v.price_cents ?? product.priceCents,
        maxQuantity: max,
        isAvailable: product.availability === "in_stock" && (max == null ? product.isAvailable : max > 0),
        imageUrl: product.image?.url ?? null,
      };
    }
    return {
      key,
      exists: true,
      name: product.name,
      unitPriceCents: product.priceCents,
      maxQuantity: product.maxQuantity,
      isAvailable: product.isAvailable,
      imageUrl: product.image?.url ?? null,
    };
  });
}

/** Product cards for the visitor's locally saved favourites. */
export async function getFavoriteProducts(ids: unknown) {
  const parsed = z.array(z.uuid()).max(200).safeParse(ids);
  if (!parsed.success) return [];
  return getProductsByIds(parsed.data);
}

export async function trackCartAdd(productId: string) {
  const id = z.uuid().safeParse(productId);
  const sb = getPublicSupabase();
  if (!id.success || !sb) return;
  await sb.rpc("track_cart_add", { p_product_id: id.data });
}

const checkoutSchema = z.object({
  items: z
    .array(lineRef.extend({ quantity: z.number().int().min(1).max(99) }))
    .min(1, "Seu carrinho está vazio.")
    .max(60, "Carrinho muito grande. Fale com a gente pelo WhatsApp."),
  customerName: z.string().trim().max(120).optional().default(""),
  customerPhone: z
    .string()
    .trim()
    .max(30)
    .regex(/^[0-9+() -]*$/, "Telefone inválido.")
    .optional()
    .default(""),
  customerNotes: z.string().trim().max(1000).optional().default(""),
  deliveryZoneId: z.uuid().nullable().optional(),
  couponCode: z
    .string()
    .trim()
    .max(20)
    .regex(/^[A-Za-z0-9]*$/, "Cupom inválido.")
    .optional()
    .default(""),
});

export type CheckoutResult =
  | {
      ok: true;
      code: string;
      whatsappUrl: string;
      summarized: boolean;
      subtotalCents: number;
      discountCents: number;
      hasUnpricedItems: boolean;
    }
  | { ok: false; error: string; retryable: boolean };

const ERROR_MESSAGES: Record<string, string> = {
  empty_cart: "Seu carrinho está vazio",
  too_many_items: "Carrinho muito grande. Fale com a gente pelo WhatsApp",
  invalid_quantity: "Revise as quantidades do carrinho",
  item_unavailable: "Um dos produtos não está mais disponível",
  insufficient_stock: "Não há estoque suficiente para",
  below_minimum_order: "O pedido não atinge o valor mínimo para a entrega escolhida",
  invalid_delivery_zone: "A opção de entrega escolhida não está mais disponível",
  rate_limited: "Muitos pedidos ao mesmo tempo. Tente novamente em instantes",
  coupon_invalid: "Este cupom não é válido no momento. Remova-o para continuar",
  coupon_not_first_purchase: "O cupom de boas-vindas vale apenas para a primeira compra. Remova-o para continuar",
};

function describeRpcError(message: string) {
  const [code, detail] = message.split(":");
  const base = ERROR_MESSAGES[code.trim()];
  if (!base) return null;
  return detail ? `${base}: ${detail.trim()}.` : `${base}.`;
}

/**
 * Registers an order intent (server-side prices) and returns the WhatsApp link.
 * An intent is not a sale: stock only moves when the store confirms it.
 */
export async function submitOrder(input: unknown): Promise<CheckoutResult> {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos.", retryable: false };
  }
  const data = parsed.data;
  const sb = getPublicSupabase();
  const settings = await getStoreSettings();
  const number = normalizeWhatsAppNumber(settings.whatsapp_number);
  if (!sb) return { ok: false, error: "A loja ainda não está conectada ao banco de dados.", retryable: false };
  if (!number) return { ok: false, error: "O WhatsApp da loja ainda não foi configurado.", retryable: false };

  const { data: result, error } = await sb.rpc("create_order_intent", {
    p_items: data.items.map((i) => ({ product_id: i.productId, variant_id: i.variantId, kit_id: i.kitId, quantity: i.quantity })),
    p_customer_name: data.customerName || null,
    p_customer_phone: data.customerPhone || null,
    p_customer_notes: data.customerNotes || null,
    p_delivery_zone_id: data.deliveryZoneId ?? null,
    p_coupon_code: data.couponCode || null,
  });

  if (error) {
    const friendly = describeRpcError(error.message);
    if (friendly) return { ok: false, error: friendly, retryable: false };
    console.error("[checkout] create_order_intent failed", error.message);
    return { ok: false, error: "Não foi possível registrar o pedido agora.", retryable: true };
  }

  const r = result as {
    code: string;
    subtotal_cents: number;
    discount_cents: number;
    coupon_code: string | null;
    discount_percent: number | null;
    has_unpriced_items: boolean;
    delivery: { name: string; method: DeliveryMethod; fee_cents: number | null; estimate: string | null } | null;
    items: { name: string; brand: string | null; code: string | null; quantity: number; unit_price_cents: number | null; line_total_cents: number | null }[];
  };

  const { url, summarized } = buildOrderWhatsAppLink(number, {
    greeting: settings.whatsapp_greeting,
    code: r.code,
    items: r.items.map((i) => ({
      name: i.brand && !i.name.toLowerCase().includes(i.brand.toLowerCase()) ? `${i.brand} ${i.name}` : i.name,
      code: i.code,
      quantity: i.quantity,
      unitPriceCents: i.unit_price_cents,
      lineTotalCents: i.line_total_cents,
    })),
    subtotalCents: r.subtotal_cents,
    hasUnpricedItems: r.has_unpriced_items,
    discount: r.coupon_code && r.discount_percent ? { code: r.coupon_code, percent: r.discount_percent, cents: r.discount_cents } : null,
    delivery:
      r.delivery && r.delivery.method !== "to_arrange"
        ? { label: `${DELIVERY_METHOD_LABEL[r.delivery.method]} (${r.delivery.name})`, feeCents: r.delivery.fee_cents, estimate: r.delivery.estimate }
        : null,
    customerName: data.customerName || null,
    customerNotes: data.customerNotes || null,
  });

  return {
    ok: true,
    code: r.code,
    whatsappUrl: url,
    summarized,
    subtotalCents: r.subtotal_cents,
    discountCents: r.discount_cents ?? 0,
    hasUnpricedItems: r.has_unpriced_items,
  };
}
