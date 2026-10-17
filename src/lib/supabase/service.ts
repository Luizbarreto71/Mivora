import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/env";

let client: SupabaseClient | null = null;

function serviceKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SECRET_KEY?.trim() || "";
}

export function isServiceRoleConfigured() {
  return Boolean(SUPABASE_URL && serviceKey());
}

/**
 * Server-only client with the service role (bypasses RLS). Used exclusively to record payment
 * results already confirmed with the Mercado Pago API, to read an order to open its checkout (and
 * whose account it is), to take a slot of the daily skin-analysis quota and to let the newest
 * sign-up of a never-confirmed e-mail define its password.
 * The key comes from SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) and never reaches the browser.
 */
export function getServiceSupabase(): SupabaseClient | null {
  if (!isServiceRoleConfigured()) return null;
  client ??= createClient(SUPABASE_URL, serviceKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}
