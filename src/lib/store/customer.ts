/** Registration remembered on the device before accounts were required (name, phone, CPF): only removed now. */
const LEGACY_KEY = "mivora.customer";

/** Brazilian phone with area code → 10/11 digits (drops the country code); null when invalid. */
export function normalizeBrPhone(input: string | null | undefined) {
  let digits = (input ?? "").replace(/\D/g, "");
  if (/^55\d{10,11}$/.test(digits)) digits = digits.slice(2);
  return /^\d{10,11}$/.test(digits) ? digits : null;
}

/** "11912345678" → "(11) 91234-5678" */
export function formatBrPhone(digits: string) {
  const d = digits.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return digits;
}

/** Buying needs an account now: a shared device must not keep someone's old registration. */
export function forgetDeviceCustomer() {
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
}
