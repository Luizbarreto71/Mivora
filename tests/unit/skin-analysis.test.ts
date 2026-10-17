import { describe, expect, it } from "vitest";
import { normalizeAnalysis, type AnalysisOutputType } from "@/lib/skin/analysis";
import { popupDue, quietPath } from "@/lib/skin/popup-schedule";
import { buildSkinPlan, productStep, type SkinCatalogProduct } from "@/lib/skin/recommend";

let seq = 0;
function product(name: string, categorySlugs: string[], over: Partial<SkinCatalogProduct> = {}): SkinCatalogProduct {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    code: `MV${String(seq).padStart(4, "0")}`,
    name,
    brand: { id: "b", slug: "marca", name: "Marca" },
    volume: null,
    shortDescription: null,
    priceCents: 10000 + seq,
    compareAtCents: null,
    availability: "in_stock",
    isAvailable: true,
    maxQuantity: null,
    isNew: false,
    isFeatured: false,
    image: null,
    hasVariants: false,
    categorySlugs,
    tags: [],
    benefits: [`Benefício de ${name}`],
    howToUse: null,
    warnings: null,
    profile: null,
    ...over,
  };
}

const cleanser = product("Espuma Suave", ["limpeza", "espumas-de-limpeza", "pele-sensivel"]);
const toner = product("Tônico Hidratante", ["tonicos-e-discos", "tonicos-hidratantes", "hidratacao"]);
const serum = product("Sérum Hidratante", ["seruns-e-ampolas", "seruns-hidratantes", "hidratacao", "luminosidade"]);
const retinal = product("Sérum Retinal", ["cuidados-especificos", "tratamentos-com-retinoides", "firmeza-e-linhas-finas"], { tags: ["retinoide"], warnings: "Pode causar sensibilidade." });
const pad = product("Disco Esfoliante", ["tonicos-e-discos", "discos-esfoliantes", "poros-e-oleosidade"], { tags: ["esfoliante"] });
const cream = product("Creme Barreira", ["hidratantes", "cremes-faciais", "hidratacao", "pele-sensivel"]);
const sunscreen = product("Protetor FPS 50", ["protecao-solar"]);
const lip = product("Bálsamo Labial", ["cuidados-especificos", "cuidados-labiais", "hidratacao"]);
const shampoo = product("Shampoo", ["cuidados-capilares", "shampoos", "hidratacao"]);
const hidden = product("Máscara Oculta", ["mascaras", "mascaras-hidratantes", "hidratacao"], { profile: { recommendable: false, step: null, time: null, precautions: null, alternativeId: null } });
const altCream = product("Creme Alternativo", ["hidratantes", "hidratantes-em-gel", "hidratacao"]);
const soldOut = product("Creme Esgotado", ["hidratantes", "cremes-faciais", "hidratacao"], {
  isAvailable: false,
  availability: "out_of_stock",
  profile: { recommendable: true, step: null, time: null, precautions: null, alternativeId: altCream.id },
});
const catalog = [cleanser, toner, serum, retinal, pad, soldOut, cream, sunscreen, lip, shampoo, hidden, altCream];

const ids = (slots: { productId: string | null }[]) => slots.map((s) => s.productId);

describe("skin analysis — recommendations from the real catalogue", () => {
  it("builds morning and night routines from categories, never from names, without lip care or hair products", () => {
    const plan = buildSkinPlan([{ need: "hidratacao", priority: "alta" }], catalog);
    expect(plan.routine.manha.map((s) => s.step)).toEqual(["limpeza", "tonico", "tratamento", "hidratante", "protetor"]);
    expect(ids(plan.routine.manha)).toEqual([cleanser.id, toner.id, serum.id, cream.id, sunscreen.id]);
    expect(plan.routine.noite.map((s) => s.step)).toEqual(["limpeza", "tonico", "tratamento", "hidratante"]);
    const recommended = plan.recommendations.map((r) => r.product.id);
    for (const excluded of [lip.id, shampoo.id, hidden.id]) expect(recommended).not.toContain(excluded);
    expect(plan.recommendations[0].needs).toContain("hidratacao");
    expect(plan.recommendations.find((r) => r.product.id === serum.id)?.reason).toBe("Indicado para hidratação, de acordo com a sua análise.");
    expect(plan.recommendations.find((r) => r.product.id === sunscreen.id)?.reason).toBe("Etapa essencial da rotina: proteção solar.");
    // only public card data goes to the browser
    expect(Object.keys(plan.recommendations[0].product)).not.toContain("categorySlugs");
  });

  it("keeps renewing actives at night and never combines a retinoid with an exfoliant", () => {
    const plan = buildSkinPlan(
      [
        { need: "linhas_finas", priority: "alta" },
        { need: "oleosidade_poros", priority: "media" },
      ],
      catalog,
    );
    expect(ids(plan.routine.manha)).not.toContain(retinal.id);
    expect(ids(plan.routine.manha)).not.toContain(pad.id);
    const night = ids(plan.routine.noite);
    expect(night).toContain(retinal.id);
    expect(night).not.toContain(pad.id);
    const rec = plan.recommendations.find((r) => r.product.id === retinal.id)!;
    expect(rec.time).toBe("noite");
    expect(rec.precautions).toEqual(["Pode causar sensibilidade.", "Contém ativo renovador: siga o modo de uso da embalagem e use protetor solar durante o dia."]);
  });

  it("replaces an unavailable product only with the alternative registered for it", () => {
    // the alternative is a moisturizer without the "hidratação" category: alone it would only fill the essential step
    const plainCream = product("Creme Básico", ["hidratantes", "cremes-faciais"]);
    const onlySoldOut = [cleanser, { ...soldOut, profile: { ...soldOut.profile!, alternativeId: plainCream.id } }, plainCream, sunscreen];
    const plan = buildSkinPlan([{ need: "hidratacao", priority: "alta" }], onlySoldOut);
    const moisturizer = plan.recommendations.find((r) => r.step === "hidratante")!;
    expect(moisturizer.product.id).toBe(plainCream.id);
    expect(moisturizer.alternativeFor).toBe("Creme Esgotado");
    expect(plan.recommendations.map((r) => r.product.id)).not.toContain(soldOut.id);

    const withoutAlternative = buildSkinPlan([{ need: "hidratacao", priority: "alta" }], [{ ...soldOut, profile: null }, sunscreen]);
    expect(withoutAlternative.recommendations.map((r) => r.product.id)).toEqual([sunscreen.id]);
    // an essential step with nothing suitable stays empty instead of inventing a product
    expect(withoutAlternative.routine.manha).toEqual([
      { step: "limpeza", productId: null },
      { step: "hidratante", productId: null },
      { step: "protetor", productId: sunscreen.id },
    ]);
  });

  it("suggests the eye area only to whoever needs it and lets the admin override the step", () => {
    const eye = product("Creme para Olhos", ["cuidados-especificos", "cuidados-com-os-olhos", "area-dos-olhos"]);
    expect(productStep(eye)).toBe("olhos");
    expect(ids(buildSkinPlan([{ need: "hidratacao", priority: "alta" }], [...catalog, eye]).routine.manha)).not.toContain(eye.id);
    expect(ids(buildSkinPlan([{ need: "area_dos_olhos", priority: "media" }], [...catalog, eye]).routine.manha)).toContain(eye.id);
    expect(productStep({ ...lip, profile: { recommendable: true, step: "hidratante", time: null, precautions: null, alternativeId: null } })).toBe("hidratante");
  });
});

describe("skin analysis — model answer", () => {
  const raw: AnalysisOutputType = {
    image_ok: true,
    image_problem: null,
    summary: "  Sua pele   aparenta pouca hidratação. ",
    observations: [
      { characteristic: "textura", status: "leve", finding: "Textura leve.", explanation: "Explicação." },
      { characteristic: "hidratacao", status: "evidente", finding: "Ressecamento.", explanation: "Hidratar." },
      { characteristic: "hidratacao", status: "leve", finding: "Repetido.", explanation: "Repetido." },
    ],
    needs: [
      { need: "luminosidade", priority: "baixa", reason: "Viço." },
      { need: "hidratacao", priority: "alta", reason: "Ressecamento." },
      { need: "hidratacao", priority: "media", reason: "Repetido." },
      { need: "conforto", priority: "media", reason: "a" },
      { need: "linhas_finas", priority: "baixa", reason: "b" },
      { need: "area_dos_olhos", priority: "baixa", reason: "c" },
    ],
    limitations: ["Luz artificial.", "", "Ângulo."],
  };

  it("keeps one entry per characteristic in a fixed order, at most four needs ordered by priority", () => {
    const a = normalizeAnalysis(raw);
    if (!a.imageOk) throw new Error("expected an analysis");
    expect(a.summary).toBe("Sua pele aparenta pouca hidratação.");
    expect(a.observations.map((o) => [o.characteristic, o.status])).toEqual([
      ["hidratacao", "evidente"],
      ["textura", "leve"],
    ]);
    expect(a.needs.map((n) => n.need)).toEqual(["hidratacao", "conforto", "luminosidade", "linhas_finas"]);
    expect(a.limitations).toEqual(["Luz artificial.", "Ângulo."]);
  });

  it("reports an unsuitable photo instead of an analysis", () => {
    expect(normalizeAnalysis({ ...raw, image_ok: false, image_problem: "desfocada" })).toEqual({ imageOk: false, imageProblem: "desfocada" });
    expect(normalizeAnalysis({ ...raw, image_ok: false, image_problem: null })).toEqual({ imageOk: false, imageProblem: "sem_rosto" });
  });
});

describe("skin analysis — launch pop-up frequency", () => {
  const day = 86_400_000;
  const now = Date.UTC(2026, 9, 16, 12);
  it("opens on the first visit and again only after the interval since it was closed or the analysis started", () => {
    expect(popupDue(null, now, 7)).toBe(true);
    expect(popupDue({ dismissedAt: now - 6 * day }, now, 7)).toBe(false);
    expect(popupDue({ dismissedAt: now - 7 * day }, now, 7)).toBe(true);
    expect(popupDue({ dismissedAt: now - 30 * day, startedAt: now - day }, now, 7)).toBe(false);
    expect(popupDue({ dismissedAt: now - 2 * day }, now, 1)).toBe(true);
    // interval 0: every load, even right after closing it
    expect(popupDue({ dismissedAt: now, startedAt: now }, now, 0)).toBe(true);
  });
  it("stays away from buying, paying, the analysis itself and sign-in returns", () => {
    for (const path of ["/carrinho", "/finalizar", "/pedido/abc", "/analise-de-pele", "/auth/callback", "/auth/confirm", "/minha-conta", "/entrar", "/criar-conta", "/confirmar-email", "/esqueci-senha", "/redefinir-senha"]) expect(quietPath(path), path).toBe(true);
    for (const path of ["/", "/produtos", "/produtos/x", "/categorias/hidratacao", "/carrinhos"]) expect(quietPath(path), path).toBe(false);
  });
});
