import { NextResponse, type NextRequest } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";

function csvCell(value: unknown) {
  const s = value == null ? "" : String(value);
  // Neutralise spreadsheet formula injection and quote every cell
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Customer (lead) list for the store's CRM or e-mail tool — admins only. */
export async function GET(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "not_authorized" }, { status: 401 });
  const q = (request.nextUrl.searchParams.get("q") ?? "").replace(/[%,()*\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  const digits = q.replace(/\D/g, "");
  let query = session.supabase
    .from("customers")
    .select("name, email, phone, marketing_consent, marketing_consent_at, city, uf, cep, orders_count, last_order_at, created_at, source")
    .order("created_at", { ascending: false })
    .limit(50000);
  if (q) query = query.or([`name.ilike.*${q}*`, `email.ilike.*${q}*`, ...(digits.length >= 3 ? [`phone.ilike.*${digits}*`] : [])].join(","));
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "query_failed" }, { status: 500 });
  const when = (ts: string | null) => (ts ? new Date(ts).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "");
  const header = ["Nome", "E-mail", "WhatsApp", "Aceita novidades", "Consentimento em", "Cidade", "UF", "CEP", "Pedidos", "Último pedido", "Cadastro", "Origem"];
  const lines = (data ?? []).map((r) =>
    [r.name, r.email, r.phone, r.marketing_consent ? "Sim" : "Não", when(r.marketing_consent_at), r.city, r.uf, r.cep, r.orders_count, when(r.last_order_at), when(r.created_at), r.source]
      .map(csvCell)
      .join(";"),
  );
  const body = "﻿" + [header.map(csvCell).join(";"), ...lines].join("\r\n");
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="mivora-clientes-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
