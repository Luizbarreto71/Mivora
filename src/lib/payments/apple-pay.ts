import "server-only";
import { SITE_URL } from "@/lib/env";
import { getServiceSupabase } from "@/lib/supabase/service";
import type { StoreSettings } from "@/lib/types";
import { applePayMethod, buildApplePayOrder, isAppleValidationUrl, isMpOrderId, isValidCpf, mapMpOrder, type MappedPayment, type MpOrder } from "./apple-pay-core";
import { applyMpOrder, mercadoPagoConfig, mpRequest } from "./mercadopago";
import { paymentWindowOpen } from "./mercadopago-core";

type ApplePaySettings = Pick<
  StoreSettings,
  "store_name" | "online_payment_enabled" | "apple_pay_enabled" | "apple_pay_merchant_id" | "apple_pay_certificate_id" | "apple_pay_product_id" | "mercadopago_public_key"
>;

/** Apple Pay is offered when switched on, fully configured and the Mercado Pago credentials are on the server. */
export function applePayConfig(settings: ApplePaySettings) {
  const merchantId = settings.apple_pay_merchant_id?.trim() || null;
  const certificateId = settings.apple_pay_certificate_id?.trim() || null;
  const productId = settings.apple_pay_product_id?.trim() || null;
  const publicKey = settings.mercadopago_public_key?.trim() || null;
  const configured = Boolean(merchantId && certificateId && productId && publicKey);
  const ready = Boolean(settings.online_payment_enabled && settings.apple_pay_enabled && configured && mercadoPagoConfig().ready);
  return { merchantId, certificateId, productId, publicKey, configured, ready, displayName: settings.store_name?.trim() || "MIVORA" };
}

/** The button's domain: the request host when it is the site's own domain (or its www twin), else the site domain. */
export function applePayDomain(host: string | null) {
  const site = new URL(SITE_URL).hostname.toLowerCase();
  const twin = site.startsWith("www.") ? site.slice(4) : `www.${site}`;
  const h = (host ?? "").split(":")[0].toLowerCase();
  return h === site || h === twin ? h : site;
}

const keyHeaders = (c: ReturnType<typeof applePayConfig>) => ({ "X-Product-ID": c.productId!, "X-Public-key": c.publicKey! });

/** Merchant validation: Mercado Pago opens the Apple Pay session with the store's merchant certificate. */
export async function createApplePaySession(settings: ApplePaySettings, validationURL: string, domain: string) {
  const c = applePayConfig(settings);
  if (!c.ready || !isAppleValidationUrl(validationURL)) return { ok: false as const };
  const r = await mpRequest<Record<string, unknown>>(
    "/applepay/v1/session",
    {
      method: "POST",
      headers: keyHeaders(c),
      body: JSON.stringify({
        id: c.certificateId,
        merchantIdentifier: c.merchantId,
        domainName: domain,
        displayName: c.displayName,
        initiative: "web",
        initiativeContext: domain,
        validationURL,
      }),
    },
    { auth: false, timeoutMs: 10_000 },
  );
  if (!r.ok || !r.body) {
    console.error("[apple-pay] sessão recusada", r.status, JSON.stringify(r.body)?.slice(0, 300));
    return { ok: false as const };
  }
  return { ok: true as const, session: r.body };
}

export type ApplePayToken = {
  paymentData: Record<string, unknown>;
  transactionIdentifier: string;
  paymentMethod: { network?: string | null; type?: string | null; displayName?: string | null };
};

export type ApplePayResult =
  | { ok: true; status: MappedPayment["status"]; orderUrl: string }
  | { ok: false; reason: "not_configured" | "not_found" | "not_payable" | "expired" | "invalid_cpf" | "unsupported_card" | "provider_error" };

type PayableOrder = {
  id: string;
  created_at: string;
  status: string;
  payment_method: string;
  payment_status: string;
  amount_due_cents: number | null;
  customer: { email: string } | null;
};

/**
 * Charges an online order with Apple Pay: the Apple Pay token becomes a Mercado Pago card token and an
 * Orders API order is created for the amount registered in the database (never an amount from the browser).
 * The result is recorded like any other payment; approval confirms the order and reserves stock.
 */
export async function chargeWithApplePay(settings: ApplePaySettings, input: { orderId: string; cpf: string; token: ApplePayToken }): Promise<ApplePayResult> {
  const c = applePayConfig(settings);
  const sb = getServiceSupabase();
  if (!c.ready || !sb) return { ok: false, reason: "not_configured" };
  if (!isValidCpf(input.cpf)) return { ok: false, reason: "invalid_cpf" };
  const method = applePayMethod(input.token.paymentMethod?.network);
  if (!method) return { ok: false, reason: "unsupported_card" };

  const { data } = await sb
    .from("order_intents")
    .select("id, created_at, status, payment_method, payment_status, amount_due_cents, customer:customers(email)")
    .eq("id", input.orderId)
    .maybeSingle();
  const order = data as unknown as PayableOrder | null;
  if (!order || order.payment_method !== "mercadopago" || !order.customer?.email) return { ok: false, reason: "not_found" };
  if (!["pending", "rejected", "cancelled"].includes(order.payment_status) || ["cancelled", "completed"].includes(order.status) || order.amount_due_cents == null) {
    return { ok: false, reason: "not_payable" };
  }
  if (!paymentWindowOpen(order.created_at)) return { ok: false, reason: "expired" };

  try {
    const tokenized = await mpRequest<{ id?: string }>(
      "/platforms/pci/applepay/v1/tokenize",
      {
        method: "POST",
        headers: keyHeaders(c),
        body: JSON.stringify({
          payment_method: { type: "applepay", payment_data: Buffer.from(JSON.stringify(input.token.paymentData)).toString("base64") },
          transaction_identifier: input.token.transactionIdentifier,
        }),
      },
      { auth: false, timeoutMs: 8_000 },
    );
    if (!tokenized.ok || !tokenized.body?.id) {
      console.error("[apple-pay] tokenização recusada", tokenized.status, JSON.stringify(tokenized.body)?.slice(0, 300));
      return { ok: false, reason: "provider_error" };
    }

    const created = await mpRequest<MpOrder & { data?: MpOrder }>(
      "/v1/orders",
      {
        method: "POST",
        // one charge per Apple Pay authorization
        headers: { "X-Idempotency-Key": `ap-${order.id}-${input.token.transactionIdentifier}`.slice(0, 128) },
        body: JSON.stringify(
          buildApplePayOrder({ orderId: order.id, amountCents: order.amount_due_cents, email: order.customer.email, cpf: input.cpf, method, cardToken: tokenized.body.id }),
        ),
      },
      { timeoutMs: 15_000 },
    );
    // 402: the payment was refused; the response still describes the order
    const mpOrder: MpOrder | null = created.ok ? created.body : created.status === 402 ? (created.body?.data ?? created.body) : null;
    const mapped = mpOrder ? mapMpOrder(mpOrder) : null;
    if (!mpOrder || !mapped) {
      console.error("[apple-pay] cobrança não criada", created.status, JSON.stringify(created.body)?.slice(0, 400));
      return { ok: false, reason: "provider_error" };
    }
    if (isMpOrderId(mpOrder.id)) {
      try {
        await applyMpOrder(mpOrder, order.id);
      } catch (e) {
        // the charge exists at Mercado Pago: the webhook or the order page records it later
        console.error("[apple-pay] não foi possível registrar o resultado agora", (e as Error).message);
      }
    }
    return { ok: true, status: mapped.status, orderUrl: `/pedido/${order.id}` };
  } catch (e) {
    console.error("[apple-pay] falha na cobrança", (e as Error).message);
    return { ok: false, reason: "provider_error" };
  }
}
