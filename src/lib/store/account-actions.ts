"use server";

import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/env";
import { createServerSupabase } from "@/lib/supabase/server";

export type AccountAddress = {
  id: string;
  recipient: string;
  cep: string;
  street: string;
  number: string;
  complement: string | null;
  reference: string | null;
  district: string;
  city: string;
  uf: string;
  isDefault: boolean;
};

export type Account = {
  email: string;
  emailVerified: boolean;
  provider: string;
  providerName: string | null;
  /** The account already saved its data (phone and CPF below come from it) */
  saved: boolean;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  cpf: string | null;
  marketing: boolean;
  addresses: AccountAddress[];
};

type RawAccount = {
  email: string;
  email_verified: boolean;
  provider: string;
  provider_name: string | null;
  saved: boolean;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  cpf: string | null;
  marketing: boolean;
};

type RawAddress = {
  id: string;
  recipient: string;
  cep: string;
  street: string;
  number: string;
  complement: string | null;
  reference: string | null;
  district: string;
  city: string;
  uf: string;
  is_default: boolean;
};

const mapAddress = (a: RawAddress): AccountAddress => ({
  id: a.id,
  recipient: a.recipient,
  cep: a.cep,
  street: a.street,
  number: a.number,
  complement: a.complement,
  reference: a.reference,
  district: a.district,
  city: a.city,
  uf: a.uf,
  isDefault: a.is_default,
});

/** Session of the signed-in customer, checked with Supabase Auth on every call (never trusted from the browser). */
async function getSession() {
  if (!isSupabaseConfigured) return null;
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  return data.user ? { supabase, user: data.user } : null;
}

export async function getMyAccount(): Promise<Account | null> {
  const s = await getSession();
  if (!s) return null;
  const [account, addresses] = await Promise.all([
    s.supabase.rpc("get_my_account"),
    s.supabase.from("customer_addresses").select("*").order("is_default", { ascending: false }).order("created_at", { ascending: false }),
  ]);
  const a = account.data as RawAccount | null;
  if (account.error || !a) return null;
  return {
    email: a.email,
    emailVerified: a.email_verified,
    provider: a.provider,
    providerName: a.provider_name,
    saved: a.saved,
    firstName: a.first_name,
    lastName: a.last_name,
    phone: a.phone,
    cpf: a.cpf,
    marketing: a.marketing,
    addresses: ((addresses.data ?? []) as RawAddress[]).map(mapAddress),
  };
}

export type AccountResult<T> = { ok: true; value: T } | { ok: false; error: string; expired?: boolean; field?: string };

const EXPIRED = { ok: false as const, expired: true, error: "Sua sessão expirou. Entre de novo ou continue como visitante: seus dados foram mantidos." };

const ACCOUNT_ERRORS: Record<string, { error: string; field?: string }> = {
  invalid_name: { error: "Informe nome e sobrenome.", field: "firstName" },
  invalid_phone: { error: "Digite um telefone com DDD, ex.: (11) 91234-5678.", field: "phone" },
  invalid_cpf: { error: "CPF inválido. Confira os números.", field: "cpf" },
  email_not_verified: { error: "Confirme o seu e-mail na conta para salvar os dados." },
  rate_limited: { error: "Muitos cadastros ao mesmo tempo. Tente de novo em instantes." },
};

const accountSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(30),
  cpf: z.string().trim().max(20),
  marketing: z.boolean().optional(),
});

/** Saves the signed-in customer's data (and links this verified e-mail's customer record to the account). */
export async function saveMyAccount(input: unknown): Promise<AccountResult<null>> {
  const parsed = accountSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Informe nome e sobrenome.", field: "firstName" };
  const s = await getSession();
  if (!s) return EXPIRED;
  const { error } = await s.supabase.rpc("save_my_account", {
    p_first_name: parsed.data.firstName,
    p_last_name: parsed.data.lastName,
    p_phone: parsed.data.phone,
    p_cpf: parsed.data.cpf,
    p_marketing: parsed.data.marketing ?? null,
  });
  if (error) {
    if (/not_authenticated/.test(error.message)) return EXPIRED;
    const known = Object.entries(ACCOUNT_ERRORS).find(([code]) => error.message.includes(code));
    return known ? { ok: false, ...known[1] } : { ok: false, error: "Não foi possível salvar seus dados agora. Tente novamente." };
  }
  return { ok: true, value: null };
}

const addressSchema = z.object({
  id: z.uuid().nullable().optional(),
  recipient: z.string().trim().min(2).max(120),
  cep: z.string().trim().max(12),
  street: z.string().trim().min(2).max(120),
  number: z.string().trim().min(1).max(20),
  complement: z.string().trim().max(80).optional().default(""),
  reference: z.string().trim().max(120).optional().default(""),
  district: z.string().trim().min(1).max(80),
  city: z.string().trim().min(2).max(80),
  uf: z.string().trim().regex(/^[A-Za-z]{2}$/),
  isDefault: z.boolean().optional(),
});

export async function saveMyAddress(input: unknown): Promise<AccountResult<AccountAddress>> {
  const parsed = addressSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Confira o endereço." };
  const cep = parsed.data.cep.replace(/\D/g, "");
  if (cep.length !== 8) return { ok: false, error: "Digite um CEP válido, com 8 números.", field: "cep" };
  const s = await getSession();
  if (!s) return EXPIRED;
  const row = {
    recipient: parsed.data.recipient,
    cep,
    street: parsed.data.street,
    number: parsed.data.number,
    complement: parsed.data.complement || null,
    reference: parsed.data.reference || null,
    district: parsed.data.district,
    city: parsed.data.city,
    uf: parsed.data.uf.toUpperCase(),
    is_default: parsed.data.isDefault ?? false,
  };
  const query = parsed.data.id
    ? s.supabase.from("customer_addresses").update(row).eq("id", parsed.data.id).select("*").single()
    : s.supabase.from("customer_addresses").insert(row).select("*").single();
  const { data, error } = await query;
  if (error || !data) {
    if (error && /too_many_addresses/.test(error.message)) return { ok: false, error: "Você já tem 10 endereços salvos. Exclua um para salvar outro." };
    return { ok: false, error: "Não foi possível salvar o endereço agora." };
  }
  return { ok: true, value: mapAddress(data as RawAddress) };
}

export async function deleteMyAddress(id: unknown): Promise<AccountResult<null>> {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return { ok: false, error: "Endereço inválido." };
  const s = await getSession();
  if (!s) return EXPIRED;
  const { error } = await s.supabase.from("customer_addresses").delete().eq("id", parsed.data);
  return error ? { ok: false, error: "Não foi possível excluir o endereço agora." } : { ok: true, value: null };
}

export type MyOrder = { id: string; code: string; createdAt: string; status: string; paymentMethod: string; paymentStatus: string; totalCents: number; itemCount: number };

export async function getMyOrders(): Promise<MyOrder[] | null> {
  const s = await getSession();
  if (!s) return null;
  const { data } = await s.supabase.rpc("get_my_orders");
  return ((data ?? []) as { id: string; code: string; created_at: string; status: string; payment_method: string; payment_status: string; total_cents: number; item_count: number }[]).map((o) => ({
    id: o.id,
    code: o.code,
    createdAt: o.created_at,
    status: o.status,
    paymentMethod: o.payment_method,
    paymentStatus: o.payment_status,
    totalCents: o.total_cents,
    itemCount: o.item_count,
  }));
}

/** Ends the session on this device (other devices keep theirs). */
export async function signOutAccount(): Promise<{ ok: true }> {
  if (!isSupabaseConfigured) return { ok: true };
  const supabase = await createServerSupabase();
  await supabase.auth.signOut({ scope: "local" });
  return { ok: true };
}
