import "server-only";
import { getDeliveryZones, getStoreSettings } from "@/lib/catalog/queries";
import { getPublicSupabase } from "@/lib/supabase/public";
import type { StoreSettings } from "@/lib/types";
import { parseBrasilApiCep, parseViaCep } from "./cep";
import { buildMelhorEnvioRequest, parseMelhorEnvioResponse, type CarrierPackageItem } from "./melhor-envio";
import type { ShippingAddress, ShippingItemRef, ShippingOption, ShippingQuote } from "./types";
import { arrangeOption, sortShippingOptions, zoneCovers, zoneOption } from "./zones";

const CEP_API_URL = (process.env.CEP_API_URL ?? "https://viacep.com.br").replace(/\/$/, "");
const BRASIL_API_URL = "https://brasilapi.com.br";

/** Server-only Melhor Envio configuration (the token never reaches the browser). */
export function melhorEnvioConfig(settings: Pick<StoreSettings, "contact_email">) {
  const token = process.env.MELHOR_ENVIO_TOKEN?.trim() || null;
  const sandbox = process.env.MELHOR_ENVIO_SANDBOX === "true";
  const baseUrl = (process.env.MELHOR_ENVIO_BASE_URL ?? (sandbox ? "https://sandbox.melhorenvio.com.br" : "https://melhorenvio.com.br")).replace(/\/$/, "");
  const email = process.env.MELHOR_ENVIO_EMAIL?.trim() || settings.contact_email || null;
  return { token, sandbox, baseUrl, email, ready: Boolean(token && email) };
}

function melhorEnvioRequest(config: ReturnType<typeof melhorEnvioConfig>, body: unknown): RequestInit {
  return {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.token}`,
      "User-Agent": `MIVORA Loja (${config.email})`,
    },
    body: JSON.stringify(body),
  };
}

// ---------------------------------------------------------------------------
// Small in-memory caches (per server instance)
// ---------------------------------------------------------------------------
type Entry<T> = { value: T; expires: number };
function makeCache<T>(ttlMs: number, max = 500) {
  const map = new Map<string, Entry<T>>();
  return {
    get(key: string) {
      const e = map.get(key);
      if (!e || e.expires < Date.now()) {
        map.delete(key);
        return undefined;
      }
      return e.value;
    },
    set(key: string, value: T) {
      if (map.size >= max) map.delete(map.keys().next().value!);
      map.set(key, { value, expires: Date.now() + ttlMs });
    },
  };
}
/** found: true = address known, false = the CEP does not exist, null = services unavailable */
type CepLookup = { address: ShippingAddress | null; found: boolean | null };
const addressCache = makeCache<CepLookup>(24 * 60 * 60 * 1000);
const carrierCache = makeCache<ShippingOption[]>(10 * 60 * 1000);

async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = 5000) {
  const res = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
}

/** CEP → address via ViaCEP, with BrasilAPI as a second source. */
export async function lookupCep(cep: string): Promise<CepLookup> {
  const cached = addressCache.get(cep);
  if (cached) return cached;
  let result: CepLookup = { address: null, found: null };
  try {
    const r = await fetchJson(`${CEP_API_URL}/ws/${cep}/json/`, {}, 4000);
    if (r.ok) {
      const address = parseViaCep(cep, r.body);
      result = { address, found: address != null };
    } else if (r.status === 400) result = { address: null, found: false };
  } catch {
    /* try the second source */
  }
  if (!result.found && !process.env.CEP_API_URL) {
    try {
      const r = await fetchJson(`${BRASIL_API_URL}/api/cep/v2/${cep}`, {}, 4000);
      const address = r.ok ? parseBrasilApiCep(cep, r.body) : null;
      if (address) result = { address, found: true };
      else if (r.status === 404 && result.found == null) result = { address: null, found: false };
    } catch {
      /* unavailable */
    }
  }
  if (result.found != null) addressCache.set(cep, result);
  return result;
}

// ---------------------------------------------------------------------------
// Cart → priced lines and packages (always read from the database)
// ---------------------------------------------------------------------------
type DimsRow = { id: string; price_cents: number | null; weight_g: number | null; height_cm: number | null; width_cm: number | null; length_cm: number | null };

async function loadCart(items: ShippingItemRef[], settings: StoreSettings) {
  const sb = getPublicSupabase();
  const productIds = [...new Set(items.filter((i) => i.productId && !i.kitId).map((i) => i.productId!))];
  const kitIds = [...new Set(items.filter((i) => i.kitId).map((i) => i.kitId!))];
  const variantIds = items.filter((i) => i.variantId).map((i) => i.variantId!);
  const dimsSelect = "id, price_cents, weight_g, height_cm, width_cm, length_cm";
  const [products, kits, variants] = await Promise.all([
    productIds.length && sb ? sb.from("products").select(dimsSelect).eq("status", "published").in("id", productIds) : Promise.resolve({ data: [] }),
    kitIds.length && sb
      ? sb.from("kits").select(`id, price_cents, items:kit_items(quantity, product:products(${dimsSelect}))`).eq("status", "published").in("id", kitIds)
      : Promise.resolve({ data: [] }),
    variantIds.length && sb ? sb.from("product_variants").select("id, price_cents").in("id", variantIds) : Promise.resolve({ data: [] }),
  ]);
  const productMap = new Map(((products.data ?? []) as DimsRow[]).map((p) => [p.id, p]));
  const kitMap = new Map(((kits.data ?? []) as unknown as { id: string; price_cents: number | null; items: { quantity: number; product: DimsRow | null }[] }[]).map((k) => [k.id, k]));
  const variantMap = new Map(((variants.data ?? []) as { id: string; price_cents: number | null }[]).map((v) => [v.id, v]));

  const pkg = (p: DimsRow, quantity: number, unitPriceCents: number | null): CarrierPackageItem => ({
    id: p.id,
    weightKg: (p.weight_g ?? settings.shipping_default_weight_g) / 1000,
    height: p.height_cm ?? settings.shipping_default_height_cm,
    width: p.width_cm ?? settings.shipping_default_width_cm,
    length: p.length_cm ?? settings.shipping_default_length_cm,
    insuranceValue: (unitPriceCents ?? 0) / 100,
    quantity,
  });

  let subtotalCents = 0;
  let hasUnpricedItems = false;
  const packages: CarrierPackageItem[] = [];
  for (const item of items) {
    if (item.kitId) {
      const kit = kitMap.get(item.kitId);
      if (!kit) continue;
      if (kit.price_cents == null) hasUnpricedItems = true;
      else subtotalCents += kit.price_cents * item.quantity;
      const priced = kit.items.filter((ki) => ki.product);
      const listTotal = priced.reduce((s, ki) => s + (ki.product!.price_cents ?? 0) * ki.quantity, 0);
      for (const ki of priced) {
        // insurance proportional to the kit price
        const share = kit.price_cents != null && listTotal > 0 ? Math.round(((ki.product!.price_cents ?? 0) / listTotal) * kit.price_cents) : ki.product!.price_cents;
        packages.push(pkg(ki.product!, ki.quantity * item.quantity, share));
      }
      continue;
    }
    const product = item.productId ? productMap.get(item.productId) : undefined;
    if (!product) continue;
    const unit = item.variantId ? (variantMap.get(item.variantId)?.price_cents ?? product.price_cents) : product.price_cents;
    if (unit == null) hasUnpricedItems = true;
    else subtotalCents += unit * item.quantity;
    packages.push(pkg(product, item.quantity, unit));
  }
  return { subtotalCents, hasUnpricedItems, packages };
}

async function quoteCarriers(settings: StoreSettings, cep: string, packages: CarrierPackageItem[]): Promise<ShippingOption[]> {
  const config = melhorEnvioConfig(settings);
  if (!settings.carrier_quotes_enabled || !settings.shipping_origin_cep || !config.ready || packages.length === 0) return [];
  const body = buildMelhorEnvioRequest(settings.shipping_origin_cep, cep, packages);
  const pricing = {
    handlingDays: settings.shipping_handling_days,
    markupPercent: Number(settings.shipping_markup_percent),
    extraCents: settings.shipping_extra_cents,
  };
  const key = JSON.stringify([body, pricing]);
  const cached = carrierCache.get(key);
  if (cached) return cached;
  try {
    const r = await fetchJson(`${config.baseUrl}/api/v2/me/shipment/calculate`, melhorEnvioRequest(config, body), 8000);
    if (!r.ok) {
      console.error("[frete] Melhor Envio respondeu", r.status, JSON.stringify(r.body)?.slice(0, 300));
      return [];
    }
    const options = parseMelhorEnvioResponse(r.body, pricing);
    carrierCache.set(key, options);
    return options;
  } catch (error) {
    console.error("[frete] falha ao consultar o Melhor Envio", (error as Error).message);
    return [];
  }
}

export type CarrierCheck = { ok: true; services: number } | { ok: false; status: number | null };

/**
 * Live test quote (origin → origin, one default package) shown in the admin settings,
 * so the owner sees when the token stops working (e.g. expired).
 */
export async function checkMelhorEnvio(settings: StoreSettings): Promise<CarrierCheck> {
  const config = melhorEnvioConfig(settings);
  if (!config.ready || !settings.shipping_origin_cep) return { ok: false, status: null };
  const body = buildMelhorEnvioRequest(settings.shipping_origin_cep, settings.shipping_origin_cep, [
    {
      id: "teste",
      weightKg: settings.shipping_default_weight_g / 1000,
      height: settings.shipping_default_height_cm,
      width: settings.shipping_default_width_cm,
      length: settings.shipping_default_length_cm,
      insuranceValue: 0,
      quantity: 1,
    },
  ]);
  try {
    const r = await fetchJson(`${config.baseUrl}/api/v2/me/shipment/calculate`, melhorEnvioRequest(config, body), 8000);
    if (!r.ok) return { ok: false, status: r.status };
    return { ok: true, services: parseMelhorEnvioResponse(r.body, { handlingDays: 0, markupPercent: 0, extraCents: 0 }).length };
  } catch {
    return { ok: false, status: 0 };
  }
}

/**
 * Full quote for a destination: store zones that cover the CEP/city plus carrier quotes.
 * Prices and weights come from the database; amounts are estimates.
 */
export async function getShippingQuote(cep: string, items: ShippingItemRef[]): Promise<ShippingQuote> {
  const [settings, zones] = await Promise.all([getStoreSettings(), getDeliveryZones()]);
  const [lookup, cart] = await Promise.all([lookupCep(cep), loadCart(items, settings)]);
  const zoneOptions = zones.filter((z) => zoneCovers(z, cep, lookup.address)).map((z) => zoneOption(z, cart));
  const carriers = lookup.found === false ? [] : await quoteCarriers(settings, cep, cart.packages);
  const options = [...zoneOptions, ...carriers];
  // there is always a way to finish: arranging the delivery on WhatsApp
  if (!options.some((o) => o.method === "to_arrange")) options.push(arrangeOption());
  return { cep, address: lookup.address, addressFound: lookup.found, options: sortShippingOptions(options) };
}
