/** CSV helpers for catalogue import/export (Excel-friendly: ";" separator, UTF-8 BOM). */

export const CATALOG_COLUMNS = [
  "slug",
  "nome",
  "marca",
  "linha",
  "volume",
  "categorias",
  "tags",
  "descricao_curta",
  "preco",
  "preco_anterior",
  "visibilidade",
  "disponibilidade",
] as const;

export type CatalogColumn = (typeof CATALOG_COLUMNS)[number];
export type CatalogRow = Partial<Record<CatalogColumn, string>>;

export const VISIBILITY_VALUES = { rascunho: "draft", publicado: "published", arquivado: "archived" } as const;
export const AVAILABILITY_VALUES = { disponivel: "in_stock", "em-breve": "coming_soon", esgotado: "out_of_stock" } as const;

/** Parses CSV text (comma or semicolon, quoted fields, CRLF) into objects keyed by header. */
export function parseCsv(text: string): CatalogRow[] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (!header) return [];
  const keys = header.map((h) => h.trim().toLowerCase().replace(/^'/, "")) as CatalogColumn[];
  return body.map((r) => {
    const obj: CatalogRow = {};
    keys.forEach((k, i) => {
      if ((CATALOG_COLUMNS as readonly string[]).includes(k)) obj[k] = (r[i] ?? "").trim().replace(/^'(?=[=+\-@])/, "");
    });
    return obj;
  });
}

export function csvCell(value: unknown) {
  const s = value == null ? "" : String(value);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export const splitList = (v: string | undefined) =>
  (v ?? "")
    .split("|")
    .map((x) => x.trim())
    .filter(Boolean);
