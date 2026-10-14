import { connection } from "next/server";
import { getStoreSettings } from "@/lib/catalog/queries";

/**
 * Apple's domain verification file for Apple Pay, served at
 * /.well-known/apple-developer-merchantid-domain-association(.txt) (rewrite in next.config.mjs).
 * The content is pasted by the owner in Admin → Configurações → Apple Pay.
 */
export async function GET() {
  await connection();
  const settings = await getStoreSettings();
  const content = settings.apple_pay_domain_association?.trim();
  if (!content) return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return new Response(content, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}
