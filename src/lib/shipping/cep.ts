import type { ShippingAddress } from "./types";

/** Keeps the 8 digits of a CEP ("29055-100" → "29055100"); null when it is not a CEP. */
export function normalizeCep(input: string | null | undefined) {
  const digits = (input ?? "").replace(/\D/g, "");
  return digits.length === 8 ? digits : null;
}

export function formatCep(cep: string) {
  const digits = cep.replace(/\D/g, "").slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

type ViaCep = { cep?: string; logradouro?: string; bairro?: string; localidade?: string; uf?: string; erro?: boolean | string };
type BrasilApiCep = { cep?: string; street?: string; neighborhood?: string; city?: string; state?: string };

export function parseViaCep(cep: string, json: ViaCep): ShippingAddress | null {
  if (!json || json.erro === true || json.erro === "true" || !json.localidade) return null;
  return {
    cep,
    street: json.logradouro || null,
    district: json.bairro || null,
    city: json.localidade || null,
    uf: json.uf ? json.uf.toUpperCase() : null,
  };
}

export function parseBrasilApiCep(cep: string, json: BrasilApiCep): ShippingAddress | null {
  if (!json || !json.city) return null;
  return { cep, street: json.street || null, district: json.neighborhood || null, city: json.city, uf: json.state ? json.state.toUpperCase() : null };
}

export function addressLabel(address: ShippingAddress | null) {
  if (!address?.city) return null;
  return [address.district, `${address.city}${address.uf ? `/${address.uf}` : ""}`].filter(Boolean).join(" · ");
}

/** "CEP 29055-100 (Vitória/ES)" for WhatsApp messages and the admin. */
export function destinationLabel(place: { cep: string; city?: string | null; uf?: string | null }) {
  const city = place.city ? `${place.city}${place.uf ? `/${place.uf}` : ""}` : null;
  return `CEP ${formatCep(place.cep)}${city ? ` (${city})` : ""}`;
}
