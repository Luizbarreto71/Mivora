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
  for (const url of ["/", "/produtos", "/produtos/dr-althea-345-relief-cream", "/carrinho", "/ritual"]) {
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
  await page.goto("/produtos/medicube-collagen-jelly-cream");
  await expect(page.getByText("Página não encontrada").or(page.locator("title", { hasText: "Produto não encontrado" })).first()).toBeAttached();
  await page.goto("/produtos?q=collagen%20jelly");
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
  await admin.locator("tr").filter({ hasText: "Anua Heartleaf 77% Soothing Toner" }).locator('a[href^="/admin/produtos/"]').first().click();
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
  const card = page.locator("article").filter({ hasText: "Anua Heartleaf", visible: true }).first();
  await expect(card).toContainText("Em breve");
  await expect(card.getByRole("button", { name: /Adicionar/ })).toHaveCount(0);

  await page.goto("/produtos/anua-heartleaf-77-soothing-toner");
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

test("Expansão — painel mostra status explícitos e os 29 cadastros", async () => {
  await admin.goto("/admin/produtos");
  await expect(admin.locator("tbody tr").filter({ hasText: /MV\d{4}/ })).toHaveCount(30); // 29 + produto criado no Teste 1
  await admin.goto("/admin/produtos?filtro=avaliacao");
  await expect(admin.locator("tbody tr").filter({ hasText: "Em avaliação" })).toHaveCount(8);
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
  await expect(page.getByText(/Novas clientes ganham 10% OFF/)).toBeVisible();

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
