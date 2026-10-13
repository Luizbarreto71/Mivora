/**
 * Mirrors public.normalize_search() in the database: lower case, no accents.
 * Search terms are matched against products.search_text with ILIKE.
 */
export function normalizeSearch(input: string) {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Turns a free-text query into safe ILIKE terms (AND semantics). */
export function searchTerms(query: string | null | undefined, max = 6) {
  if (!query) return [];
  return normalizeSearch(query)
    .replace(/[^a-z0-9+.\- ]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^[.\-]+|[.\-]+$/g, ""))
    .filter((t) => t.length >= 1)
    .slice(0, max);
}
