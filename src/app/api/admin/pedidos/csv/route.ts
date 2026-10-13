import { NextResponse, type NextRequest } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/types";

function csvCell(value: unknown) {
  const s = value == null ? "" : String(value);
  // Neutralise spreadsheet formula injection and quote every cell
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "not_authorized" }, { status: 401 });
  const status = request.nextUrl.searchParams.get("status");

  let query = session.supabase
    .from("order_intents")
    .select("code, created_at, status, item_count, subtotal_cents, coupon_code, discount_cents, has_unpriced_items, delivery_method, delivery_fee_cents, customer_name, customer_phone, customer_notes, admin_notes, items:order_intent_items(name_snapshot, quantity, unit_price_cents)")
    .order("created_at", { ascending: false })
    .limit(10000);
  if (status && status in ORDER_STATUS_LABEL) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "query_failed" }, { status: 500 });

  const header = ["Pedido", "Data", "Status", "Itens", "Subtotal (R$)", "Cupom", "Desconto (R$)", "Itens sob consulta", "Entrega", "Taxa estimada (R$)", "Nome", "Telefone", "Observações do cliente", "Anotações internas", "Produtos"];
  const lines = (data ?? []).map((o) =>
    [
      o.code,
      new Date(o.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
      ORDER_STATUS_LABEL[o.status as OrderStatus],
      o.item_count,
      (o.subtotal_cents / 100).toFixed(2).replace(".", ","),
      o.coupon_code ?? "",
      (o.discount_cents / 100).toFixed(2).replace(".", ","),
      o.has_unpriced_items ? "Sim" : "Não",
      o.delivery_method ?? "",
      o.delivery_fee_cents == null ? "" : (o.delivery_fee_cents / 100).toFixed(2).replace(".", ","),
      o.customer_name,
      o.customer_phone,
      o.customer_notes,
      o.admin_notes,
      (o.items ?? []).map((i: { name_snapshot: string; quantity: number }) => `${i.quantity}x ${i.name_snapshot}`).join(" | "),
    ]
      .map(csvCell)
      .join(";"),
  );
  const body = "﻿" + [header.map(csvCell).join(";"), ...lines].join("\r\n");
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="mivora-pedidos-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
