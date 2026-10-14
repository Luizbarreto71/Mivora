"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { getPublicSupabase } from "@/lib/supabase/public";
import { normalizeBrPhone, type CustomerProfile } from "./customer";

type Field = "name" | "email" | "phone";
export type RegisterResult = { ok: true; customer: CustomerProfile } | { ok: false; error: string; field?: Field };

const MESSAGES: Record<string, { error: string; field?: Field }> = {
  invalid_name: { error: "Informe seu nome completo.", field: "name" },
  invalid_email: { error: "Digite um e-mail válido.", field: "email" },
  invalid_phone: { error: "Digite um WhatsApp com DDD, ex.: (11) 91234-5678.", field: "phone" },
  rate_limited: { error: "Muitos cadastros ao mesmo tempo. Tente de novo em instantes." },
};

const schema = z.object({
  name: z.string().trim().max(120),
  email: z.string().trim().max(254),
  phone: z.string().trim().max(30),
  marketing: z.boolean(),
  source: z.enum(["checkout", "conta"]),
});

// per-IP limit on top of the database's global flood protection
const hits = new Map<string, { count: number; reset: number }>();
function allow(ip: string) {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || entry.reset < now) {
    if (hits.size > 5000) hits.clear();
    hits.set(ip, { count: 1, reset: now + 60_000 });
    return true;
  }
  entry.count += 1;
  return entry.count <= 10;
}

/** Mandatory registration before buying (lead): stored through register_customer(). */
export async function registerCustomer(input: unknown): Promise<RegisterResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Revise os dados do cadastro." };
  const { marketing, source } = parsed.data;
  const name = parsed.data.name.replace(/\s+/g, " ");
  const email = parsed.data.email.toLowerCase();
  const phone = normalizeBrPhone(parsed.data.phone);
  if (name.length < 2) return { ok: false, ...MESSAGES.invalid_name };
  if (!z.email().safeParse(email).success) return { ok: false, ...MESSAGES.invalid_email };
  if (!phone) return { ok: false, ...MESSAGES.invalid_phone };

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  if (!allow(ip)) return { ok: false, ...MESSAGES.rate_limited };
  const sb = getPublicSupabase();
  if (!sb) return { ok: false, error: "A loja ainda não está conectada ao banco de dados." };

  const { error } = await sb.rpc("register_customer", { p_name: name, p_email: email, p_phone: phone, p_marketing: marketing, p_source: source });
  if (error) {
    const known = MESSAGES[error.message.trim()];
    if (known) return { ok: false, ...known };
    console.error("[cadastro] register_customer failed", error.message);
    return { ok: false, error: "Não foi possível salvar o cadastro agora. Tente novamente." };
  }
  return { ok: true, customer: { name, email, phone, marketing } };
}
