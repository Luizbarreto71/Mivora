import { describe, expect, it } from "vitest";
import {
  amountsIn,
  buildPost,
  composeMessage,
  concentrationsIn,
  dedupeKey,
  displayName,
  fragranceKey,
  fragranticaImage,
  matchProduct,
  normalizeSheet,
  reviewPost,
  scheduleSlots,
  seenOnTheWeb,
  simpleListDrafts,
  splitForCaption,
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
    expect(reviewPost(`${good}\nFixação marcante.`, item).join(" ")).toMatch(/fixação/);
    expect(reviewPost(`${good}\nÚltimas unidades!`, item).join(" ")).toMatch(/estoque/);
    expect(reviewPost(`${good}\nÚltimas unidades!`, { ...item, details: "últimas unidades" })).toEqual([]);
    expect(reviewPost("Um perfume elegante. R$ 99,90", { sourceLine: "Bidaya Ayat", priceCents: null, details: null }).join(" ")).toMatch(/lista não informa preço/);
  });

  it("fixação and projeção are fine when the sheet brings them from Fragrantica or Parfumo; hours never", () => {
    const rated = `${good}\n• *Fixação:* duradoura · *Projeção:* moderada _(avaliação dos usuários do Fragrantica)_`;
    expect(reviewPost(rated, item, { performanceSourced: true })).toEqual([]);
    expect(reviewPost(rated, item).join(" ")).toMatch(/fixação/);
    expect(reviewPost(`${good}\nDura 12 horas.`, item, { performanceSourced: true }).join(" ")).toMatch(/fixação, projeção ou duração/);
  });

  it("counts the closing in the post limit", () => {
    expect(composeMessage(" Texto ", " Pedidos no privado ")).toBe("Texto\n\nPedidos no privado");
    expect(composeMessage("Texto", null)).toBe("Texto");
    expect(reviewPost(`${good}\n${"x".repeat(3480)}`, item, { footer: "Pedidos no privado" }).join(" ")).toMatch(/passou de 3500 caracteres/);
  });
});

const RAW: RawSheet = {
  status: "confirmada",
  identificado_como: "Lattafa Asad Eau de Parfum",
  concentracao: "Eau de Parfum",
  genero: "masculino",
  familia: "Âmbar especiado",
  notas_topo: ["pimenta-preta", "abacaxi", " pimenta-preta "],
  notas_coracao: ["café", "patchouli"],
  notas_fundo: ["baunilha", "âmbar"],
  notas_gerais: [],
  acordes: ["âmbar", "especiado", "doce"],
  perfumistas: [],
  ano_lancamento: "2021",
  fixacao: "duradoura",
  projecao: "moderada",
  fonte_desempenho: "https://www.fragrantica.com.br/perfume/Lattafa-Perfumes/Asad-70001.html",
  perfil: "Quente e especiado.",
  ocasioes: ["noite", "outono", "inverno"],
  imagem_url: "https://lattafa.example/media/asad.png",
  observacoes: "",
  fontes: [
    { titulo: "Fragrantica", url: "https://www.fragrantica.com.br/perfume/Lattafa-Perfumes/Asad-70001.html" },
    { titulo: "Inventada", url: "https://example.com/asad" },
    { titulo: "Inválida", url: "javascript:alert(1)" },
  ],
};
const SEEN = seenOnTheWeb([
  { type: "web_search_tool_result", content: [{ type: "web_search_result", url: "https://www.fragrantica.com.br/perfume/Lattafa-Perfumes/Asad-70001.html", title: "Asad" }] },
  { type: "web_fetch_tool_result", content: { type: "web_fetch_result", url: "https://lattafa.example/asad", content: { source: { data: "foto: https://lattafa.example/media/asad.png" } } } },
  { type: "text", text: "https://example.com/asad" },
]);
const ASAD = { brand: "Lattafa", name: "Lattafa Asad EDP 100ml" };

describe("olfactory sheet", () => {
  it("keeps only sources the research really reached", () => {
    const sheet = normalizeSheet(RAW, SEEN, ASAD);
    expect(sheet.sources.map((s) => s.title)).toEqual(["Fragrantica"]);
    expect(sheet.status).toBe("confirmada");
    expect(sheet.topNotes).toEqual(["pimenta-preta", "abacaxi"]);
    expect(sheet).toMatchObject({ accords: ["âmbar", "especiado", "doce"], launchYear: 2021, longevity: "duradoura", sillage: "moderada", performanceSource: "Fragrantica" });
  });

  it("a confirmed sheet without a checkable source becomes partial; a perfume not found carries nothing", () => {
    const unchecked = normalizeSheet({ ...RAW, fontes: [{ titulo: "Inventada", url: "https://example.com/asad" }] }, SEEN, ASAD);
    expect(unchecked.status).toBe("parcial");
    expect(unchecked.remarks).toMatch(/conferida/);
    // the ratings' page is no longer among the sources: no fixação/projeção
    expect(unchecked).toMatchObject({ longevity: null, sillage: null, performanceSource: null });
    const missing = normalizeSheet({ ...RAW, status: "nao_encontrada" }, SEEN, ASAD);
    expect(missing).toMatchObject({ family: null, topNotes: [], accords: [], launchYear: null, longevity: null, profile: null, occasions: [], imageCandidates: [] });
  });

  it("ratings count only from Fragrantica or Parfumo, and years must be real", () => {
    const blog = normalizeSheet({ ...RAW, fonte_desempenho: "https://example.com/asad" }, SEEN, ASAD);
    expect(blog.longevity).toBeNull();
    expect(normalizeSheet({ ...RAW, ano_lancamento: "21" }, SEEN, ASAD).launchYear).toBeNull();
  });

  it("photo candidates: the official one seen on a fetched page first, then Fragrantica's for the same page", () => {
    expect(normalizeSheet(RAW, SEEN, ASAD).imageCandidates).toEqual([
      { url: "https://lattafa.example/media/asad.png", source: "lattafa.example" },
      { url: "https://fimgs.net/mdimg/perfume/o.70001.jpg", source: "Fragrantica" },
    ]);
    // an address the research never saw is not trusted
    expect(normalizeSheet({ ...RAW, imagem_url: "https://cdn.other.example/x.png" }, SEEN, ASAD).imageCandidates.map((c) => c.source)).toEqual(["Fragrantica"]);
  });

  it("a Fragrantica photo only for the very same perfume (never a flanker or another perfume)", () => {
    const page = "https://www.fragrantica.com.br/perfume/Lattafa-Perfumes/Asad-70001.html";
    expect(fragranticaImage(page, { brand: "Lattafa", name: "Asad" })).toBe("https://fimgs.net/mdimg/perfume/o.70001.jpg");
    expect(fragranticaImage(page, { brand: "Lattafa", name: "Asad Elixir" })).toBeNull();
    expect(fragranticaImage("https://www.fragrantica.com/perfume/Lattafa-Perfumes/Asad-Bourbon-90000.html", { brand: "Lattafa", name: "Asad" })).toBeNull();
    expect(fragranticaImage("https://example.com/perfume/Lattafa-Perfumes/Asad-70001.html", { brand: "Lattafa", name: "Asad" })).toBeNull();
  });
});

describe("the post laid out by the store", () => {
  const sheet = normalizeSheet(RAW, SEEN, ASAD);
  const item = { name: "Lattafa Asad EDP 100ml Masculino", concentration: "Eau de Parfum", volumeMl: 100, priceCents: 18990 };

  it("one perfume per post: photo caption with name, version, opening, the whole sheet and the price", () => {
    const post = buildPost(item, sheet, "Um âmbar especiado marcante.");
    expect(post).toBe(
      [
        "✨ *Lattafa Asad*",
        "_Eau de Parfum · 100 ml_",
        "",
        "Um âmbar especiado marcante.",
        "",
        "*Ficha olfativa*",
        "• *Família olfativa:* Âmbar especiado",
        "• *Notas de saída:* pimenta-preta e abacaxi",
        "• *Notas de coração:* café e patchouli",
        "• *Notas de fundo:* baunilha e âmbar",
        "• *Acordes principais:* âmbar, especiado e doce",
        "• *Classificação:* masculino",
        "• *Lançamento:* 2021",
        "• *Fixação:* duradoura · *Projeção:* moderada _(avaliação dos usuários do Fragrantica)_",
        "• *Quando usar:* noite, outono e inverno",
        "",
        "💎 *R$ 189,90*",
      ].join("\n"),
    );
    expect(reviewPost(post, { sourceLine: "Lattafa Asad EDP 100ml R$ 189,90", priceCents: 18990, details: null }, { performanceSourced: true })).toEqual([]);
  });

  it("without a sheet or a price, only what the list says", () => {
    const post = buildPost({ name: "Bidaya Ayat", concentration: null, volumeMl: 100, priceCents: null }, normalizeSheet({ ...RAW, status: "nao_encontrada" }, SEEN, ASAD), "Elegante.");
    expect(post).toBe("✨ *Bidaya Ayat*\n_100 ml_\n\nElegante.");
  });

  it("names keep flankers but lose size, version and gender", () => {
    expect(displayName("Lattafa Asad Elixir EDP 100ml Masculino")).toBe("Lattafa Asad Elixir");
    expect(displayName("French Avenue Irida Extrait EDP Feminino")).toBe("French Avenue Irida");
    expect(displayName("Parfums de Marly Layton Eau de Parfum")).toBe("Parfums de Marly Layton");
  });

  it("a post longer than a photo caption is split at a paragraph", () => {
    const long = `${"a".repeat(600)}\n\n${"b".repeat(600)}\n\n${"c".repeat(100)}`;
    const [caption, rest] = splitForCaption(long);
    expect(caption).toBe("a".repeat(600));
    expect(rest).toBe(`${"b".repeat(600)}\n\n${"c".repeat(100)}`);
    expect(splitForCaption("curto")).toEqual(["curto"]);
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
