import { describe, expect, it } from "vitest";
import { clampQuantity, computeTotals, deliveryQuote, lineKey, type CartLine } from "@/lib/cart/math";
import { formatBRL, parseBRLToCents } from "@/lib/money";
import { normalizeSearch, searchTerms } from "@/lib/search";
import { catalogQueryString, parseCatalogParams } from "@/lib/catalog/filters";
import { categoryAncestors, expandCategorySlugs, isIrritatingPair } from "@/lib/catalog/rules";
import { csvCell, parseCsv } from "@/lib/admin/catalog-csv";
import {
  buildOrderMessage,
  buildOrderWhatsAppLink,
  buildWhatsAppUrl,
  MAX_WHATSAPP_URL_LENGTH,
  normalizeWhatsAppNumber,
} from "@/lib/whatsapp";

const line = (over: Partial<CartLine>): CartLine => ({
  key: lineKey({ productId: over.productId ?? "p1" }),
  productId: "p1",
  variantId: null,
  kitId: null,
  slug: "x",
  href: "/produtos/x",
  name: "Produto",
  brand: "Marca",
  variantName: null,
  volume: null,
  imageUrl: null,
  unitPriceCents: 1000,
  quantity: 1,
  maxQuantity: null,
  isAvailable: true,
  ...over,
});

describe("money", () => {
  it("formats and parses BRL", () => {
    expect(formatBRL(11990)).toBe("R$ 119,90");
    expect(formatBRL(129900)).toBe("R$ 1.299,00");
    expect(parseBRLToCents("119,90")).toBe(11990);
    expect(parseBRLToCents("R$ 1.299,00")).toBe(129900);
    expect(parseBRLToCents("119.9")).toBe(11990);
    expect(parseBRLToCents("")).toBeNull();
    expect(parseBRLToCents("abc")).toBeNaN();
  });
});

describe("cart totals (Teste 3 / 6)", () => {
  it("sums three different products with changed quantities", () => {
    const totals = computeTotals([
      line({ key: "a", productId: "a", unitPriceCents: 11990, quantity: 2 }),
      line({ key: "b", productId: "b", unitPriceCents: 15900, quantity: 1 }),
      line({ key: "c", productId: "c", unitPriceCents: 8990, quantity: 3 }),
    ]);
    expect(totals.subtotalCents).toBe(2 * 11990 + 15900 + 3 * 8990);
    expect(totals.itemCount).toBe(6);
    expect(totals.hasUnpricedItems).toBe(false);
  });

  it("never adds a value for unpriced items", () => {
    const totals = computeTotals([line({ key: "a", unitPriceCents: 5000, quantity: 1 }), line({ key: "b", productId: "b", unitPriceCents: null, quantity: 4 })]);
    expect(totals.subtotalCents).toBe(5000);
    expect(totals.hasUnpricedItems).toBe(true);
  });

  it("excludes unavailable lines and flags them (Teste 8)", () => {
    const totals = computeTotals([line({ key: "a", isAvailable: false }), line({ key: "b", productId: "b", maxQuantity: 0 })]);
    expect(totals.purchasableLines).toHaveLength(0);
    expect(totals.hasUnavailableItems).toBe(true);
  });

  it("clamps quantities to tracked stock", () => {
    expect(clampQuantity(10, 3)).toBe(3);
    expect(clampQuantity(0, null)).toBe(1);
    expect(clampQuantity(500, null)).toBe(99);
  });

  it("computes delivery estimates without inventing free shipping", () => {
    const zone = { feeCents: 1500, freeOverCents: 20000, minOrderCents: 5000 };
    expect(deliveryQuote(zone, { subtotalCents: 10000, hasUnpricedItems: false })).toEqual({ feeCents: 1500, belowMinimum: false, isFree: false });
    expect(deliveryQuote(zone, { subtotalCents: 25000, hasUnpricedItems: false }).feeCents).toBe(0);
    expect(deliveryQuote(zone, { subtotalCents: 25000, hasUnpricedItems: true }).isFree).toBe(false);
    expect(deliveryQuote(zone, { subtotalCents: 1000, hasUnpricedItems: false }).belowMinimum).toBe(true);
  });
});

describe("WhatsApp message (Teste 4)", () => {
  const input = {
    greeting: "Olá, MIVORA!",
    code: "MIV-000001",
    items: [
      { name: "Medicube PDRN Pink Peptide", quantity: 1, unitPriceCents: 18990, lineTotalCents: 18990 },
      { name: "SKIN1004 Centella Ampoule", quantity: 2, unitPriceCents: 11990, lineTotalCents: 23980 },
      { name: "Dr. Althea 345 Relief Cream", quantity: 1, unitPriceCents: null, lineTotalCents: null },
    ],
    subtotalCents: 18990 + 23980,
    hasUnpricedItems: true,
  };

  it("follows the requested template with real values", () => {
    const msg = buildOrderMessage(input);
    expect(msg).toContain("*Olá, MIVORA! Gostaria de fazer um pedido pelo site.*");
    expect(msg).toContain("*Meu pedido:*");
    expect(msg).toContain("1. Medicube PDRN Pink Peptide\nQuantidade: 1\nValor: R$ 189,90");
    expect(msg).toContain("2. SKIN1004 Centella Ampoule\nQuantidade: 2\nValor: R$ 239,80 (R$ 119,90 cada)");
    expect(msg).toContain("3. Dr. Althea 345 Relief Cream\nQuantidade: 1\nValor: Preço sob consulta");
    expect(msg).toContain("*Subtotal dos produtos:* R$ 429,70 + itens com preço sob consulta");
    expect(msg).toContain("*Entrega:* a combinar.");
    expect(msg).toContain("*Código do pedido:* MIV-000001");
    expect(msg).toContain("Gostaria de confirmar a disponibilidade e saber as opções de entrega e pagamento.");
  });

  it("encodes the text for wa.me links (web and app)", () => {
    const url = buildWhatsAppUrl("5511912345678", "Olá & bem-vinda #1\nLinha 2");
    expect(url).toBe("https://wa.me/5511912345678?text=Ol%C3%A1%20%26%20bem-vinda%20%231%0ALinha%202");
    expect(decodeURIComponent(url.split("text=")[1])).toBe("Olá & bem-vinda #1\nLinha 2");
  });

  it("uses a summary for very large carts", () => {
    const big = {
      ...input,
      items: Array.from({ length: 40 }, (_, i) => ({ name: `Produto com um nome bastante longo número ${i + 1}`, quantity: 2, unitPriceCents: 9990, lineTotalCents: 19980 })),
    };
    const { url, summarized } = buildOrderWhatsAppLink("5511912345678", big);
    expect(summarized).toBe(true);
    expect(url.length).toBeLessThanOrEqual(MAX_WHATSAPP_URL_LENGTH);
    expect(decodeURIComponent(url)).toContain("MIV-000001");
  });

  it("normalises Brazilian numbers", () => {
    expect(normalizeWhatsAppNumber("(11) 91234-5678")).toBe("5511912345678");
    expect(normalizeWhatsAppNumber("+55 11 91234-5678")).toBe("5511912345678");
    expect(normalizeWhatsAppNumber("123")).toBeNull();
    expect(normalizeWhatsAppNumber(null)).toBeNull();
  });
});

describe("search & filters", () => {
  it("is accent and case insensitive", () => {
    expect(normalizeSearch("Ácido Tranexâmico")).toBe("acido tranexamico");
    expect(searchTerms("Vitamina C")).toEqual(["vitamina", "c"]);
    expect(searchTerms("pele sensível!!")).toEqual(["pele", "sensivel"]);
    expect(searchTerms("100%_off")).toEqual(["100", "off"]);
  });

  it("round-trips catalogue URL params and rejects junk", () => {
    const f = parseCatalogParams({ marca: "medicube,skin1004", necessidade: "poros-e-oleosidade", ordem: "preco-asc", pagina: "2", disponibilidade: "em-breve", pele: "<script>" });
    expect(f.marca).toEqual(["medicube", "skin1004"]);
    expect(f.pele).toBeUndefined();
    expect(catalogQueryString(f)).toBe("?marca=medicube%2Cskin1004&necessidade=poros-e-oleosidade&disponibilidade=em-breve&ordem=preco-asc&pagina=2");
    expect(parseCatalogParams({ disponivel: "1" }).disponibilidade).toBe("disponivel");
  });
});

describe("catalogue rules", () => {
  const cats = [
    { id: "1", slug: "seruns-e-ampolas", parent_id: null },
    { id: "2", slug: "seruns-hidratantes", parent_id: "1" },
    { id: "3", slug: "ampolas-calmantes", parent_id: "1" },
    { id: "4", slug: "limpeza", parent_id: null },
  ];
  it("expands a parent category to its subcategories", () => {
    expect(expandCategorySlugs(["seruns-e-ampolas"], cats).sort()).toEqual(["ampolas-calmantes", "seruns-e-ampolas", "seruns-hidratantes"]);
    expect(expandCategorySlugs(["seruns-hidratantes"], cats)).toEqual(["seruns-hidratantes"]);
    expect(categoryAncestors("3", cats)).toEqual(["1"]);
  });

  it("never pairs retinoids with exfoliants (or doubles them)", () => {
    expect(isIrritatingPair(["retinal", "retinoide"], ["pads", "esfoliante"])).toBe(true);
    expect(isIrritatingPair(["retinoide"], ["retinoide"])).toBe(true);
    expect(isIrritatingPair(["esfoliante"], ["esfoliante"])).toBe(true);
    expect(isIrritatingPair(["retinoide"], ["centella"])).toBe(false);
    expect(isIrritatingPair(["centella"], ["hialurônico"])).toBe(false);
  });
});

describe("catalogue CSV import", () => {
  it("parses semicolon CSV with quotes, BOM and formula-escaped cells", () => {
    const rows = parseCsv('﻿slug;nome;preco;tags\r\n"a-b";"Nome; com ""aspas""";119,90;"x|y"\r\nc;\'=cmd;;\r\n');
    expect(rows).toEqual([
      { slug: "a-b", nome: 'Nome; com "aspas"', preco: "119,90", tags: "x|y" },
      { slug: "c", nome: "=cmd", preco: "", tags: "" },
    ]);
    expect(csvCell("=SUM(A1)")).toBe(`"'=SUM(A1)"`);
  });
});

describe("WhatsApp message with welcome coupon", () => {
  it("shows coupon, discount and total", () => {
    const msg = buildOrderMessage({
      code: "MIV-000010",
      items: [{ name: "SKIN1004 Madagascar Centella Ampoule", code: "MV0009", quantity: 2, unitPriceCents: 17999, lineTotalCents: 35998 }],
      subtotalCents: 35998,
      hasUnpricedItems: false,
      discount: { code: "BEMVINDA10", percent: 10, cents: 3599 },
    });
    expect(msg).toContain("Código: MV0009");
    expect(msg).toContain("*Subtotal dos produtos:* R$ 359,98");
    expect(msg).toContain("*Cupom:* BEMVINDA10 (10% na primeira compra): - R$ 35,99");
    expect(msg).toContain("*Total com desconto:* R$ 323,99");
  });
});
