import type { Category } from "@/lib/types";

/** Returns the given slugs plus every descendant slug (a parent filter covers its subcategories). */
export function expandCategorySlugs(slugs: string[], categories: Pick<Category, "id" | "slug" | "parent_id">[]) {
  const out = new Set(slugs);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of categories) {
      const parent = categories.find((p) => p.id === c.parent_id);
      if (parent && out.has(parent.slug) && !out.has(c.slug)) {
        out.add(c.slug);
        grew = true;
      }
    }
  }
  return [...out];
}

/** Ancestor chain for a category id (closest first). */
export function categoryAncestors(id: string, categories: Pick<Category, "id" | "parent_id">[]) {
  const chain: string[] = [];
  let current = categories.find((c) => c.id === id);
  while (current?.parent_id && !chain.includes(current.parent_id)) {
    const parentId: string = current.parent_id;
    chain.push(parentId);
    current = categories.find((c) => c.id === parentId);
  }
  return chain;
}

export const RETINOID_TAG = "retinoide";
export const EXFOLIANT_TAG = "esfoliante";

/**
 * Pairings never suggested together: retinoid + exfoliating acids, two retinoids
 * or two exfoliants (risk of irritation / over-exfoliation). Driven by the
 * canonical "retinoide" and "esfoliante" product tags.
 */
export function isIrritatingPair(a: string[], b: string[]) {
  const actives = (t: string[]) => ({ r: t.includes(RETINOID_TAG), e: t.includes(EXFOLIANT_TAG) });
  const x = actives(a);
  const y = actives(b);
  return (x.r && (y.r || y.e)) || (x.e && (y.r || y.e));
}
