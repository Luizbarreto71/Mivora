import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { isSupabaseConfigured } from "@/lib/env";
import { createServerSupabase } from "@/lib/supabase/server";

export type AdminSession = {
  supabase: Awaited<ReturnType<typeof createServerSupabase>>;
  user: { id: string; email: string | null };
  role: "owner" | "admin" | "editor";
};

/** Verifies the session with Supabase Auth and the admin_users table. */
export const getAdminSession = cache(async (): Promise<AdminSession | null> => {
  if (!isSupabaseConfigured) return null;
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: admin } = await supabase
    .from("admin_users")
    .select("role, is_active")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (!admin?.is_active) return null;
  return { supabase, user: { id: data.user.id, email: data.user.email ?? null }, role: admin.role };
});

/** For admin pages: redirects to the login page when the visitor is not an active admin. */
export async function requireAdmin(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  return session;
}

export class NotAuthorizedError extends Error {
  constructor() {
    super("not_authorized");
  }
}

/** For Server Actions and Route Handlers: never trust the UI, re-check every call. */
export async function requireAdminAction(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) throw new NotAuthorizedError();
  return session;
}
