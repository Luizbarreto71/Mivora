/**
 * Orders sent from this browser before accounts were required (code + WhatsApp link), kept only on the device.
 * New orders belong to the account and are listed from the database in "Minha conta".
 */
export type DeviceOrder = { code: string; url: string; at: number; summarized?: boolean };

const KEY = "mivora.orders";

export function readDeviceOrders(): DeviceOrder[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((o) => o && typeof o.code === "string" && typeof o.url === "string" && typeof o.at === "number") : [];
  } catch {
    return [];
  }
}

export function forgetDeviceOrders() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
