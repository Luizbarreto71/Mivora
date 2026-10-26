import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { sendNextDuePost } from "@/lib/vip/pipeline";
import { zapiConfigured } from "@/lib/vip/zapi";

export const maxDuration = 60;

/**
 * Clock of the VIP community: the database (pg_cron) calls this every 5 minutes. It sends at most
 * one post, and only one the admin already approved whose time has come (the database picks it,
 * inside the daily window and with the spacing set in the panel). An extra call can therefore never
 * send anything that would not go out anyway, so no secret is needed.
 */
export async function POST() {
  const service = getServiceSupabase();
  if (!service || !zapiConfigured()) return NextResponse.json({ state: "not_configured" }, { status: 503 });
  const result = await sendNextDuePost(service);
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
