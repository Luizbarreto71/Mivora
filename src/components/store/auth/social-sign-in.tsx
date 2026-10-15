"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

type Provider = "google" | "apple";

function GoogleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function AppleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 384 512" aria-hidden="true" className={className}>
      <path
        fill="currentColor"
        d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"
      />
    </svg>
  );
}

/**
 * Real sign-in with Google / Apple through Supabase Auth (OAuth + PKCE). After the provider, the customer returns
 * to /auth/callback, which creates the session and sends them back to `next` (cart and form stay on the device).
 */
export function SocialSignIn({ providers, next, beforeRedirect, className }: { providers: { google: boolean; apple: boolean }; next: string; beforeRedirect?: () => void; className?: string }) {
  const [busy, setBusy] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!providers.google && !providers.apple) return null;

  const start = async (provider: Provider) => {
    setError(null);
    const supabase = getBrowserSupabase();
    if (!supabase) {
      setError("O login não está disponível no momento.");
      return;
    }
    setBusy(provider);
    beforeRedirect?.();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        ...(provider === "google" ? { queryParams: { prompt: "select_account" } } : {}),
      },
    });
    if (oauthError) {
      setBusy(null);
      setError("Não foi possível iniciar o login agora. Tente novamente ou continue com seus dados.");
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      {providers.google ? (
        <button
          type="button"
          onClick={() => start("google")}
          disabled={busy !== null}
          className="flex h-12 w-full items-center justify-center gap-3 rounded-[4px] border border-[#747775] bg-white px-4 text-[0.9375rem] font-medium text-[#1f1f1f] transition-colors hover:bg-[#f7f7f7] disabled:opacity-60"
        >
          {busy === "google" ? <Loader2 className="h-5 w-5 animate-spin" /> : <GoogleMark className="h-5 w-5" />}
          Continuar com Google
        </button>
      ) : null}
      {providers.apple ? (
        <button
          type="button"
          onClick={() => start("apple")}
          disabled={busy !== null}
          className="flex h-12 w-full items-center justify-center gap-3 rounded-[4px] bg-black px-4 text-[0.9375rem] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {busy === "apple" ? <Loader2 className="h-5 w-5 animate-spin" /> : <AppleMark className="h-5 w-5" />}
          Continuar com Apple
        </button>
      ) : null}
      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
