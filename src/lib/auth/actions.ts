"use server";

import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { z } from "zod";
import { SITE_URL, SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "@/lib/env";
import { isValidCpf, normalizeCpf } from "@/lib/payments/apple-pay-core";
import { normalizeBrPhone } from "@/lib/store/customer";
import { createServerSupabase } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { passwordOk, safeNext } from "./password";

// Extra per-IP limits on top of Supabase Auth's own (never revealing whether an e-mail is registered)
const buckets = new Map<string, number[]>();
async function allow(action: string, max: number, windowMs: number) {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "";
  // loopback / private addresses (a proxy without the client's IP, local tests) are not limited here
  if (!ip || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|::ffff:(127|10|192\.168)\.)/.test(ip)) return true;
  const key = `${action}:${ip}`;
  const now = Date.now();
  if (buckets.size > 5000) buckets.clear();
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) return false;
  recent.push(now);
  buckets.set(key, recent);
  return true;
}

const TOO_MANY = "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.";
const UNAVAILABLE = "Não foi possível concluir agora. Tente de novo em instantes.";
const email = z.string().trim().toLowerCase().max(254).regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, "Digite um e-mail válido, ex.: nome@exemplo.com.br.");
const confirmLink = (next: string) => `${SITE_URL}/auth/confirm?next=${encodeURIComponent(next)}`;
const waitSeconds = (message: string) => Number(message.match(/after (\d+) seconds/)?.[1] ?? 60);

type FieldErrors = Record<string, string>;
const fieldErrors = (error: z.ZodError): FieldErrors =>
  Object.fromEntries(error.issues.map((i) => [String(i.path[0] ?? "form"), i.message]).reverse());

// ---------------------------------------------------------------------------------------------------------------
// Sign in
// ---------------------------------------------------------------------------------------------------------------
export type SignInResult = { ok: true; next: string } | { ok: false; error: string; fields?: FieldErrors; unconfirmed?: boolean; email?: string };

const signInSchema = z.object({ email, password: z.string().min(1, "Digite sua senha.").max(200), next: z.string().max(500).optional() });

/** E-mail and password through Supabase Auth: the session cookie is created by the server only after the check. */
export async function signInWithEmail(input: unknown): Promise<SignInResult> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Confira os campos destacados.", fields: fieldErrors(parsed.error) };
  if (!isSupabaseConfigured) return { ok: false, error: UNAVAILABLE };
  if (!(await allow("login", 10, 10 * 60_000))) return { ok: false, error: TOO_MANY };
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  if (error) {
    if (error.code === "email_not_confirmed") return { ok: false, unconfirmed: true, email: parsed.data.email, error: "Confirme seu e-mail para entrar." };
    if (error.code === "invalid_credentials") return { ok: false, error: "E-mail ou senha incorretos." };
    if (error.status === 429) return { ok: false, error: TOO_MANY };
    console.error("[conta] login recusado", error.code ?? error.status ?? "");
    return { ok: false, error: UNAVAILABLE };
  }
  if (!data.user?.email_confirmed_at) {
    await supabase.auth.signOut({ scope: "local" });
    return { ok: false, unconfirmed: true, email: parsed.data.email, error: "Confirme seu e-mail para entrar." };
  }
  return { ok: true, next: safeNext(parsed.data.next) };
}

// ---------------------------------------------------------------------------------------------------------------
// Sign up
// ---------------------------------------------------------------------------------------------------------------
const GENDERS = ["feminino", "masculino", "nao_binario", "outro", "prefiro_nao_informar"] as const;

const signUpSchema = z
  .object({
    firstName: z.string().trim().min(1, "Informe seu nome.").max(60, "Use até 60 caracteres."),
    lastName: z.string().trim().min(1, "Informe seu sobrenome.").max(80, "Use até 80 caracteres."),
    email,
    password: z.string().refine(passwordOk, "A senha não cumpre todos os requisitos."),
    confirm: z.string(),
    cpf: z
      .string()
      .optional()
      .transform((v) => normalizeCpf(v ?? ""))
      .refine((v) => !v || isValidCpf(v), "CPF inválido. Confira os números."),
    phone: z
      .string()
      .optional()
      .refine((v) => !v?.replace(/\D/g, "") || Boolean(normalizeBrPhone(v)), "Digite um telefone com DDD, ex.: (11) 91234-5678."),
    birthDate: z
      .string()
      .optional()
      .refine((v) => {
        if (!v) return true;
        const d = new Date(`${v}T12:00:00Z`);
        return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(d.getTime()) && v >= "1900-01-01" && d.getTime() <= Date.now();
      }, "Data de nascimento inválida."),
    gender: z.enum(GENDERS).optional().or(z.literal("")),
    next: z.string().max(500).optional(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "As senhas não são iguais." });

export type SignUpResult = { ok: true; email: string; next: string } | { ok: false; error: string; fields?: FieldErrors };

/**
 * Supabase Auth keeps the first password typed for an address that was never confirmed, so whoever typed another
 * person's e-mail first would know the password once the owner confirms it. Here the newest sign-up defines the
 * password and the data instead (only the owner of the inbox can confirm), through the service role on the server.
 * Keys sent as null are removed, so nothing typed by the earlier sign-up is left behind.
 */
async function replacePendingSignUp(address: string, password: string, profile: Record<string, string | null>) {
  const service = getServiceSupabase();
  if (!service) return;
  const { data: pendingId, error } = await service.rpc("pending_email_signup", { p_email: address });
  if (error) {
    console.error("[conta] cadastro pendente não verificado", error.message);
    return;
  }
  if (typeof pendingId !== "string") return;
  const { error: updateError } = await service.auth.admin.updateUserById(pendingId, { password, user_metadata: profile });
  if (updateError) console.error("[conta] cadastro pendente não atualizado", updateError.code ?? updateError.status ?? "");
}

/**
 * Creates the account in Supabase Auth and sends the confirmation e-mail. The answer is the same whether or not the
 * address already has an account (Supabase does not reveal it either); profile data waits in the sign-up metadata.
 */
export async function signUpWithEmail(input: unknown): Promise<SignUpResult> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Confira os campos destacados.", fields: fieldErrors(parsed.error) };
  if (!isSupabaseConfigured) return { ok: false, error: UNAVAILABLE };
  if (!(await allow("signup", 5, 10 * 60_000))) return { ok: false, error: TOO_MANY };
  const v = parsed.data;
  const next = safeNext(v.next);
  const profile: Record<string, string | null> = {
    first_name: v.firstName,
    last_name: v.lastName,
    full_name: `${v.firstName} ${v.lastName}`,
    phone: v.phone ? normalizeBrPhone(v.phone) : null,
    cpf: v.cpf || null,
    birth_date: v.birthDate || null,
    gender: v.gender || null,
  };
  await replacePendingSignUp(v.email, v.password, profile);
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signUp({
    email: v.email,
    password: v.password,
    options: { emailRedirectTo: confirmLink(next), data: Object.fromEntries(Object.entries(profile).filter(([, value]) => value)) },
  });
  if (error) {
    if (error.code === "weak_password") return { ok: false, error: "A senha não cumpre todos os requisitos.", fields: { password: "Escolha uma senha mais forte." } };
    if (error.code === "email_address_invalid" || error.code === "validation_failed") return { ok: false, error: "Confira os campos destacados.", fields: { email: "Digite um e-mail válido, ex.: nome@exemplo.com.br." } };
    if (error.code === "over_email_send_rate_limit") return { ok: false, error: `Aguarde ${waitSeconds(error.message)} segundos para pedir um novo e-mail.` };
    if (error.code === "signup_disabled") return { ok: false, error: "O cadastro está temporariamente indisponível." };
    if (error.status === 429) return { ok: false, error: TOO_MANY };
    console.error("[conta] cadastro recusado", error.code ?? error.status ?? "");
    return { ok: false, error: UNAVAILABLE };
  }
  return { ok: true, email: v.email, next };
}

// ---------------------------------------------------------------------------------------------------------------
// Confirmation e-mail and password recovery (neutral answers)
// ---------------------------------------------------------------------------------------------------------------
export type MailResult = { ok: true } | { ok: false; error: string; retryAfter?: number };

export async function resendConfirmation(input: unknown): Promise<MailResult> {
  const parsed = z.object({ email, next: z.string().max(500).optional() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Digite um e-mail válido, ex.: nome@exemplo.com.br." };
  if (!isSupabaseConfigured) return { ok: false, error: UNAVAILABLE };
  if (!(await allow("resend", 5, 10 * 60_000))) return { ok: false, error: TOO_MANY };
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.resend({ type: "signup", email: parsed.data.email, options: { emailRedirectTo: confirmLink(safeNext(parsed.data.next)) } });
  if (error) {
    if (error.status === 429) {
      const wait = waitSeconds(error.message);
      return { ok: false, error: `Aguarde ${wait} segundos para reenviar.`, retryAfter: wait };
    }
    console.error("[conta] reenvio recusado", error.code ?? error.status ?? "");
    return { ok: false, error: UNAVAILABLE };
  }
  return { ok: true };
}

export async function requestPasswordReset(input: unknown): Promise<MailResult> {
  const parsed = z.object({ email }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Digite um e-mail válido, ex.: nome@exemplo.com.br." };
  if (!isSupabaseConfigured) return { ok: false, error: UNAVAILABLE };
  if (!(await allow("recover", 5, 10 * 60_000))) return { ok: false, error: TOO_MANY };
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, { redirectTo: confirmLink("/redefinir-senha") });
  // the answer never says whether the address has an account; only a real outage is reported
  if (error && error.status !== 429 && error.status !== 400 && error.status !== 422) {
    console.error("[conta] recuperação recusada", error.code ?? error.status ?? "");
    return { ok: false, error: UNAVAILABLE };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------------------------
// New password (recovery link) and password change (account page)
// ---------------------------------------------------------------------------------------------------------------
export type PasswordResult = { ok: true } | { ok: false; error: string; fields?: FieldErrors; expired?: boolean };

const newPassword = z
  .object({ password: z.string().refine(passwordOk, "A senha não cumpre todos os requisitos."), confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "As senhas não são iguais." });

async function savePassword(supabase: Awaited<ReturnType<typeof createServerSupabase>>, password: string): Promise<PasswordResult> {
  const { error } = await supabase.auth.updateUser({ password });
  if (!error) {
    // the account's other sessions end (another device, or someone who knew the old password)
    await supabase.auth.signOut({ scope: "others" });
    return { ok: true };
  }
  if (error.code === "same_password") return { ok: false, error: "A nova senha precisa ser diferente da atual.", fields: { password: "Use uma senha diferente da atual." } };
  if (error.code === "weak_password") return { ok: false, error: "A senha não cumpre todos os requisitos.", fields: { password: "Escolha uma senha mais forte." } };
  if (error.status === 401 || error.code === "session_not_found" || error.code === "session_expired") return { ok: false, expired: true, error: "O link expirou. Peça um novo para redefinir a senha." };
  console.error("[conta] senha não alterada", error.code ?? error.status ?? "");
  return { ok: false, error: UNAVAILABLE };
}

/** After the recovery link: the link opened a short session for this account, which sets the new password. */
export async function resetPassword(input: unknown): Promise<PasswordResult> {
  const parsed = newPassword.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Confira os campos destacados.", fields: fieldErrors(parsed.error) };
  if (!isSupabaseConfigured) return { ok: false, error: UNAVAILABLE };
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false, expired: true, error: "O link expirou ou já foi usado. Peça um novo para redefinir a senha." };
  return savePassword(supabase, parsed.data.password);
}

/** Account page: the current password is checked first (with a throwaway client, so the session is untouched). */
export async function changePassword(input: unknown): Promise<PasswordResult> {
  const parsed = z.object({ current: z.string().min(1, "Digite a senha atual.").max(200) }).and(newPassword).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Confira os campos destacados.", fields: fieldErrors(parsed.error) };
  if (!isSupabaseConfigured) return { ok: false, error: UNAVAILABLE };
  if (!(await allow("change-password", 5, 10 * 60_000))) return { ok: false, error: TOO_MANY };
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user?.email) return { ok: false, expired: true, error: "Sua sessão expirou. Entre de novo para alterar a senha." };
  const check = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const verified = await check.auth.signInWithPassword({ email: data.user.email, password: parsed.data.current });
  if (verified.error) return { ok: false, error: "Senha atual incorreta.", fields: { current: "Senha atual incorreta." } };
  await check.auth.signOut({ scope: "local" });
  return savePassword(supabase, parsed.data.password);
}

// ---------------------------------------------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------------------------------------------
export type SessionSummary = { email: string; firstName: string | null; verified: boolean } | null;

/** Who is signed in, checked with Supabase Auth on the server (never trusted from the browser). */
export async function getSessionSummary(): Promise<SessionSummary> {
  if (!isSupabaseConfigured) return null;
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user?.email) return null;
  const { data: account } = await supabase.rpc("get_my_account");
  const first = (account as { first_name?: string | null; provider_name?: string | null } | null)?.first_name ?? null;
  const fromProvider = (account as { provider_name?: string | null } | null)?.provider_name?.split(/\s+/)[0] ?? null;
  return { email: data.user.email, firstName: first ?? fromProvider, verified: Boolean(data.user.email_confirmed_at) };
}

