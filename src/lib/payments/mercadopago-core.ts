import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Mercado Pago Checkout Pro — pure helpers (no I/O), shared by the server code and the unit tests.
 * Amounts are integer cents everywhere in the store; the API takes decimal BRL.
 */

export type PaymentStatus = "none" | "pending" | "in_process" | "approved" | "rejected" | "cancelled" | "refunded" | "charged_back";

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  none: "Sem pagamento online",
  pending: "Aguardando pagamento",
  in_process: "Pagamento em análise",
  approved: "Pago",
  rejected: "Pagamento recusado",
  cancelled: "Pagamento cancelado ou expirado",
  refunded: "Pagamento devolvido",
  charged_back: "Pagamento contestado",
};

export const PAYMENT_TYPE_LABEL: Record<string, string> = {
  bank_transfer: "Pix",
  pix: "Pix",
  credit_card: "Cartão de crédito",
  debit_card: "Cartão de débito",
  prepaid_card: "Cartão pré-pago",
  ticket: "Boleto",
  account_money: "Saldo Mercado Pago",
  apple_pay: "Apple Pay",
  digital_currency: "Linha de crédito Mercado Pago",
  digital_wallet: "Carteira digital",
};

export function paymentTypeLabel(type: string | null | undefined) {
  return type ? (PAYMENT_TYPE_LABEL[type] ?? type) : null;
}

/** Mercado Pago item category for cosmetics ("Health & Beauty" lives under fashion). */
export const ITEM_CATEGORY = "fashion";
/** Name on the buyer's card statement (up to 13 characters is the safe limit across card networks). */
export const STATEMENT_DESCRIPTOR = "MIVORA";
/** How long an order can be paid online (prices and stock may change after that). */
export const PAYMENT_WINDOW_HOURS = 72;

export type CheckoutOrder = {
  id: string;
  code: string;
  createdAt: string;
  items: { ref: string; name: string; brand: string | null; quantity: number; unitPriceCents: number }[];
  discountCents: number;
  shippingFeeCents: number;
  payer: { name: string; email: string; phone: string | null; cep: string | null };
};

export type PreferenceOptions = {
  siteUrl: string;
  maxInstallments: number;
  now?: Date;
};

const reais = (cents: number) => Math.round(cents) / 100;

/** "Ana Paula Souza" → { first: "Ana", last: "Paula Souza" } */
export function splitName(full: string) {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] ?? "", last: parts.slice(1).join(" ") };
}

/** Spreads a discount over the lines in proportion to their totals (largest remainder, exact in cents). */
export function allocateDiscount(lineTotals: number[], discountCents: number) {
  const total = lineTotals.reduce((s, t) => s + t, 0);
  if (discountCents <= 0 || total <= 0) return lineTotals.map(() => 0);
  const capped = Math.min(discountCents, total);
  const raw = lineTotals.map((t) => (t * capped) / total);
  const shares = raw.map(Math.floor);
  let left = capped - shares.reduce((s, v) => s + v, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    shares[i] += 1;
    left -= 1;
  }
  return shares;
}

export type PreferenceItem = {
  id: string;
  title: string;
  description: string;
  category_id: string;
  quantity: number;
  unit_price: number;
  currency_id: "BRL";
};

/**
 * One Mercado Pago item per order line, with the first-purchase discount already applied to the prices.
 * When a discounted line does not split evenly by quantity, it becomes two items (n−1 units + 1 unit)
 * so the sum matches the order total to the cent.
 */
export function preferenceItems(order: Pick<CheckoutOrder, "code" | "items" | "discountCents">): PreferenceItem[] {
  const totals = order.items.map((i) => i.unitPriceCents * i.quantity);
  const shares = allocateDiscount(totals, order.discountCents);
  const out: PreferenceItem[] = [];
  order.items.forEach((line, idx) => {
    const title = (line.brand && !line.name.toLowerCase().includes(line.brand.toLowerCase()) ? `${line.brand} ${line.name}` : line.name).slice(0, 250);
    const base = {
      id: line.ref.slice(0, 60),
      title,
      description: `${line.brand ? `${line.brand} · ` : ""}pedido ${order.code}`.slice(0, 250),
      category_id: ITEM_CATEGORY,
      currency_id: "BRL" as const,
    };
    const lineTotal = totals[idx] - shares[idx];
    if (lineTotal <= 0) return;
    if (lineTotal % line.quantity === 0) {
      out.push({ ...base, quantity: line.quantity, unit_price: reais(lineTotal / line.quantity) });
      return;
    }
    const unit = Math.floor(lineTotal / line.quantity);
    out.push({ ...base, quantity: line.quantity - 1, unit_price: reais(unit) });
    out.push({ ...base, quantity: 1, unit_price: reais(lineTotal - unit * (line.quantity - 1)) });
  });
  return out;
}

/** Total charged by a preference, in cents (items + shipping). */
export function preferenceTotalCents(body: { items: PreferenceItem[]; shipments?: { cost?: number } }) {
  return body.items.reduce((s, i) => s + Math.round(i.unit_price * 100) * i.quantity, 0) + Math.round((body.shipments?.cost ?? 0) * 100);
}

export function isPublicHttps(url: string) {
  return /^https:\/\//i.test(url) && !/^https:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)([:/]|$)/i.test(url);
}

export function paymentDeadline(createdAt: string) {
  return new Date(new Date(createdAt).getTime() + PAYMENT_WINDOW_HOURS * 3600_000);
}

/** The order can still be paid online. */
export function paymentWindowOpen(createdAt: string) {
  return paymentDeadline(createdAt).getTime() > Date.now();
}

/** Request body for POST /checkout/preferences. */
export function buildPreference(order: CheckoutOrder, opts: PreferenceOptions) {
  const now = opts.now ?? new Date();
  const deadline = paymentDeadline(order.createdAt);
  const name = splitName(order.payer.name);
  const phone = order.payer.phone?.replace(/\D/g, "") ?? "";
  const orderUrl = `${opts.siteUrl}/pedido/${order.id}`;
  const publicSite = isPublicHttps(opts.siteUrl);
  return {
    items: preferenceItems(order),
    payer: {
      name: name.first,
      surname: name.last,
      email: order.payer.email,
      ...(phone.length >= 10 ? { phone: { area_code: phone.slice(0, 2), number: phone.slice(2) } } : {}),
      ...(order.payer.cep ? { address: { zip_code: order.payer.cep } } : {}),
    },
    ...(order.shippingFeeCents > 0 ? { shipments: { cost: reais(order.shippingFeeCents), mode: "not_specified" } } : {}),
    back_urls: { success: orderUrl, pending: orderUrl, failure: orderUrl },
    // Mercado Pago rejects auto_return when the return address is not public
    ...(publicSite ? { auto_return: "approved", notification_url: `${opts.siteUrl}/api/mercadopago/webhook?source_news=webhooks` } : {}),
    external_reference: order.id,
    statement_descriptor: STATEMENT_DESCRIPTOR,
    payment_methods: { installments: Math.min(Math.max(Math.round(opts.maxInstallments), 1), 12) },
    expires: true,
    expiration_date_from: new Date(now.getTime() - 60_000).toISOString(),
    expiration_date_to: deadline.toISOString(),
    // Pix and boleto generated close to the deadline expire with the order
    date_of_expiration: deadline.toISOString(),
    metadata: { order_code: order.code },
  };
}

// ---------------------------------------------------------------------------
// Payments API (card and Pix inside the site)
// ---------------------------------------------------------------------------
export type PaymentPayer = {
  email: string;
  firstName: string;
  lastName: string;
  cpf: string;
  phone: string | null;
  address: { cep: string; street: string | null; number: string | null; complement: string | null; district: string | null; city: string | null; uf: string | null } | null;
};

/** Mercado Pago date format with the Brasília offset (Brazil has no daylight saving time). */
export function mpDate(date: Date) {
  const local = new Date(date.getTime() - 3 * 3600_000);
  return `${local.toISOString().slice(0, 23)}-03:00`;
}

function paymentExtras(order: Pick<CheckoutOrder, "id" | "code" | "items" | "discountCents">, payer: PaymentPayer, siteUrl: string) {
  const phone = payer.phone?.replace(/\D/g, "") ?? "";
  const a = payer.address;
  return {
    description: `Pedido ${order.code} - MIVORA`,
    external_reference: order.id,
    statement_descriptor: STATEMENT_DESCRIPTOR,
    ...(isPublicHttps(siteUrl) ? { notification_url: `${siteUrl}/api/mercadopago/webhook?source_news=webhooks` } : {}),
    additional_info: {
      items: preferenceItems(order).map(({ id, title, description, category_id, quantity, unit_price }) => ({ id, title, description, category_id, quantity, unit_price })),
      payer: {
        first_name: payer.firstName,
        last_name: payer.lastName,
        ...(phone.length >= 10 ? { phone: { area_code: phone.slice(0, 2), number: phone.slice(2) } } : {}),
        ...(a ? { address: { zip_code: a.cep, street_name: a.street ?? "", street_number: a.number ?? "" } } : {}),
      },
      ...(a?.street
        ? {
            shipments: {
              receiver_address: { zip_code: a.cep, street_name: a.street, street_number: a.number ?? "", apartment: a.complement ?? "", city_name: a.city ?? "", state_name: a.uf ?? "" },
            },
          }
        : {}),
    },
  };
}

const payerBlock = (payer: PaymentPayer) => ({
  email: payer.email,
  first_name: payer.firstName,
  last_name: payer.lastName,
  identification: { type: "CPF", number: payer.cpf.replace(/\D/g, "") },
});

/** POST /v1/payments with the card token from Mercado Pago's secure fields (the store never sees the card). */
export function buildCardPayment(input: {
  order: Pick<CheckoutOrder, "id" | "code" | "items" | "discountCents">;
  amountCents: number;
  card: { token: string; paymentMethodId: string; issuerId: string | null; installments: number };
  payer: PaymentPayer;
  siteUrl: string;
}) {
  return {
    transaction_amount: Math.round(input.amountCents) / 100,
    token: input.card.token,
    installments: input.card.installments,
    payment_method_id: input.card.paymentMethodId,
    ...(input.card.issuerId ? { issuer_id: Number(input.card.issuerId) || input.card.issuerId } : {}),
    payer: payerBlock(input.payer),
    ...paymentExtras(input.order, input.payer, input.siteUrl),
  };
}

/** POST /v1/payments for Pix: the response carries the QR code, the copy-and-paste code and the ticket page. */
export function buildPixPayment(input: {
  order: Pick<CheckoutOrder, "id" | "code" | "items" | "discountCents">;
  amountCents: number;
  payer: PaymentPayer;
  siteUrl: string;
  expiresAt: Date;
}) {
  return {
    transaction_amount: Math.round(input.amountCents) / 100,
    payment_method_id: "pix",
    date_of_expiration: mpDate(input.expiresAt),
    payer: payerBlock(input.payer),
    ...paymentExtras(input.order, input.payer, input.siteUrl),
  };
}

/** Pix code validity: one hour, never beyond the order's payment window and never under Mercado Pago's 30 minutes. */
export function pixExpiry(createdAt: string, now = new Date()) {
  const deadline = paymentDeadline(createdAt).getTime();
  const end = Math.min(now.getTime() + 60 * 60_000, deadline);
  return end - now.getTime() >= 30 * 60_000 ? new Date(end) : null;
}

export type MercadoPagoPayment = {
  id: number | string;
  status: string;
  status_detail?: string | null;
  payment_type_id?: string | null;
  transaction_amount?: number | null;
  shipping_amount?: number | null;
  external_reference?: string | null;
  date_created?: string | null;
  date_last_updated?: string | null;
};

/** Amount paid, in cents. transaction_amount includes the shipping cost; older payloads may report it apart. */
export function paidCents(payment: MercadoPagoPayment, dueCents: number | null) {
  const amount = Math.round((payment.transaction_amount ?? 0) * 100);
  const shipping = Math.round((payment.shipping_amount ?? 0) * 100);
  return dueCents != null && amount < dueCents && amount + shipping >= dueCents ? amount + shipping : amount;
}

/** Order to apply several payments of the same order in (oldest first). */
export function sortPayments(payments: MercadoPagoPayment[]) {
  const t = (p: MercadoPagoPayment) => new Date(p.date_last_updated ?? p.date_created ?? 0).getTime();
  return [...payments].sort((a, b) => t(a) - t(b));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/**
 * What a notification is about: a payment (Checkout Pro; Webhooks type/data.id or legacy IPN topic/id)
 * or an Orders API order (Apple Pay; type "order", id "ORD…"). Other topics → null.
 */
export function parseNotificationTarget(query: URLSearchParams, body: unknown): { topic: "payment" | "order"; id: string } | null {
  const b = (body && typeof body === "object" ? body : {}) as { type?: unknown; topic?: unknown; data?: { id?: unknown } };
  const type = String(query.get("type") ?? query.get("topic") ?? b.type ?? b.topic ?? "");
  const id = String(query.get("data.id") ?? b.data?.id ?? query.get("id") ?? "");
  if (type === "payment") return /^[0-9]{1,24}$/.test(id) ? { topic: "payment", id } : null;
  if (type === "order") return /^ORD[0-9A-Z]{8,40}$/.test(id) ? { topic: "order", id } : null;
  return null;
}

/** Payment id from a payment notification. */
export function parseNotification(query: URLSearchParams, body: unknown): string | null {
  const target = parseNotificationTarget(query, body);
  return target?.topic === "payment" ? target.id : null;
}

/**
 * Validates the x-signature header (HMAC-SHA256 with the application's webhook secret).
 * Manifest: "id:{data.id};request-id:{x-request-id};ts:{ts};" — pairs whose value is absent are left out.
 */
export function verifyWebhookSignature(input: { xSignature: string | null; xRequestId: string | null; dataId: string | null; secret: string }) {
  if (!input.xSignature) return false;
  let ts: string | undefined;
  let v1: string | undefined;
  for (const part of input.xSignature.split(",")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "ts") ts = value;
    if (key === "v1") v1 = value;
  }
  if (!ts || !v1 || !/^[0-9a-f]{64}$/i.test(v1)) return false;
  const parts: string[] = [];
  if (input.dataId) parts.push(`id:${input.dataId.toLowerCase()}`);
  if (input.xRequestId) parts.push(`request-id:${input.xRequestId}`);
  parts.push(`ts:${ts}`);
  const expected = createHmac("sha256", input.secret).update(`${parts.join(";")};`).digest();
  return timingSafeEqual(expected, Buffer.from(v1, "hex"));
}
