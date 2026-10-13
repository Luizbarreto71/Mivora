import type { ShippingOption } from "./types";

/** Package of one cart line, in the units expected by Melhor Envio (cm, kg, BRL). */
export type CarrierPackageItem = {
  id: string;
  width: number;
  height: number;
  length: number;
  weightKg: number;
  insuranceValue: number;
  quantity: number;
};

export function buildMelhorEnvioRequest(fromCep: string, toCep: string, items: CarrierPackageItem[]) {
  return {
    from: { postal_code: fromCep },
    to: { postal_code: toCep },
    products: items.map((i) => ({
      id: i.id,
      width: Math.max(1, Math.round(i.width)),
      height: Math.max(1, Math.round(i.height)),
      length: Math.max(1, Math.round(i.length)),
      weight: Math.round(i.weightKg * 1000) / 1000,
      insurance_value: Math.round(i.insuranceValue * 100) / 100,
      quantity: i.quantity,
    })),
    options: { receipt: false, own_hand: false },
  };
}

type Range = { min?: number | null; max?: number | null } | null | undefined;
type MelhorEnvioService = {
  id?: number;
  name?: string;
  price?: string | number;
  custom_price?: string | number;
  delivery_time?: number;
  custom_delivery_time?: number;
  delivery_range?: Range;
  custom_delivery_range?: Range;
  error?: string;
  company?: { id?: number; name?: string };
};

export type CarrierPricing = {
  /** Business days added for order preparation before the parcel is posted */
  handlingDays: number;
  markupPercent: number;
  extraCents: number;
};

export function businessDaysLabel(min: number, max: number) {
  if (max <= 0) return null;
  const lo = Math.max(1, Math.min(min, max));
  return lo === max ? `${max} ${max === 1 ? "dia útil" : "dias úteis"}` : `${lo} a ${max} dias úteis`;
}

/**
 * Turns the calculate response into options. Uses custom_price / custom_delivery_*
 * (they include the account's own rules), skips services that returned an error,
 * then applies the store's markup and preparation time.
 */
export function parseMelhorEnvioResponse(json: unknown, pricing: CarrierPricing): ShippingOption[] {
  if (!Array.isArray(json)) return [];
  const options: ShippingOption[] = [];
  for (const raw of json as MelhorEnvioService[]) {
    if (!raw || raw.error || raw.id == null) continue;
    const price = Number(raw.custom_price ?? raw.price);
    if (!Number.isFinite(price) || price < 0) continue;
    const range = raw.custom_delivery_range ?? raw.delivery_range;
    const days = Number(raw.custom_delivery_time ?? raw.delivery_time ?? 0);
    const min = Number(range?.min ?? days) + pricing.handlingDays;
    const max = Number(range?.max ?? days) + pricing.handlingDays;
    const feeCents = Math.round(price * 100 * (1 + pricing.markupPercent / 100)) + pricing.extraCents;
    const company = raw.company?.name?.trim();
    const service = (raw.name ?? "").trim();
    options.push({
      id: `carrier:${raw.id}`,
      kind: "carrier",
      method: "shipping",
      name: company && !service.toLowerCase().startsWith(company.toLowerCase()) ? `${company} ${service}`.trim() : service || company || "Transportadora",
      feeCents,
      estimate: businessDaysLabel(min, max),
      note: null,
      unavailableReason: null,
      zoneId: null,
      serviceId: raw.id,
    });
  }
  return options;
}
