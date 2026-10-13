const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Formats integer cents as BRL ("R$ 119,90"). Uses a regular space for WhatsApp/plain text safety. */
export function formatBRL(cents: number) {
  return brl.format(cents / 100).replace(/ /g, " ");
}

/**
 * Parses a user typed BRL value ("119,90", "R$ 1.299,00", "119.9") into cents.
 * Returns null for empty input and NaN for invalid input.
 */
export function parseBRLToCents(input: string | null | undefined): number | null {
  if (input == null) return null;
  const raw = String(input).replace(/R\$|\s/g, "");
  if (raw === "") return null;
  let normalized = raw;
  if (raw.includes(",")) {
    normalized = raw.replace(/\./g, "").replace(",", ".");
  } else if ((raw.match(/\./g) ?? []).length > 1) {
    normalized = raw.replace(/\./g, "");
  }
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return Number.NaN;
  return Math.round(Number(normalized) * 100);
}

export function centsToInput(cents: number | null | undefined) {
  if (cents == null) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}
