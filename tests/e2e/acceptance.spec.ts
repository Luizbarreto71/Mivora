import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { RETURNING_VISITOR } from "../../playwright.config";

/**
 * Acceptance criteria (section 21 of the brief) exercised through the real UI.
 * Runs serially: later steps depend on data created by earlier ones.
 */
test.describe.configure({ mode: "serial" });

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@mivora.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "mivora-local-123";
const NEW_PRODUCT = `Sérum Teste E2E ${Date.now().toString().slice(-5)}`;
const PRICED = [
  { slug: "skin1004-madagascar-centella-ampoule", price: "119,90", cents: 11990 },
  { slug: "dr-althea-345-relief-cream", price: "159,00", cents: 15900 },
  { slug: "celimax-pore-dark-spot-brightening-cream", price: "89,90", cents: 8990 },
];
const brl = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;

let admin: Page;

async function editProductBySlug(page: Page, slug: string) {
  await page.goto(`/admin/produtos?q=${encodeURIComponent(slug.split("-").slice(0, 3).join(" "))}`);
  await page.locator(`tr:has(a[href="/produtos/${slug}"]) a[href^="/admin/produtos/"]`).first().click();
  await expect(page.getByLabel("Preço de venda (R$)")).toBeVisible();
}

async function saveProduct(page: Page) {
  await page.getByRole("button", { name: /Salvar alterações|Criar produto/ }).click();
  await expect(page.getByRole("status").filter({ hasText: /Produto (salvo|criado)/ })).toBeVisible();
}

test.beforeAll(async ({ browser }) => {
  admin = await browser.newPage({ storageState: RETURNING_VISITOR });
});

test("Teste 9 — visitante não autenticado não acessa o admin nem escreve dados", async ({ page, request }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);
  await page.goto("/admin/produtos");
  await expect(page).toHaveURL(/\/admin\/login/);
  const csv = await request.get("/api/admin/pedidos/csv");
  expect(csv.status()).toBe(401);
});

test("login do administrador e configuração do WhatsApp", async () => {
  await admin.goto("/admin/login");
  await admin.getByLabel("E-mail").fill(ADMIN_EMAIL);
  await admin.getByLabel("Senha").fill(ADMIN_PASSWORD);
  await admin.getByRole("button", { name: "Entrar" }).click();
  await expect(admin.getByRole("heading", { name: "Painel" })).toBeVisible();

  await admin.goto("/admin/configuracoes");
  await admin.getByLabel("Número do WhatsApp da loja").fill("11 91234-5678");
  await admin.getByRole("button", { name: "Salvar configurações" }).click();
  await expect(admin.getByText("Configurações salvas.")).toBeVisible();
});

test("Teste 10 — os nove produtos iniciais estão cadastrados com marca e categoria", async ({ page }) => {
  await page.goto("/produtos");
  const seed = [
    "medicube-pdrn-pink-peptide-serum",
    "medicube-zero-pore-pad",
    "medicube-deep-vita-c-pad",
    "celimax-the-vita-a-retinal-shot",
    "numbuzin-no9-volumetox-eye-cream",
    "celimax-pore-dark-spot-brightening-cream",
    "dr-althea-345-relief-cream",
    "skin1004-madagascar-centella-ampoule",
    "skin1004-madagascar-centella-tone-brightening-capsule-ampoule",
  ];
  for (const slug of seed) await expect(page.locator(`article a[href="/produtos/${slug}"]`).filter({ visible: true }).first()).toBeVisible();
  for (const brand of ["Medicube", "SKIN1004", "Celimax", "Dr. Althea", "Numbuzin"]) {
    await expect(page.locator("article").filter({ hasText: brand, visible: true }).first()).toBeVisible();
  }
});

test("Teste 6 — produto sem preço mostra “Consultar preço”", async ({ page }) => {
  await page.goto("/produtos/medicube-deep-vita-c-pad");
  await expect(page.getByText("Consultar preço").first()).toBeVisible();
  await expect(page.locator("main")).not.toContainText("R$ 0,00");
});

test("Teste 2 — preço alterado no admin aparece no catálogo e na página do produto", async ({ page }) => {
  for (const p of PRICED) {
    await editProductBySlug(admin, p.slug);
    await admin.getByLabel("Preço de venda (R$)").fill(p.price);
    await saveProduct(admin);
  }
  await page.goto("/produtos/skin1004-madagascar-centella-ampoule");
  await expect(page.getByText(brl(11990)).first()).toBeVisible();
  await page.goto("/marcas/skin1004");
  await expect(page.locator("article").filter({ hasText: "Madagascar Centella Ampoule", visible: true }).first()).toContainText(brl(11990));
});

test("Testes 1 e 12 — admin cadastra produto com foto, preço e estoque; após publicar aparece na loja", async ({ page }) => {
  await admin.goto("/admin/produtos/novo");
  await admin.getByLabel("Nome comercial").fill(NEW_PRODUCT);
  await admin.getByLabel("Marca", { exact: true }).selectOption({ label: "SKIN1004" });
  await admin.getByLabel("Conteúdo / volume").fill("30 ml");
  await admin.getByLabel("Descrição curta").fill("Produto criado pelo teste automatizado.");
  await admin.getByLabel("Séruns e ampolas").check();
  await admin.getByLabel("Preço de venda (R$)").fill("99,90");
  await admin.getByLabel("Disponibilidade", { exact: true }).selectOption("in_stock");
  await admin.getByLabel("Documentação e regularização").selectOption("verified");
  await admin.getByLabel("Controlar quantidade em estoque").check();
  await admin.getByLabel("Quantidade inicial").fill("2");
  await admin.getByRole("button", { name: "Criar produto" }).click();
  await expect(admin).toHaveURL(/\/admin\/produtos\/[0-9a-f-]{36}/);
  await expect(admin.getByText("Produto criado. Agora envie as fotos.")).toBeVisible();

  // Real upload: the supplied photo goes through validation, re-encoding and Storage
  await admin.locator('input[type="file"]').setInputFiles(path.join(process.cwd(), "assets/originals/skin1004-madagascar-centella-ampoule.jpg"));
  await expect(admin.getByText("Imagem enviada.")).toBeVisible({ timeout: 30_000 });
  await expect(admin.getByText("Principal", { exact: true })).toBeVisible();

  await admin.getByRole("button", { name: "Publicar" }).click();
  await expect(admin.getByText("Publicado").first()).toBeVisible();

  await page.goto(`/produtos?q=${encodeURIComponent("Teste E2E")}`);
  const card = page.locator("article").filter({ hasText: NEW_PRODUCT, visible: true });
  await expect(card).toBeVisible();
  await expect(card).toContainText(brl(9990));
  await expect(card.locator("img").first()).toHaveAttribute("src", /storage%2Fv1%2Fobject%2Fpublic|storage\/v1\/object\/public/);
});

test("Testes 3, 4, 5 e 13 — carrinho, subtotal, WhatsApp e intenção de pedido", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: RETURNING_VISITOR });
  const page = await ctx.newPage();
  let whatsappUrl = "";
  await ctx.route("https://wa.me/**", async (route) => {
    whatsappUrl = route.request().url();
    await route.fulfill({ status: 200, body: "whatsapp" });
  });

  for (const p of PRICED) {
    await page.goto(`/produtos/${p.slug}`);
    await page.getByRole("button", { name: "Adicionar ao carrinho" }).click();
    await page.getByRole("button", { name: "Fechar" }).click();
  }
  await page.goto("/carrinho");
  const increase = page.getByRole("button", { name: "Aumentar quantidade" });
  await increase.nth(0).click(); // centella ×2
  await increase.nth(2).click(); // celimax ×2
  await increase.nth(2).click(); // celimax ×3
  const expected = 2 * 11990 + 15900 + 3 * 8990;
  await expect(page.getByText(brl(expected)).first()).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Seu carrinho (6 itens)");

  // Teste 13: survives reloads
  await page.reload();
  await expect(page.getByText(brl(expected)).first()).toBeVisible();

  await page.goto("/finalizar");
  await page.getByLabel("Nome").fill("Cliente Teste");
  await page.getByRole("button", { name: "Finalizar pelo WhatsApp" }).click();
  await expect.poll(() => whatsappUrl, { timeout: 15_000 }).toContain("https://wa.me/5511912345678?text=");

  const message = decodeURIComponent(whatsappUrl.split("text=")[1]);
  expect(message).toContain("Gostaria de fazer um pedido pelo site.");
  expect(message).toContain("Quantidade: 2");
  expect(message).toContain("Quantidade: 3");
  expect(message).toContain(brl(11990));
  expect(message).toContain(brl(15900));
  expect(message).toContain(`*Subtotal dos produtos:* ${brl(expected)}`);
  expect(message).toContain("*Entrega:* a combinar.");
  expect(message).toMatch(/Código: MV\d{4}/);
  const code = message.match(/MIV-\d{6}/)?.[0];
  expect(code).toBeTruthy();

  // "Minha conta" lists the order sent from this device
  await page.goto("/minha-conta");
  await expect(page.getByText(code!)).toBeVisible();
  await expect(page.getByRole("link", { name: /Abrir conversa do pedido/ })).toHaveAttribute("href", /wa\.me/);

  // Teste 5: registered as an intent, never as a completed sale
  await admin.goto(`/admin/pedidos?q=${code}`);
  const row = admin.locator("tr").filter({ hasText: code! });
  await expect(row).toContainText("Iniciado");
  await expect(row).toContainText(brl(expected));
  await admin.goto("/admin");
  await expect(admin.locator("a", { hasText: "Vendas concluídas" })).toContainText("0");
  await ctx.close();
});

test("Teste 8 — produto com estoque numérico esgotado não pode ser comprado", async ({ page }) => {
  await admin.goto("/admin/estoque");
  await admin.getByLabel("Produto").selectOption({ label: NEW_PRODUCT });
  await admin.getByLabel("Tipo").selectOption("out");
  await admin.getByLabel("Quantidade").fill("2");
  await admin.getByLabel("Motivo / observação").fill("Teste automatizado");
  await admin.getByRole("button", { name: "Registrar" }).click();
  await expect(admin.getByText("Movimentação registrada.")).toBeVisible();

  await page.goto(`/produtos?q=${encodeURIComponent("Teste E2E")}`);
  const card = page.locator("article").filter({ hasText: NEW_PRODUCT, visible: true });
  await expect(card).toContainText("Esgotado");
  await card.getByRole("link", { name: NEW_PRODUCT }).first().click();
  await expect(page.getByText("Esgotado no momento")).toBeVisible();
  await expect(page.getByRole("button", { name: "Adicionar ao carrinho" })).toHaveCount(0);
});

test("Teste 7 — produto despublicado sai do catálogo público", async ({ page }) => {
  await admin.goto(`/admin/produtos?q=${encodeURIComponent("Teste E2E")}`);
  await admin.locator("tr").filter({ hasText: NEW_PRODUCT }).getByRole("button", { name: "Despublicar" }).click();
  await expect(admin.locator("tr").filter({ hasText: NEW_PRODUCT })).toContainText("Rascunho");
  await page.goto(`/produtos?q=${encodeURIComponent("Teste E2E")}`);
  await expect(page.getByText("Nenhum produto encontrado").filter({ visible: true })).toBeVisible();
});

test("Teste 14 — páginas públicas têm título, descrição, Open Graph e dados estruturados", async ({ page }) => {
  await page.goto("/produtos/skin1004-madagascar-centella-ampoule");
  await expect(page).toHaveTitle("SKIN1004 Madagascar Centella Ampoule | MIVORA");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /Centella/);
  await expect(page.locator('meta[property="og:image"]').first()).toHaveAttribute("content", /skin1004/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/produtos\/skin1004-madagascar-centella-ampoule$/);
  const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(ld.some((s) => s.includes('"@type":"Product"') && s.includes('"priceCurrency":"BRL"'))).toBe(true);
});

test("Teste 11 — experiência mobile sem rolagem horizontal", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, storageState: RETURNING_VISITOR });
  const page = await ctx.newPage();
  for (const url of ["/", "/produtos", "/produtos/dr-althea-345-relief-cream", "/carrinho", "/ritual", "/minha-conta", "/finalizar"]) {
    await page.goto(url);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, url).toBeLessThanOrEqual(0);
  }
  await page.goto("/");
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await expect(page.getByRole("dialog", { name: "Menu" })).toBeVisible();
  await ctx.close();
});

// ---------------------------------------------------------------------------
// Catalogue expansion (29 products)
// ---------------------------------------------------------------------------

test("Expansão — produtos em rascunho não aparecem ao público", async ({ page }) => {
  await page.goto("/produtos/aestura-atobarrier365-cream");
  await expect(page.getByText("Página não encontrada").or(page.locator("title", { hasText: "Produto não encontrado" })).first()).toBeAttached();
  await page.goto("/produtos?q=atobarrier");
  await expect(page.getByText("Nenhum produto encontrado").filter({ visible: true })).toBeVisible();
});

test("Expansão — busca encontra produtos reais por ativo, marca e necessidade", async ({ page }) => {
  const results = async (q: string) => {
    await page.goto(`/produtos?q=${encodeURIComponent(q)}`);
    await page.locator("main article h3").filter({ visible: true }).first().waitFor();
    return page.locator("main article h3").filter({ visible: true }).allTextContents();
  };
  expect((await results("Centella")).join(" ")).toContain("Madagascar Centella Ampoule");
  expect((await results("Retinal")).join(" ")).toContain("Celimax The Vita A Retinal Shot");
  const medicube = await results("Medicube");
  expect(medicube.length).toBeGreaterThanOrEqual(3);
  expect(medicube.every((n) => n.startsWith("Medicube"))).toBe(true);
  expect((await results("Hidratação")).length).toBeGreaterThanOrEqual(3);
});

test("Expansão — categoria-mãe inclui subcategorias e URL antiga redireciona", async ({ page }) => {
  await page.goto("/categorias/seruns-e-ampolas");
  await expect(page.getByRole("navigation", { name: "Subcategorias" })).toBeVisible();
  await expect(page.locator("main article").filter({ hasText: "Madagascar Centella Ampoule", visible: true }).first()).toBeVisible();
  await page.goto("/categorias/discos-faciais");
  await expect(page).toHaveURL(/\/categorias\/tonicos-e-discos$/);
});

test("Expansão — “Em breve”: vitrine sem compra e venda bloqueada sem documentação", async ({ page }) => {
  await admin.goto("/admin/produtos?filtro=em-breve");
  await admin.locator("tr").filter({ hasText: "Mediheal Madecassoside Blemish Pad" }).locator('a[href^="/admin/produtos/"]').first().click();
  await expect(admin.getByLabel("Disponibilidade", { exact: true })).toHaveValue("coming_soon");

  // Trying to sell it without verified documentation is refused (form + database)
  await admin.getByLabel("Visibilidade").selectOption("published");
  await admin.getByLabel("Disponibilidade", { exact: true }).selectOption("in_stock");
  await admin.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(admin.getByText("Para liberar a venda, marque a documentação e a regularização como verificadas.")).toBeVisible();

  // Publish as "Em breve" (authorised showcase)
  await admin.getByLabel("Disponibilidade", { exact: true }).selectOption("coming_soon");
  await admin.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(admin.getByRole("status").filter({ hasText: "Produto salvo" })).toBeVisible();

  await page.goto("/produtos?disponibilidade=em-breve");
  const card = page.locator("article").filter({ hasText: "Mediheal Madecassoside", visible: true }).first();
  await expect(card).toContainText("Em breve");
  await expect(card.getByRole("button", { name: /Adicionar/ })).toHaveCount(0);

  await page.goto("/produtos/mediheal-madecassoside-blemish-pad");
  await expect(page.getByText("Este produto ainda não está disponível.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Adicionar ao carrinho" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Consultar previsão de chegada/ })).toHaveAttribute("href", /ainda%20n%C3%A3o%20est%C3%A1%20dispon%C3%ADvel/);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Em breve na MIVORA" })).toBeVisible();
});

test("Expansão — recomendações não combinam retinoide com esfoliante", async ({ page }) => {
  await page.goto("/produtos/celimax-the-vita-a-retinal-shot");
  await expect(page.getByRole("heading", { name: "Você também pode gostar" }).or(page.getByRole("heading", { name: "Complete seu ritual" })).first()).toBeVisible();
  const recommended = await page.locator("main section article h3").allTextContents();
  expect(recommended.join(" ")).not.toContain("Zero Pore Pad");
  expect(recommended.join(" ")).not.toContain("Numbuzin");
});

test("Expansão — importação de catálogo é simulada sem gravar e é idempotente", async () => {
  await admin.goto("/admin/produtos/importar");
  await admin.getByLabel("…ou cole o conteúdo").fill("slug;volume;categorias\nmedicube-collagen-jelly-cream;110 ml;hidratantes-em-gel\nproduto-inexistente-sem-marca;;");
  await admin.getByRole("button", { name: "Processar planilha" }).click();
  await expect(admin.getByText(/Simulação concluída: 1 linhas válidas, 1 com erro/)).toBeVisible();
  await expect(admin.locator("td").filter({ hasText: "marca obrigatória" })).toBeVisible();
});

test("Expansão — painel mostra status explícitos e todos os cadastros", async () => {
  await admin.goto("/admin/produtos");
  await expect(admin.locator("tbody tr").filter({ hasText: /MV\d{4}/ })).toHaveCount(64); // 63 + produto criado no Teste 1
  await admin.goto("/admin/produtos?filtro=avaliacao");
  await expect(admin.locator("tbody tr").filter({ hasText: "Em avaliação" })).toHaveCount(6);
});

// ---------------------------------------------------------------------------
// New logo, welcome intro and first-purchase coupon
// ---------------------------------------------------------------------------
test("Boas-vindas — apresentação na primeira visita e cupom de 10% aplicado no pedido", async ({ browser }) => {
  // A first-time visitor: empty storage (no "intro seen" flag)
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  let whatsappUrl = "";
  await ctx.route("https://wa.me/**", async (route) => {
    whatsappUrl = route.request().url();
    await route.fulfill({ status: 200, body: "whatsapp" });
  });

  await page.goto("/");
  const intro = page.getByRole("dialog", { name: "Bem-vinda à MIVORA" });
  await expect(intro).toBeVisible();
  await expect(intro).toContainText("10% OFF");
  await expect(intro).toContainText("BEMVINDA10");
  await intro.getByRole("button", { name: "Quero meu desconto" }).click();
  await expect(intro).toBeHidden();
  await page.reload();
  await expect(page.getByRole("dialog", { name: "Bem-vinda à MIVORA" })).toHaveCount(0);
  await expect(page.getByText("10% OFF na primeira compra · cupom BEMVINDA10").first()).toBeVisible();

  await page.goto("/produtos/skin1004-madagascar-centella-ampoule");
  await page.getByRole("button", { name: "Adicionar ao carrinho" }).click();
  await page.goto("/finalizar");
  await expect(page.getByText("BEMVINDA10", { exact: true })).toBeVisible();
  await expect(page.getByText(/Desconto \(BEMVINDA10\)/)).toBeVisible();
  await page.getByRole("button", { name: "Finalizar pelo WhatsApp" }).click();
  await expect.poll(() => whatsappUrl, { timeout: 15_000 }).toContain("https://wa.me/");
  const message = decodeURIComponent(whatsappUrl.split("text=")[1]);
  expect(message).toContain("*Cupom:* BEMVINDA10 (10% na primeira compra)");
  expect(message).toContain("*Total com desconto:*");
  await ctx.close();
});

// ---------------------------------------------------------------------------
// Catálogo MIVORA 2026
// ---------------------------------------------------------------------------
test("Catálogo — produto 'Sob consulta' mostra foto e 'Consultar preço', sem carrinho", async ({ page }) => {
  await page.goto("/produtos/olaplex-no3-hair-perfector");
  await expect(page.getByRole("heading", { name: "Olaplex Nº 3 Hair Perfector" })).toBeVisible();
  await expect(page.getByText("Consultar preço").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Adicionar ao carrinho" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Consultar preço pelo WhatsApp/ })).toHaveAttribute("href", /saber%20o%20pre%C3%A7o/);
  await expect(page.locator('main img[src*="olaplex-no3-hair-perfector"]').first()).toBeVisible();

  await page.goto("/categorias/cuidados-capilares");
  await expect(page.getByRole("navigation", { name: "Subcategorias" })).toContainText("Shampoos");
  const card = page.locator("article").filter({ hasText: "Kérastase Elixir Ultime", visible: true }).first();
  await expect(card).toContainText("Sob consulta");
  await expect(card).toContainText("Consultar preço");
});

// ---------------------------------------------------------------------------
// Calculadora de frete (Melhor Envio e ViaCEP substituídos por dublês locais)
// ---------------------------------------------------------------------------
test("Frete — admin configura origem e zona por CEP; cliente calcula no produto e finaliza com o frete escolhido", async ({ browser }) => {
  await admin.goto("/admin/configuracoes");
  await admin.getByLabel("CEP de origem (de onde os pedidos saem)").fill("29010-000");
  await admin.getByLabel("Cotar Correios e transportadoras pelo Melhor Envio").check();
  await admin.getByRole("button", { name: "Salvar configurações" }).click();
  await expect(admin.getByText("Configurações salvas.")).toBeVisible();
  await admin.reload();
  await expect(admin.getByText(/Melhor Envio conectado.*2 serviços/)).toBeVisible();

  const newZone = admin.locator("form").filter({ has: admin.getByRole("button", { name: "Adicionar opção" }) });
  await newZone.locator('[name="name"]').fill("Entrega local — Grande Vitória");
  await newZone.locator('[name="fee"]').fill("12,00");
  await newZone.locator('[name="estimate"]').fill("1 dia útil");
  await newZone.locator('[name="cep_ranges"]').fill("29000-000 a 29099-999");
  await newZone.locator('[name="cities"]').fill("Vila Velha/ES");
  await newZone.getByRole("button", { name: "Adicionar opção" }).click();
  await expect(admin.getByText("Opção de entrega criada.")).toBeVisible();

  const ctx = await browser.newContext({ storageState: RETURNING_VISITOR });
  const page = await ctx.newPage();
  let whatsappUrl = "";
  await ctx.route("https://wa.me/**", async (route) => {
    whatsappUrl = route.request().url();
    await route.fulfill({ status: 200, body: "whatsapp" });
  });

  // Product page: São Paulo gets carrier quotes only (the local zone does not cover it)
  await page.goto("/produtos/skin1004-madagascar-centella-ampoule");
  const cep = page.getByLabel("Calcular frete e prazo");
  await cep.fill("01001-000");
  await expect(page.getByText("Sé · São Paulo/SP · CEP 01001-000")).toBeVisible();
  await expect(page.getByText("Correios PAC")).toBeVisible();
  await expect(page.getByText("R$ 27,00")).toBeVisible();
  await expect(page.getByText("Prazo estimado: 6 a 8 dias úteis")).toBeVisible();
  await expect(page.getByText("Correios SEDEX")).toBeVisible();
  await expect(page.getByText(".Package")).toHaveCount(0);
  await expect(page.getByText("Entrega local — Grande Vitória")).toHaveCount(0);

  // Vitória: the zone restricted to 29000-000…29099-999 appears with its fee
  await cep.fill("29055-100");
  await expect(page.getByText("Praia do Canto · Vitória/ES · CEP 29055-100")).toBeVisible();
  await expect(page.getByText("Entrega local — Grande Vitória")).toBeVisible();
  await expect(page.getByText("R$ 12,00")).toBeVisible();

  await cep.fill("99999-999");
  await expect(page.getByText("Não encontramos este CEP. Confira os números e tente de novo.")).toBeVisible();

  await cep.fill("01001-000");
  await expect(page.getByText("Correios SEDEX")).toBeVisible();
  await page.getByRole("button", { name: "Adicionar ao carrinho" }).click();

  // Checkout: the remembered CEP is quoted again; the visitor picks SEDEX
  await page.goto("/finalizar");
  const sedex = page.getByRole("radio", { name: /Correios SEDEX/ });
  await expect(sedex).toBeVisible();
  await expect(page.getByRole("button", { name: "Finalizar pelo WhatsApp" })).toBeDisabled();
  await sedex.check();
  await expect(page.getByText("Total estimado", { exact: true })).toBeVisible();
  await expect(page.getByText(brl(11990 + 4100)).first()).toBeVisible();
  await page.getByRole("button", { name: "Finalizar pelo WhatsApp" }).click();
  await expect.poll(() => whatsappUrl, { timeout: 15_000 }).toContain("https://wa.me/");
  const message = decodeURIComponent(whatsappUrl.split("text=")[1]);
  expect(message).toContain("*Entrega:* Envio (Correios SEDEX) — taxa estimada R$ 41,00 (sujeita a confirmação) — prazo estimado: 2 a 3 dias úteis — CEP 01001-000 (São Paulo/SP).");
  expect(message).toContain(`*Total estimado com entrega:* ${brl(11990 + 4100)}`);

  const code = message.match(/MIV-\d{6}/)![0];
  await admin.goto(`/admin/pedidos?q=${code}`);
  await admin.getByRole("link", { name: code }).click();
  await expect(admin.getByText("CEP 01001-000 (São Paulo/SP)")).toBeVisible();
  await expect(admin.getByText(/Envio · Correios SEDEX · R\$ 41,00 \(estimado\)/)).toBeVisible();
  await ctx.close();
});

// ---------------------------------------------------------------------------
// Home — carrossel de fotos
// ---------------------------------------------------------------------------
test("Home — carrossel: banner do mockup, fotos de campanha, setas, indicadores e pausa", async ({ page }) => {
  await page.goto("/");
  const carousel = page.getByRole("region", { name: "Destaques da MIVORA" });
  await expect(carousel.getByRole("heading", { level: 1, name: "Sua pele, seu ritual." })).toBeVisible();
  await expect(carousel.getByText("Beleza que cuida de você")).toBeVisible();
  await expect(carousel.getByRole("link", { name: /Explorar produtos/ })).toHaveAttribute("href", "/produtos");
  await expect(carousel.getByRole("img", { name: /PDRN Pink Peptide/i })).toBeVisible();

  await carousel.getByRole("button", { name: "Pausar a troca automática" }).click();
  await expect(carousel.getByRole("button", { name: "Retomar a troca automática" })).toBeVisible();
  await carousel.getByRole("button", { name: "Próximo destaque" }).click();
  await expect(carousel.getByRole("heading", { name: "Seu momento de autocuidado" })).toBeVisible();
  await expect(carousel.getByRole("img", { name: /aparelho facial de luz/ })).toBeVisible();

  await carousel.getByRole("button", { name: /Ir para o destaque 3/ }).click();
  await expect(carousel.getByRole("heading", { name: "Desperte seu glow com o cuidado noturno" })).toBeVisible();
  await expect(carousel.getByRole("link", { name: "Ver produto" })).toHaveAttribute("href", "/produtos/medicube-collagen-night-wrapping-mask");

  await carousel.getByRole("button", { name: /Ir para o destaque 4/ }).click();
  await expect(carousel.getByRole("heading", { name: "Poros limpos, pele lisa" })).toBeVisible();
  for (let i = 0; i < 4; i++) await carousel.getByRole("button", { name: "Destaque anterior" }).click();
  await expect(carousel.getByRole("heading", { name: "Glow de pele de vidro o dia todo" })).toBeVisible();

  await carousel.getByRole("button", { name: /Ir para o destaque 4/ }).click();
  await carousel.getByRole("link", { name: "Comprar agora" }).click();
  await expect(page).toHaveURL(/\/produtos\/medicube-zero-pore-pad$/);
});

test("Home premium — cabeçalho, busca, seções do mockup, produto em abas, newsletter e depoimentos reais", async ({ page }) => {
  await page.goto("/");
  // header: thin bar, search in the middle, account / favourites / cart, compact navigation
  await expect(page.getByText("Atendimento via WhatsApp").first()).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Principal" });
  for (const label of ["Início", "Todos os produtos", "Marcas", "Cuidados com a pele", "Novidades", "Contato"]) await expect(nav.getByRole("link", { name: label, exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Buscar produtos" }).fill("centella");
  await expect(page.getByRole("link", { name: /Madagascar Centella Ampoule/ }).first()).toBeVisible();
  await page.getByRole("combobox", { name: "Buscar produtos" }).press("Enter");
  await expect(page).toHaveURL(/\/produtos\?q=centella/);
  await page.getByRole("link", { name: "Minha conta" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Minha conta" })).toBeVisible();

  // home sections in the order of the mockup, with real data
  await page.goto("/");
  // the benefits strip was removed at the owner's request
  await expect(page.getByText("Produtos originais")).toHaveCount(0);
  const headings = await page.locator("main h2").filter({ visible: true }).allTextContents();
  const order = ["Novidades MIVORA", "Descubra por marca", "Rotinas de Skincare", "Cuidados para cada necessidade"].map((t) => headings.findIndex((h) => h.includes(t)));
  expect(order.every((i) => i >= 0)).toBe(true);
  expect([...order].sort((a, b) => a - b)).toEqual(order);
  expect(await page.getByRole("list", { name: "Novidades MIVORA" }).locator("article").count()).toBe(4);
  await expect(page.getByRole("link", { name: "Medicube", exact: true }).first()).toHaveAttribute("href", "/marcas/medicube");
  await expect(page.getByRole("link", { name: /Ver rotinas/ })).toHaveAttribute("href", "/ritual");
  await expect(page.getByRole("heading", { name: "O que nossos clientes dizem" })).toHaveCount(0);
  await page.getByRole("link", { name: "Poros e textura" }).click();
  await expect(page).toHaveURL(/\/categorias\/poros-e-oleosidade$/);
  await expect(page.getByRole("heading", { level: 1, name: "Poros e textura" })).toBeVisible();
  expect(await page.locator("main article").count()).toBeGreaterThan(0);

  // product page: information in tabs, only from the product's own data
  await page.goto("/produtos/dr-althea-345-relief-cream");
  await expect(page.getByRole("tab", { name: "Descrição" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Como usar" }).click();
  await expect(page.getByRole("tabpanel")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Como usar" })).toHaveAttribute("aria-selected", "true");

  // newsletter in the footer (stored only through the database function)
  const email = `e2e-${Date.now()}@exemplo.com.br`;
  await page.getByLabel("Receba novidades e lançamentos").fill(email);
  await page.getByRole("button", { name: "Inscrever-se" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Inscrição confirmada" })).toBeVisible();
  await admin.goto("/admin/newsletter");
  await expect(admin.getByText(email)).toBeVisible();

  // testimonials: never published without the customer's authorisation, shown once published
  await admin.goto("/admin/depoimentos");
  const form = admin.locator("form").filter({ has: admin.getByRole("button", { name: "Cadastrar depoimento" }) });
  await form.getByLabel("Nome ou identificação autorizada").fill("Cliente E2E");
  await form.getByLabel("Depoimento", { exact: true }).fill("Atendimento atencioso e entrega combinada certinho.");
  await form.getByLabel("Publicar na home (seção “O que nossos clientes dizem”)").check();
  await form.getByRole("button", { name: "Cadastrar depoimento" }).click();
  await expect(admin.getByText(/confirme que o depoimento é real/)).toBeVisible();
  await form.getByLabel(/Confirmo que este depoimento é real/).check();
  await form.getByRole("button", { name: "Cadastrar depoimento" }).click();
  await expect(admin.getByText("Depoimento cadastrado.")).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "O que nossos clientes dizem" })).toBeVisible();
  await expect(page.getByText("“Atendimento atencioso e entrega combinada certinho.”")).toBeVisible();

  // campaign banners are managed in the admin: deactivating "Em breve" hides it
  await admin.goto("/admin/conteudo");
  const soon = admin.locator("form").filter({ has: admin.locator('input[name="title"][value="Em breve na MIVORA"]') });
  await soon.getByLabel("Ativo").uncheck();
  await soon.getByRole("button", { name: "Salvar banner" }).click();
  await expect(admin.getByText("Banner salvo.").first()).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Em breve na MIVORA" })).toHaveCount(0);
});
