/** Customer registration remembered on this device (the record itself lives in the database). */
export type CustomerProfile = { name: string; email: string; phone: string; marketing: boolean };

const KEY = "mivora.customer";

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

export function readDeviceCustomer(): CustomerProfile | null {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return c && typeof c.name === "string" && typeof c.email === "string" && typeof c.phone === "string" ? { ...c, marketing: Boolean(c.marketing) } : null;
  } catch {
    return null;
  }
}

export function saveDeviceCustomer(customer: CustomerProfile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(customer));
  } catch {
    /* private mode */
  }
}

export function forgetDeviceCustomer() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
