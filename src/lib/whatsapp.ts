import { formatBRL } from "./money";

export type OrderMessageItem = {
  name: string;
  /** Public product code (e.g. MV0007) */
  code?: string | null;
  brand?: string | null;
  quantity: number;
  unitPriceCents: number | null;
  lineTotalCents: number | null;
};

export type OrderMessageInput = {
  greeting?: string;
  code: string | null;
  items: OrderMessageItem[];
  subtotalCents: number;
  hasUnpricedItems: boolean;
  /** First-purchase coupon applied by the server */
  discount?: { code: string; percent: number; cents: number } | null;
  delivery?: { label: string; feeCents: number | null; estimate?: string | null } | null;
  customerName?: string | null;
  customerNotes?: string | null;
};

/** wa.me links above this size are unreliable on some devices/browsers. */
export const MAX_WHATSAPP_URL_LENGTH = 1900;

/** Keeps only digits; Brazilian numbers without country code get 55. */
export function normalizeWhatsAppNumber(raw: string | null | undefined) {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

export function buildWhatsAppUrl(number: string, message: string) {
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

function itemValue(item: OrderMessageItem) {
  if (item.unitPriceCents == null) return "Preço sob consulta";
  if (item.quantity > 1) return `${formatBRL(item.lineTotalCents ?? item.unitPriceCents * item.quantity)} (${formatBRL(item.unitPriceCents)} cada)`;
  return formatBRL(item.unitPriceCents);
}

function subtotalLine(input: OrderMessageInput) {
  if (input.items.every((i) => i.unitPriceCents == null)) return "*Subtotal dos produtos:* sob consulta";
  const value = formatBRL(input.subtotalCents);
  return input.hasUnpricedItems
    ? `*Subtotal dos produtos:* ${value} + itens com preço sob consulta`
    : `*Subtotal dos produtos:* ${value}`;
}

function discountLines(input: OrderMessageInput) {
  const d = input.discount;
  if (!d || d.cents <= 0) return [];
  const total = formatBRL(input.subtotalCents - d.cents);
  return [
    `*Cupom:* ${d.code} (${d.percent}% na primeira compra): - ${formatBRL(d.cents)}`,
    input.hasUnpricedItems ? `*Total com desconto:* ${total} + itens com preço sob consulta` : `*Total com desconto:* ${total}`,
  ];
}

function deliveryLine(input: OrderMessageInput) {
  const d = input.delivery;
  if (!d) return "*Entrega:* a combinar.";
  const parts = [d.label];
  if (d.feeCents === 0) parts.push("frete grátis (sujeito a confirmação)");
  else if (d.feeCents != null) parts.push(`taxa estimada ${formatBRL(d.feeCents)} (sujeita a confirmação)`);
  else parts.push("valor a combinar");
  if (d.estimate) parts.push(`prazo estimado: ${d.estimate}`);
  return `*Entrega:* ${parts.join(" — ")}.`;
}

export function buildOrderMessage(input: OrderMessageInput) {
  const greeting = input.greeting?.trim() || "Olá, MIVORA!";
  const lines: string[] = [`*${greeting} Gostaria de fazer um pedido pelo site.*`, "", "*Meu pedido:*", ""];
  input.items.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.name}`);
    if (item.code) lines.push(`Código: ${item.code}`);
    lines.push(`Quantidade: ${item.quantity}`);
    lines.push(`Valor: ${itemValue(item)}`);
    lines.push("");
  });
  lines.push(subtotalLine(input), ...discountLines(input), "", deliveryLine(input));
  if (input.code) lines.push("", `*Código do pedido:* ${input.code}`);
  if (input.customerName) lines.push("", `*Nome:* ${input.customerName}`);
  if (input.customerNotes) lines.push(`*Observações:* ${input.customerNotes}`);
  lines.push("", "Gostaria de confirmar a disponibilidade e saber as opções de entrega e pagamento.");
  return lines.join("\n");
}

/** Short version used when the full list would produce an oversized link. */
export function buildSummaryOrderMessage(input: OrderMessageInput) {
  const greeting = input.greeting?.trim() || "Olá, MIVORA!";
  const units = input.items.reduce((sum, i) => sum + i.quantity, 0);
  const lines = [
    `*${greeting} Gostaria de fazer um pedido pelo site.*`,
    "",
    input.code ? `*Código do pedido:* ${input.code}` : "*Pedido sem código registrado*",
    `*Itens:* ${input.items.length} produtos (${units} unidades)`,
    subtotalLine(input),
    ...discountLines(input),
    deliveryLine(input),
  ];
  if (input.customerName) lines.push(`*Nome:* ${input.customerName}`);
  lines.push("", "A lista completa está registrada no pedido. Gostaria de confirmar a disponibilidade e saber as opções de entrega e pagamento.");
  return lines.join("\n");
}

/** Returns the best link for the order: full message when it fits, summary otherwise. */
export function buildOrderWhatsAppLink(number: string, input: OrderMessageInput) {
  const full = buildWhatsAppUrl(number, buildOrderMessage(input));
  if (full.length <= MAX_WHATSAPP_URL_LENGTH || !input.code) return { url: full, summarized: false };
  return { url: buildWhatsAppUrl(number, buildSummaryOrderMessage(input)), summarized: true };
}

/** Transparent message for products that are not on sale yet. */
export function buildComingSoonMessage(opts: { greeting?: string; productName: string; url: string }) {
  const greeting = opts.greeting?.trim() || "Olá, MIVORA!";
  return `${greeting} Vi no site que o produto *${opts.productName}* ainda não está disponível.
${opts.url}

Gostaria de saber se há previsão de chegada.`;
}

export function buildProductInterestMessage(opts: { greeting?: string; productName: string; url: string; priceCents: number | null }) {
  const greeting = opts.greeting?.trim() || "Olá, MIVORA!";
  const price = opts.priceCents == null ? "Gostaria de saber o preço e a disponibilidade." : "Gostaria de confirmar a disponibilidade.";
  return `${greeting} Tenho interesse no produto *${opts.productName}*.\n${opts.url}\n\n${price}`;
}
