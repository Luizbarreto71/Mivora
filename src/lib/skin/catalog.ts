import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { getCategories } from "@/lib/catalog/queries";
import { PRODUCT_SUMMARY_SELECT, toProductSummary, type Row } from "@/lib/catalog/mappers";
import { categoryAncestors } from "@/lib/catalog/rules";
import { TAGS } from "@/lib/catalog/tags";
import { getPublicSupabase } from "@/lib/supabase/public";
import type { SkinCatalogProduct, SkinProfile } from "./recommend";
import { ROUTINE_STEPS, ROUTINE_TIMES, type RoutineStep, type RoutineTime } from "./taxonomy";

/** Published products with what the recommendation relies on: categories, tags, benefits, how to use, warnings, profile. */
export async function getSkinCatalog(): Promise<SkinCatalogProduct[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(TAGS.catalog);
  const sb = getPublicSupabase();
  if (!sb) return [];
  const [{ data, error }, categories] = await Promise.all([
    sb
      .from("products")
      .select(
        `${PRODUCT_SUMMARY_SELECT}, tags, benefits, how_to_use, warnings, links:product_categories(category_id),
         skin:product_skin_profiles!product_skin_profiles_product_id_fkey(recommendable, routine_step, routine_time, precautions, alternative_product_id)`,
      )
      .eq("status", "published")
      .order("is_featured", { ascending: false })
      .order("sort_order")
      .limit(400),
    getCategories(),
  ]);
  if (error) throw new Error(`skin catalog: ${error.message}`);
  const slugOf = new Map(categories.map((c) => [c.id, c.slug]));
  return ((data ?? []) as Row[]).map((r) => {
    const ids = ((r.links ?? []) as Row[]).flatMap((l) => [l.category_id as string, ...categoryAncestors(l.category_id, categories)]);
    const skin = (Array.isArray(r.skin) ? r.skin[0] : r.skin) as Row | null | undefined;
    const profile: SkinProfile | null = skin
      ? {
          recommendable: skin.recommendable !== false,
          step: ROUTINE_STEPS.includes(skin.routine_step) ? (skin.routine_step as RoutineStep) : null,
          time: ROUTINE_TIMES.includes(skin.routine_time) ? (skin.routine_time as RoutineTime) : null,
          precautions: skin.precautions ?? null,
          alternativeId: skin.alternative_product_id ?? null,
        }
      : null;
    return {
      ...toProductSummary(r),
      categorySlugs: [...new Set(ids.map((id) => slugOf.get(id)).filter((x): x is string => Boolean(x)))],
      tags: r.tags ?? [],
      benefits: r.benefits ?? [],
      howToUse: r.how_to_use ?? null,
      warnings: r.warnings ?? null,
      profile,
    };
  });
}
