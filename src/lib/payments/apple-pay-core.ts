/**
 * Apple Pay through Mercado Pago (Orders API) — pure helpers shared by the browser, the server and the tests.
 * No Node or DOM imports here: the checkout component uses this module too.
 */

export const APPLE_PAY_VERSION = 3;
/** Mercado Pago accepts Apple Pay with Visa and Mastercard; credit only (single payment, no installments). */
export const APPLE_PAY_NETWORKS = ["visa", "masterCard"] as const;

// ---------------------------------------------------------------------------
// CPF (required by Mercado Pago for this payment; never stored by the store)
// ---------------------------------------------------------------------------
export function normalizeCpf(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "").slice(0, 11);
}

export function formatCpf(value: string) {
  const d = normalizeCpf(value);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
}

export function isValidCpf(value: string | null | undefined) {
  const d = normalizeCpf(value);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const digit = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return digit(9) === Number(d[9]) && digit(10) === Number(d[10]);
}

// ---------------------------------------------------------------------------
// Apple Pay JS request (browser)
// ---------------------------------------------------------------------------
export const reaisString = (cents: number) => (Math.round(cents) / 100).toFixed(2);

export type ApplePayLines = { subtotalCents: number; discountCents: number; feeCents: number };

export function applePayLineItems(lines: ApplePayLines) {
  return [
    { label: "Produtos", amount: reaisString(lines.subtotalCents), type: "final" },
    ...(lines.discountCents > 0 ? [{ label: "Desconto", amount: `-${reaisString(lines.discountCents)}`, type: "final" }] : []),
    { label: "Frete", amount: reaisString(lines.feeCents), type: "final" },
  ];
}

export function applePayPaymentRequest(totalCents: number, label: string) {
  return {
    countryCode: "BR",
    currencyCode: "BRL",
    supportedNetworks: [...APPLE_PAY_NETWORKS],
    merchantCapabilities: ["supports3DS", "supportsCredit"],
    total: { label, amount: reaisString(totalCents), type: "final" },
  };
}

/** Apple Pay card network → Mercado Pago payment method. */
export function applePayMethod(network: string | null | undefined) {
  const n = (network ?? "").toLowerCase().replace(/[\s_-]/g, "");
  if (n === "visa") return { id: "visa", type: "credit_card" } as const;
  if (n === "mastercard") return { id: "master", type: "credit_card" } as const;
  return null;
}

/** Merchant validation URLs come from Apple (apple-pay-gateway*.apple.com). */
export function isAppleValidationUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /(^|\.)apple\.com$/i.test(url.hostname) && /^apple-pay-gateway/i.test(url.hostname);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Orders API (server)
// ---------------------------------------------------------------------------
export function buildApplePayOrder(input: {
  orderId: string;
  amountCents: number;
  email: string;
  cpf: string;
  method: { id: string; type: string };
  cardToken: string;
}) {
  const amount = reaisString(input.amountCents);
  // exactly the fields documented for Apple Pay: the Orders API refuses unsupported properties
  return {
    type: "online",
    processing_mode: "automatic",
    total_amount: amount,
    currency_id: "BRL",
    external_reference: input.orderId,
    payer: { email: input.email, identification: { type: "CPF", number: normalizeCpf(input.cpf) } },
    transactions: {
      payments: [{ amount, payment_method: { id: input.method.id, type: input.method.type, token: input.cardToken, installments: 1 } }],
    },
  };
}

export type MpOrder = {
  id?: string;
  status?: string;
  status_detail?: string;
  external_reference?: string;
  total_amount?: string;
  total_paid_amount?: string;
  transactions?: { payments?: { id?: string; status?: string; status_detail?: string; amount?: string; paid_amount?: string }[] };
};

export type MappedPayment = { status: "approved" | "in_process" | "pending" | "rejected" | "cancelled" | "refunded" | "charged_back"; detail: string | null; paidCents: number };

const cents = (value: string | undefined) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

/** Orders API status → the store's payment status (same vocabulary as the Payments API). */
export function mapMpOrder(order: MpOrder): MappedPayment | null {
  const payment = order.transactions?.payments?.[0];
  const detail = payment?.status_detail ?? order.status_detail ?? null;
  const paidCents = cents(order.total_paid_amount) || cents(payment?.paid_amount);
  const status = (() => {
    switch (order.status) {
      case "processed":
        return order.status_detail === "refunded" ? "refunded" : "approved";
      case "processing":
      case "in_review":
        return "in_process";
      case "action_required":
        return order.status_detail === "waiting_capture" || order.status_detail === "waiting_retry" ? "in_process" : "pending";
      case "created":
        return "pending";
      case "failed":
        return "rejected";
      case "canceled":
      case "expired":
        return "cancelled";
      case "refunded":
        return "refunded";
      case "charged_back":
        return "charged_back";
      default:
        return null;
    }
  })();
  return status ? { status, detail, paidCents } : null;
}

export const isMpOrderId = (value: unknown): value is string => typeof value === "string" && /^ORD[0-9A-Z]{8,40}$/.test(value);
