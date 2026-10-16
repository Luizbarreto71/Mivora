import { EXFOLIANT_TAG, isIrritatingPair, RETINOID_TAG } from "@/lib/catalog/rules";
import type { ProductSummary } from "@/lib/types";
import {
  NEED_CATEGORIES,
  NEED_LABEL,
  NEEDS,
  PRIORITY_WEIGHT,
  ROUTINE_STEP_LABEL,
  TYPE_STEP,
  type NeedPriority,
  type RoutineStep,
  type RoutineTime,
  type SkinNeed,
} from "./taxonomy";

export type SkinProfile = { recommendable: boolean; step: RoutineStep | null; time: RoutineTime | null; precautions: string | null; alternativeId: string | null };

/** A catalogue product with the data the recommendation may rely on (all of it comes from the product's registration). */
export type SkinCatalogProduct = ProductSummary & {
  categorySlugs: string[];
  tags: string[];
  benefits: string[];
  howToUse: string | null;
  warnings: string | null;
  profile: SkinProfile | null;
};

export type RequestedNeed = { need: SkinNeed; priority: NeedPriority };

export type Recommendation = {
  product: ProductSummary;
  step: RoutineStep;
  time: RoutineTime;
  needs: SkinNeed[];
  reason: string;
  benefits: string[];
  howToUse: string | null;
  precautions: string[];
  /** Name of the unavailable product this one replaces, when it is an alternative registered in the admin */
  alternativeFor: string | null;
};

export type RoutineSlot = { step: RoutineStep; productId: string | null };
export type SkinPlan = { recommendations: Recommendation[]; routine: { manha: RoutineSlot[]; noite: RoutineSlot[] } };

/** Lip care and other subcategories of "cuidados específicos" that are not facial treatments */
const NOT_FACIAL = ["cuidados-labiais"];
/** Steps every routine needs, filled even without a matching need; the others only when they answer a need */
const BASE_STEPS: RoutineStep[] = ["limpeza", "hidratante", "protetor"];
const MORNING: RoutineStep[] = ["limpeza", "tonico", "tratamento", "olhos", "hidratante", "protetor"];
const NIGHT: RoutineStep[] = ["limpeza", "tonico", "tratamento", "olhos", "hidratante", "mascara"];
/** Category checks in order: the most specific first (eye care is also a "cuidado específico") */
const STEP_ORDER = ["protecao-solar", "limpeza", "cuidados-com-os-olhos", "tonicos-e-discos", "mascaras", "hidratantes", "seruns-e-ampolas", "cuidados-especificos"];

const clip = (text: string, max: number) => {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};

export function productStep(p: Pick<SkinCatalogProduct, "categorySlugs" | "profile">): RoutineStep | null {
  if (p.profile?.step) return p.profile.step;
  if (p.categorySlugs.some((s) => NOT_FACIAL.includes(s))) return null;
  const slug = STEP_ORDER.find((s) => p.categorySlugs.includes(s));
  return slug ? TYPE_STEP[slug] : null;
}

const renewing = (p: Pick<SkinCatalogProduct, "tags">) => p.tags.includes(RETINOID_TAG) || p.tags.includes(EXFOLIANT_TAG);

export function productTime(p: Pick<SkinCatalogProduct, "tags" | "profile">, step: RoutineStep): RoutineTime {
  if (p.profile?.time) return p.profile.time;
  if (step === "protetor") return "manha";
  if (step === "mascara" || renewing(p)) return "noite";
  return "ambos";
}

export function productNeeds(p: Pick<SkinCatalogProduct, "categorySlugs">): SkinNeed[] {
  return NEEDS.filter((n) => NEED_CATEGORIES[n].some((c) => p.categorySlugs.includes(c)));
}

/** Only the public card data goes to the browser */
function summaryOf(p: SkinCatalogProduct): ProductSummary {
  return {
    id: p.id,
    slug: p.slug,
    code: p.code,
    name: p.name,
    brand: p.brand,
    volume: p.volume,
    shortDescription: p.shortDescription,
    priceCents: p.priceCents,
    compareAtCents: p.compareAtCents,
    availability: p.availability,
    isAvailable: p.isAvailable,
    maxQuantity: p.maxQuantity,
    isNew: p.isNew,
    isFeatured: p.isFeatured,
    image: p.image,
    hasVariants: p.hasVariants,
  };
}

const purchasable = (p: SkinCatalogProduct) => p.isAvailable && p.availability === "in_stock" && p.priceCents != null;
const eligible = (p: SkinCatalogProduct) => (p.profile?.recommendable ?? true) && productStep(p) != null;

type Candidate = { product: SkinCatalogProduct; step: RoutineStep; time: RoutineTime; matched: SkinNeed[]; score: number; alternativeFor: string | null };

/**
 * Picks real, purchasable catalogue products for the requested needs and arranges them into a morning and a night
 * routine. Products are chosen from their categories and admin profile — never from their names — and renewing actives
 * (retinoids, exfoliating acids) are never combined in the same part of the day.
 */
export function buildSkinPlan(needs: RequestedNeed[], catalog: SkinCatalogProduct[]): SkinPlan {
  const weight = new Map(needs.map((n) => [n.need, PRIORITY_WEIGHT[n.priority]]));
  const byId = new Map(catalog.map((p) => [p.id, p]));

  const candidates: Candidate[] = [];
  const add = (product: SkinCatalogProduct, alternativeFor: string | null) => {
    if (candidates.some((c) => c.product.id === product.id)) return;
    const step = productStep(product)!;
    const matched = productNeeds(product).filter((n) => weight.has(n));
    const score = matched.reduce((sum, n) => sum + (weight.get(n) ?? 0), 0);
    candidates.push({ product, step, time: productTime(product, step), matched, score, alternativeFor });
  };
  // available products first; then the alternative registered for each unavailable one, when it is compatible
  for (const p of catalog) if (eligible(p) && purchasable(p)) add(p, null);
  for (const original of catalog) {
    if (!eligible(original) || purchasable(original) || !original.profile?.alternativeId) continue;
    const alt = byId.get(original.profile.alternativeId);
    const compatible = alt && eligible(alt) && purchasable(alt) && (productStep(alt) === productStep(original) || productNeeds(alt).some((n) => productNeeds(original).includes(n)));
    if (!alt || !compatible) continue;
    // the alternative stands in for the original: it takes the original's place in the ranking
    const score = productNeeds(original).reduce((sum, n) => sum + (weight.get(n) ?? 0), 0);
    const existing = candidates.findIndex((c) => c.product.id === alt.id);
    if (existing >= 0 && candidates[existing].score >= score) continue;
    const step = productStep(alt)!;
    const entry = { product: alt, step, time: productTime(alt, step), matched: productNeeds(alt).filter((n) => weight.has(n)), score, alternativeFor: original.name };
    if (existing >= 0) candidates[existing] = entry;
    else candidates.push(entry);
  }
  // highest score first; at the same score, direct matches before alternatives, then the catalogue order (featured first)
  const ranked = [...candidates].sort((a, b) => b.score - a.score || Number(Boolean(a.alternativeFor)) - Number(Boolean(b.alternativeFor)));

  // Each part of the day takes the best products first, so the main need decides which actives go in;
  // the slots are then listed in routine order.
  const plan = (part: "manha" | "noite", steps: RoutineStep[]) => {
    const byStep = new Map<RoutineStep, Candidate>();
    for (const c of ranked) {
      if (!steps.includes(c.step) || byStep.has(c.step)) continue;
      if (c.time !== "ambos" && c.time !== part) continue;
      if (c.score === 0 && !BASE_STEPS.includes(c.step)) continue;
      // the eye area is only suggested to whoever needs it
      if (c.step === "olhos" && !weight.has("area_dos_olhos")) continue;
      if ([...byStep.values()].some((x) => isIrritatingPair(x.product.tags, c.product.tags))) continue;
      byStep.set(c.step, c);
    }
    const slots: RoutineSlot[] = steps.flatMap((step) => (byStep.has(step) || BASE_STEPS.includes(step) ? [{ step, productId: byStep.get(step)?.product.id ?? null }] : []));
    return { chosen: [...byStep.values()], slots };
  };
  const morning = plan("manha", MORNING);
  const night = plan("noite", NIGHT);

  const used = new Map<string, Candidate>();
  for (const c of [...morning.chosen, ...night.chosen]) used.set(c.product.id, c);
  const recommendations = [...used.values()]
    .sort((a, b) => b.score - a.score)
    .map((c): Recommendation => {
      const p = c.product;
      const precautions = [p.profile?.precautions, p.warnings].filter((x): x is string => Boolean(x?.trim())).map((x) => clip(x, 280));
      if (renewing(p)) precautions.push("Contém ativo renovador: siga o modo de uso da embalagem e use protetor solar durante o dia.");
      return {
        product: summaryOf(p),
        step: c.step,
        time: c.time,
        needs: c.matched,
        reason: c.matched.length
          ? `Indicado para ${c.matched.map((n) => NEED_LABEL[n].toLowerCase()).join(" e ")}, de acordo com a sua análise.`
          : `Etapa essencial da rotina: ${ROUTINE_STEP_LABEL[c.step].toLowerCase()}.`,
        benefits: p.benefits.slice(0, 3).map((b) => clip(b, 160)),
        howToUse: p.howToUse ? clip(p.howToUse, 260) : null,
        precautions,
        alternativeFor: c.alternativeFor,
      };
    });
  return { recommendations, routine: { manha: morning.slots, noite: night.slots } };
}
