/** Payment labels shown in the store and the admin. No server dependencies, so client components can import them. */

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
