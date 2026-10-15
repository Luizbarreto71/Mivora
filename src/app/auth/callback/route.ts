import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

/** Only paths inside the store (never another site) */
function safeNext(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/finalizar?etapa=identificacao";
  return value;
}

function withParam(path: string, key: string, value: string) {
  const url = new URL(path, "http://local");
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}

/**
 * Return from Google / Apple: Supabase Auth validated the provider; here the authorization code is exchanged
 * for the session (PKCE) and the customer goes back to where they were (the cart stays on the device).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNext(searchParams.get("next"));
  const code = searchParams.get("code");
  if (searchParams.get("error") || !code) {
    const reason = searchParams.get("error") === "access_denied" ? "cancelado" : "erro";
    return NextResponse.redirect(new URL(withParam(next, "login", reason), origin));
  }
  try {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("[auth] retorno do login social recusado", error.status ?? "", error.code ?? "");
      return NextResponse.redirect(new URL(withParam(next, "login", "erro"), origin));
    }
  } catch {
    return NextResponse.redirect(new URL(withParam(next, "login", "erro"), origin));
  }
  return NextResponse.redirect(new URL(withParam(next, "login", "ok"), origin));
}
