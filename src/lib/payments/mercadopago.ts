import "server-only";
import { SITE_URL } from "@/lib/env";
import { getServiceSupabase, isServiceRoleConfigured } from "@/lib/supabase/service";
import {
  buildCardPayment,
  buildPixPayment,
  buildPreference,
  isUuid,
  paidCents,
  paymentDeadline,
  pixExpiry,
  sortPayments,
  type CheckoutOrder,
  type MercadoPagoPayment,
  type PaymentPayer,
} from "./mercadopago-core";
import { isMpOrderId, mapMpOrder, type MpOrder } from "./apple-pay-core";

const DEFAULT_BASE_URL = "https://api.mercadopago.com";

/** Server-only configuration. The access token and the webhook secret never reach the browser or the database. */
export function mercadoPagoConfig() {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim() || null;
  const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim() || null;
  const baseUrl = (process.env.MERCADOPAGO_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, "");
  const serviceRole = isServiceRoleConfigured();
  return { token, webhookSecret, baseUrl, serviceRole, ready: Boolean(token) && serviceRole };
}

export type MpResponse<T> = { ok: boolean; status: number; body: T | null };

/**
 * Mercado Pago API call. With `auth: false` the access token is not sent (calls identified by the public key).
 */
export async function mpRequest<T>(path: string, init: RequestInit = {}, opts: { auth?: boolean; timeoutMs?: number } = {}): Promise<MpResponse<T>> {
  const { token, baseUrl } = mercadoPagoConfig();
  const auth = opts.auth ?? true;
  if (auth && !token) return { ok: false, status: 0, body: null };
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
    headers: { Accept: "application/json", "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
  });
  const body = (await res.json().catch(() => null)) as T | null;
  return { ok: res.ok, status: res.status, body };
}

const mp = <T>(path: string, init: RequestInit = {}, timeoutMs = 10_000) => mpRequest<T>(path, init, { timeoutMs });

export type MercadoPagoCheck = { ok: true; nickname: string | null; siteId: string | null; test: boolean } | { ok: false; status: number };

/** Admin settings: confirms the access token works (GET /users/me). */
export async function checkMercadoPago(): Promise<MercadoPagoCheck> {
  try {
    const r = await mp<{ nickname?: string; site_id?: string; test_data?: unknown; tags?: string[] }>("/users/me", {}, 6000);
    if (!r.ok || !r.body) return { ok: false, status: r.status };
    const test = Boolean(r.body.tags?.includes("test_user")) || (mercadoPagoConfig().token ?? "").startsWith("TEST-");
    return { ok: true, nickname: r.body.nickname ?? null, siteId: r.body.site_id ?? null, test };
  } catch {
    return { ok: false, status: 0 };
  }
}

type OrderRow = {
  id: string;
  code: string;
  created_at: string;
  status: string;
  payment_method: string;
  payment_status: string;
  amount_due_cents: number | null;
  discount_cents: number;
  delivery_fee_cents: number | null;
  shipping_cep: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_cpf: string | null;
  shipping_city: string | null;
  shipping_uf: string | null;
  shipping_street: string | null;
  shipping_number: string | null;
  shipping_complement: string | null;
  shipping_district: string | null;
  payment_checkout_url: string | null;
  payment_expires_at: string | null;
  customer: { name: string; email: string; phone: string; first_name: string | null; last_name: string | null; cpf: string | null } | null;
  items: { name_snapshot: string; brand_snapshot: string | null; unit_price_cents: number | null; quantity: number; product_id: string | null; kit_id: string | null; sort_order: number; product: { code: string | null } | null }[];
};

export type CheckoutResult = { ok: true; url: string } | { ok: false; reason: "not_configured" | "not_found" | "not_payable" | "expired" | "provider_error" };

type Payable = { ok: true; order: OrderRow & { amount_due_cents: number }; checkout: CheckoutOrder; payer: PaymentPayer } | { ok: false; reason: "not_configured" | "not_found" | "not_payable" | "expired" | "provider_error" };

/** Reads an online order that can still be paid, with the buyer data registered on it. */
async function loadPayableOrder(orderId: string): Promise<Payable> {
  const config = mercadoPagoConfig();
  const sb = getServiceSupabase();
  if (!config.ready || !sb) return { ok: false, reason: "not_configured" };
  const { data, error } = await sb
    .from("order_intents")
    .select(
      "id, code, created_at, status, payment_method, payment_status, amount_due_cents, discount_cents, delivery_fee_cents, shipping_cep, shipping_city, shipping_uf, shipping_street, shipping_number, shipping_complement, shipping_district, customer_name, customer_phone, customer_cpf, payment_checkout_url, payment_expires_at, customer:customers(name, email, phone, first_name, last_name, cpf), items:order_intent_items(name_snapshot, brand_snapshot, unit_price_cents, quantity, product_id, kit_id, sort_order, product:products(code))",
    )
    .eq("id", orderId)
    .maybeSingle();
  if (error) {
    console.error("[mercadopago] leitura do pedido falhou", error.message);
    return { ok: false, reason: "provider_error" };
  }
  const order = data as unknown as OrderRow | null;
  if (!order || order.payment_method !== "mercadopago") return { ok: false, reason: "not_found" };
  if (!["pending", "rejected", "cancelled"].includes(order.payment_status) || ["cancelled", "completed"].includes(order.status) || order.amount_due_cents == null) {
    return { ok: false, reason: "not_payable" };
  }
  if (paymentDeadline(order.created_at).getTime() <= Date.now() + 5 * 60_000) return { ok: false, reason: "expired" };
  const name = (order.customer_name ?? order.customer?.name ?? "").trim().split(/\s+/);
  const payer: PaymentPayer = {
    email: order.customer?.email ?? "",
    firstName: name[0] ?? "",
    lastName: name.slice(1).join(" "),
    cpf: order.customer_cpf ?? "",
    phone: order.customer_phone ?? order.customer?.phone ?? null,
    address: order.shipping_cep
      ? { cep: order.shipping_cep, street: order.shipping_street, number: order.shipping_number, complement: order.shipping_complement, district: order.shipping_district, city: order.shipping_city, uf: order.shipping_uf }
      : null,
  };
  const checkout: CheckoutOrder = {
    id: order.id,
    code: order.code,
    createdAt: order.created_at,
    items: [...order.items]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((i) => ({
        ref: i.product?.code || i.product_id || (i.kit_id ? `kit-${i.kit_id}` : order.code),
        name: i.name_snapshot,
        brand: i.brand_snapshot,
        quantity: i.quantity,
        unitPriceCents: i.unit_price_cents ?? 0,
      })),
    discountCents: order.discount_cents,
    shippingFeeCents: order.delivery_fee_cents ?? 0,
    payer: {
      name: order.customer_name ?? order.customer?.name ?? "",
      email: order.customer?.email ?? "",
      phone: order.customer_phone ?? order.customer?.phone ?? null,
      cep: order.shipping_cep,
    },
  };
  return { ok: true, order: order as OrderRow & { amount_due_cents: number }, checkout, payer };
}

/**
 * Opens (or reuses) the Mercado Pago checkout of an online order and returns its address.
 * Prices, discount and shipping come from the order registered in the database, never from the browser.
 */
export async function openCheckout(orderId: string): Promise<CheckoutResult> {
  const loaded = await loadPayableOrder(orderId);
  if (!loaded.ok) return loaded;
  const { order, checkout } = loaded;
  const sb = getServiceSupabase()!;
  if (order.payment_checkout_url && order.payment_expires_at && new Date(order.payment_expires_at).getTime() > Date.now() + 5 * 60_000) {
    return { ok: true, url: order.payment_checkout_url };
  }
  const settings = await sb.from("store_settings").select("online_payment_max_installments").eq("id", 1).maybeSingle();
  const body = buildPreference(checkout, { siteUrl: SITE_URL, maxInstallments: settings.data?.online_payment_max_installments ?? 12 });
  try {
    const r = await mp<{ id?: string; init_point?: string }>("/checkout/preferences", {
      method: "POST",
      // the same order never opens two checkouts at once
      headers: { "X-Idempotency-Key": `${order.id}-${order.payment_expires_at ?? "first"}` },
      body: JSON.stringify(body),
    });
    if (!r.ok || !r.body?.id || !r.body.init_point) {
      console.error("[mercadopago] preferência recusada", r.status, JSON.stringify(r.body)?.slice(0, 400));
      return { ok: false, reason: "provider_error" };
    }
    // Always the production checkout address (init_point); test credentials work on it too
    const { error: saveError } = await sb.rpc("set_order_checkout", {
      p_order_id: order.id,
      p_preference_id: r.body.id,
      p_checkout_url: r.body.init_point,
      p_expires_at: body.expiration_date_to,
    });
    if (saveError) console.error("[mercadopago] não foi possível guardar o checkout", saveError.message);
    return { ok: true, url: r.body.init_point };
  } catch (e) {
    console.error("[mercadopago] falha ao criar a preferência", (e as Error).message);
    return { ok: false, reason: "provider_error" };
  }
}

export type SyncResult = { ok: true; changed: boolean; orderId: string; paymentStatus: string } | { ok: false; reason: "not_configured" | "not_found" | "not_ours" | "mismatch" };

/** Records a payment result already read from the Mercado Pago API (apply_payment_update, service role only). */
export async function recordPayment(input: {
  orderId: string;
  paymentId: string;
  status: string;
  detail: string | null;
  type: string | null;
  amountCents: number | null;
}): Promise<SyncResult> {
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, reason: "not_configured" };
  const { data, error } = await sb.rpc("apply_payment_update", {
    p_order_id: input.orderId,
    p_payment_id: input.paymentId,
    p_status: input.status,
    p_status_detail: input.detail,
    p_payment_type: input.type,
    p_amount_cents: input.amountCents,
  });
  if (error) {
    if (/order_not_found|not_online_order|invalid_payment/.test(error.message)) return { ok: false, reason: "not_ours" };
    throw new Error(`apply_payment_update: ${error.message}`);
  }
  const r = data as { changed: boolean; payment_status: string };
  return { ok: true, changed: r.changed, orderId: input.orderId, paymentStatus: r.payment_status };
}

async function applyPayment(payment: MercadoPagoPayment, orderId: string): Promise<SyncResult> {
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, reason: "not_configured" };
  const due = await sb.from("order_intents").select("amount_due_cents").eq("id", orderId).maybeSingle();
  if (!due.data) return { ok: false, reason: "not_found" };
  return recordPayment({
    orderId,
    paymentId: String(payment.id),
    status: payment.status,
    detail: payment.status_detail ?? null,
    type: payment.payment_type_id ?? null,
    amountCents: paidCents(payment, due.data.amount_due_cents),
  });
}

/** Records an Orders API order (Apple Pay) read from Mercado Pago. */
export async function applyMpOrder(order: MpOrder, orderId: string, type = "apple_pay"): Promise<SyncResult> {
  const mapped = mapMpOrder(order);
  if (!mapped || !isMpOrderId(order.id)) return { ok: false, reason: "not_found" };
  return recordPayment({ orderId, paymentId: order.id, status: mapped.status, detail: mapped.detail, type, amountCents: mapped.status === "approved" ? mapped.paidCents : null });
}

/** Reads an Orders API order (Apple Pay) from Mercado Pago and records it on its store order. */
export async function syncMpOrder(mpOrderId: string, expectedOrderId?: string): Promise<SyncResult> {
  if (!mercadoPagoConfig().ready) return { ok: false, reason: "not_configured" };
  if (!isMpOrderId(mpOrderId)) return { ok: false, reason: "not_found" };
  const r = await mp<MpOrder>(`/v1/orders/${mpOrderId}`);
  if (r.status === 404 || (r.ok && !r.body)) return { ok: false, reason: "not_found" };
  if (!r.ok || !r.body) throw new Error(`Mercado Pago respondeu ${r.status}`);
  const orderId = r.body.external_reference;
  if (!isUuid(orderId)) return { ok: false, reason: "not_ours" };
  if (expectedOrderId && orderId !== expectedOrderId) return { ok: false, reason: "mismatch" };
  return applyMpOrder(r.body, orderId);
}

/**
 * Reads a payment from the Mercado Pago API (the only source of truth) and records it on its order.
 * Throws on temporary failures so the webhook answers with an error and Mercado Pago retries.
 */
export async function syncPayment(paymentId: string, expectedOrderId?: string): Promise<SyncResult> {
  if (!mercadoPagoConfig().ready) return { ok: false, reason: "not_configured" };
  if (!/^[0-9]{1,24}$/.test(paymentId)) return { ok: false, reason: "not_found" };
  const r = await mp<MercadoPagoPayment>(`/v1/payments/${paymentId}`);
  if (r.status === 404 || (r.ok && !r.body)) return { ok: false, reason: "not_found" };
  if (!r.ok || !r.body) throw new Error(`Mercado Pago respondeu ${r.status}`);
  const orderId = r.body.external_reference;
  if (!isUuid(orderId)) return { ok: false, reason: "not_ours" };
  if (expectedOrderId && orderId !== expectedOrderId) return { ok: false, reason: "mismatch" };
  return applyPayment(r.body, orderId);
}

/** Looks up every payment of an order (by external_reference) and records them, oldest first. */
export async function syncOrderPayments(orderId: string): Promise<SyncResult> {
  if (!mercadoPagoConfig().ready) return { ok: false, reason: "not_configured" };
  // Apple Pay orders are Orders API orders: read them by id
  const stored = await getServiceSupabase()?.from("order_intents").select("payment_id").eq("id", orderId).maybeSingle();
  const storedId = stored?.data?.payment_id as string | null | undefined;
  let orderResult: SyncResult | null = null;
  if (isMpOrderId(storedId)) {
    orderResult = await syncMpOrder(storedId, orderId);
    // a settled Apple Pay payment is the order's payment: no need to look for Checkout Pro attempts
    if (orderResult.ok && ["approved", "in_process", "refunded", "charged_back"].includes(orderResult.paymentStatus)) return orderResult;
  }
  const r = await mp<{ results?: MercadoPagoPayment[] }>(
    `/v1/payments/search?external_reference=${encodeURIComponent(orderId)}&sort=date_created&criteria=desc&limit=20`,
  );
  if (!r.ok) throw new Error(`Mercado Pago respondeu ${r.status}`);
  const payments = sortPayments((r.body?.results ?? []).filter((p) => p.external_reference === orderId));
  let last: SyncResult = orderResult ?? { ok: false, reason: "not_found" };
  let changed = Boolean(orderResult?.ok && orderResult.changed);
  for (const p of payments) {
    last = await applyPayment(p, orderId);
    if (last.ok && last.changed) changed = true;
  }
  return last.ok ? { ...last, changed } : orderResult?.ok ? { ...orderResult, changed } : last;
}

// ---------------------------------------------------------------------------
// Card and Pix inside the site (Payments API)
// ---------------------------------------------------------------------------
export type ChargeResult =
  | { ok: true; status: string; detail: string | null }
  | { ok: false; reason: "not_configured" | "not_found" | "not_payable" | "expired" | "provider_error" | "invalid_card" | "pix_unavailable" | "missing_cpf" };

async function recordInfo(orderId: string, info: { installments: number | null; brand: string | null; qrCode: string | null; qrBase64: string | null; ticketUrl: string | null; expiresAt: string | null }) {
  const { error } = await getServiceSupabase()!.rpc("set_order_payment_info", {
    p_order_id: orderId,
    p_installments: info.installments,
    p_brand: info.brand,
    p_qr_code: info.qrCode,
    p_qr_base64: info.qrBase64,
    p_ticket_url: info.ticketUrl,
    p_qr_expires_at: info.expiresAt,
  });
  if (error) console.error("[mercadopago] não foi possível guardar os dados do pagamento", error.message);
}

type CreatedPayment = MercadoPagoPayment & {
  installments?: number;
  payment_method_id?: string;
  point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string; ticket_url?: string } };
  cause?: { code?: string | number; description?: string }[];
  message?: string;
};

/**
 * Charges the order with the card token created by Mercado Pago's secure fields (the store never sees
 * card numbers). The amount is the one registered in the database. The result is recorded like any payment.
 */
export async function chargeCard(orderId: string, card: { token: string; paymentMethodId: string; issuerId: string | null; installments: number }, attemptKey: string): Promise<ChargeResult> {
  const loaded = await loadPayableOrder(orderId);
  if (!loaded.ok) return loaded;
  const { order, checkout, payer } = loaded;
  if (!payer.cpf) return { ok: false, reason: "missing_cpf" };
  const body = buildCardPayment({ order: checkout, amountCents: order.amount_due_cents, card, payer, siteUrl: SITE_URL });
  try {
    const r = await mp<CreatedPayment>("/v1/payments", {
      method: "POST",
      headers: { "X-Idempotency-Key": `card-${attemptKey}-${card.token.slice(-24)}`.slice(0, 128) },
      body: JSON.stringify(body),
    }, 20_000);
    if (!r.ok || !r.body?.id) {
      console.error("[mercadopago] cartão recusado na criação", r.status, JSON.stringify(r.body?.cause ?? r.body?.message ?? "")?.slice(0, 300));
      return { ok: false, reason: r.status >= 400 && r.status < 500 ? "invalid_card" : "provider_error" };
    }
    const payment = r.body;
    await applyPayment(payment, order.id).catch((e) => console.error("[mercadopago] registro do pagamento adiado", (e as Error).message));
    await recordInfo(order.id, { installments: payment.installments ?? card.installments, brand: payment.payment_method_id ?? card.paymentMethodId, qrCode: null, qrBase64: null, ticketUrl: null, expiresAt: null });
    return { ok: true, status: payment.status, detail: payment.status_detail ?? null };
  } catch (e) {
    console.error("[mercadopago] falha na cobrança com cartão", (e as Error).message);
    return { ok: false, reason: "provider_error" };
  }
}

/** Creates a Pix charge for the order: QR code and copy-and-paste code, valid for up to one hour. */
export async function createPix(orderId: string, attemptKey: string): Promise<ChargeResult> {
  const loaded = await loadPayableOrder(orderId);
  if (!loaded.ok) return loaded;
  const { order, checkout, payer } = loaded;
  if (!payer.cpf) return { ok: false, reason: "missing_cpf" };
  const expiresAt = pixExpiry(order.created_at);
  if (!expiresAt) return { ok: false, reason: "expired" };
  const body = buildPixPayment({ order: checkout, amountCents: order.amount_due_cents, payer, siteUrl: SITE_URL, expiresAt });
  try {
    const r = await mp<CreatedPayment>("/v1/payments", {
      method: "POST",
      headers: { "X-Idempotency-Key": `pix-${attemptKey}`.slice(0, 128) },
      body: JSON.stringify(body),
    }, 20_000);
    const data = r.body?.point_of_interaction?.transaction_data;
    if (!r.ok || !r.body?.id || !data?.qr_code) {
      console.error("[mercadopago] Pix não criado", r.status, JSON.stringify(r.body?.cause ?? r.body?.message ?? "")?.slice(0, 300));
      return { ok: false, reason: r.status >= 400 && r.status < 500 ? "pix_unavailable" : "provider_error" };
    }
    await recordInfo(order.id, {
      installments: null,
      brand: "pix",
      qrCode: data.qr_code,
      qrBase64: data.qr_code_base64 ?? null,
      ticketUrl: data.ticket_url && /^https?:\/\//.test(data.ticket_url) ? data.ticket_url : null,
      expiresAt: expiresAt.toISOString(),
    });
    await applyPayment(r.body, order.id).catch((e) => console.error("[mercadopago] registro do Pix adiado", (e as Error).message));
    return { ok: true, status: r.body.status, detail: r.body.status_detail ?? null };
  } catch (e) {
    console.error("[mercadopago] falha ao criar o Pix", (e as Error).message);
    return { ok: false, reason: "provider_error" };
  }
}
