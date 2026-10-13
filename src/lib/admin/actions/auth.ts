"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { fail, type ActionState } from "@/lib/admin/action-state";
import { isSupabaseConfigured } from "@/lib/env";
import { createServerSupabase } from "@/lib/supabase/server";

const loginSchema = z.object({
  email: z.email("Informe um e-mail válido."),
  password: z.string().min(6, "Informe a senha."),
});

export async function signIn(_: ActionState, formData: FormData): Promise<ActionState> {
  if (!isSupabaseConfigured) return fail("Supabase não configurado. Defina as variáveis de ambiente.");
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) return fail("E-mail ou senha inválidos.");

  const { data: admin } = await supabase.from("admin_users").select("is_active").eq("user_id", data.user.id).maybeSingle();
  if (!admin?.is_active) {
    await supabase.auth.signOut();
    return fail("Este usuário não tem acesso ao painel administrativo.");
  }
  redirect("/admin");
}

export async function signOut() {
  if (isSupabaseConfigured) {
    const supabase = await createServerSupabase();
    await supabase.auth.signOut();
  }
  redirect("/admin/login");
}
