"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { getKits, getProductsByIds, getStoreSettings } from "@/lib/catalog/queries";
import { applePayConfig, applePayDomain, chargeWithApplePay, createApplePaySession } from "@/lib/payments/apple-pay";
import type { ApplePayLines } from "@/lib/payments/apple-pay-core";
import { isSupabaseConfigured } from "@/lib/env";
import { chargeCard, createPix, mercadoPagoConfig, openCheckout } from "@/lib/payments/mercadopago";
import { getPublicSupabase } from "@/lib/supabase/public";
import { createServerSupabase } from "@/lib/supabase/server";
import { saveMyAddress } from "./account-actions";
import { cardRejectionMessage, isValidCpf } from "./checkout-data";
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

const lineWithQuantity = lineRef.extend({ quantity: z.number().int().min(1).max(99) });

const checkoutSchema = z.object({
  /** One id per checkout attempt: repeated clicks reuse the same order */
  requestId: z.uuid().optional(),
  items: z.array(lineWithQuantity).min(1, "Seu carrinho está vazio.").max(60, "Carrinho muito grande. Fale com a gente pelo WhatsApp."),
  // validated again by the database (CPF digits, phone, e-mail)
  customer: z.object(
    {
      firstName: z.string().trim().min(1, "Informe seu primeiro nome.").max(60),
      lastName: z.string().trim().min(1, "Informe seu sobrenome.").max(80),
      email: z.string().trim().max(254),
      phone: z.string().trim().max(30),
      cpf: z.string().trim().max(20).optional().default(""),
      marketing: z.boolean().optional(),
    },
    { error: "Informe seus dados para finalizar a compra." },
  ),
  /** Delivery address (not needed for pickup or a delivery arranged on WhatsApp) */
  address: z
    .object({
      recipient: z.string().trim().max(120),
      cep: z.string().trim().max(12),
      street: z.string().trim().max(120),
      number: z.string().trim().max(20),
      complement: z.string().trim().max(80).optional().default(""),
      reference: z.string().trim().max(120).optional().default(""),
      district: z.string().trim().max(80),
      city: z.string().trim().max(80),
      uf: z.string().trim().max(2),
    })
    .nullable()
    .optional(),
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
type CheckoutInput = z.infer<typeof checkoutSchema>;

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
  customer_required: "Informe seus dados para finalizar a compra",
  invalid_name: "Revise nome e sobrenome",
  invalid_email: "Revise o e-mail",
  invalid_phone: "Revise o telefone (com DDD)",
  invalid_cpf: "Revise o CPF",
  invalid_cep: "CEP inválido. Confira os números",
  invalid_shipping: "Não foi possível validar a entrega escolhida. Calcule o frete novamente",
  delivery_zone_unavailable: "A opção de entrega escolhida não atende este CEP. Calcule o frete novamente",
  address_required: "Informe o endereço completo de entrega (rua, número, bairro e destinatário)",
  invalid_payment_method: "Forma de pagamento inválida",
  online_payment_disabled: "O pagamento pelo site não está disponível no momento",
  online_payment_unavailable: "Há itens com preço sob consulta no carrinho. Para eles, combine o pagamento pelo WhatsApp",
  delivery_required: "Para pagar pelo site, escolha uma entrega com valor definido",
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
  duplicate?: boolean;
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

type Registered = { ok: true; r: OrderRpcResult } | { ok: false; error: string; retryable: boolean };

/**
 * Quotes the delivery again and registers the order with server-side prices. When the customer is signed in,
 * the call carries their session, so the order is linked to the account (auth.uid() in the database).
 */
async function registerOrder(data: CheckoutInput, paymentMethod: "whatsapp" | "mercadopago"): Promise<Registered> {
  if (!isSupabaseConfigured) return { ok: false, error: "A loja ainda não está conectada ao banco de dados.", retryable: false };
  const sb = await createServerSupabase();

  // Delivery chosen in the CEP calculator: quoted again here, never trusted from the browser
  let deliveryZoneId = data.deliveryZoneId ?? null;
  let shipping: Record<string, unknown> | null = null;
  const address = data.address ?? null;
  if (data.shipping) {
    const cep = normalizeCep(data.shipping.cep);
    if (!cep) return { ok: false, error: "CEP inválido. Confira os números.", retryable: false };
    const quote = await getShippingQuote(cep, data.items);
    const option = quote.options.find((o) => o.id === data.shipping!.optionId);
    if (!option) return { ok: false, error: "A opção de entrega escolhida não está mais disponível para este CEP. Calcule o frete novamente.", retryable: false };
    if (option.unavailableReason) return { ok: false, error: `${option.unavailableReason}.`, retryable: false };
    const place = {
      cep,
      city: quote.address?.city ?? (address?.city || null),
      uf: quote.address?.uf ?? (address?.uf ? address.uf.toUpperCase() : null),
      ...(address && option.method !== "pickup" && option.method !== "to_arrange"
        ? { recipient: address.recipient, street: address.street, number: address.number, complement: address.complement, reference: address.reference, district: address.district }
        : {}),
    };
    deliveryZoneId = option.kind === "zone" && option.method !== "to_arrange" ? option.zoneId : null;
    shipping = option.kind === "carrier" ? { ...place, service: option.name, fee_cents: option.feeCents, estimate: option.estimate } : place;
  }

  const { data: result, error } = await sb.rpc("create_order_intent", {
    p_items: data.items.map((i) => ({ product_id: i.productId, variant_id: i.variantId, kit_id: i.kitId, quantity: i.quantity })),
    p_customer_notes: data.customerNotes || null,
    p_delivery_zone_id: deliveryZoneId,
    p_coupon_code: data.couponCode || null,
    p_shipping: shipping,
    p_customer: {
      first_name: data.customer.firstName,
      last_name: data.customer.lastName,
      name: `${data.customer.firstName} ${data.customer.lastName}`,
      email: data.customer.email,
      phone: data.customer.phone,
      ...(data.customer.cpf ? { cpf: data.customer.cpf } : {}),
      ...(data.customer.marketing !== undefined ? { marketing: data.customer.marketing } : {}),
    },
    p_payment_method: paymentMethod,
    p_request_id: data.requestId ?? null,
  });

  if (error) {
    const friendly = describeRpcError(error.message);
    if (friendly) return { ok: false, error: friendly, retryable: false };
    console.error("[checkout] create_order_intent failed", error.message);
    return { ok: false, error: "Não foi possível registrar o pedido agora.", retryable: true };
  }
  return { ok: true, r: result as OrderRpcResult };
}

async function clientIp() {
  return (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

function makeLimiter(perMinute: number) {
  const hits = new Map<string, { count: number; reset: number }>();
  return (key: string) => {
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.reset < now) {
      if (hits.size > 5000) hits.clear();
      hits.set(key, { count: 1, reset: now + 60_000 });
      return true;
    }
    entry.count += 1;
    return entry.count <= perMinute;
  };
}
const allowPlace = makeLimiter(20);
const allowPay = makeLimiter(10);

const paymentSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("pix") }),
  z.object({
    method: z.literal("card"),
    token: z.string().trim().min(8).max(200),
    paymentMethodId: z.string().regex(/^[a-z0-9_]{2,30}$/),
    issuerId: z.string().max(20).nullable().optional(),
    installments: z.number().int().min(1).max(24),
  }),
  z.object({ method: z.literal("checkout_pro") }),
  z.object({ method: z.literal("whatsapp") }),
]);

const placeSchema = checkoutSchema.extend({
  requestId: z.uuid(),
  saveAddress: z.boolean().optional(),
  payment: paymentSchema,
});

export type PlaceOrderResult =
  | { ok: true; kind: "order"; code: string; orderId: string; url: string }
  | { ok: true; kind: "redirect"; code: string; orderId: string; url: string; orderUrl: string }
  | { ok: true; kind: "whatsapp"; code: string; url: string; summarized: boolean }
  | { ok: false; error: string; retryable: boolean; step?: "identificacao" | "pagamento"; orderId?: string };

type Receipt = { payment_status: string; pix: { qr_code: string } | null };
async function readReceipt(orderId: string) {
  const { data } = (await getPublicSupabase()?.rpc("get_order_receipt", { p_order_id: orderId })) ?? { data: null };
  return (data as Receipt | null) ?? null;
}

/**
 * Review step → "Confirmar pedido". Registers the order (server prices, one order per attempt) and starts the
 * chosen payment: Pix (QR code), card (Mercado Pago token), Mercado Pago's page (boleto, balance) or WhatsApp.
 * An order is confirmed only when Mercado Pago approves the payment.
 */
export async function placeOrder(input: unknown): Promise<PlaceOrderResult> {
  const parsed = placeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos.", retryable: false };
  const data = parsed.data;
  if (!allowPlace(await clientIp())) return { ok: false, error: "Muitas tentativas seguidas. Aguarde um minuto e tente de novo.", retryable: true };
  const settings = await getStoreSettings();
  const method = data.payment.method;
  const online = method !== "whatsapp";
  const whatsapp = normalizeWhatsAppNumber(settings.whatsapp_number);

  if (online && (!settings.online_payment_enabled || !mercadoPagoConfig().ready)) {
    return { ok: false, error: "O pagamento pelo site não está disponível no momento. Escolha outra forma de pagamento.", retryable: false, step: "pagamento" };
  }
  if (method === "card" && !settings.mercadopago_public_key) return { ok: false, error: "O pagamento com cartão não está disponível no momento.", retryable: false, step: "pagamento" };
  if ((method === "pix" || method === "card") && !isValidCpf(data.customer.cpf)) return { ok: false, error: "Informe um CPF válido para pagar pelo site.", retryable: false, step: "identificacao" };
  if (method === "whatsapp" && !whatsapp) return { ok: false, error: "O WhatsApp da loja ainda não foi configurado.", retryable: false, step: "pagamento" };

  const registered = await registerOrder(data, online ? "mercadopago" : "whatsapp");
  if (!registered.ok) return registered;
  const r = registered.r;
  const orderUrl = `/pedido/${r.id}`;

  // address saved in the account for the next purchases (signed-in customers who asked for it)
  if (data.saveAddress && data.address && !r.duplicate) {
    await saveMyAddress({ ...data.address, isDefault: false }).catch(() => null);
  }

  if (method === "whatsapp") {
    const destination = r.destination ? destinationLabel(r.destination) : null;
    const { url, summarized } = buildOrderWhatsAppLink(whatsapp!, {
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
      customerName: `${data.customer.firstName} ${data.customer.lastName}`,
      customerNotes: data.customerNotes || null,
    });
    return { ok: true, kind: "whatsapp", code: r.code, url, summarized };
  }

  if (method === "checkout_pro") {
    const checkout = await openCheckout(r.id);
    return { ok: true, kind: "redirect", code: r.code, orderId: r.id, url: checkout.ok ? checkout.url : orderUrl, orderUrl };
  }

  // a repeated confirmation of an order already charged goes straight to its page
  if (r.duplicate) {
    const receipt = await readReceipt(r.id);
    if (receipt && (["approved", "in_process"].includes(receipt.payment_status) || (method === "pix" && receipt.pix))) {
      return { ok: true, kind: "order", code: r.code, orderId: r.id, url: orderUrl };
    }
  }

  if (method === "pix") {
    const pix = await createPix(r.id, data.requestId);
    if (!pix.ok) {
      return {
        ok: false,
        orderId: r.id,
        step: "pagamento",
        retryable: pix.reason === "provider_error",
        error: pix.reason === "pix_unavailable" ? "O Pix não está disponível no momento. Escolha outra forma de pagamento." : "Não foi possível gerar o Pix agora. Tente novamente em instantes.",
      };
    }
    return { ok: true, kind: "order", code: r.code, orderId: r.id, url: orderUrl };
  }

  const card = data.payment as Extract<z.infer<typeof paymentSchema>, { method: "card" }>;
  const charged = await chargeCard(r.id, { token: card.token, paymentMethodId: card.paymentMethodId, issuerId: card.issuerId ?? null, installments: card.installments }, data.requestId);
  if (!charged.ok) {
    return {
      ok: false,
      orderId: r.id,
      step: "pagamento",
      retryable: charged.reason === "provider_error",
      error: charged.reason === "invalid_card" ? "Confira os dados do cartão e tente de novo." : "Não foi possível concluir o pagamento com cartão agora. Tente novamente em instantes.",
    };
  }
  if (charged.status === "rejected" || charged.status === "cancelled") {
    return { ok: false, orderId: r.id, step: "pagamento", retryable: false, error: cardRejectionMessage(charged.detail) };
  }
  return { ok: true, kind: "order", code: r.code, orderId: r.id, url: orderUrl };
}

function payError(reason: string) {
  return reason === "expired"
    ? "O prazo para pagar este pedido terminou. Faça um novo pedido ou fale com a gente pelo WhatsApp."
    : reason === "not_payable"
      ? "Este pedido não está aguardando pagamento."
      : "Não foi possível abrir o pagamento agora. Tente novamente em instantes.";
}

/** "Pagar agora" / "Tentar novamente" on the order page (Mercado Pago's page). */
export async function payOrder(orderId: unknown): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const id = z.uuid().safeParse(orderId);
  if (!id.success) return { ok: false, error: "Pedido inválido." };
  if (!allowPay(await clientIp())) return { ok: false, error: "Muitas tentativas seguidas. Aguarde um minuto e tente de novo." };
  const result = await openCheckout(id.data);
  return result.ok ? result : { ok: false, error: payError(result.reason) };
}

/** "Gerar novo código Pix" on the order page (the previous code expired). */
export async function renewPix(orderId: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = z.uuid().safeParse(orderId);
  if (!id.success) return { ok: false, error: "Pedido inválido." };
  if (!allowPay(await clientIp())) return { ok: false, error: "Muitas tentativas seguidas. Aguarde um minuto e tente de novo." };
  const result = await createPix(id.data, `${id.data}-${Date.now()}`);
  if (result.ok) return { ok: true };
  return { ok: false, error: result.reason === "pix_unavailable" ? "O Pix não está disponível no momento." : payError(result.reason) };
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
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  if (!isValidCpf(parsed.data.customer.cpf)) return { ok: false, error: "Informe um CPF válido para pagar com Apple Pay." };
  const registered = await registerOrder(parsed.data, "mercadopago");
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
