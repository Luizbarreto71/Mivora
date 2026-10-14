import type { DeliveryMethod } from "@/lib/types";

export type ShippingAddress = {
  cep: string;
  street: string | null;
  district: string | null;
  city: string | null;
  uf: string | null;
};

export type ShippingOption = {
  /** "zone:<uuid>" (store-configured), "carrier:<serviceId>" (carrier quote) or "arrange" (combinar pelo WhatsApp) */
  id: string;
  kind: "zone" | "carrier" | "arrange";
  method: DeliveryMethod;
  name: string;
  /** null = "a combinar" */
  feeCents: number | null;
  estimate: string | null;
  note: string | null;
  /** When set, the option is shown but cannot be chosen (e.g. minimum order not reached) */
  unavailableReason: string | null;
  zoneId: string | null;
  serviceId: number | null;
  /** Carriers: longest estimated business days (preparation included) */
  days?: number | null;
};

export type ShippingQuote = {
  cep: string;
  address: ShippingAddress | null;
  /** false = the CEP does not exist; null = CEP services unavailable (address unknown) */
  addressFound: boolean | null;
  options: ShippingOption[];
};

/** A cart line as sent by the browser: only identifiers and quantities. */
export type ShippingItemRef = {
  productId: string | null;
  variantId: string | null;
  kitId: string | null;
  quantity: number;
};
