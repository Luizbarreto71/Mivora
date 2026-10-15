import "server-only";
import { cacheLife } from "next/cache";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "@/lib/env";

export type SocialProviders = { google: boolean; apple: boolean };

/**
 * Which social sign-ins are switched on in Supabase Auth (Authentication → Providers).
 * The buttons only appear for providers that actually work.
 */
export async function getSocialProviders(): Promise<SocialProviders> {
  "use cache";
  cacheLife("minutes");
  if (!isSupabaseConfigured) return { google: false, apple: false };
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_ANON_KEY }, signal: AbortSignal.timeout(4000) });
    if (!res.ok) return { google: false, apple: false };
    const body = (await res.json()) as { external?: { google?: boolean; apple?: boolean } };
    return { google: Boolean(body.external?.google), apple: Boolean(body.external?.apple) };
  } catch {
    return { google: false, apple: false };
  }
}
