"use server";

import { updateTag } from "next/cache";
import { dbErrorMessage, type ActionState } from "@/lib/admin/action-state";
import { requireAdminAction } from "@/lib/admin/auth";
import { AVAILABILITY_VALUES, parseCsv, splitList, VISIBILITY_VALUES, type CatalogRow } from "@/lib/admin/catalog-csv";
import { TAGS } from "@/lib/catalog/tags";
import { parseBRLToCents } from "@/lib/money";
import { slugify } from "@/lib/utils";

export type ImportReport = ActionState & {
  dryRun?: boolean;
  lines?: { line: number; slug: string; result: "criado" | "atualizado" | "sem alterações" | "erro"; detail: string }[];
};

const MAX_ROWS = 500;

/**
 * Idempotent catalogue import keyed by slug.
 * - Existing products: only the columns filled in the file are changed (empty cells keep current data,
 *   so prices, stock and photos are never wiped).
 * - New products start as drafts and "Em breve" unless the file says otherwise.
 * - Sales are still blocked by the database until documentation is verified.
 */
export async function importCatalog(_: ImportReport, formData: FormData): Promise<ImportReport> {
  const { supabase } = await requireAdminAction();
  const dryRun = formData.get("dryRun") === "on";
  const file = formData.get("file");
  const text = file instanceof File && file.size > 0 ? await file.text() : String(formData.get("csv") ?? "");
  if (!text.trim()) return { ok: false, message: "Envie um arquivo CSV ou cole o conteúdo.", at: Date.now() };
  if (text.length > 2_000_000) return { ok: false, message: "Arquivo muito grande (máx. 2 MB).", at: Date.now() };
  const rows = parseCsv(text);
  if (!rows.length) return { ok: false, message: "Nenhuma linha encontrada. Verifique o cabeçalho.", at: Date.now() };
  if (rows.length > MAX_ROWS) return { ok: false, message: `Máximo de ${MAX_ROWS} linhas por importação.`, at: Date.now() };

  const [{ data: brands }, { data: categories }, { data: existing }] = await Promise.all([
    supabase.from("brands").select("id, slug, name"),
    supabase.from("categories").select("id, slug"),
    supabase.from("products").select("id, slug, name, brand_id, product_line, volume, short_description, tags, price_cents, compare_at_price_cents, status, availability"),
  ]);
  const brandList = [...(brands ?? [])];
  const lines: NonNullable<ImportReport["lines"]> = [];

  for (const [index, row] of rows.entries()) {
    const line = index + 2;
    const slug = (row.slug || slugify(row.nome ?? "")).toLowerCase();
    const report = (result: (typeof lines)[number]["result"], detail: string) => lines.push({ line, slug: slug || "—", result, detail });
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
      report("erro", "Slug ausente ou inválido.");
      continue;
    }
    const current = existing?.find((p) => p.slug === slug);
    const changes: Record<string, unknown> = {};
    const problems: string[] = [];

    // Brand: by slug or name; created when missing
    let brandId = current?.brand_id as string | undefined;
    if (row.marca) {
      const wanted = row.marca.trim();
      let brand = brandList.find((b) => b.slug === slugify(wanted) || b.name.toLowerCase() === wanted.toLowerCase());
      if (!brand && !dryRun) {
        const { data, error } = await supabase.from("brands").insert({ name: wanted, slug: slugify(wanted) }).select("id, slug, name").single();
        if (error) problems.push(`marca: ${dbErrorMessage(error)}`);
        else brand = data;
        if (brand) brandList.push(brand);
      }
      if (brand && brand.id !== brandId) changes.brand_id = brand.id;
      if (brand) brandId = brand.id;
      if (!brand && dryRun) changes.brand_id = `(nova marca: ${wanted})`;
    }
    if (!current && !brandId && !changes.brand_id) problems.push("marca obrigatória para novos produtos");
    if (!current && !row.nome) problems.push("nome obrigatório para novos produtos");

    const text = (col: keyof CatalogRow, field: string) => {
      const v = row[col];
      if (v && v !== (current as Record<string, unknown> | undefined)?.[field]) changes[field] = v;
    };
    text("nome", "name");
    text("linha", "product_line");
    text("volume", "volume");
    text("descricao_curta", "short_description");
    if (row.tags) {
      const tags = splitList(row.tags).map((t) => t.toLowerCase());
      if (JSON.stringify(tags) !== JSON.stringify(current?.tags ?? [])) changes.tags = tags;
    }
    for (const [col, field] of [
      ["preco", "price_cents"],
      ["preco_anterior", "compare_at_price_cents"],
    ] as const) {
      if (!row[col]) continue;
      const cents = parseBRLToCents(row[col]);
      if (cents == null || Number.isNaN(cents)) problems.push(`${col} inválido`);
      else if (cents !== current?.[field]) changes[field] = cents;
    }
    if (row.visibilidade) {
      const v = VISIBILITY_VALUES[row.visibilidade.toLowerCase() as keyof typeof VISIBILITY_VALUES];
      if (!v) problems.push("visibilidade deve ser rascunho, publicado ou arquivado");
      else if (v !== current?.status) changes.status = v;
    }
    if (row.disponibilidade) {
      const v = AVAILABILITY_VALUES[row.disponibilidade.toLowerCase() as keyof typeof AVAILABILITY_VALUES];
      if (!v) problems.push("disponibilidade deve ser disponivel, em-breve ou esgotado");
      else if (v !== current?.availability) changes.availability = v;
    }
    const categorySlugs = splitList(row.categorias);
    const categoryIds = categorySlugs.map((c) => categories?.find((x) => x.slug === c)?.id);
    if (categoryIds.some((c) => !c)) problems.push(`categoria inexistente: ${categorySlugs.filter((_, i) => !categoryIds[i]).join(", ")}`);

    if (problems.length) {
      report("erro", problems.join("; "));
      continue;
    }
    const summary = Object.keys(changes).length ? `campos: ${Object.keys(changes).join(", ")}` : "";
    if (dryRun) {
      report(current ? (summary || categorySlugs.length ? "atualizado" : "sem alterações") : "criado", [summary, categorySlugs.length ? `categorias: ${categorySlugs.join(", ")}` : ""].filter(Boolean).join(" · ") || "—");
      continue;
    }

    let productId = current?.id as string | undefined;
    if (!current) {
      // New records never start on sale: draft unless stated, "Em breve" unless stated
      const wantsSale = changes.status === "published" && changes.availability === "in_stock";
      const { data, error } = await supabase
        .from("products")
        .insert({
          slug,
          name: row.nome,
          brand_id: brandId,
          status: wantsSale ? "draft" : (changes.status ?? "draft"),
          availability: changes.availability ?? "coming_soon",
          media_pending: true,
          ...Object.fromEntries(Object.entries(changes).filter(([k]) => !["status", "availability", "brand_id", "name"].includes(k))),
        })
        .select("id")
        .single();
      if (error) {
        report("erro", dbErrorMessage(error));
        continue;
      }
      productId = data.id;
      await supabase.from("product_private").insert({ product_id: productId, sourcing_status: "planned" });
      if (wantsSale) {
        const { error: saleError } = await supabase.from("products").update({ status: "published" }).eq("id", productId);
        if (saleError) problems.push(`criado como rascunho — ${dbErrorMessage(saleError)}`);
      }
    } else if (Object.keys(changes).length) {
      const { error } = await supabase.from("products").update(changes).eq("id", current.id);
      if (error) {
        report("erro", dbErrorMessage(error));
        continue;
      }
    }
    if (categoryIds.length && productId) {
      await supabase.from("product_categories").upsert(categoryIds.map((category_id) => ({ product_id: productId, category_id })), { ignoreDuplicates: true });
    }
    report(current ? (summary || categorySlugs.length ? "atualizado" : "sem alterações") : "criado", [summary, ...problems].filter(Boolean).join(" · ") || "—");
  }

  if (!dryRun) updateTag(TAGS.catalog);
  const failed = lines.filter((l) => l.result === "erro").length;
  return {
    ok: failed < lines.length,
    dryRun,
    lines,
    message: dryRun
      ? `Simulação concluída: ${lines.length - failed} linhas válidas, ${failed} com erro. Nada foi gravado.`
      : `Importação concluída: ${lines.filter((l) => l.result === "criado").length} criados, ${lines.filter((l) => l.result === "atualizado").length} atualizados, ${failed} com erro.`,
    at: Date.now(),
  };
}
