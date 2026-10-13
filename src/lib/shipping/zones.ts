import { formatBRL } from "@/lib/money";
import { normalizeSearch } from "@/lib/search";
import type { DeliveryZone } from "@/lib/types";
import { formatCep } from "./cep";
import type { ShippingAddress, ShippingOption } from "./types";

/**
 * Parses one admin line into a CEP range "00000000-99999999". Accepts:
 * "29000-000 a 29099-999", "29000000-29099999", a single CEP "29055-100"
 * or a prefix "290" (= 29000000-29099999).
 */
export function parseCepRangeLine(line: string): string | null {
  const text = line.trim();
  if (/^\d{1,7}$/.test(text)) return `${text.padEnd(8, "0")}-${text.padEnd(8, "9")}`;
  const ceps = (text.match(/\d{5}-?\d{3}/g) ?? []).map((c) => c.replace("-", ""));
  const leftover = text.replace(/\d{5}-?\d{3}/g, "").replace(/até|ate|a/gi, "").replace(/[\s\-–]/g, "");
  if (leftover !== "") return null;
  if (ceps.length === 1) return `${ceps[0]}-${ceps[0]}`;
  if (ceps.length === 2 && ceps[0] <= ceps[1]) return `${ceps[0]}-${ceps[1]}`;
  return null;
}

export function parseCepRanges(text: string) {
  const ranges: string[] = [];
  const invalid: string[] = [];
  for (const raw of text.split(/\r?\n|;/)) {
    const line = raw.trim();
    if (!line) continue;
    const range = parseCepRangeLine(line);
    if (range) ranges.push(range);
    else invalid.push(line);
  }
  return { ranges: [...new Set(ranges)], invalid };
}

export function formatCepRange(range: string) {
  const [start, end] = range.split("-");
  return start === end ? formatCep(start) : `${formatCep(start)} a ${formatCep(end)}`;
}

/** "vitória - es", "Vitória/ES", "Vitória" → "Vitória/ES" | "Vitória" */
export function parseCityLine(line: string): string | null {
  const m = line.trim().match(/^(.+?)(?:\s*[/,-]\s*([A-Za-z]{2}))?$/);
  if (!m) return null;
  const city = m[1].trim().replace(/\s+/g, " ");
  if (city.length < 2 || city.length > 77 || city.includes("/")) return null;
  return m[2] ? `${city}/${m[2].toUpperCase()}` : city;
}

export function parseCities(text: string) {
  const cities: string[] = [];
  const invalid: string[] = [];
  for (const raw of text.split(/\r?\n|;/)) {
    const line = raw.trim();
    if (!line) continue;
    const city = parseCityLine(line);
    if (city) cities.push(city);
    else invalid.push(line);
  }
  return { cities: [...new Set(cities)], invalid };
}

type CoverageZone = Pick<DeliveryZone, "cep_ranges" | "cities">;

/** Mirrors public.delivery_zone_covers() in the database. */
export function zoneCovers(zone: CoverageZone, cep: string, address: Pick<ShippingAddress, "city" | "uf"> | null) {
  const ranges = zone.cep_ranges ?? [];
  const cities = zone.cities ?? [];
  if (ranges.length === 0 && cities.length === 0) return true;
  if (ranges.some((r) => {
    const [start, end] = r.split("-");
    return cep >= start && cep <= end;
  })) return true;
  const city = normalizeSearch((address?.city ?? "").trim());
  const uf = (address?.uf ?? "").toUpperCase();
  return cities.some((c) => {
    const [name, state] = c.split("/");
    return normalizeSearch(name.trim()) === city && (!state || state === uf);
  });
}

/** Option for a store-configured zone, with free-delivery and minimum-order rules. */
export function zoneOption(zone: DeliveryZone, cart: { subtotalCents: number; hasUnpricedItems: boolean }): ShippingOption {
  const free = zone.free_over_cents != null && !cart.hasUnpricedItems && cart.subtotalCents >= zone.free_over_cents;
  const belowMinimum = zone.min_order_cents != null && !cart.hasUnpricedItems && cart.subtotalCents < zone.min_order_cents;
  const notes = [zone.notes, !free && zone.free_over_cents != null ? `Grátis acima de ${formatBRL(zone.free_over_cents)}` : null].filter(Boolean);
  return {
    id: `zone:${zone.id}`,
    kind: "zone",
    method: zone.method,
    name: zone.name,
    feeCents: zone.method === "to_arrange" ? null : free ? 0 : zone.fee_cents,
    estimate: zone.estimate,
    note: notes.length ? notes.join(" · ") : null,
    unavailableReason: belowMinimum ? `Pedido mínimo de ${formatBRL(zone.min_order_cents!)} para esta opção` : null,
    zoneId: zone.id,
    serviceId: null,
  };
}

export const ARRANGE_OPTION_ID = "arrange";

/** Offered when no store option is "a combinar": delivery is arranged on WhatsApp. */
export function arrangeOption(): ShippingOption {
  return {
    id: ARRANGE_OPTION_ID,
    kind: "arrange",
    method: "to_arrange",
    name: "Combinar a entrega pelo WhatsApp",
    feeCents: null,
    estimate: null,
    note: "Valor e prazo informados pelo atendimento.",
    unavailableReason: null,
    zoneId: null,
    serviceId: null,
  };
}

const METHOD_ORDER: Record<string, number> = { pickup: 0, local_delivery: 1, shipping: 2, to_arrange: 3 };

/** Pickup and local delivery first, then carriers by price, "a combinar" last. */
export function sortShippingOptions(options: ShippingOption[]) {
  return [...options].sort(
    (a, b) =>
      (METHOD_ORDER[a.method] ?? 9) - (METHOD_ORDER[b.method] ?? 9) ||
      (a.feeCents ?? Number.MAX_SAFE_INTEGER) - (b.feeCents ?? Number.MAX_SAFE_INTEGER) ||
      a.name.localeCompare(b.name, "pt-BR"),
  );
}
