"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { getPublicSupabase } from "@/lib/supabase/public";

export type NewsletterResult = { ok: boolean; message: string };

const MESSAGES: Record<string, string> = {
  invalid_email: "Digite um e-mail válido.",
  consent_required: "Confirme que deseja receber nossos e-mails.",
  newsletter_disabled: "As inscrições estão fechadas no momento.",
  rate_limited: "Muitas inscrições ao mesmo tempo. Tente de novo em instantes.",
};

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
  return entry.count <= 5;
}

/** Stores the e-mail through subscribe_newsletter(); the answer is the same for new and existing e-mails. */
export async function subscribeNewsletter(input: unknown): Promise<NewsletterResult> {
  const parsed = z.object({ email: z.string().trim().max(254), consent: z.literal(true) }).safeParse(input);
  if (!parsed.success) return { ok: false, message: MESSAGES.invalid_email };
  if (!z.email().safeParse(parsed.data.email).success) return { ok: false, message: MESSAGES.invalid_email };
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  if (!allow(ip)) return { ok: false, message: MESSAGES.rate_limited };
  const sb = getPublicSupabase();
  if (!sb) return { ok: false, message: "A loja ainda não está conectada ao banco de dados." };
  const { error } = await sb.rpc("subscribe_newsletter", { p_email: parsed.data.email, p_consent: true, p_source: "rodape" });
  if (error) {
    const known = MESSAGES[error.message.trim()];
    if (known) return { ok: false, message: known };
    console.error("[newsletter] subscribe failed", error.message);
    return { ok: false, message: "Não foi possível concluir a inscrição agora. Tente novamente." };
  }
  return { ok: true, message: "Inscrição confirmada. Você vai receber as novidades da MIVORA por e-mail." };
}
