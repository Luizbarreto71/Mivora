"use client";

import { createContext, use, type ReactNode } from "react";

/** Public store settings needed by client components (WhatsApp CTA, delivery note). */
export type StoreConfig = {
  whatsappNumber: string | null;
  whatsappGreeting: string;
  deliverySummary: string | null;
  businessHours: string | null;
  siteUrl: string;
  /** Show "Consultar previsão" for coming-soon products */
  comingSoonInquiry: boolean;
  /** First-purchase offer, when enabled in the admin */
  welcomeOffer: { code: string; percent: number } | null;
  /** CEP shipping calculator (product page, cart, checkout) */
  shippingCalculator: boolean;
  /** Pay on the site (Mercado Pago): enabled in the admin and credentials present on the server */
  onlinePayment: boolean;
  /** Apple Pay (Mercado Pago): enabled and configured; the browser still has to support it */
  applePay: boolean;
};

const StoreConfigContext = createContext<StoreConfig>({
  whatsappNumber: null,
  whatsappGreeting: "Olá, MIVORA!",
  deliverySummary: null,
  businessHours: null,
  siteUrl: "",
  comingSoonInquiry: false,
  welcomeOffer: null,
  shippingCalculator: false,
  onlinePayment: false,
  applePay: false,
});

export function StoreConfigProvider({ value, children }: { value: StoreConfig; children: ReactNode }) {
  return <StoreConfigContext value={value}>{children}</StoreConfigContext>;
}

export function useStoreConfig() {
  return use(StoreConfigContext);
}
