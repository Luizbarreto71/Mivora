"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { getKits, getProductsByIds, getStoreSettings } from "@/lib/catalog/queries";
import { applePayConfig, applePayDomain, chargeWithApplePay, createApplePaySession } from "@/lib/payments/apple-pay";
import type { ApplePayLines } from "@/lib/payments/apple-pay-core";
import { mercadoPagoConfig, openCheckout } from "@/lib/payments/mercadopago";
import { getPublicSupabase } from "@/lib/supabase/public";
import { lineKey } from "@/lib/cart/math";
import { destinationLabel, normalizeCep } from "@/lib/shipping/cep";
import { getShippingQuote } from "@/lib/shipping/quote";
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
  // mandatory registration (lead capture); validated again by the database
  customer: z.object(
    {
      name: z.string().trim().min(2, "Informe seu nome completo.").max(120),
      email: z.string().trim().max(254),
      phone: z.string().trim().max(30),
      marketing: z.boolean().optional(),
    },
    { error: "Faça seu cadastro para finalizar a compra." },
  ),
  customerNotes: z.string().trim().max(1000).optional().default(""),
  deliveryZoneId: z.uuid().nullable().optional(),
  /** Option chosen in the CEP calculator; quoted again on the server */
  shipping: z
    .object({ cep: z.string().max(12), optionId: z.string().max(80) })
    .nullable()
    .optional(),
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
  customer_required: "Faça seu cadastro para finalizar a compra",
  invalid_name: "Revise o nome do cadastro",
  invalid_email: "Revise o e-mail do cadastro",
  invalid_phone: "Revise o WhatsApp do cadastro (com DDD)",
  invalid_cep: "CEP inválido. Confira os números",
  invalid_shipping: "Não foi possível validar a entrega escolhida. Calcule o frete novamente",
  delivery_zone_unavailable: "A opção de entrega escolhida não atende este CEP. Calcule o frete novamente",
  invalid_payment_method: "Forma de pagamento inválida",
  online_payment_disabled: "O pagamento pelo site não está disponível no momento. Você pode finalizar pelo WhatsApp",
  online_payment_unavailable: "Há itens com preço sob consulta no carrinho. Para eles, finalize pelo WhatsApp",
  delivery_required: "Para pagar pelo site, escolha uma entrega com valor definido (calcule o frete pelo CEP)",
};

function describeRpcError(message: string) {
  const [code, detail] = message.split(":");
  const base = ERROR_MESSAGES[code.trim()];
  if (!base) return null;
  return detail ? `${base}: ${detail.trim()}.` : `${base}.`;
}

type OrderRpcResult = {
  id: string;
  code: string;
  subtotal_cents: number;
  discount_cents: number;
  coupon_code: string | null;
  discount_percent: number | null;
  has_unpriced_items: boolean;
  amount_due_cents: number | null;
  delivery: { name: string; method: DeliveryMethod; fee_cents: number | null; estimate: string | null } | null;
  destination: { cep: string; city: string | null; uf: string | null } | null;
  items: { name: string; brand: string | null; code: string | null; quantity: number; unit_price_cents: number | null; line_total_cents: number | null }[];
};

type Registered = { ok: true; data: z.infer<typeof checkoutSchema>; r: OrderRpcResult } | { ok: false; error: string; retryable: boolean };

/** Validates the cart, quotes the delivery again and registers the order with server-side prices. */
async function registerOrder(input: unknown, paymentMethod: "whatsapp" | "mercadopago"): Promise<Registered> {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos.", retryable: false };
  }
  const data = parsed.data;
  const sb = getPublicSupabase();
  if (!sb) return { ok: false, error: "A loja ainda não está conectada ao banco de dados.", retryable: false };

  // Delivery chosen in the CEP calculator: quoted again here, never trusted from the browser
  let deliveryZoneId = data.deliveryZoneId ?? null;
  let shipping: Record<string, unknown> | null = null;
  if (data.shipping) {
    const cep = normalizeCep(data.shipping.cep);
    if (!cep) return { ok: false, error: "CEP inválido. Confira os números.", retryable: false };
    const quote = await getShippingQuote(cep, data.items);
    const option = quote.options.find((o) => o.id === data.shipping!.optionId);
    if (!option) return { ok: false, error: "A opção de entrega escolhida não está mais disponível para este CEP. Calcule o frete novamente.", retryable: false };
    if (option.unavailableReason) return { ok: false, error: `${option.unavailableReason}.`, retryable: false };
    const place = { cep, city: quote.address?.city ?? null, uf: quote.address?.uf ?? null };
    deliveryZoneId = option.kind === "zone" && option.method !== "to_arrange" ? option.zoneId : null;
    shipping = option.kind === "carrier" ? { ...place, service: option.name, fee_cents: option.feeCents, estimate: option.estimate } : place;
  }

  const { data: result, error } = await sb.rpc("create_order_intent", {
    p_items: data.items.map((i) => ({ product_id: i.productId, variant_id: i.variantId, kit_id: i.kitId, quantity: i.quantity })),
    p_customer_notes: data.customerNotes || null,
    p_delivery_zone_id: deliveryZoneId,
    p_coupon_code: data.couponCode || null,
    p_shipping: shipping,
    p_customer: data.customer,
    p_payment_method: paymentMethod,
  });

  if (error) {
    const friendly = describeRpcError(error.message);
    if (friendly) return { ok: false, error: friendly, retryable: false };
    console.error("[checkout] create_order_intent failed", error.message);
    return { ok: false, error: "Não foi possível registrar o pedido agora.", retryable: true };
  }
  return { ok: true, data, r: result as OrderRpcResult };
}

/**
 * Registers an order intent (server-side prices) and returns the WhatsApp link.
 * An intent is not a sale: stock only moves when the store confirms it.
 */
export async function submitOrder(input: unknown): Promise<CheckoutResult> {
  const settings = await getStoreSettings();
  const number = normalizeWhatsAppNumber(settings.whatsapp_number);
  if (!number) return { ok: false, error: "O WhatsApp da loja ainda não foi configurado.", retryable: false };

  const registered = await registerOrder(input, "whatsapp");
  if (!registered.ok) return registered;
  const { data, r } = registered;

  const destination = r.destination ? destinationLabel(r.destination) : null;
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
        ? { label: `${DELIVERY_METHOD_LABEL[r.delivery.method]} (${r.delivery.name})`, feeCents: r.delivery.fee_cents, estimate: r.delivery.estimate, destination }
        : destination
          ? { label: null, feeCents: null, destination }
          : null,
    customerName: data.customer.name,
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

export type OnlineCheckoutResult =
  | { ok: true; code: string; orderUrl: string; checkoutUrl: string | null }
  | { ok: false; error: string; retryable: boolean };

/**
 * Pay on the site: registers the order (total = products − discount + delivery, all computed by the
 * database) and opens the Mercado Pago checkout. The order is confirmed only when Mercado Pago approves.
 */
export async function startOnlinePayment(input: unknown): Promise<OnlineCheckoutResult> {
  const settings = await getStoreSettings();
  if (!settings.online_payment_enabled || !mercadoPagoConfig().ready) {
    return { ok: false, error: "O pagamento pelo site não está disponível no momento. Você pode finalizar pelo WhatsApp.", retryable: false };
  }
  const registered = await registerOrder(input, "mercadopago");
  if (!registered.ok) return registered;
  const checkout = await openCheckout(registered.r.id);
  return { ok: true, code: registered.r.code, orderUrl: `/pedido/${registered.r.id}`, checkoutUrl: checkout.ok ? checkout.url : null };
}

// per-IP limit for opening checkouts again from the order page
const payHits = new Map<string, { count: number; reset: number }>();
function allowPay(ip: string) {
  const now = Date.now();
  const entry = payHits.get(ip);
  if (!entry || entry.reset < now) {
    if (payHits.size > 5000) payHits.clear();
    payHits.set(ip, { count: 1, reset: now + 60_000 });
    return true;
  }
  entry.count += 1;
  return entry.count <= 10;
}

/** "Pagar agora" / "Tentar novamente" on the order page. */
export async function payOrder(orderId: unknown): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const id = z.uuid().safeParse(orderId);
  if (!id.success) return { ok: false, error: "Pedido inválido." };
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!allowPay(ip)) return { ok: false, error: "Muitas tentativas seguidas. Aguarde um minuto e tente de novo." };
  const result = await openCheckout(id.data);
  if (result.ok) return result;
  return {
    ok: false,
    error:
      result.reason === "expired"
        ? "O prazo para pagar este pedido terminou. Faça um novo pedido ou fale com a gente pelo WhatsApp."
        : result.reason === "not_payable"
          ? "Este pedido não está aguardando pagamento."
          : "Não foi possível abrir o pagamento agora. Tente novamente em instantes.",
  };
}

// ---------------------------------------------------------------------------
// Apple Pay (Mercado Pago Orders API)
// ---------------------------------------------------------------------------
const applePayHits = new Map<string, { count: number; reset: number }>();
async function allowApplePay() {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const entry = applePayHits.get(ip);
  if (!entry || entry.reset < now) {
    if (applePayHits.size > 5000) applePayHits.clear();
    applePayHits.set(ip, { count: 1, reset: now + 60_000 });
    return true;
  }
  entry.count += 1;
  return entry.count <= 20;
}

export type ApplePayStart =
  | { ok: true; orderId: string; code: string; orderUrl: string; amountCents: number; lines: ApplePayLines }
  | { ok: false; error: string };

/** Apple Pay, step 1: registers the order (server prices) so the payment sheet shows the exact total. */
export async function startApplePayOrder(input: unknown): Promise<ApplePayStart> {
  const settings = await getStoreSettings();
  if (!applePayConfig(settings).ready) return { ok: false, error: "O Apple Pay não está disponível no momento. Escolha outra forma de pagamento." };
  if (!(await allowApplePay())) return { ok: false, error: "Muitas tentativas seguidas. Aguarde um minuto e tente de novo." };
  const registered = await registerOrder(input, "mercadopago");
  if (!registered.ok) return { ok: false, error: registered.error };
  const r = registered.r;
  if (r.amount_due_cents == null) return { ok: false, error: "Não foi possível calcular o total do pedido. Escolha outra forma de pagamento." };
  return {
    ok: true,
    orderId: r.id,
    code: r.code,
    orderUrl: `/pedido/${r.id}`,
    amountCents: r.amount_due_cents,
    lines: { subtotalCents: r.subtotal_cents, discountCents: r.discount_cents ?? 0, feeCents: r.delivery?.fee_cents ?? 0 },
  };
}

/** Apple Pay, step 2: merchant validation (Mercado Pago opens the session with the store's certificate). */
export async function validateApplePayMerchant(validationURL: unknown): Promise<{ ok: true; session: unknown } | { ok: false; error: string }> {
  const url = z.url().max(500).safeParse(validationURL);
  const failure = { ok: false as const, error: "Não foi possível iniciar o Apple Pay agora. Tente novamente ou escolha outra forma de pagamento." };
  if (!url.success || !(await allowApplePay())) return failure;
  const settings = await getStoreSettings();
  const domain = applePayDomain((await headers()).get("host"));
  const result = await createApplePaySession(settings, url.data, domain).catch(() => ({ ok: false as const }));
  return result.ok ? { ok: true, session: result.session } : failure;
}

const applePaySchema = z.object({
  orderId: z.uuid(),
  cpf: z.string().max(20),
  token: z.object({
    paymentData: z.record(z.string(), z.unknown()).refine((v) => JSON.stringify(v).length <= 20_000, "Pagamento inválido."),
    transactionIdentifier: z.string().regex(/^[0-9A-Fa-f]{1,128}$/),
    paymentMethod: z.object({
      network: z.string().max(40).nullable().optional(),
      type: z.string().max(20).nullable().optional(),
      displayName: z.string().max(80).nullable().optional(),
    }),
  }),
});

export type ApplePayCompletion = { ok: true; status: string; approved: boolean; orderUrl: string } | { ok: false; error: string };

/** Apple Pay, step 3: the authorized payment is charged for the amount registered in the database. */
export async function completeApplePay(input: unknown): Promise<ApplePayCompletion> {
  const parsed = applePaySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Não foi possível ler o pagamento do Apple Pay. Tente novamente." };
  if (!(await allowApplePay())) return { ok: false, error: "Muitas tentativas seguidas. Aguarde um minuto e tente de novo." };
  const settings = await getStoreSettings();
  const result = await chargeWithApplePay(settings, parsed.data);
  if (result.ok) return { ok: true, status: result.status, approved: result.status === "approved", orderUrl: result.orderUrl };
  const messages: Record<typeof result.reason, string> = {
    invalid_cpf: "Confira o CPF: o Mercado Pago exige um CPF válido para pagar com Apple Pay.",
    unsupported_card: "O Apple Pay aceita cartões de crédito Visa e Mastercard. Escolha outro cartão ou outra forma de pagamento.",
    expired: "O prazo para pagar este pedido terminou. Faça um novo pedido ou fale com a gente pelo WhatsApp.",
    not_payable: "Este pedido não está aguardando pagamento.",
    not_found: "Pedido não encontrado.",
    not_configured: "O Apple Pay não está disponível no momento. Escolha outra forma de pagamento.",
    provider_error: "Não foi possível concluir o pagamento com Apple Pay agora. Tente novamente em instantes ou escolha outra forma de pagamento.",
  };
  return { ok: false, error: messages[result.reason] };
}
