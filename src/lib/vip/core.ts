/**
 * Pure rules of the "Comunidade VIP" agent (no I/O), shared by the server code and the tests.
 * The AI only splits the admin's list and writes; price, size and version always come from the
 * admin's own words, read here, so the posts can never carry an invented value.
 */

import { formatBRL } from "@/lib/money";

/** Store time zone. Brazil has had no daylight saving time since 2019, so the offset is fixed. */
export const VIP_TZ_OFFSET = "-03:00";

// ---------------------------------------------------------------------------
// Prices, sizes and versions read from the admin's line
// ---------------------------------------------------------------------------

/** "1.299,90" / "189,9" / "189" / "189.90" → cents. */
function amountToCents(raw: string): number | null {
  let s = raw.trim();
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) s = s.replace(/\./g, "");
  s = s.replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const cents = Math.round(Number(s) * 100);
  return cents > 0 ? cents : null;
}

/**
 * Every amount in a piece of text: values after "R$" and, without the symbol, only values with
 * cents ("189,90"), since a bare number may be a size or a quantity.
 */
export function amountsIn(text: string): number[] {
  const found: number[] = [];
  const consumed: [number, number][] = [];
  for (const m of text.matchAll(/R\$\s*(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/gi)) {
    const cents = amountToCents(m[1]);
    if (cents != null) found.push(cents);
    consumed.push([m.index, m.index + m[0].length]);
  }
  for (const m of text.matchAll(/(?<![\d.,])(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2})(?![\d])/g)) {
    if (consumed.some(([a, b]) => m.index >= a && m.index < b)) continue;
    const cents = amountToCents(m[1]);
    if (cents != null) found.push(cents);
  }
  return found;
}

/** Sizes in millilitres written in the text ("100ml", "100 ML"). */
export function volumesIn(text: string): number[] {
  return [...text.matchAll(/(?<![\d.,])(\d{1,4})\s*ml\b/gi)].map((m) => Number(m[1])).filter((n) => n > 0);
}

/**
 * Perfume versions. "Elixir", "Intense" and similar words are left out on purpose: they are part of
 * the name of a flanker (Asad Elixir, Yara Pink Elixir), not a concentration.
 */
const CONCENTRATIONS: { label: string; re: RegExp }[] = [
  { label: "Extrait de Parfum", re: /\bextrait\b/i },
  { label: "Eau de Parfum", re: /\b(edp|eau\s+de\s+parfum)\b/i },
  { label: "Eau de Toilette", re: /\b(edt|eau\s+de\s+toilette)\b/i },
  { label: "Eau de Cologne", re: /\b(edc|eau\s+de\s+cologne|col[oô]nia)\b/i },
  { label: "Eau Fraîche", re: /\beau\s+fra[iî]che\b/i },
  { label: "Parfum", re: /(?<!eau\s+de\s+)(?<!extrait\s+de\s+)\bparfum\b/i },
  { label: "Body Splash", re: /\b(body\s+splash|body\s+mist)\b/i },
];

export function concentrationsIn(text: string): string[] {
  return CONCENTRATIONS.filter((c) => c.re.test(text)).map((c) => c.label);
}

// ---------------------------------------------------------------------------
// Items of the daily list
// ---------------------------------------------------------------------------

/** What the AI (or the simple fallback reader) returns for each perfume of the list. */
export type ListItemDraft = { lines: string[]; brand: string | null; name: string; details: string | null };

/** An item checked against the admin's own words. */
export type ListItem = {
  sourceLine: string;
  brand: string | null;
  name: string;
  concentration: string | null;
  volumeMl: number | null;
  priceCents: number | null;
  details: string | null;
  problems: string[];
};

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * Keeps only what the admin really wrote: the lines must exist in the list, and price, size and
 * version are read from those lines (never from the AI). Ambiguities become review notes.
 */
export function verifyItem(draft: ListItemDraft, listText: string): ListItem | null {
  const listLines = listText.split(/\r?\n/).map(squash).filter(Boolean);
  // the AI may drop an emoji or a symbol: a shortened line still points at the admin's full line
  const resolve = (l: string) => listLines.find((x) => x === l) ?? (l.length >= 4 ? listLines.find((x) => x.includes(l)) : undefined);
  const lines = [...new Set(draft.lines.map(squash).map(resolve).filter((l): l is string => Boolean(l)))];
  if (lines.length === 0) return null;
  const name = squash(draft.name);
  if (!name) return null;
  const source = lines.join(" · ");
  return { sourceLine: source, brand: draft.brand ? squash(draft.brand) : null, name, details: draft.details ? squash(draft.details) : null, ...readLine(source) };
}

/** Price, size and version as the admin wrote them, plus what is ambiguous. */
export function readLine(source: string): Pick<ListItem, "priceCents" | "volumeMl" | "concentration" | "problems"> {
  const problems: string[] = [];
  const prices = [...new Set(amountsIn(source))];
  let priceCents: number | null = null;
  if (prices.length === 1) priceCents = prices[0];
  else if (prices.length > 1) {
    priceCents = Math.min(...prices);
    problems.push(`A linha tem mais de um valor (${prices.map(formatBRL).join(", ")}). O texto usa ${formatBRL(priceCents)}: confira.`);
  } else problems.push("A lista não informa o preço deste perfume.");

  const volumes = [...new Set(volumesIn(source))];
  const volumeMl = volumes.length === 1 ? volumes[0] : null;
  if (volumes.length > 1) problems.push(`A linha tem mais de um tamanho (${volumes.map((v) => `${v} ml`).join(", ")}).`);

  const versions = concentrationsIn(source);
  const concentration = versions.length === 1 ? versions[0] : null;
  if (versions.length > 1) problems.push(`A linha cita mais de uma versão (${versions.join(", ")}). Confirme qual é.`);
  return { priceCents, volumeMl, concentration, problems };
}

/** Reader used when the AI is not available: one perfume per line that has a price, a size or a version. */
export function simpleListDrafts(listText: string): ListItemDraft[] {
  const out: ListItemDraft[] = [];
  for (const raw of listText.split(/\r?\n/)) {
    const line = squash(raw);
    if (!line || !/[a-zA-ZÀ-ú]{2}/.test(line)) continue;
    if (amountsIn(line).length === 0 && volumesIn(line).length === 0 && concentrationsIn(line).length === 0) continue;
    const name = squash(
      line
        .replace(/R\$\s*[\d.,]+/gi, " ")
        .replace(/\d+,\d{2}/g, " ")
        .replace(/\d+\s*ml\b/gi, " ")
        .replace(/[|•–—:;*_~]+|(^|\s)-(\s|$)/g, " ")
        .replace(/[^\p{L}\p{N}\s'&.+-]/gu, " "),
    );
    if (name.length >= 2) out.push({ lines: [line], brand: null, name, details: null });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Identity: matching store products and spotting repeated posts
// ---------------------------------------------------------------------------

const STOP = new Set([
  "de", "da", "do", "di", "e", "the", "eau", "parfum", "toilette", "cologne", "edp", "edt", "edc", "extrait", "ml",
  "masculino", "feminino", "unissex", "unisex", "perfume", "perfumes", "for", "men", "women", "colonia", "colônia",
]);

export function identityTokens(text: string): string[] {
  const plain = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/r\$\s*[\d.,]+/g, " ")
    .replace(/\d+\s*ml\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ");
  return [...new Set(plain.split(" ").filter((t) => t && !STOP.has(t)))];
}

/** Same perfume, version and size → same key, whatever the word order the admin used that day. */
export function dedupeKey(item: Pick<ListItem, "brand" | "name" | "concentration" | "volumeMl">) {
  const tokens = identityTokens(`${item.brand ?? ""} ${item.name}`).sort();
  return `${tokens.join(" ")}|${item.concentration ?? ""}|${item.volumeMl ?? ""}`;
}

/** The olfactory sheet does not depend on the size: one research per perfume and version. */
export function fragranceKey(item: Pick<ListItem, "brand" | "name" | "concentration">) {
  return `${identityTokens(`${item.brand ?? ""} ${item.name}`).sort().join(" ")}|${item.concentration ?? ""}`;
}

/**
 * The store product this perfume is, when exactly one product has every word of its name
 * (and no conflicting version). Used only for the photo.
 */
export function matchProduct<T extends { id: string; name: string }>(item: Pick<ListItem, "brand" | "name" | "concentration">, products: T[]): T | null {
  const wanted = identityTokens(`${item.brand ?? ""} ${item.name}`);
  if (wanted.length === 0) return null;
  const candidates = products
    .filter((p) => {
      const tokens = new Set(identityTokens(p.name));
      if (!wanted.every((t) => tokens.has(t))) return false;
      const versions = concentrationsIn(p.name);
      return !item.concentration || versions.length === 0 || versions.includes(item.concentration);
    })
    .map((p) => ({ p, extra: identityTokens(p.name).length - wanted.length }))
    .sort((a, b) => a.extra - b.extra);
  if (candidates.length === 0) return null;
  if (candidates.length > 1 && candidates[0].extra === candidates[1].extra) return null;
  return candidates[0].p;
}

// ---------------------------------------------------------------------------
// Olfactory sheet from the web research
// ---------------------------------------------------------------------------

/** What the research tool call carries ("registrar_ficha"), already shape-checked. */
export type RawSheet = {
  status: "confirmada" | "parcial" | "nao_encontrada";
  identificado_como: string;
  concentracao: string;
  genero: string;
  familia: string;
  notas_topo: string[];
  notas_coracao: string[];
  notas_fundo: string[];
  notas_gerais: string[];
  perfil: string;
  ocasioes: string[];
  observacoes: string;
  fontes: { titulo: string; url: string }[];
};

export type FragranceSheet = {
  status: RawSheet["status"];
  identifiedAs: string | null;
  concentration: string | null;
  gender: string | null;
  family: string | null;
  topNotes: string[];
  heartNotes: string[];
  baseNotes: string[];
  generalNotes: string[];
  profile: string | null;
  occasions: string[];
  remarks: string | null;
  sources: { title: string; url: string }[];
};

const cleanList = (l: string[], max = 30) => [...new Set(l.map(squash).filter(Boolean))].slice(0, max);

/** URLs and hosts that really came back from the web tools (any *_tool_result block). */
export function seenOnTheWeb(blocks: unknown[]) {
  const urls = new Set<string>();
  const hosts = new Set<string>();
  for (const block of blocks) {
    const type = (block as { type?: string } | null)?.type ?? "";
    if (!type.endsWith("_tool_result")) continue;
    for (const m of JSON.stringify(block).matchAll(/https?:\/\/[^\s"'\\<>]+/g)) {
      urls.add(m[0].replace(/\/$/, ""));
      try {
        hosts.add(new URL(m[0]).hostname.replace(/^www\./, ""));
      } catch {
        // not a URL after all
      }
    }
  }
  return { urls, hosts };
}

/**
 * Keeps only sources the research really reached; a "confirmed" sheet without one becomes
 * "partial", and a perfume not found carries no notes at all.
 */
export function normalizeSheet(input: RawSheet, seen: { urls: Set<string>; hosts: Set<string> }): FragranceSheet {
  const sources = input.fontes
    .map((f) => ({ title: squash(f.titulo).slice(0, 200), url: f.url.trim() }))
    .filter((f) => {
      try {
        const u = new URL(f.url);
        if (u.protocol !== "https:" && u.protocol !== "http:") return false;
        return seen.urls.has(f.url.replace(/\/$/, "")) || seen.hosts.has(u.hostname.replace(/^www\./, ""));
      } catch {
        return false;
      }
    })
    .slice(0, 8);
  let status = input.status;
  let remarks = squash(input.observacoes) || null;
  if (status === "confirmada" && sources.length === 0) {
    status = "parcial";
    remarks = [remarks, "Nenhuma das fontes citadas pôde ser conferida nesta pesquisa."].filter(Boolean).join(" ");
  }
  const empty = status === "nao_encontrada";
  return {
    status,
    identifiedAs: squash(input.identificado_como).slice(0, 200) || null,
    concentration: squash(input.concentracao).slice(0, 60) || null,
    gender: squash(input.genero).slice(0, 40) || null,
    family: empty ? null : squash(input.familia).slice(0, 160) || null,
    topNotes: empty ? [] : cleanList(input.notas_topo),
    heartNotes: empty ? [] : cleanList(input.notas_coracao),
    baseNotes: empty ? [] : cleanList(input.notas_fundo),
    generalNotes: empty ? [] : cleanList(input.notas_gerais),
    profile: empty ? null : squash(input.perfil).slice(0, 800) || null,
    occasions: empty ? [] : cleanList(input.ocasioes, 8),
    remarks: remarks?.slice(0, 800) ?? null,
    sources,
  };
}

// ---------------------------------------------------------------------------
// Checking a written post
// ---------------------------------------------------------------------------

// word edges that understand accents ("Últimas" starts with a letter JavaScript's \b does not see)
const word = (body: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${body})(?![\\p{L}\\p{N}])`, "iu");
const CLAIMS = word("fixa[cç][aã]o|proje[cç][aã]o|durabilidade|longa\\s+dura[cç][aã]o|rastro|sillage|performance|\\d+\\s*(?:h|horas)");
const STOCK = word("[uú]ltimas?\\s+unidades?|estoque|esgotad[oa]s?|esgotando|pronta\\s+entrega|poucas\\s+unidades|acabando");

/**
 * Rules a post must follow before it can be approved without edits. Returns the problems found;
 * the admin may still publish after editing the text.
 */
export function reviewPost(text: string, item: Pick<ListItem, "sourceLine" | "priceCents" | "details">, footer: string | null = null): string[] {
  const problems: string[] = [];
  const prices = amountsIn(text);
  if (item.priceCents == null) {
    if (prices.length > 0) problems.push("O texto cita um preço, mas a lista não informa preço.");
  } else {
    if (!prices.includes(item.priceCents)) problems.push(`O texto não traz o preço da lista (${formatBRL(item.priceCents)}).`);
    const other = prices.filter((p) => p !== item.priceCents);
    if (other.length > 0) problems.push(`O texto cita um valor que não está na lista (${[...new Set(other)].map(formatBRL).join(", ")}).`);
  }
  const allowed = new Set(concentrationsIn(item.sourceLine));
  const versions = concentrationsIn(text).filter((v) => !allowed.has(v));
  if (versions.length > 0) problems.push(`O texto cita uma versão que a lista não informa (${versions.join(", ")}).`);
  if (CLAIMS.test(text)) problems.push("O texto fala de fixação, projeção ou duração, que não foram verificadas.");
  if (STOCK.test(text) && !STOCK.test(`${item.sourceLine} ${item.details ?? ""}`)) problems.push("O texto fala de estoque ou de últimas unidades, o que a lista não informa.");
  if (composeMessage(text, footer).length > VIP_POST_MAX) problems.push(`O post (com o fechamento) passou de ${VIP_POST_MAX} caracteres.`);
  return problems;
}

/** WhatsApp caps a photo caption at 1,024 characters; posts stay below that, closing included. */
export const VIP_POST_MAX = 1000;

/** The final message: the written text plus the admin's fixed closing (how to order). */
export function composeMessage(body: string, footer: string | null) {
  const text = body.trim();
  const end = footer?.trim();
  return end ? `${text}\n\n${end}` : text;
}

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

export type VipSchedule = { firstTime: string; lastTime: string; intervalMinutes: number };

/** "YYYY-MM-DD" of an instant in São Paulo. */
export function spDate(at: Date) {
  return new Date(at.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
}

function spInstant(date: string, time: string) {
  return new Date(`${date}T${time.slice(0, 5)}:00${VIP_TZ_OFFSET}`);
}

function nextDay(date: string) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

/**
 * Sending times for `count` posts: from 5 minutes from now (or after the last post already
 * scheduled, one interval later), one per interval, only inside the daily window; what does not
 * fit goes to the next day's window.
 */
export function scheduleSlots(count: number, now: Date, schedule: VipSchedule, lastScheduled: Date | null = null): Date[] {
  const step = schedule.intervalMinutes * 60_000;
  let at = new Date(Math.max(now.getTime() + 5 * 60_000, lastScheduled ? lastScheduled.getTime() + step : 0));
  const slots: Date[] = [];
  for (let guard = 0; slots.length < count && guard < 10_000; guard++) {
    const day = spDate(at);
    const first = spInstant(day, schedule.firstTime);
    const last = spInstant(day, schedule.lastTime);
    if (at < first) at = first;
    if (at > last) {
      at = spInstant(nextDay(day), schedule.firstTime);
      continue;
    }
    slots.push(at);
    at = new Date(at.getTime() + step);
  }
  return slots;
}
