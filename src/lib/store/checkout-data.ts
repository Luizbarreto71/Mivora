/**
 * Checkout data shared by the browser and the server: shapes, masks and validation messages.
 * The database validates everything again (CPF digits, phone, CEP, address lengths).
 */
import { formatCpf, isValidCpf, normalizeCpf } from "@/lib/payments/apple-pay-core";
import { formatCep, normalizeCep } from "@/lib/shipping/cep";
import { normalizeBrPhone } from "./customer";

export { formatCpf, isValidCpf, normalizeCpf, formatCep, normalizeCep, normalizeBrPhone };

export type CheckoutIdentity = {
  email: string;
  firstName: string;
  lastName: string;
  cpf: string;
  phone: string;
  marketing: boolean;
};

export type CheckoutAddress = {
  recipient: string;
  cep: string;
  street: string;
  number: string;
  complement: string;
  reference: string;
  district: string;
  city: string;
  uf: string;
};

export const EMPTY_IDENTITY: CheckoutIdentity = { email: "", firstName: "", lastName: "", cpf: "", phone: "", marketing: false };
export const EMPTY_ADDRESS: CheckoutAddress = { recipient: "", cep: "", street: "", number: "", complement: "", reference: "", district: "", city: "", uf: "" };

export const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"] as const;

export function isValidEmail(value: string) {
  const v = value.trim();
  return v.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
}

/** Phone mask while typing: (11) 91234-5678 */
export function formatPhoneInput(value: string) {
  const d = value.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** "Ana Paula Souza" → ["Ana", "Paula Souza"] (the customer can adjust both fields). */
export function splitFullName(full: string | null | undefined): [string, string] {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  return [parts[0] ?? "", parts.slice(1).join(" ")];
}

export type IdentityField = "email" | "firstName" | "lastName" | "cpf" | "phone";
export type AddressField = "recipient" | "cep" | "street" | "number" | "district" | "city" | "uf" | "complement" | "reference";

export function validateIdentity(identity: CheckoutIdentity): Partial<Record<IdentityField, string>> {
  const errors: Partial<Record<IdentityField, string>> = {};
  if (!isValidEmail(identity.email)) errors.email = "Digite um e-mail válido, ex.: nome@exemplo.com.br.";
  if (identity.firstName.trim().length < 1) errors.firstName = "Informe seu primeiro nome.";
  else if (identity.firstName.trim().length > 60) errors.firstName = "Use até 60 caracteres.";
  if (identity.lastName.trim().length < 1) errors.lastName = "Informe seu sobrenome.";
  else if (identity.lastName.trim().length > 80) errors.lastName = "Use até 80 caracteres.";
  if (!isValidCpf(identity.cpf)) errors.cpf = normalizeCpf(identity.cpf).length === 11 ? "CPF inválido. Confira os números." : "Informe seu CPF com 11 números.";
  if (!normalizeBrPhone(identity.phone)) errors.phone = "Digite um telefone com DDD, ex.: (11) 91234-5678.";
  return errors;
}

export function validateAddress(address: CheckoutAddress): Partial<Record<AddressField, string>> {
  const errors: Partial<Record<AddressField, string>> = {};
  if (!normalizeCep(address.cep)) errors.cep = "Digite um CEP válido, com 8 números.";
  if (address.street.trim().length < 2) errors.street = "Informe a rua.";
  if (!address.number.trim()) errors.number = "Informe o número (ou S/N).";
  if (!address.district.trim()) errors.district = "Informe o bairro.";
  if (address.city.trim().length < 2) errors.city = "Informe a cidade.";
  if (!(UFS as readonly string[]).includes(address.uf.trim().toUpperCase())) errors.uf = "Escolha o estado.";
  if (address.recipient.trim().length < 2) errors.recipient = "Informe quem vai receber o pedido.";
  if (address.complement.length > 80) errors.complement = "Use até 80 caracteres.";
  if (address.reference.length > 120) errors.reference = "Use até 120 caracteres.";
  return errors;
}

export type PayMethod = "pix" | "card" | "applepay" | "checkout_pro" | "whatsapp";

export const PAY_METHOD_LABEL: Record<PayMethod, string> = {
  pix: "Pix",
  card: "Cartão de crédito",
  applepay: "Apple Pay",
  checkout_pro: "Boleto ou saldo no Mercado Pago",
  whatsapp: "Combinar pelo WhatsApp",
};

/** Card data kept only in memory between the payment and the review step (never stored). */
export type CardSelection = {
  token: string;
  paymentMethodId: string;
  issuerId: string | null;
  installments: number;
  paymentType: string;
  lastFour: string | null;
};

/** Friendly messages for card refusals (Mercado Pago status_detail). */
export function cardRejectionMessage(detail: string | null | undefined) {
  switch (detail) {
    case "cc_rejected_bad_filled_card_number":
    case "cc_rejected_bad_filled_date":
    case "cc_rejected_bad_filled_security_code":
    case "cc_rejected_bad_filled_other":
      return "Confira os dados do cartão (número, validade e código de segurança) e tente de novo.";
    case "cc_rejected_insufficient_amount":
      return "O cartão não tem limite suficiente. Tente outro cartão ou pague com Pix.";
    case "cc_rejected_call_for_authorize":
      return "O banco pediu autorização para este pagamento. Fale com o seu banco e tente de novo, ou pague com Pix.";
    case "cc_rejected_card_disabled":
      return "Este cartão está desativado. Fale com o seu banco ou use outro cartão.";
    case "cc_rejected_duplicated_payment":
      return "Um pagamento igual acabou de ser feito. Confira a página do pedido antes de tentar de novo.";
    case "cc_rejected_high_risk":
    case "cc_rejected_blacklist":
      return "O pagamento não foi aprovado pela análise de segurança. Tente pagar com Pix.";
    case "cc_rejected_max_attempts":
      return "Você atingiu o limite de tentativas com este cartão. Use outro cartão ou pague com Pix.";
    default:
      return "O pagamento com cartão não foi aprovado. Tente outro cartão ou pague com Pix.";
  }
}
