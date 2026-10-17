"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { getStoreSettings } from "@/lib/catalog/queries";
import { normalizeCep } from "@/lib/shipping/cep";
import { getShippingQuote } from "@/lib/shipping/quote";
import type { ShippingQuote } from "@/lib/shipping/types";

const schema = z.object({
  cep: z.string().max(12),
  items: z
    .array(
      z.object({
        productId: z.uuid().nullable(),
        variantId: z.uuid().nullable(),
        kitId: z.uuid().nullable(),
        quantity: z.number().int().min(1).max(99),
      }),
    )
    .min(1)
    .max(60),
});

// Per-IP limit: carrier quotes call an external API
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const hits = new Map<string, { count: number; reset: number }>();
function allow(ip: string) {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || entry.reset < now) {
    if (hits.size > 5000) hits.clear();
    hits.set(ip, { count: 1, reset: now + WINDOW_MS });
    return true;
  }
  entry.count += 1;
  return entry.count <= MAX_PER_WINDOW;
}

export type QuoteResult = { ok: true; quote: ShippingQuote } | { ok: false; error: string };

export async function quoteShipping(input: unknown): Promise<QuoteResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Não foi possível calcular o frete para esta sacola." };
  const cep = normalizeCep(parsed.data.cep);
  if (!cep) return { ok: false, error: "Digite um CEP válido, com 8 números." };
  const settings = await getStoreSettings();
  if (!settings.shipping_calculator_enabled) return { ok: false, error: "A calculadora de frete está desativada." };
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "";
  // loopback / private addresses (a proxy without the client's IP, local tests) are not limited here
  const publicIp = ip && !/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|::ffff:(127|10|192\.168)\.)/.test(ip);
  if (publicIp && !allow(ip)) return { ok: false, error: "Muitas consultas seguidas. Aguarde um minuto e tente de novo." };
  const quote = await getShippingQuote(cep, parsed.data.items);
  if (quote.addressFound === false) return { ok: false, error: "Não encontramos este CEP. Confira os números e tente de novo." };
  return { ok: true, quote };
}
