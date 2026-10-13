import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { AVAILABILITY_VALUES, CATALOG_COLUMNS, csvCell, VISIBILITY_VALUES } from "@/lib/admin/catalog-csv";
import { centsToInput } from "@/lib/money";

const invert = <T extends Record<string, string>>(o: T) => Object.fromEntries(Object.entries(o).map(([k, v]) => [v, k]));

/** Exports the catalogue in the same format accepted by the importer. */
export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "not_authorized" }, { status: 401 });
  const { data, error } = await session.supabase
    .from("products")
    .select("slug, name, product_line, volume, tags, short_description, price_cents, compare_at_price_cents, status, availability, brand:brands(name), links:product_categories(category:categories(slug))")
    .order("sort_order")
    .limit(5000);
  if (error) return NextResponse.json({ error: "query_failed" }, { status: 500 });
  const vis = invert(VISIBILITY_VALUES);
  const avail = invert(AVAILABILITY_VALUES);
  const rows = (data ?? []).map((p) => {
    const brand = p.brand as unknown as { name: string } | null;
    const links = (p.links ?? []) as unknown as { category: { slug: string } | null }[];
    return [
      p.slug,
      p.name,
      brand?.name ?? "",
      p.product_line,
      p.volume,
      links.map((l) => l.category?.slug).filter(Boolean).join("|"),
      (p.tags ?? []).join("|"),
      p.short_description,
      centsToInput(p.price_cents),
      centsToInput(p.compare_at_price_cents),
      vis[p.status] ?? p.status,
      avail[p.availability] ?? p.availability,
    ]
      .map(csvCell)
      .join(";");
  });
  const body = "﻿" + [CATALOG_COLUMNS.map(csvCell).join(";"), ...rows].join("\r\n");
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="mivora-catalogo-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
