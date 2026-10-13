import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";

function csvCell(value: unknown) {
  const s = value == null ? "" : String(value);
  // Neutralise spreadsheet formula injection and quote every cell
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Newsletter list for the store's e-mail tool (admins only). */
export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "not_authorized" }, { status: 401 });
  const { data, error } = await session.supabase
    .from("newsletter_subscribers")
    .select("email, source, consented_at")
    .order("consented_at", { ascending: false })
    .limit(50000);
  if (error) return NextResponse.json({ error: "query_failed" }, { status: 500 });
  const header = ["E-mail", "Origem", "Inscrição"];
  const lines = (data ?? []).map((r) =>
    [r.email, r.source, new Date(r.consented_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })].map(csvCell).join(";"),
  );
  const body = "﻿" + [header.map(csvCell).join(";"), ...lines].join("\r\n");
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="mivora-newsletter-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
