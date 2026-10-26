import { describe, expect, it } from "vitest";
import {
  amountsIn,
  composeMessage,
  concentrationsIn,
  dedupeKey,
  fragranceKey,
  matchProduct,
  normalizeSheet,
  reviewPost,
  scheduleSlots,
  seenOnTheWeb,
  simpleListDrafts,
  verifyItem,
  volumesIn,
  type RawSheet,
} from "@/lib/vip/core";

const LIST = `Lista VIP de hoje 🌟
✨ Lattafa Asad EDP 100ml — R$ 189,90
Armaf Club de Nuit Intense Man EDT 105 ml R$1.299,90 (pronta entrega)
Yara Pink Elixir 100ml de R$ 300 por R$ 250
Bidaya Ayat 100ml
Boa semana!`;

describe("reading the admin's list", () => {
  it("reads prices only where they are prices", () => {
    expect(amountsIn("R$ 189,90")).toEqual([18990]);
    expect(amountsIn("R$1.299,90")).toEqual([129990]);
    expect(amountsIn("Asad 100ml 189,90")).toEqual([18990]);
    expect(amountsIn("R$ 189")).toEqual([18900]);
    expect(amountsIn("Asad 100ml")).toEqual([]);
    expect(amountsIn("de R$ 300 por R$ 250")).toEqual([30000, 25000]);
  });

  it("reads sizes and versions, keeping flankers apart from concentrations", () => {
    expect(volumesIn("100ml e 105 ML")).toEqual([100, 105]);
    expect(concentrationsIn("Asad EDP")).toEqual(["Eau de Parfum"]);
    expect(concentrationsIn("Eau de Parfum")).toEqual(["Eau de Parfum"]);
    expect(concentrationsIn("Extrait de Parfum")).toEqual(["Extrait de Parfum"]);
    expect(concentrationsIn("Bleu de Chanel Parfum")).toEqual(["Parfum"]);
    expect(concentrationsIn("Asad Elixir")).toEqual([]);
    expect(concentrationsIn("um perfume marcante da Parfums de Marly")).toEqual([]);
  });

  it("takes price, size and version from the admin's line, never from the AI", () => {
    const item = verifyItem({ lines: ["Lattafa Asad EDP 100ml — R$ 189,90"], brand: "Lattafa", name: "Asad", details: null }, LIST);
    // the AI dropped the emoji: the item still points at the admin's full line
    expect(item).toMatchObject({ sourceLine: "✨ Lattafa Asad EDP 100ml — R$ 189,90", priceCents: 18990, volumeMl: 100, concentration: "Eau de Parfum", problems: [] });
    const thousands = verifyItem({ lines: ["Armaf Club de Nuit Intense Man EDT 105 ml R$1.299,90 (pronta entrega)"], brand: "Armaf", name: "Club de Nuit Intense Man", details: "pronta entrega" }, LIST);
    expect(thousands).toMatchObject({ priceCents: 129990, volumeMl: 105, concentration: "Eau de Toilette" });
  });

  it("drops perfumes that are not in the list and flags what is ambiguous or missing", () => {
    expect(verifyItem({ lines: ["Dior Sauvage EDT 100ml R$ 99,90"], brand: "Dior", name: "Sauvage", details: null }, LIST)).toBeNull();
    const twoPrices = verifyItem({ lines: ["Yara Pink Elixir 100ml de R$ 300 por R$ 250"], brand: null, name: "Yara Pink Elixir", details: null }, LIST)!;
    expect(twoPrices.priceCents).toBe(25000);
    expect(twoPrices.concentration).toBeNull();
    expect(twoPrices.problems.join(" ")).toMatch(/mais de um valor/);
    const noPrice = verifyItem({ lines: ["Bidaya Ayat 100ml"], brand: "Bidaya", name: "Ayat", details: null }, LIST)!;
    expect(noPrice.priceCents).toBeNull();
    expect(noPrice.problems.join(" ")).toMatch(/não informa o preço/);
  });

  it("the simple reader (no AI) keeps only lines that describe a perfume", () => {
    const drafts = simpleListDrafts(LIST);
    expect(drafts.map((d) => d.lines[0])).toEqual([
      "✨ Lattafa Asad EDP 100ml — R$ 189,90",
      "Armaf Club de Nuit Intense Man EDT 105 ml R$1.299,90 (pronta entrega)",
      "Yara Pink Elixir 100ml de R$ 300 por R$ 250",
      "Bidaya Ayat 100ml",
    ]);
    expect(drafts[0].name).toBe("Lattafa Asad EDP");
  });
});

describe("identity of a perfume", () => {
  it("repeats are found whatever the word order, but size and version tell posts apart", () => {
    const a = dedupeKey({ brand: "Lattafa", name: "Asad", concentration: "Eau de Parfum", volumeMl: 100 });
    expect(dedupeKey({ brand: null, name: "Asad Lattafa Masculino", concentration: "Eau de Parfum", volumeMl: 100 })).toBe(a);
    expect(dedupeKey({ brand: "Lattafa", name: "Asad", concentration: "Eau de Parfum", volumeMl: 30 })).not.toBe(a);
    expect(dedupeKey({ brand: "Lattafa", name: "Asad Elixir", concentration: null, volumeMl: 100 })).not.toBe(a);
    // the olfactory sheet is shared by every size of the same perfume and version
    expect(fragranceKey({ brand: "Lattafa", name: "Asad", concentration: "Eau de Parfum" })).toBe(fragranceKey({ brand: null, name: "Asad Lattafa", concentration: "Eau de Parfum" }));
  });

  it("matches a store product only when it is unambiguous", () => {
    const products = [
      { id: "1", name: "Lattafa Asad EDP Masculino" },
      { id: "2", name: "Lattafa Asad Elixir Masculino" },
      { id: "3", name: "Lattafa Yara Pink EDP Feminino" },
      { id: "4", name: "Lattafa Yara Pink Elixir EDP" },
      { id: "5", name: "Rasasi Hawas Black EDP Masculino" },
      { id: "6", name: "Rasasi Hawas Ice EDP Masculino" },
    ];
    expect(matchProduct({ brand: "Lattafa", name: "Asad", concentration: "Eau de Parfum" }, products)?.id).toBe("1");
    expect(matchProduct({ brand: "Lattafa", name: "Asad Elixir", concentration: null }, products)?.id).toBe("2");
    expect(matchProduct({ brand: null, name: "Yara Pink Elixir", concentration: null }, products)?.id).toBe("4");
    expect(matchProduct({ brand: "Rasasi", name: "Hawas", concentration: null }, products)).toBeNull();
    expect(matchProduct({ brand: "Rasasi", name: "Hawas Black", concentration: "Eau de Toilette" }, products)).toBeNull();
    expect(matchProduct({ brand: "Dior", name: "Sauvage", concentration: null }, products)).toBeNull();
  });
});

describe("checking a written post", () => {
  const item = { sourceLine: "Lattafa Asad EDP 100ml R$ 189,90", priceCents: 18990, details: null };
  const good = "*Lattafa Asad* — Eau de Parfum, 100 ml\nAbertura de pimenta-preta e abacaxi sobre baunilha.\n💎 *R$ 189,90*";

  it("accepts a post that sticks to the list", () => {
    expect(reviewPost(good, item)).toEqual([]);
  });

  it("flags invented prices, versions, performance and stock claims", () => {
    expect(reviewPost(good.replace("189,90", "179,90"), item).join(" ")).toMatch(/não traz o preço da lista.*valor que não está na lista/);
    expect(reviewPost(`${good}\nDe R$ 250,00 por R$ 189,90!`, item).join(" ")).toMatch(/valor que não está na lista \(R\$ 250,00\)/);
    expect(reviewPost(good.replace("Eau de Parfum", "Eau de Toilette"), item).join(" ")).toMatch(/versão que a lista não informa \(Eau de Toilette\)/);
    expect(reviewPost(`${good}\nFixação de 12 horas.`, item).join(" ")).toMatch(/fixação/);
    expect(reviewPost(`${good}\nÚltimas unidades!`, item).join(" ")).toMatch(/estoque/);
    expect(reviewPost(`${good}\nÚltimas unidades!`, { ...item, details: "últimas unidades" })).toEqual([]);
    expect(reviewPost("Um perfume elegante. R$ 99,90", { sourceLine: "Bidaya Ayat", priceCents: null, details: null }).join(" ")).toMatch(/lista não informa preço/);
  });

  it("counts the closing in the caption limit", () => {
    expect(composeMessage(" Texto ", " Pedidos no privado ")).toBe("Texto\n\nPedidos no privado");
    expect(composeMessage("Texto", null)).toBe("Texto");
    expect(reviewPost(`${good}\n${"x".repeat(900)}`, item, "Pedidos no privado").join(" ")).toMatch(/passou de 1000 caracteres/);
  });
});

describe("olfactory sheet", () => {
  const raw: RawSheet = {
    status: "confirmada",
    identificado_como: "Lattafa Asad Eau de Parfum",
    concentracao: "Eau de Parfum",
    genero: "masculino",
    familia: "Âmbar especiado",
    notas_topo: ["pimenta-preta", "abacaxi", " pimenta-preta "],
    notas_coracao: ["café"],
    notas_fundo: ["baunilha"],
    notas_gerais: [],
    perfil: "Quente e especiado.",
    ocasioes: ["noite", "inverno"],
    observacoes: "",
    fontes: [
      { titulo: "Fragrantica", url: "https://www.fragrantica.com.br/perfume/Lattafa-Perfumes/Asad-63546.html" },
      { titulo: "Inventada", url: "https://example.com/asad" },
      { titulo: "Inválida", url: "javascript:alert(1)" },
    ],
  };
  const seen = seenOnTheWeb([
    { type: "web_search_tool_result", content: [{ type: "web_search_result", url: "https://www.fragrantica.com.br/perfume/Lattafa-Perfumes/Asad-63546.html", title: "Asad" }] },
    { type: "text", text: "https://example.com/asad" },
  ]);

  it("keeps only sources the research really reached", () => {
    const sheet = normalizeSheet(raw, seen);
    expect(sheet.sources.map((s) => s.title)).toEqual(["Fragrantica"]);
    expect(sheet.status).toBe("confirmada");
    expect(sheet.topNotes).toEqual(["pimenta-preta", "abacaxi"]);
  });

  it("a confirmed sheet without a checkable source becomes partial; a perfume not found carries no notes", () => {
    const unchecked = normalizeSheet({ ...raw, fontes: [{ titulo: "Inventada", url: "https://example.com/asad" }] }, seen);
    expect(unchecked.status).toBe("parcial");
    expect(unchecked.remarks).toMatch(/conferida/);
    const missing = normalizeSheet({ ...raw, status: "nao_encontrada" }, seen);
    expect(missing).toMatchObject({ family: null, topNotes: [], heartNotes: [], baseNotes: [], profile: null, occasions: [] });
  });
});

describe("sending schedule (São Paulo time)", () => {
  const schedule = { firstTime: "10:00", lastTime: "21:00", intervalMinutes: 90 };
  const sp = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", hour: "2-digit", minute: "2-digit" });

  it("starts at the window, spaces posts by the interval and moves what does not fit to the next day", () => {
    const slots = scheduleSlots(9, new Date("2026-10-26T11:00:00Z"), schedule); // 08:00 in São Paulo
    expect(slots.map(sp)).toEqual(["26, 10:00", "26, 11:30", "26, 13:00", "26, 14:30", "26, 16:00", "26, 17:30", "26, 19:00", "26, 20:30", "27, 10:00"]);
  });

  it("never schedules in the past, late at night or on top of posts already scheduled", () => {
    expect(scheduleSlots(1, new Date("2026-10-26T17:00:00Z"), schedule).map(sp)).toEqual(["26, 14:05"]);
    expect(scheduleSlots(2, new Date("2026-10-27T01:00:00Z"), schedule).map(sp)).toEqual(["27, 10:00", "27, 11:30"]); // 22:00 the day before
    expect(scheduleSlots(1, new Date("2026-10-26T11:00:00Z"), schedule, new Date("2026-10-26T15:00:00Z")).map(sp)).toEqual(["26, 13:30"]);
  });
});
