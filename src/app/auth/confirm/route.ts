import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/auth/password";
import { createServerSupabase } from "@/lib/supabase/server";

const TYPES: EmailOtpType[] = ["signup", "email", "recovery", "invite", "email_change"];

function withParam(path: string, key: string, value: string) {
  const url = new URL(path, "http://local");
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}

/** Destination carried by the link: ?next=… directly, or inside redirect_to (recommended e-mail template). */
function destination(params: URLSearchParams) {
  const direct = params.get("next");
  if (direct) return safeNext(direct, "");
  const redirectTo = params.get("redirect_to");
  if (!redirectTo) return "";
  try {
    return safeNext(new URL(redirectTo).searchParams.get("next"), "");
  } catch {
    return "";
  }
}

/**
 * Links from the confirmation and password-recovery e-mails. The token is validated by Supabase Auth (verifyOtp for
 * token_hash links, which work on any device; or the PKCE code of Supabase's default link) and only then the session
 * exists. Expired or invalid links lead to a page that offers a new one.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const type = searchParams.get("type") as EmailOtpType | null;
  const recovery = type === "recovery" || destination(searchParams).startsWith("/redefinir-senha");
  const next = destination(searchParams) || (recovery ? "/redefinir-senha" : "/minha-conta");
  const fail = () =>
    NextResponse.redirect(new URL(recovery ? "/esqueci-senha?link=invalido" : `/confirmar-email?link=invalido&next=${encodeURIComponent(next)}`, origin));

  const tokenHash = searchParams.get("token_hash");
  const code = searchParams.get("code");
  if (searchParams.get("error") || (!tokenHash && !code)) return fail();
  try {
    const supabase = await createServerSupabase();
    if (tokenHash) {
      if (!type || !TYPES.includes(type)) return fail();
      const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
      if (error) return fail();
    } else {
      const { error } = await supabase.auth.exchangeCodeForSession(code!);
      // Supabase already validated the link; without this browser's PKCE key (link opened on another device) the
      // e-mail is confirmed but no session is created here: the customer just signs in
      if (error) return recovery ? fail() : NextResponse.redirect(new URL(`/entrar?link=outro-aparelho&next=${encodeURIComponent(next)}`, origin));
    }
  } catch {
    return fail();
  }
  return NextResponse.redirect(new URL(recovery ? next : withParam(next, "login", "confirmado"), origin));
}
