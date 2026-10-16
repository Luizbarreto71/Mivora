import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import path from "node:path";
import sharp from "sharp";
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

let customerSeq = 0;
const CPF = "52998224725";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/** Checkout step 2: the buyer's data, as a new customer. */
async function fillIdentity(page: Page, name = "Cliente Teste", cpf = CPF) {
  customerSeq += 1;
  const email = `cliente${Date.now()}${customerSeq}@exemplo.com.br`;
  const [first, ...last] = name.split(" ");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Primeiro nome").fill(first);
  await page.getByLabel("Sobrenome").fill(last.join(" ") || "Teste");
  await page.getByLabel("CPF", { exact: true }).fill(cpf);
  await page.getByLabel("Telefone com DDD").fill(`(11) 9${String(Date.now()).slice(-4)}-${String(1000 + customerSeq).slice(-4)}`);
  return email;
}

/** Checkout step 2: the address comes from the CEP (local ViaCEP double); then the number and, optionally, the delivery option. */
async function fillAddress(page: Page, option?: RegExp, cep = "01001-000") {
  const field = page.getByLabel("CEP", { exact: true });
  if ((await field.inputValue()) !== cep) await field.fill(cep);
  await expect(page.getByText(/^Endereço identificado:/)).toBeVisible();
  const street = page.getByLabel("Rua", { exact: true });
  if (!(await street.inputValue())) await street.fill("Rua das Flores");
  await page.getByLabel("Número", { exact: true }).fill("100");
  if (option) await page.getByRole("radio", { name: option }).check();
}

async function toPayment(page: Page) {
  await page.getByRole("button", { name: "Continuar para o pagamento" }).click();
  await expect(page.getByRole("heading", { name: "Pagamento", exact: true })).toBeVisible();
}

async function toReview(page: Page) {
  await page.getByRole("button", { name: "Continuar para a revisão" }).click();
  await expect(page.getByRole("heading", { name: "Revise seu pedido" })).toBeVisible();
}

/** Reads the local database with the service key (only the local stack runs these tests). */
async function serviceGet(request: APIRequestContext, query: string) {
  const r = await request.get(`${SUPABASE_URL}/rest/v1/${query}`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
  expect(r.ok()).toBe(true);
  return r.json();
}

async function setOnlinePayment(on: boolean) {
  await admin.goto("/admin/configuracoes");
  const box = admin.getByLabel("Oferecer pagamento pelo site (Pix, cartão e boleto)");
  if (on) await box.check();
  else await box.uncheck();
  await admin.getByRole("button", { name: "Salvar configurações" }).click();
  await expect(admin.getByText("Configurações salvas.")).toBeVisible();
}

/** "Continuar com Google/Apple" → the local OAuth simulator (never the real providers) → back to the store. */
async function socialLogin(page: Page, provider: "Google" | "Apple", email: string, name: string) {
  await page.getByRole("button", { name: `Continuar com ${provider}` }).click();
  await expect(page.getByRole("heading", { name: `Login com ${provider} — simulador local` })).toBeVisible();
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Nome").fill(name);
  await page.getByRole("button", { name: "Autorizar" }).click();
  await expect(page.getByText(/Pronto, você entrou na sua conta/)).toBeVisible();
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
  await admin.getByLabel("E-mail", { exact: true }).fill(ADMIN_EMAIL);
  await admin.getByLabel("Senha").fill(ADMIN_PASSWORD);
  await admin.getByRole("button", { name: "Entrar" }).click();
  await expect(admin.getByRole("heading", { name: "Painel" })).toBeVisible();

  await admin.goto("/admin/configuracoes");
  await admin.getByLabel("Número do WhatsApp da loja").fill("11 91234-5678");
  // the skin-analysis pop-up opens on every load by default (interval 0); the suite uses 7 days so returning
  // visitors who already closed it are not interrupted — the pop-up tests switch the modes explicitly
  await admin.getByLabel("Intervalo do pop-up (dias)").fill("7");
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
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sacola (6 itens)");

  // Teste 13: survives reloads
  await page.reload();
  await expect(page.getByText(brl(expected)).first()).toBeVisible();

  // Step 1 → 2 (identification and delivery): nothing moves on without the buyer's data
  await page.getByRole("link", { name: "Continuar para identificação" }).click();
  await expect(page).toHaveURL(/\/finalizar\?etapa=identificacao$/);
  await expect(page.getByRole("navigation", { name: "Etapas da compra" }).locator('[aria-current="step"]')).toContainText("Identificação e entrega");
  await page.getByRole("button", { name: "Continuar para o pagamento" }).click();
  await expect(page.getByText("Digite um e-mail válido, ex.: nome@exemplo.com.br.")).toBeVisible();
  await expect(page.getByLabel("E-mail", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await fillIdentity(page);
  // without carriers (Melhor Envio is set up later) the only option for the CEP, "Entrega a combinar", comes selected and needs no address
  await page.getByLabel("CEP", { exact: true }).fill("01001-000");
  await expect(page.getByRole("radio", { name: /Entrega a combinar/ })).toBeChecked();
  await expect(page.getByLabel("Número", { exact: true })).toBeVisible();
  await toPayment(page);
  // online payment is off: the order goes to the team on WhatsApp
  await expect(page.getByRole("radio", { name: /^Combinar pelo WhatsApp/ })).toBeChecked();
  await expect(page.getByRole("radio", { name: /^Pix/ })).toHaveCount(0);
  await toReview(page);
  await page.getByRole("button", { name: "Confirmar e enviar pelo WhatsApp" }).click();
  await expect.poll(() => whatsappUrl, { timeout: 15_000 }).toContain("https://wa.me/5511912345678?text=");

  const message = decodeURIComponent(whatsappUrl.split("text=")[1]);
  expect(message).toContain("Gostaria de fazer um pedido pelo site.");
  expect(message).toContain("Quantidade: 2");
  expect(message).toContain("Quantidade: 3");
  expect(message).toContain(brl(11990));
  expect(message).toContain(brl(15900));
  expect(message).toContain(`*Subtotal dos produtos:* ${brl(expected)}`);
  expect(message).toContain("*Entrega:* a combinar — CEP 01001-000 (São Paulo/SP).");
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
  // getByText also sees the hidden copy React may leave from streaming right after a revalidation
  await expect(page.getByText("Este produto ainda não está disponível.").filter({ visible: true })).toBeVisible();
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
  await fillIdentity(page, "Nova Cliente");
  await page.getByLabel("CEP", { exact: true }).fill("01001-000");
  await expect(page.getByRole("radio", { name: /Entrega a combinar/ })).toBeChecked();
  await toPayment(page);
  await toReview(page);
  await expect(page.getByRole("region", { name: "Revise seu pedido" })).toContainText("Desconto (BEMVINDA10)");
  await page.getByRole("button", { name: "Confirmar e enviar pelo WhatsApp" }).click();
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
  const cep = page.getByLabel("Calcular frete e prazo").filter({ visible: true });
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

  // Cart: the remembered CEP is quoted, the visitor picks SEDEX and sees it in the total
  await page.goto("/carrinho");
  await page.getByRole("radio", { name: /Correios SEDEX/ }).check();
  await expect(page.getByText("Total estimado", { exact: true })).toBeVisible();
  await expect(page.getByText(brl(11990 + 4100)).first()).toBeVisible();

  // Checkout: the CEP fills the address, SEDEX comes pre-selected and the fee is in the total
  await page.getByRole("link", { name: "Continuar para identificação" }).click();
  await fillIdentity(page);
  await expect(page.getByLabel("CEP", { exact: true })).toHaveValue("01001-000");
  await expect(page.getByLabel("Rua", { exact: true })).toHaveValue("Praça da Sé");
  await expect(page.getByLabel("Bairro")).toHaveValue("Sé");
  await expect(page.getByLabel("Cidade")).toHaveValue("São Paulo");
  await expect(page.getByLabel("Estado")).toHaveValue("SP");
  await expect(page.getByLabel("Nome de quem vai receber")).toHaveValue("Cliente Teste");
  const sedex = page.getByRole("radio", { name: /Correios SEDEX/ });
  await expect(sedex).toBeChecked();
  await expect(page.getByRole("complementary", { name: "Resumo do pedido" }).getByText("Total estimado", { exact: true })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Resumo do pedido" }).getByText(brl(11990 + 4100)).filter({ visible: true })).toBeVisible();
  // a delivery needs the house number
  await page.getByRole("button", { name: "Continuar para o pagamento" }).click();
  await expect(page.getByText("Informe o número (ou S/N).")).toBeVisible();
  await page.getByLabel("Número", { exact: true }).fill("100");
  await page.getByLabel("Complemento (opcional)").fill("Apto 12");
  await toPayment(page);
  await toReview(page);
  const review = page.getByRole("region", { name: "Revise seu pedido" });
  await expect(review).toContainText("Praça da Sé, 100 · Apto 12");
  await expect(review).toContainText("Correios SEDEX · R$ 41,00 · prazo estimado: 2 a 3 dias úteis");
  await page.getByRole("button", { name: "Confirmar e enviar pelo WhatsApp" }).click();
  await expect.poll(() => whatsappUrl, { timeout: 15_000 }).toContain("https://wa.me/");
  const message = decodeURIComponent(whatsappUrl.split("text=")[1]);
  expect(message).toContain("*Entrega:* Envio (Correios SEDEX) — taxa estimada R$ 41,00 (sujeita a confirmação) — prazo estimado: 2 a 3 dias úteis — CEP 01001-000 (São Paulo/SP).");
  expect(message).toContain(`*Total estimado com entrega:* ${brl(11990 + 4100)}`);

  const code = message.match(/MIV-\d{6}/)![0];
  await admin.goto(`/admin/pedidos?q=${code}`);
  await admin.getByRole("link", { name: code }).click();
  await expect(admin.getByText("CEP 01001-000 (São Paulo/SP)")).toBeVisible();
  await expect(admin.getByText(/Envio · Correios SEDEX · R\$ 41,00 \(estimado\)/)).toBeVisible();
  await expect(admin.getByText("Praça da Sé, 100 · Apto 12")).toBeVisible();
  await ctx.close();
});

// ---------------------------------------------------------------------------
// Home — carrossel de fotos
// ---------------------------------------------------------------------------
test("Home — carrossel: banner do mockup, artes autorais da MIVORA, setas, indicadores e pausa", async ({ page }) => {
  await page.goto("/");
  const carousel = page.getByRole("region", { name: "Destaques da MIVORA" });
  await expect(carousel.getByRole("heading", { level: 1, name: "Sua pele, seu ritual." })).toBeVisible();
  await expect(carousel.getByText("Beleza que cuida de você")).toBeVisible();
  await expect(carousel.getByRole("link", { name: /Explorar produtos/ })).toHaveAttribute("href", "/produtos");
  await expect(carousel.getByRole("img", { name: /PDRN Pink Peptide/i })).toBeVisible();

  await carousel.getByRole("button", { name: "Pausar a troca automática" }).click();
  await expect(carousel.getByRole("button", { name: "Retomar a troca automática" })).toBeVisible();

  // the owner's own art (logo inside the image) is shown whole and the banner itself is the link
  await carousel.getByRole("button", { name: "Próximo destaque" }).click();
  await expect(carousel.getByRole("heading", { name: "Seu momento de autocuidado" })).toBeAttached();
  await expect(carousel.getByRole("img", { name: /sérum com conta-gotas/ })).toBeVisible();
  await expect(carousel.getByRole("link", { name: /Seu momento de autocuidado/ })).toHaveAttribute("href", "/produtos");

  await carousel.getByRole("button", { name: /Ir para o destaque 5/ }).click();
  await expect(carousel.getByRole("img", { name: /máscara transparente/ })).toBeVisible();
  await expect(carousel.getByRole("link", { name: /Desperte seu glow com o cuidado noturno/ })).toHaveAttribute("href", "/produtos/medicube-collagen-night-wrapping-mask");
  await carousel.getByRole("button", { name: "Próximo destaque" }).click();
  await expect(carousel.getByRole("heading", { level: 1, name: "Sua pele, seu ritual." })).toBeVisible();
  await carousel.getByRole("button", { name: "Destaque anterior" }).click();
  await carousel.getByRole("button", { name: "Destaque anterior" }).click();
  await expect(carousel.getByRole("img", { name: /textura em gel/ })).toBeVisible();

  await carousel.getByRole("button", { name: /Ir para o destaque 3/ }).click();
  await carousel.getByRole("link", { name: /Hidratação que deixa a pele macia/ }).click();
  await expect(page).toHaveURL(/\/categorias\/hidratantes$/);
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

// ---------------------------------------------------------------------------
// Cadastro obrigatório (captação de leads)
// ---------------------------------------------------------------------------
test("Cadastro — obrigatório para comprar, lembrado no aparelho, visível em Clientes no painel", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: RETURNING_VISITOR });
  const page = await ctx.newPage();
  let whatsappUrl = "";
  await ctx.route("https://wa.me/**", async (route) => {
    whatsappUrl = route.request().url();
    await route.fulfill({ status: 200, body: "whatsapp" });
  });

  // "Comprar pelo WhatsApp" on the product page goes through the checkout
  await page.goto("/produtos/dr-althea-345-relief-cream");
  await page.getByRole("button", { name: "Comprar pelo WhatsApp" }).click();
  await expect(page).toHaveURL(/\/finalizar$/);
  await expect(page.getByRole("heading", { name: "Seus dados" })).toBeVisible();

  // validation, next to each field
  await page.getByLabel("E-mail", { exact: true }).fill("helena@");
  await page.getByLabel("Primeiro nome").fill("Helena");
  await page.getByLabel("Sobrenome").fill("Prado");
  await page.getByLabel("CPF", { exact: true }).fill("111.111.111-11");
  await page.getByLabel("Telefone com DDD").fill("1234");
  await page.getByRole("button", { name: "Continuar para o pagamento" }).click();
  await expect(page.getByText("Digite um e-mail válido, ex.: nome@exemplo.com.br.")).toBeVisible();
  await expect(page.getByText("CPF inválido. Confira os números.")).toBeVisible();
  await expect(page.getByText("Digite um telefone com DDD, ex.: (11) 91234-5678.")).toBeVisible();
  await expect(page.getByText("Informe o CEP para calcular a entrega.")).toBeVisible();
  await expect(page.getByLabel("E-mail", { exact: true })).toBeFocused();

  // valid data (with masks) and marketing opt-in
  const email = `helena${Date.now()}@exemplo.com.br`;
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("CPF", { exact: true }).fill("52998224725");
  await expect(page.getByLabel("CPF", { exact: true })).toHaveValue("529.982.247-25");
  await page.getByLabel("Telefone com DDD").fill("27998765432");
  await expect(page.getByLabel("Telefone com DDD")).toHaveValue("(27) 99876-5432");
  await page.getByLabel(/Quero receber novidades/).check();
  await fillAddress(page, /Correios PAC/);
  await toPayment(page);
  await toReview(page);
  const review = page.getByRole("region", { name: "Revise seu pedido" });
  await expect(review).toContainText("Helena Prado");
  await expect(review).toContainText("(27) 99876-5432 · CPF ***.***.247-25");
  await page.getByRole("button", { name: "Confirmar e enviar pelo WhatsApp" }).click();
  await expect.poll(() => whatsappUrl, { timeout: 15_000 }).toContain("https://wa.me/");
  expect(decodeURIComponent(whatsappUrl.split("text=")[1])).toContain("Helena Prado");

  // remembered on this device
  await page.goto("/minha-conta");
  await expect(page.getByText("Helena Prado")).toBeVisible();
  await expect(page.getByText("Recebe novidades e ofertas")).toBeVisible();

  // the lead is in the admin, with consent, linked to the order; also in the newsletter list
  await admin.goto(`/admin/clientes?q=${encodeURIComponent(email)}`);
  const row = admin.locator("tr").filter({ hasText: email });
  await expect(row).toContainText("Helena Prado");
  await expect(row).toContainText("(27) 99876-5432");
  await expect(row).toContainText("Sim");
  await expect(row).toContainText("1");
  await admin.goto("/admin/newsletter");
  await expect(admin.getByText(email)).toBeVisible();

  // "Minha conta" also registers without buying
  const other = await browser.newContext({ storageState: RETURNING_VISITOR });
  const visitor = await other.newPage();
  await visitor.goto("/minha-conta");
  await visitor.getByLabel("Nome completo").fill("Iara Mendes");
  await visitor.getByLabel("WhatsApp com DDD").fill("(31) 98888-1234");
  const iara = `iara${Date.now()}@exemplo.com.br`;
  await visitor.getByLabel("E-mail", { exact: true }).fill(iara);
  await visitor.getByRole("button", { name: "Fazer cadastro" }).click();
  await expect(visitor.getByText("Iara Mendes")).toBeVisible();
  await admin.goto(`/admin/clientes?q=${encodeURIComponent(iara)}`);
  await expect(admin.locator("tr").filter({ hasText: iara })).toContainText("Não");
  await other.close();
  await ctx.close();
});


// ---------------------------------------------------------------------------
// Pagamento online — Mercado Pago Checkout Pro (simulador local, nunca o Mercado Pago real)
// ---------------------------------------------------------------------------
test("Pagamento online — Pix com QR Code aprovado pelo webhook, clique duplo sem pedido duplicado, cartão recusado e aprovado no mesmo pedido, Mercado Pago", async ({ browser, request }) => {
  const MP = "http://localhost:54321/mercadopago";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const receipt = async (id: string) => {
    const r = await request.post(`${SUPABASE_URL}/rest/v1/rpc/get_order_receipt`, { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` }, data: { p_order_id: id } });
    return (await r.json()) as { status: string; payment_status: string; payment_type: string | null; amount_paid_cents: number | null };
  };
  const total = 11990 + 4100;

  // Admin: credentials detected, online payment switched on; the card form needs the public key
  await admin.goto("/admin/configuracoes");
  await expect(admin.getByText(/Conectado ao Mercado Pago \(conta MIVORA-TESTE\) — credencial de TESTE/)).toBeVisible();
  await expect(admin.getByText("Chave de serviço do Supabase configurada (registra os pagamentos aprovados).")).toBeVisible();
  await expect(admin.getByText(/Assinatura dos avisos do Mercado Pago verificada/)).toBeVisible();
  await admin.getByLabel("Oferecer pagamento pelo site (Pix, cartão e boleto)").check();
  await admin.getByLabel("Parcelamento máximo no cartão").selectOption("6");
  await admin.getByLabel("Public Key do Mercado Pago").fill("TEST-00000000-0000-4000-8000-000000000001");
  await admin.getByRole("button", { name: "Salvar configurações" }).click();
  await expect(admin.getByText("Configurações salvas.")).toBeVisible();

  const ctx = await browser.newContext({ storageState: RETURNING_VISITOR });
  const page = await ctx.newPage();

  // Product page → "Comprar agora" → checkout
  await page.goto("/produtos/skin1004-madagascar-centella-ampoule");
  await expect(page.getByText(/Pague pelo site com Pix, cartão ou boleto/).filter({ visible: true }).first()).toBeVisible();
  await page.getByLabel("Calcular frete e prazo").filter({ visible: true }).fill("01001-000");
  await expect(page.getByText("Correios SEDEX")).toBeVisible();
  await page.getByRole("button", { name: "Comprar agora" }).click();
  await expect(page).toHaveURL(/\/finalizar$/);
  await expect(page.getByRole("heading", { name: "Finalizar compra" })).toBeVisible();
  const email = await fillIdentity(page, "Bruna Online");
  await fillAddress(page);

  // a delivery "a combinar" has no price: paying on the site needs a defined fee
  await page.getByRole("radio", { name: /Entrega a combinar|Combinar a entrega/ }).check();
  await toPayment(page);
  await expect(page.getByText("Para pagar pelo site, escolha uma entrega com valor definido.")).toBeVisible();
  await expect(page.getByRole("radio", { name: /^Pix/ })).toHaveCount(0);
  await expect(page.getByRole("radio", { name: /^Combinar pelo WhatsApp/ })).toBeChecked();
  await page.getByRole("button", { name: "Voltar para identificação e entrega" }).click();
  await page.getByRole("radio", { name: /Correios SEDEX/ }).check();
  await toPayment(page);
  for (const method of [/^Pix/, /^Cartão de crédito/, /^Boleto ou saldo no Mercado Pago/, /^Combinar pelo WhatsApp/]) await expect(page.getByRole("radio", { name: method })).toBeVisible();
  await page.getByRole("radio", { name: /^Pix/ }).check();
  await expect(page.getByRole("complementary", { name: "Resumo do pedido" }).getByText("Total a pagar", { exact: true })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Resumo do pedido" }).getByText(brl(total)).filter({ visible: true })).toBeVisible();
  await toReview(page);
  await expect(page.getByRole("region", { name: "Revise seu pedido" })).toContainText(`Valor final${brl(total)}`);

  // A double click on "confirm" registers a single order with a single Pix
  await page.getByRole("button", { name: "Confirmar e gerar o Pix" }).dblclick();
  await expect(page).toHaveURL(/\/pedido\/[0-9a-f-]{36}$/);
  const orderId = page.url().match(/pedido\/([0-9a-f-]{36})/)![1];
  const code = (await page.getByRole("heading", { level: 1 }).textContent())!.trim();
  expect(code).toMatch(/^MIV-\d{6}$/);
  await expect(page.getByText("Aguardando pagamento").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByRole("img", { name: "QR Code do Pix" })).toBeVisible();
  await expect(page.getByLabel("Pix copia e cola")).toHaveValue(/^00020126/);
  await expect(page.getByRole("button", { name: "Copiar código Pix" })).toBeVisible();
  await expect(page.getByText(/O código vale até \d{2}:\d{2}/).filter({ visible: true }).first()).toBeVisible();

  const [order] = await serviceGet(request, `order_intents?id=eq.${orderId}&select=payment_id,payment_status,payment_type,customer_cpf,shipping_recipient,shipping_street,shipping_number,amount_due_cents`);
  expect(order).toMatchObject({ payment_status: "pending", payment_type: "bank_transfer", customer_cpf: CPF, shipping_recipient: "Bruna Online", shipping_street: "Praça da Sé", shipping_number: "100", amount_due_cents: total });
  expect(await serviceGet(request, `customers?email=eq.${encodeURIComponent(email)}&select=orders_count`)).toEqual([{ orders_count: 1 }]);

  // The Pix is paid: Mercado Pago's signed notification alone confirms the order
  const approved = await request.post(`${MP}/test/payments/${order.payment_id}/approve`);
  expect((await approved.json()).webhook).toBe(200);
  expect(await receipt(orderId)).toMatchObject({ status: "confirmed", payment_status: "approved", payment_type: "bank_transfer", amount_paid_cents: total });
  await page.reload();
  await expect(page.getByText("Pagamento aprovado").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText(`Recebemos o pagamento de ${brl(total)} (Pix). Seu pedido está confirmado`, { exact: false }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("Próximos passos").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByLabel("Pix copia e cola")).toHaveCount(0);

  // Forged notifications are refused
  const forged = await request.post(`/api/mercadopago/webhook?data.id=${order.payment_id}&type=payment`, {
    headers: { "x-signature": `ts=1,v1=${"0".repeat(64)}`, "x-request-id": "forjado" },
    data: { type: "payment", data: { id: order.payment_id } },
  });
  expect(forged.status()).toBe(401);

  // The cart was emptied and the order is in "Minha conta" with its page
  await page.goto("/minha-conta");
  await expect(page.getByText(code)).toBeVisible();
  await page.getByRole("link", { name: "Ver pedido e pagamento" }).first().click();
  await expect(page.getByText("Pagamento aprovado").filter({ visible: true }).first()).toBeVisible();

  // Admin: payment card, confirmed order, address and CPF for the invoice
  await admin.goto(`/admin/pedidos?q=${code}`);
  await expect(admin.getByText("Pago · online")).toBeVisible();
  await admin.getByRole("link", { name: code }).click();
  await expect(admin.getByRole("heading", { name: "Pagamento online" })).toBeVisible();
  await expect(admin.getByText("Valor pago")).toBeVisible();
  await expect(admin.getByText("Pix", { exact: true })).toBeVisible();
  await expect(admin.getByText(/Pedido confirmado automaticamente/)).toBeVisible();
  await expect(admin.getByText("Endereço de entrega")).toBeVisible();
  await expect(admin.getByText("529.982.247-25")).toBeVisible();

  // Second order: the card is refused, then another card is approved — on the same order
  await page.goto("/produtos/skin1004-madagascar-centella-ampoule");
  await page.getByRole("button", { name: "Comprar agora" }).click();
  // the buyer's data is remembered on this device
  await expect(page.getByLabel("E-mail", { exact: true })).toHaveValue(email);
  await expect(page.getByLabel("CPF", { exact: true })).toHaveValue("529.982.247-25");
  await fillAddress(page, /Correios SEDEX/);
  await toPayment(page);
  await page.getByRole("radio", { name: /^Cartão de crédito/ }).check();
  const brick = page.locator('[data-mp-brick="cardPayment"]');
  const typeCard = async (number: string) => {
    await brick.getByLabel("Número do cartão").fill(number);
    await brick.getByLabel("Nome do titular").fill("BRUNA ONLINE");
    await brick.getByLabel("Validade").fill("12/30");
    await brick.getByLabel("Código de segurança").fill("123");
  };
  // incomplete card data does not move on
  await page.getByRole("button", { name: "Continuar para a revisão" }).click();
  await expect(page.getByText("Confira os dados do cartão para continuar.")).toBeVisible();
  await typeCard("4000 0000 0000 0002");
  await brick.getByLabel("Parcelas").selectOption("3");
  await toReview(page);
  await expect(page.getByText("Visa final 0002 · 3x")).toBeVisible();
  await page.getByRole("button", { name: `Confirmar e pagar ${brl(total)}` }).click();
  // back on the card form with the reason; the refused card has to be replaced
  await expect(page.getByRole("heading", { name: "Pagamento", exact: true })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "O cartão não tem limite suficiente. Tente outro cartão ou pague com Pix." })).toBeVisible();
  await typeCard("5031 4332 1540 6351");
  await toReview(page);
  await expect(page.getByText("Mastercard final 6351 · à vista")).toBeVisible();
  await page.getByRole("button", { name: `Confirmar e pagar ${brl(total)}` }).click();
  await expect(page).toHaveURL(/\/pedido\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Pagamento aprovado").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText(/\(Cartão de crédito Mastercard\)\. Seu pedido está confirmado/).filter({ visible: true }).first()).toBeVisible();
  expect(await serviceGet(request, `customers?email=eq.${encodeURIComponent(email)}&select=orders_count`)).toEqual([{ orders_count: 2 }]);

  // Third order: boleto / Mercado Pago balance on Mercado Pago's page; refused, then paid from the order page
  await page.goto("/produtos/skin1004-madagascar-centella-ampoule");
  await page.getByRole("button", { name: "Comprar agora" }).click();
  await fillAddress(page, /Correios SEDEX/);
  await toPayment(page);
  await page.getByRole("radio", { name: /^Boleto ou saldo no Mercado Pago/ }).check();
  await toReview(page);
  await page.getByRole("button", { name: "Confirmar e ir para o Mercado Pago" }).click();
  await expect(page.getByRole("heading", { name: "Mercado Pago — simulador local" })).toBeVisible();
  await expect(page.getByText(`Total: ${brl(total)}`)).toBeVisible();
  await page.getByRole("button", { name: "Recusar pagamento" }).click();
  await expect(page.getByText("Pagamento não aprovado").filter({ visible: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Tentar pagar novamente" }).click();
  await expect(page.getByRole("heading", { name: "Mercado Pago — simulador local" })).toBeVisible();
  await page.getByRole("button", { name: "Aprovar pagamento com cartão" }).click();
  await expect(page.getByText("Pagamento aprovado").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText(/\(Cartão de crédito\)\. Seu pedido está confirmado/).filter({ visible: true }).first()).toBeVisible();

  // Switched off again: the store goes back to WhatsApp only
  await setOnlinePayment(false);
  await page.goto("/produtos/skin1004-madagascar-centella-ampoule");
  await expect(page.getByRole("button", { name: "Comprar pelo WhatsApp" })).toBeVisible();
  await ctx.close();
});


// ---------------------------------------------------------------------------
// Apple Pay — Mercado Pago Orders API (Safari simulado: Apple Pay JS só existe em aparelhos Apple)
// ---------------------------------------------------------------------------
/** Stand-in for Safari's ApplePaySession following Apple Pay JS v3: validate → method → authorize. */
function fakeApplePay() {
  const store = (patch: Record<string, unknown>) => {
    const current = JSON.parse(localStorage.getItem("__applePay") ?? "{}");
    localStorage.setItem("__applePay", JSON.stringify({ ...current, ...patch }));
  };
  class FakeApplePaySession {
    static STATUS_SUCCESS = 0;
    static STATUS_FAILURE = 1;
    static canMakePayments() {
      return true;
    }
    static supportsVersion(version: number) {
      return version <= 3;
    }
    onvalidatemerchant: ((e: unknown) => void) | null = null;
    onpaymentmethodselected: ((e: unknown) => void) | null = null;
    onpaymentauthorized: ((e: unknown) => void) | null = null;
    oncancel: ((e: unknown) => void) | null = null;
    constructor(version: number, request: unknown) {
      localStorage.removeItem("__applePay");
      store({ version, request });
    }
    begin() {
      setTimeout(() => this.onvalidatemerchant?.({ validationURL: "https://apple-pay-gateway.apple.com/paymentservices/startSession" }), 10);
    }
    completeMerchantValidation(merchantSession: unknown) {
      store({ merchantSession });
      setTimeout(() => (this.onpaymentmethodselected ? this.onpaymentmethodselected({ paymentMethod: { network: "Visa", type: "credit" } }) : this.authorize()), 10);
    }
    completePaymentMethodSelection(update: { newTotal: unknown; newLineItems: unknown }) {
      store({ total: update.newTotal, lineItems: update.newLineItems });
      setTimeout(() => this.authorize(), 10);
    }
    authorize() {
      const decline = localStorage.getItem("__applePayDecline") === "1";
      this.onpaymentauthorized?.({
        payment: {
          token: {
            paymentData: { version: "EC_v1", data: decline ? "decline" : "approve", signature: "c2lnbmF0dXJl", header: { transactionId: "abcdef" } },
            transactionIdentifier: (decline ? "DEC" : "ABC") + Date.now().toString(16).toUpperCase(),
            paymentMethod: { displayName: "Visa 0492", network: "Visa", type: "credit" },
          },
        },
      });
    }
    completePayment(result: number | { status: number }) {
      store({ result: typeof result === "number" ? result : result.status });
    }
    abort() {
      store({ aborted: true });
    }
  }
  (window as unknown as { ApplePaySession: unknown }).ApplePaySession = FakeApplePaySession;
}

test("Apple Pay — painel, arquivo da Apple, CPF, recusa sem pedido duplicado, aprovação e devolução avisada pelo webhook", async ({ browser, request }) => {
  const MP = "http://localhost:54321/mercadopago";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  // Admin: the public key refuses an access token; then Apple Pay is configured and switched on
  await admin.goto("/admin/configuracoes");
  await admin.getByLabel("Oferecer pagamento pelo site (Pix, cartão e boleto)").check();
  await admin.getByLabel("Oferecer Apple Pay no checkout").check();
  await admin.getByLabel("Public Key do Mercado Pago").fill("APP_USR-ACCESS-TOKEN-FALSO-DE-TESTE");
  await admin.getByRole("button", { name: "Salvar configurações" }).click();
  await expect(admin.getByText(/Public Key inválida/)).toBeVisible();
  await admin.getByLabel("Public Key do Mercado Pago").fill("TEST-00000000-0000-4000-8000-000000000001");
  await admin.getByLabel("Merchant ID (Apple)").fill("merchant.br.com.mivoracosmeticos.teste");
  await admin.getByLabel("ID do certificado de comerciante").fill("cert-local-0001");
  await admin.getByLabel("Product ID (X-Product-ID)").fill("local-product");
  await admin.getByLabel("Arquivo de verificação de domínio da Apple").fill("verificacao-local-0123456789abcdef");
  await admin.getByRole("button", { name: "Salvar configurações" }).click();
  await expect(admin.getByText("Configurações salvas.")).toBeVisible();
  await admin.reload();
  await expect(admin.getByText(/Pronto: o botão do Apple Pay aparece no checkout/)).toBeVisible();

  // Apple's domain verification file is published at the address Apple checks
  const file = await request.get("/.well-known/apple-developer-merchantid-domain-association.txt");
  expect(file.status()).toBe(200);
  expect(await file.text()).toBe("verificacao-local-0123456789abcdef");
  expect((await request.get("/.well-known/apple-developer-merchantid-domain-association")).status()).toBe(200);

  // A browser without Apple Pay never sees the option
  const plain = await browser.newContext({ storageState: RETURNING_VISITOR });
  const visitor = await plain.newPage();
  await visitor.goto("/produtos/skin1004-madagascar-centella-ampoule");
  await visitor.getByLabel("Calcular frete e prazo").filter({ visible: true }).fill("01001-000");
  await expect(visitor.getByText("Correios SEDEX")).toBeVisible();
  await visitor.getByRole("button", { name: "Comprar agora" }).click();
  await fillIdentity(visitor, "Davi Sem Apple");
  await fillAddress(visitor, /Correios SEDEX/);
  await toPayment(visitor);
  await expect(visitor.getByRole("radio", { name: /^Pix/ })).toBeChecked();
  await expect(visitor.getByRole("radio", { name: /^Apple Pay/ })).toHaveCount(0);
  await plain.close();

  // Safari with Apple Pay (simulated)
  const ctx = await browser.newContext({ storageState: RETURNING_VISITOR });
  await ctx.addInitScript(fakeApplePay);
  const page = await ctx.newPage();
  await page.goto("/produtos/skin1004-madagascar-centella-ampoule");
  await page.getByLabel("Calcular frete e prazo").filter({ visible: true }).fill("01001-000");
  await expect(page.getByText("Correios SEDEX")).toBeVisible();
  await page.getByRole("button", { name: "Comprar agora" }).click();
  // the CPF Mercado Pago needs for Apple Pay is asked with the buyer's data
  const email = await fillIdentity(page, "Carla Apple", "12345678900");
  await fillAddress(page, /Correios SEDEX/);
  await page.getByRole("button", { name: "Continuar para o pagamento" }).click();
  await expect(page.getByText("CPF inválido. Confira os números.")).toBeVisible();
  await expect(page.getByLabel("CPF", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel("CPF", { exact: true }).fill("52998224725");
  await expect(page.getByLabel("CPF", { exact: true })).toHaveValue("529.982.247-25");
  await toPayment(page);
  await page.getByRole("radio", { name: /^Apple Pay/ }).check();
  await expect(page.getByRole("complementary", { name: "Resumo do pedido" }).getByText("Total a pagar", { exact: true })).toBeVisible();
  await toReview(page);
  const appleButton = page.getByRole("button", { name: "Pagar com Apple Pay" });

  // First the card is refused: the message shows and the order is kept for the next attempt
  await page.evaluate(() => localStorage.setItem("__applePayDecline", "1"));
  await appleButton.click();
  await expect(page.getByText(/O pagamento com Apple Pay não foi aprovado/)).toBeVisible();
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem("__applePay") ?? "{}"))).result).toBe(1);

  // Then it is approved: the buyer lands on the order page
  await page.evaluate(() => localStorage.removeItem("__applePayDecline"));
  await appleButton.click();
  await expect(page).toHaveURL(/\/pedido\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Pagamento aprovado").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText(`Recebemos o pagamento de ${brl(11990 + 4100)} (Apple Pay). Seu pedido está confirmado`, { exact: false }).filter({ visible: true }).first()).toBeVisible();

  // What Safari was asked for: Visa and Mastercard credit, and the server's exact total
  const sheet = await page.evaluate(() => JSON.parse(localStorage.getItem("__applePay") ?? "{}"));
  expect(sheet.request).toMatchObject({ countryCode: "BR", currencyCode: "BRL", supportedNetworks: ["visa", "masterCard"], merchantCapabilities: ["supports3DS", "supportsCredit"] });
  expect(sheet.total).toEqual({ label: "MIVORA", amount: "160.90", type: "final" });
  expect(sheet.lineItems).toEqual([
    { label: "Produtos", amount: "119.90", type: "final" },
    { label: "Frete", amount: "41.00", type: "final" },
  ]);
  expect(sheet.merchantSession).toMatchObject({ domainName: "localhost", displayName: "MIVORA" });
  expect(sheet.result).toBe(0);

  // The refused attempt did not create a second order
  expect(await serviceGet(request, `customers?email=eq.${encodeURIComponent(email)}&select=orders_count`)).toEqual([{ orders_count: 1 }]);

  // Admin: the payment card shows Apple Pay and the Mercado Pago order
  const code = (await page.getByRole("heading", { level: 1 }).textContent())!.trim();
  const orderId = page.url().match(/pedido\/([0-9a-f-]{36})/)![1];
  await admin.goto(`/admin/pedidos?q=${code}`);
  await admin.getByRole("link", { name: code }).click();
  await expect(admin.getByText("Apple Pay", { exact: true })).toBeVisible();
  await expect(admin.getByText(/Pedido confirmado automaticamente/)).toBeVisible();
  const mpOrderId = (await admin.getByText(/^ORD01[0-9A-Z]+$/).textContent())!.trim();

  // A refund at Mercado Pago arrives as a signed "order" notification
  const refunded = await request.post(`${MP}/test/orders/${mpOrderId}/refund`);
  expect((await refunded.json()).webhook).toBe(200);
  const receipt = await request.post(`${SUPABASE_URL}/rest/v1/rpc/get_order_receipt`, { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` }, data: { p_order_id: orderId } });
  expect(await receipt.json()).toMatchObject({ payment_status: "refunded", payment_type: "apple_pay" });
  await page.reload();
  await expect(page.getByText("Pagamento devolvido").filter({ visible: true }).first()).toBeVisible();

  // Switched off again
  await admin.goto("/admin/configuracoes");
  await admin.getByLabel("Oferecer Apple Pay no checkout").uncheck();
  await admin.getByLabel("Oferecer pagamento pelo site (Pix, cartão e boleto)").uncheck();
  await admin.getByRole("button", { name: "Salvar configurações" }).click();
  await expect(admin.getByText("Configurações salvas.")).toBeVisible();
  await ctx.close();
});

// ---------------------------------------------------------------------------
// Checkout em 4 etapas + login com Google e Apple (simulador OAuth local, nunca os provedores reais)
// ---------------------------------------------------------------------------
test("Checkout — sacola vazia, dados mantidos ao atualizar a página e ao voltar pelo navegador, produto que fica indisponível", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: RETURNING_VISITOR });
  const page = await ctx.newPage();

  await page.goto("/finalizar");
  await expect(page.getByText("Sua sacola está vazia")).toBeVisible();

  await page.goto("/produtos/celimax-pore-dark-spot-brightening-cream");
  await page.getByRole("button", { name: "Adicionar ao carrinho" }).click();
  await page.getByRole("button", { name: "Fechar" }).click();
  await page.goto("/finalizar?etapa=identificacao");
  // an unknown CEP is reported next to the field
  await page.getByLabel("CEP", { exact: true }).fill("99999-999");
  await expect(page.getByText("Não encontramos este CEP. Confira os números e tente de novo.")).toBeVisible();
  const email = await fillIdentity(page, "Lia Refresh");
  await fillAddress(page, /Correios PAC/);

  // a refresh in the middle of the checkout keeps everything
  await page.reload();
  await expect(page.getByLabel("E-mail", { exact: true })).toHaveValue(email);
  await expect(page.getByLabel("Primeiro nome")).toHaveValue("Lia");
  await expect(page.getByLabel("Número", { exact: true })).toHaveValue("100");
  await expect(page.getByRole("radio", { name: /Correios PAC/ })).toBeChecked();
  await toPayment(page);
  await expect(page).toHaveURL(/etapa=pagamento/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Pagamento", exact: true })).toBeVisible();
  // the browser's back button returns to step 2 with the data
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Seus dados" })).toBeVisible();
  await expect(page.getByLabel("Sobrenome")).toHaveValue("Refresh");

  // A product that becomes unavailable blocks the checkout, with a link back to the bag
  await editProductBySlug(admin, "celimax-pore-dark-spot-brightening-cream");
  await admin.getByLabel("Disponibilidade", { exact: true }).selectOption("out_of_stock");
  await saveProduct(admin);
  await page.goto("/finalizar?etapa=identificacao");
  await expect(page.getByRole("alert").filter({ hasText: "Um ou mais produtos ficaram indisponíveis." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continuar para o pagamento" })).toBeDisabled();
  await expect(page.getByRole("link", { name: "Revisar sacola" })).toHaveAttribute("href", "/carrinho");
  await editProductBySlug(admin, "celimax-pore-dark-spot-brightening-cream");
  await admin.getByLabel("Disponibilidade", { exact: true }).selectOption("in_stock");
  await saveProduct(admin);
  await ctx.close();
});

test("Login com Google — cliente nova volta à finalização com a sacola, completa só o que falta e salva o endereço; em outro aparelho usa o endereço salvo", async ({ browser, request }) => {
  const googleEmail = `ana${Date.now()}@exemplo.com.br`;
  const ctx = await browser.newContext({ storageState: RETURNING_VISITOR });
  const page = await ctx.newPage();
  let whatsappUrl = "";
  await ctx.route("https://wa.me/**", async (route) => {
    whatsappUrl = route.request().url();
    await route.fulfill({ status: 200, body: "whatsapp" });
  });

  await page.goto("/produtos/dr-althea-345-relief-cream");
  await page.getByRole("button", { name: "Adicionar ao carrinho" }).click();
  await page.getByRole("button", { name: "Fechar" }).click();
  await page.goto("/carrinho");
  await page.getByRole("link", { name: "Continuar para identificação" }).click();
  await expect(page.getByText("ou continue com seus dados")).toBeVisible();
  await socialLogin(page, "Google", googleEmail, "Ana Google");
  await expect(page).toHaveURL(/\/finalizar\?etapa=identificacao/);
  await expect(page.getByRole("complementary", { name: "Resumo do pedido" })).toContainText("345 Relief Cream");

  // the account brings the e-mail and the name; only CPF, phone and address are asked
  await expect(page.getByText("Conectada com Google")).toBeVisible();
  await expect(page.getByLabel("E-mail", { exact: true })).toHaveValue(googleEmail);
  await expect(page.getByLabel("E-mail", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Primeiro nome")).toHaveValue("Ana");
  await expect(page.getByLabel("Sobrenome")).toHaveValue("Google");
  await expect(page.getByText(/Complete os dados que faltam para finalizar a compra/)).toBeVisible();
  await page.getByLabel("CPF", { exact: true }).fill(CPF);
  await page.getByLabel("Telefone com DDD").fill("(21) 98765-4321");
  await fillAddress(page, /Correios SEDEX/);
  await expect(page.getByLabel("Nome de quem vai receber")).toHaveValue("Ana Google");
  await page.getByLabel("Salvar este endereço na minha conta").check();
  await toPayment(page);
  await toReview(page);
  await page.getByRole("button", { name: "Confirmar e enviar pelo WhatsApp" }).click();
  await expect.poll(() => whatsappUrl, { timeout: 15_000 }).toContain("https://wa.me/");
  const code = decodeURIComponent(whatsappUrl.split("text=")[1]).match(/MIV-\d{6}/)![0];

  // The order belongs to the account; the account page shows the saved address and the order
  const [order] = await serviceGet(request, `order_intents?code=eq.${code}&select=user_id,customer_cpf,shipping_street`);
  expect(order).toMatchObject({ customer_cpf: CPF, shipping_street: "Praça da Sé" });
  expect(order.user_id).toMatch(/^[0-9a-f-]{36}$/);
  await page.goto("/minha-conta");
  const account = page.getByRole("region", { name: "Sua conta" });
  await expect(account).toContainText(googleEmail);
  await expect(account).toContainText("Conectada com Google");
  await expect(account).toContainText("Praça da Sé, 100");
  await expect(account.getByRole("link", { name: code })).toBeVisible();

  // Another device: the same Google account brings the saved data and address
  const other = await browser.newContext({ storageState: RETURNING_VISITOR });
  const phone = await other.newPage();
  await phone.goto("/produtos/dr-althea-345-relief-cream");
  await phone.getByRole("button", { name: "Adicionar ao carrinho" }).click();
  await phone.getByRole("button", { name: "Fechar" }).click();
  await phone.goto("/finalizar");
  await socialLogin(phone, "Google", googleEmail, "Ana Google");
  const data = phone.getByRole("region", { name: "Dados da conta" });
  await expect(data).toContainText("Ana Google");
  await expect(data).toContainText("CPF ***.***.247-25");
  await expect(phone.getByRole("radio", { name: /Ana Google.*Praça da Sé, 100/ })).toBeChecked();
  await phone.getByRole("radio", { name: /Correios SEDEX/ }).check();
  await toPayment(phone);
  await toReview(phone);
  await expect(phone.getByRole("region", { name: "Revise seu pedido" })).toContainText("Praça da Sé, 100");

  // Signing out on a shared device clears the account's data from the checkout
  await phone.getByRole("button", { name: "Alterar seus dados" }).click();
  await phone.getByRole("button", { name: "Sair da conta" }).click();
  await expect(phone.getByText("Você saiu da sua conta neste aparelho.")).toBeVisible();
  await expect(phone.getByLabel("E-mail", { exact: true })).toHaveValue("");
  await expect(phone.getByRole("button", { name: "Continuar com Google" })).toBeVisible();
  await other.close();
  await ctx.close();
});

test("Login com Apple — cancelar volta sem perder a sacola; sem nome e com e-mail privado da Apple, pede só o que falta", async ({ browser }) => {
  const relay = `x${Date.now()}@privaterelay.appleid.com`;
  const ctx = await browser.newContext({ storageState: RETURNING_VISITOR });
  const page = await ctx.newPage();
  await page.goto("/produtos/skin1004-madagascar-centella-ampoule");
  await page.getByRole("button", { name: "Adicionar ao carrinho" }).click();
  await page.getByRole("button", { name: "Fechar" }).click();
  await page.goto("/finalizar");

  await page.getByRole("button", { name: "Continuar com Apple" }).click();
  await expect(page.getByRole("heading", { name: "Login com Apple — simulador local" })).toBeVisible();
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByText("O login foi cancelado. Você pode tentar de novo ou continuar com seus dados.")).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Resumo do pedido" })).toContainText("Madagascar Centella Ampoule");

  // Apple shares no name here and hides the real e-mail behind its relay address
  await socialLogin(page, "Apple", relay, "");
  await expect(page.getByText("Conectada com Apple")).toBeVisible();
  await expect(page.getByLabel("E-mail", { exact: true })).toHaveValue(relay);
  await expect(page.getByLabel("Primeiro nome")).toHaveValue("");
  await page.getByRole("button", { name: "Continuar para o pagamento" }).click();
  await expect(page.getByText("Informe seu primeiro nome.")).toBeVisible();
  await expect(page.getByText("Informe seu sobrenome.")).toBeVisible();
  await page.getByLabel("Primeiro nome").fill("Bia");
  await page.getByLabel("Sobrenome").fill("Maçã");
  await page.getByLabel("CPF", { exact: true }).fill(CPF);
  await page.getByLabel("Telefone com DDD").fill("(31) 97777-1234");
  await fillAddress(page, /Correios SEDEX/);
  await toPayment(page);

  // the name typed once stays in the account
  await page.goto("/minha-conta");
  const account = page.getByRole("region", { name: "Sua conta" });
  await expect(account).toContainText("Bia Maçã");
  await expect(account).toContainText(relay);
  await expect(account).toContainText("Conectada com Apple");
  await ctx.close();
});

test("Sessão expirada — a finalização avisa, mantém os dados digitados e segue como visitante", async ({ browser }) => {
  const email = `sessao${Date.now()}@exemplo.com.br`;
  const ctx = await browser.newContext({ storageState: RETURNING_VISITOR });
  const page = await ctx.newPage();
  await page.goto("/produtos/skin1004-madagascar-centella-ampoule");
  await page.getByRole("button", { name: "Adicionar ao carrinho" }).click();
  await page.getByRole("button", { name: "Fechar" }).click();
  await page.goto("/finalizar");
  await socialLogin(page, "Google", email, "Rita Sessão");
  await page.getByLabel("CPF", { exact: true }).fill(CPF);
  await page.getByLabel("Telefone com DDD").fill("(41) 96666-1234");
  await fillAddress(page, /Correios PAC/);

  // the session ends (cookies gone) before the data is saved
  await ctx.clearCookies();
  await page.getByRole("button", { name: "Continuar para o pagamento" }).click();
  await expect(page.getByText("Sua sessão expirou. Entre de novo ou continue como visitante: seus dados foram mantidos.")).toBeVisible();
  await expect(page.getByLabel("E-mail", { exact: true })).toBeEnabled();
  await expect(page.getByLabel("E-mail", { exact: true })).toHaveValue(email);
  await expect(page.getByLabel("Primeiro nome")).toHaveValue("Rita");
  await expect(page.getByLabel("CPF", { exact: true })).toHaveValue("529.982.247-25");
  await expect(page.getByLabel("Número", { exact: true })).toHaveValue("100");
  await expect(page.getByRole("button", { name: "Continuar com Google" })).toBeVisible();
  await toPayment(page);
  await ctx.close();
});

test("Checkout no celular (390 px) — resumo recolhível e nenhuma etapa com rolagem horizontal", async ({ browser }) => {
  await setOnlinePayment(true);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: RETURNING_VISITOR });
  const page = await ctx.newPage();
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

  await page.goto("/produtos/skin1004-madagascar-centella-ampoule");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Adicionar ao carrinho" }).filter({ visible: true }).first().click();
  await expect(page.getByRole("button", { name: "Fechar" })).toBeVisible();
  await page.goto("/carrinho");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sacola (1 item)");
  expect(await overflow(), "sacola").toBeLessThanOrEqual(0);
  await page.getByRole("link", { name: "Continuar para identificação" }).click();

  // on phones the summary sits collapsed at the top, with the total
  const toggle = page.getByRole("button", { name: /Resumo do pedido/ });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("complementary", { name: "Resumo do pedido" }).getByText("Madagascar Centella Ampoule")).toBeVisible();

  await page.getByRole("button", { name: "Continuar para o pagamento" }).click();
  await expect(page.getByText("Informe seu primeiro nome.")).toBeVisible();
  expect(await overflow(), "identificação com erros").toBeLessThanOrEqual(0);
  await fillIdentity(page, "Mila Celular");
  await fillAddress(page, /Correios SEDEX/);
  expect(await overflow(), "entrega").toBeLessThanOrEqual(0);
  await toPayment(page);
  await page.getByRole("radio", { name: /^Cartão de crédito/ }).check();
  await expect(page.locator('[data-mp-brick="cardPayment"]')).toBeVisible();
  expect(await overflow(), "pagamento").toBeLessThanOrEqual(0);
  await page.getByRole("radio", { name: /^Pix/ }).check();
  await toReview(page);
  expect(await overflow(), "revisão").toBeLessThanOrEqual(0);
  await page.getByRole("button", { name: "Confirmar e gerar o Pix" }).click();
  await expect(page).toHaveURL(/\/pedido\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("button", { name: "Copiar código Pix" })).toBeVisible();
  expect(await overflow(), "pedido com Pix").toBeLessThanOrEqual(0);
  await ctx.close();
  await setOnlinePayment(false);
});

// ---------------------------------------------------------------------------
// Análise de Pele com IA (simulador local da Anthropic — a IA real nunca é chamada nos testes)
// ---------------------------------------------------------------------------
/** A solid-colour JPEG: the local AI double answers by colour (beige → dryness, reddish → redness, grey → no face, black → overloaded). */
const photo = async (r: number, g: number, b: number, name = "rosto.jpg") => ({
  name,
  mimeType: "image/jpeg",
  buffer: await sharp({ create: { width: 720, height: 960, channels: 3, background: { r, g, b } } }).jpeg().toBuffer(),
});
const FIRST_VISIT_DONE = (memory?: object) => ({
  cookies: [],
  origins: [
    {
      origin: process.env.E2E_BASE_URL ?? "http://localhost:3000",
      localStorage: [{ name: "mivora.welcome.v1", value: "1" }, ...(memory ? [{ name: "mivora.skinPopup.v1", value: JSON.stringify(memory) }] : [])],
    },
  ],
});
const DAY = 86_400_000;

test("Análise de pele — pop-up de lançamento: X, Esc, clique fora, frequência, CTA e seção permanente na home", async ({ browser }) => {
  // interval 0 (the store's default): the pop-up opens every time the site is loaded or reloaded, even right after
  // being closed — but navigating inside the site does not reopen it
  const setInterval = async (days: string) => {
    await admin.goto("/admin/configuracoes");
    await admin.getByLabel("Intervalo do pop-up (dias)").fill(days);
    await admin.getByRole("button", { name: "Salvar configurações" }).click();
    await expect(admin.getByText("Configurações salvas.")).toBeVisible();
  };
  await setInterval("0");
  const every = await browser.newContext({ storageState: RETURNING_VISITOR });
  const reloads = await every.newPage();
  await reloads.goto("/");
  const again = reloads.getByRole("dialog", { name: "Sua pele fala. A gente te ouve." });
  await expect(again).toBeVisible();
  await again.getByRole("button", { name: "Fechar" }).click();
  await expect(again).toBeHidden();
  await reloads.reload();
  await expect(again).toBeVisible();
  await again.getByRole("button", { name: "Fechar" }).click();
  await reloads.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Novidades", exact: true }).click();
  await expect(reloads).toHaveURL(/\/novidades$/);
  await reloads.waitForTimeout(1500);
  await expect(again).toHaveCount(0);
  await reloads.goto("/produtos");
  await expect(again).toBeVisible();
  await every.close();
  // from here on: 7 days, remembered per browser
  await setInterval("7");

  // eligible visit: the pop-up opens, the X closes it, and it does not come back on the next visit
  const ctx = await browser.newContext({ storageState: FIRST_VISIT_DONE() });
  const page = await ctx.newPage();
  await page.goto("/");
  const popup = page.getByRole("dialog", { name: "Sua pele fala. A gente te ouve." });
  await expect(popup).toBeVisible();
  await expect(popup).toContainText("Novidade MIVORA");
  await expect(popup).toContainText("Envie uma foto do seu rosto e receba uma análise visual personalizada");
  for (const h of ["Análise visual personalizada.", "Recomendações de produtos da MIVORA.", "Sua rotina de skincare em poucos passos."]) await expect(popup).toContainText(h);
  await expect(popup.getByRole("link", { name: "Analisar minha pele" })).toHaveAttribute("href", "/analise-de-pele");
  await expect(popup.getByRole("link", { name: "Conhecer a novidade" })).toHaveAttribute("href", "/#analise-de-pele");
  await expect(popup.getByRole("button", { name: "Fechar" })).toBeFocused();
  await popup.getByRole("button", { name: "Fechar" }).click();
  await expect(popup).toBeHidden();
  await page.reload();
  await page.waitForTimeout(1500);
  await expect(page.getByRole("dialog", { name: "Sua pele fala. A gente te ouve." })).toHaveCount(0);
  // closing it never hides the feature: the home section and the menu stay
  const section = page.getByRole("region", { name: "Sua pele é única. Sua rotina também deveria ser." });
  await expect(section).toBeVisible();
  await expect(section).toContainText("Exclusivo MIVORA");
  await expect(section).toContainText("Rápido, personalizado e pensado para ajudar você a escolher seus produtos.");
  await expect(page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: /Análise de pele/ })).toHaveAttribute("href", "/analise-de-pele");
  await section.getByRole("link", { name: "Fazer minha análise" }).click();
  await expect(page).toHaveURL(/\/analise-de-pele$/);
  await expect(page.getByRole("heading", { level: 1, name: "Vamos conhecer melhor a sua pele?" })).toBeVisible();
  await ctx.close();

  // Escape closes it; a click outside also closes it
  for (const how of ["escape", "outside"] as const) {
    const c = await browser.newContext({ storageState: FIRST_VISIT_DONE() });
    const p = await c.newPage();
    await p.goto("/produtos");
    const d = p.getByRole("dialog", { name: "Sua pele fala. A gente te ouve." });
    await expect(d).toBeVisible();
    if (how === "escape") await p.keyboard.press("Escape");
    else await p.mouse.click(8, 8);
    await expect(d).toBeHidden();
    await c.close();
  }

  // the interval set in the admin: 6 days after closing it stays away, after 8 days it returns
  for (const [days, shown] of [
    [6, false],
    [8, true],
  ] as const) {
    const c = await browser.newContext({ storageState: FIRST_VISIT_DONE({ dismissedAt: Date.now() - days * DAY }) });
    const p = await c.newPage();
    await p.goto("/");
    if (shown) await expect(p.getByRole("dialog", { name: "Sua pele fala. A gente te ouve." })).toBeVisible();
    else {
      await p.waitForTimeout(1500);
      await expect(p.getByRole("dialog", { name: "Sua pele fala. A gente te ouve." })).toHaveCount(0);
    }
    await c.close();
  }

  // the main button opens the analysis and the pop-up does not return while the customer goes on
  const go = await browser.newContext({ storageState: FIRST_VISIT_DONE() });
  const visitor = await go.newPage();
  await visitor.goto("/");
  await visitor.getByRole("dialog", { name: "Sua pele fala. A gente te ouve." }).getByRole("link", { name: "Analisar minha pele" }).click();
  await expect(visitor).toHaveURL(/\/analise-de-pele$/);
  await visitor.goto("/produtos");
  await visitor.waitForTimeout(1500);
  await expect(visitor.getByRole("dialog", { name: "Sua pele fala. A gente te ouve." })).toHaveCount(0);
  await go.close();

  // a first visit shows the welcome intro, never both campaigns in the same session; checkout pages stay quiet
  const first = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const fresh = await first.newPage();
  await fresh.goto("/");
  const intro = fresh.getByRole("dialog", { name: "Bem-vinda à MIVORA" });
  await expect(intro).toBeVisible();
  await intro.getByRole("button", { name: "Quero meu desconto" }).click();
  await fresh.goto("/produtos");
  await fresh.waitForTimeout(1500);
  await expect(fresh.getByRole("dialog", { name: "Sua pele fala. A gente te ouve." })).toHaveCount(0);
  await first.close();
  const quiet = await browser.newContext({ storageState: FIRST_VISIT_DONE() });
  const cart = await quiet.newPage();
  await cart.goto("/carrinho");
  await cart.waitForTimeout(1500);
  await expect(cart.getByRole("dialog", { name: "Sua pele fala. A gente te ouve." })).toHaveCount(0);
  await quiet.close();
});

test("Análise de pele — consentimento obrigatório, foto inadequada, falha do serviço, resultado conforme a foto, produtos reais e carrinho", async ({ browser, request }) => {
  const ctx = await browser.newContext({ storageState: RETURNING_VISITOR });
  const page = await ctx.newPage();
  await page.goto("/analise-de-pele");
  const steps = page.getByRole("navigation", { name: "Etapas da análise" });
  await expect(steps.locator('[aria-current="step"]')).toContainText("Início");
  await expect(page.getByText("A análise é cosmética e informativa. Ela não é um diagnóstico médico")).toBeVisible();
  await page.getByRole("button", { name: "Começar análise" }).click();

  // consent: explained, not pre-selected, required to continue
  await expect(page.getByRole("heading", { name: "Antes de começar" })).toBeVisible();
  await expect(page.getByText("A imagem não é usada para treinar modelos de inteligência artificial nem para publicidade.")).toBeVisible();
  const consent = page.getByRole("checkbox", { name: /Concordo com o uso da minha foto/ });
  await expect(consent).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Continuar" })).toBeDisabled();
  await consent.check();
  await page.getByRole("button", { name: "Continuar" }).click();

  // the server refuses a photo without consent, whatever the page does
  const noConsent = await request.post("/api/analise-de-pele", { multipart: { photo: await photo(230, 200, 180) } });
  expect(noConsent.status()).toBe(400);
  expect(await noConsent.json()).toMatchObject({ ok: false, error: "consent_required" });
  expect(noConsent.headers()["cache-control"]).toContain("no-store");

  // photo step: preview first, nothing is sent until "Analisar minha foto"
  await expect(page.getByRole("heading", { name: "Sua foto" })).toBeVisible();
  await expect(page.getByLabel("Tirar foto com a câmera")).toHaveAttribute("capture", "user");
  await page.getByLabel("Escolher foto da galeria").setInputFiles(await photo(128, 128, 128, "parede.jpg"));
  await expect(page.getByRole("img", { name: "Pré-visualização da sua foto" })).toBeVisible();
  await page.getByRole("button", { name: "Analisar minha foto" }).click();
  // a photo without a face is explained and another one is asked
  await expect(page.getByText("Não encontramos um rosto na foto. Envie uma foto do seu rosto, de frente.")).toBeVisible();
  await page.getByRole("button", { name: "Enviar outra foto" }).click();

  // the AI service fails: an honest message, no result, and a retry
  await page.getByLabel("Escolher foto da galeria").setInputFiles(await photo(4, 4, 4, "escura.jpg"));
  await page.getByRole("button", { name: "Analisar minha foto" }).click();
  await expect(page.getByText("O serviço de análise está ocupado agora. Tente de novo em instantes.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Tentar de novo" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sua análise está pronta" })).toHaveCount(0);
  await page.getByRole("button", { name: "Voltar para a foto" }).click();

  // a real analysis: the result follows the photo
  await page.getByLabel("Trocar foto").setInputFiles(await photo(230, 200, 180));
  await page.getByRole("button", { name: "Analisar minha foto" }).click();
  await expect(page.getByRole("heading", { name: "Sua análise está pronta" })).toBeVisible({ timeout: 20_000 });
  const traits = page.getByRole("region", { name: "Características observadas" });
  await expect(traits).toContainText("Hidratação");
  await expect(traits).toContainText("Merece atenção");
  await expect(traits).toContainText("A pele aparenta ressecamento nas maçãs do rosto.");
  await expect(page.getByText("Com esta foto não foi possível avaliar: poros.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Necessidades que podem ser consideradas" })).toContainText("Hidratação — A aparência de ressecamento");
  await expect(page.getByText(/não um diagnóstico médico, e não substitui a avaliação de um dermatologista/)).toBeVisible();

  // products: only real, available catalogue products, with their current price and links
  await page.getByRole("button", { name: "Ver produtos recomendados" }).click();
  const cards = page.locator("main article");
  await expect(cards.first()).toBeVisible();
  const names = await cards.locator("h3").allTextContents();
  expect(names.length).toBeGreaterThan(0);
  for (let i = 0; i < names.length; i += 1) {
    const card = cards.nth(i);
    const href = (await card.getByRole("link", { name: "Ver produto" }).getAttribute("href"))!;
    const slug = href.replace("/produtos/", "");
    // each card is a real catalogue product: published, available, with the price stored in the database
    const [row] = await serviceGet(request, `products?slug=eq.${slug}&select=name,status,availability,is_available,price_cents`);
    expect(row, slug).toMatchObject({ name: names[i], status: "published", availability: "in_stock", is_available: true });
    expect(row.price_cents).toBeGreaterThan(0);
    await expect(card).toContainText(brl(row.price_cents));
    await expect(card).toContainText("Disponível");
  }
  // the product link works and the result is still there after coming back
  await cards.first().getByRole("link", { name: "Ver produto" }).click();
  await expect(page.getByRole("heading", { level: 1, name: names[0] })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Sua análise está pronta" })).toBeVisible();

  // add one product with the store's cart
  await page.getByRole("tab", { name: /Produtos/ }).click();
  await cards.first().getByRole("button", { name: /^Adicionar .* ao carrinho$/ }).click();
  await expect(page.getByRole("dialog", { name: /Carrinho \(1\)/ })).toBeVisible();
  await page.getByRole("button", { name: "Fechar" }).click();

  // routine: morning and night; the whole routine goes to the bag only after confirming the list and the total
  await page.getByRole("tab", { name: "Rotina" }).click();
  await expect(page.getByRole("region", { name: "Rotina da manhã" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Rotina da noite" })).toBeVisible();
  await page.getByRole("button", { name: "Adicionar rotina ao carrinho" }).click();
  const confirm = page.getByRole("group", { name: "Estes produtos serão adicionados à sua sacola:" });
  await expect(confirm).toContainText("Total dos produtos");
  await page.getByRole("button", { name: "Confirmar e adicionar" }).click();
  await expect(page.getByText("Rotina adicionada à sacola.")).toBeVisible();
  // the store's cart drawer opens with the products; it is closed to go on
  await page.getByRole("dialog", { name: /Carrinho/ }).getByRole("button", { name: "Fechar" }).click();

  // adjusting the needs recomputes from the catalogue, without a new photo
  await page.getByRole("tab", { name: "Análise" }).click();
  await page.getByRole("button", { name: "Conforto da pele" }).click();
  await expect(page.getByRole("button", { name: "Conforto da pele" })).toHaveAttribute("aria-pressed", "true");

  // another photo, another result (consent asked again)
  await page.getByRole("button", { name: "Refazer análise" }).click();
  await page.getByRole("checkbox", { name: /Concordo com o uso da minha foto/ }).check();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Escolher foto da galeria").setInputFiles(await photo(225, 110, 110));
  await page.getByRole("button", { name: "Analisar minha foto" }).click();
  await expect(page.getByRole("heading", { name: "Sua análise está pronta" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("region", { name: "Características observadas" })).toContainText("Vermelhidão");
  await expect(page.getByRole("region", { name: "Necessidades que podem ser consideradas" })).toContainText("Conforto da pele");
  await ctx.close();
});

test("Análise de pele — relatório salvo na conta (consentimento à parte), painel: textos, intervalo, classificação e desligar", async ({ browser, request }) => {
  // switching the feature off waits for the cached pages to renew (up to about a minute)
  test.setTimeout(240_000);
  // signed in with Google (local OAuth simulator), the report can be kept — text only
  const email = `relatorio${Date.now()}@exemplo.com.br`;
  const ctx = await browser.newContext({ storageState: RETURNING_VISITOR });
  const page = await ctx.newPage();
  await page.goto("/minha-conta");
  await page.getByRole("button", { name: "Continuar com Google" }).click();
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Nome").fill("Rita Relatório");
  await page.getByRole("button", { name: "Autorizar" }).click();
  await expect(page.getByRole("region", { name: "Sua conta" })).toContainText("Nenhum relatório salvo.");
  await page.goto("/analise-de-pele");
  await page.getByRole("button", { name: "Começar análise" }).click();
  await page.getByRole("checkbox", { name: /Concordo com o uso da minha foto/ }).check();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Escolher foto da galeria").setInputFiles(await photo(230, 200, 180));
  await page.getByRole("button", { name: "Analisar minha foto" }).click();
  await expect(page.getByRole("heading", { name: "Sua análise está pronta" })).toBeVisible({ timeout: 20_000 });
  const save = page.getByRole("button", { name: "Salvar relatório" });
  await expect(save).toBeDisabled();
  await page.getByRole("checkbox", { name: /salvar o texto deste relatório/ }).check();
  await save.click();
  await expect(page.getByText("Relatório salvo em Minha conta.")).toBeVisible();
  await page.goto("/minha-conta");
  const account = page.getByRole("region", { name: "Sua conta" });
  await expect(account).toContainText("Relatórios da análise de pele");
  await expect(account).toContainText("Hidratação");
  await account.getByRole("button", { name: /Excluir o relatório de/ }).click();
  await expect(account).toContainText("Nenhum relatório salvo.");
  await ctx.close();

  // Admin: status, interval and daily limit
  await admin.goto("/admin/configuracoes");
  await expect(admin.getByText(/No ar: pop-up de lançamento, seção da home, menu e página \/analise-de-pele/)).toBeVisible();
  await expect(admin.getByText(/Hoje: \d+ análises?\./)).toBeVisible();
  await admin.getByLabel("Intervalo do pop-up (dias)").fill("91");
  await admin.getByRole("button", { name: "Salvar configurações" }).click();
  await expect(admin.getByText("O intervalo do pop-up da análise de pele deve ficar entre 0 (toda vez) e 90 dias.")).toBeVisible();
  await admin.getByLabel("Intervalo do pop-up (dias)").fill("3");
  await admin.getByRole("button", { name: "Salvar configurações" }).click();
  await expect(admin.getByText("Configurações salvas.")).toBeVisible();

  // Admin: the pop-up copy is edited in Conteúdo and shows in the store
  await admin.goto("/admin/conteudo#analise-de-pele");
  const popupForm = admin.locator("section#analise-de-pele form").first();
  await popupForm.getByLabel("Título", { exact: true }).fill("Sua pele fala. A MIVORA te ouve.");
  await popupForm.getByLabel("Destaques").fill("Análise visual personalizada.\nProdutos do nosso catálogo.");
  await popupForm.getByRole("button", { name: "Salvar banner" }).click();
  await expect(admin.getByText("Banner salvo.").first()).toBeVisible();
  const visitor = await browser.newContext({ storageState: FIRST_VISIT_DONE({ dismissedAt: Date.now() - 4 * DAY }) });
  const v = await visitor.newPage();
  await v.goto("/");
  const edited = v.getByRole("dialog", { name: "Sua pele fala. A MIVORA te ouve." });
  await expect(edited).toBeVisible(); // 4 days later with a 3-day interval
  await expect(edited).toContainText("Produtos do nosso catálogo.");
  await edited.getByRole("button", { name: "Fechar" }).click();

  // Admin: a product left out of the recommendations is never suggested
  await editProductBySlug(admin, "dr-althea-345-relief-cream");
  await expect(admin.getByRole("heading", { name: "Análise de pele" })).toBeVisible();
  await expect(admin.getByText(/Etapa automática \(pelo tipo\):/)).toBeVisible();
  await admin.getByLabel("Pode aparecer nas recomendações da análise de pele").uncheck();
  await admin.getByRole("button", { name: "Salvar análise de pele" }).click();
  await expect(admin.getByText("Análise de pele salva.")).toBeVisible();
  await v.goto("/analise-de-pele");
  await v.getByRole("button", { name: "Começar análise" }).click();
  await v.getByRole("checkbox", { name: /Concordo com o uso da minha foto/ }).check();
  await v.getByRole("button", { name: "Continuar" }).click();
  await v.getByLabel("Escolher foto da galeria").setInputFiles(await photo(230, 200, 180));
  await v.getByRole("button", { name: "Analisar minha foto" }).click();
  await expect(v.getByRole("heading", { name: "Sua análise está pronta" })).toBeVisible({ timeout: 20_000 });
  await v.getByRole("button", { name: "Ver produtos recomendados" }).click();
  await expect(v.locator('main article a[href="/produtos/dr-althea-345-relief-cream"]')).toHaveCount(0);
  await admin.getByLabel("Pode aparecer nas recomendações da análise de pele").check();
  await admin.getByRole("button", { name: "Salvar análise de pele" }).click();
  await expect(admin.getByText("Análise de pele salva.")).toBeVisible();

  // Admin: switched off → no section, no menu link, no pop-up; the page says it is unavailable
  await admin.goto("/admin/configuracoes");
  await admin.getByLabel("Mostrar a Análise de Pele com IA na loja").uncheck();
  await admin.getByRole("button", { name: "Salvar configurações" }).click();
  await expect(admin.getByText("Configurações salvas.")).toBeVisible();
  // the analysis itself stops at once: the server refuses new photos as soon as the feature is off
  const refused = await request.post("/api/analise-de-pele", { multipart: { consent: "aceito", photo: await photo(230, 200, 180) } });
  expect(refused.status()).toBe(404);
  expect(await refused.json()).toMatchObject({ ok: false, error: "disabled" });
  // cached pages renew on the next visits (at most about a minute): reload until the change shows
  const reloadUntil = (url: string, check: () => Promise<void>) =>
    expect(async () => {
      await v.goto(url);
      await check();
    }).toPass({ timeout: 100_000, intervals: [2_000, 3_000, 5_000] });
  await reloadUntil("/", async () => {
    await expect(v.getByRole("region", { name: "Sua pele é única. Sua rotina também deveria ser." })).toHaveCount(0, { timeout: 1_000 });
    await expect(v.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: /Análise de pele/ })).toHaveCount(0, { timeout: 1_000 });
  });
  await reloadUntil("/analise-de-pele", () => expect(v.getByText("A análise de pele está temporariamente indisponível. Tente de novo mais tarde.")).toBeVisible({ timeout: 1_000 }));
  await admin.goto("/admin/configuracoes");
  await admin.getByLabel("Mostrar a Análise de Pele com IA na loja").check();
  await admin.getByLabel("Intervalo do pop-up (dias)").fill("7");
  await admin.getByRole("button", { name: "Salvar configurações" }).click();
  await expect(admin.getByText("Configurações salvas.")).toBeVisible();
  await reloadUntil("/", () => expect(v.getByRole("region", { name: "Sua pele é única. Sua rotina também deveria ser." })).toBeVisible({ timeout: 1_000 }));
  await reloadUntil("/analise-de-pele", () => expect(v.getByRole("button", { name: "Começar análise" })).toBeVisible({ timeout: 1_000 }));
  await visitor.close();
});

test("Análise de pele no celular (390 px) — pop-up proporcional, seção da home e etapas sem rolagem horizontal", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: FIRST_VISIT_DONE() });
  const page = await ctx.newPage();
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await page.goto("/");
  const popup = page.getByRole("dialog", { name: /Sua pele fala/ });
  await expect(popup).toBeVisible();
  const box = (await popup.boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(390 - 16);
  expect(box.height).toBeLessThan(844);
  await expect(popup.getByRole("link", { name: "Analisar minha pele" })).toBeInViewport();
  await popup.getByRole("button", { name: "Fechar" }).tap();
  await expect(popup).toBeHidden();
  const section = page.getByRole("region", { name: "Sua pele é única. Sua rotina também deveria ser." });
  await section.scrollIntoViewIfNeeded();
  await expect(section.getByRole("link", { name: "Fazer minha análise" })).toBeVisible();
  expect(await overflow(), "home").toBeLessThanOrEqual(0);
  await page.getByRole("button", { name: "Abrir menu" }).tap();
  await expect(page.getByRole("dialog", { name: "Menu" }).getByRole("link", { name: /Análise de pele com IA/ })).toBeVisible();
  await page.goto("/analise-de-pele");
  expect(await overflow(), "início").toBeLessThanOrEqual(0);
  await page.getByRole("button", { name: "Começar análise" }).tap();
  await page.getByRole("checkbox", { name: /Concordo com o uso da minha foto/ }).check();
  expect(await overflow(), "consentimento").toBeLessThanOrEqual(0);
  await page.getByRole("button", { name: "Continuar" }).tap();
  await page.getByLabel("Escolher foto da galeria").setInputFiles(await photo(230, 200, 180));
  await expect(page.getByRole("img", { name: "Pré-visualização da sua foto" })).toBeVisible();
  expect(await overflow(), "foto").toBeLessThanOrEqual(0);
  await page.getByRole("button", { name: "Analisar minha foto" }).tap();
  await expect(page.getByRole("heading", { name: "Sua análise está pronta" })).toBeVisible({ timeout: 20_000 });
  expect(await overflow(), "resultado").toBeLessThanOrEqual(0);
  await page.getByRole("tab", { name: /Produtos/ }).tap();
  await expect(page.locator("main article").first()).toBeVisible();
  expect(await overflow(), "produtos").toBeLessThanOrEqual(0);
  await page.getByRole("tab", { name: "Rotina" }).tap();
  expect(await overflow(), "rotina").toBeLessThanOrEqual(0);
  await ctx.close();
});
