/** Orders sent from this browser (code + WhatsApp link). Kept only on the device, never on a server. */
export type DeviceOrder = { code: string; url: string; at: number; summarized?: boolean };

const KEY = "mivora.orders";
const MAX = 20;

export function readDeviceOrders(): DeviceOrder[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((o) => o && typeof o.code === "string" && typeof o.url === "string" && typeof o.at === "number") : [];
  } catch {
    return [];
  }
}

export function rememberDeviceOrder(order: DeviceOrder) {
  try {
    const list = [order, ...readDeviceOrders().filter((o) => o.code !== order.code)].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* private mode or storage full */
  }
}

export function forgetDeviceOrders() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
