import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { asRole, createTestDb, type TestDb } from "./harness";

let db: TestDb;

/** Expansion drafts that appear in the Catálogo MIVORA 2026 and became visible as "Sob consulta". */
const CATALOGUE_DRAFTS = [
  "cosrx-advanced-snail-96-mucin-power-essence",
  "anua-heartleaf-77-soothing-toner",
  "laneige-lip-sleeping-mask",
  "biodance-bio-collagen-real-deep-mask",
  "skin1004-madagascar-centella-light-cleansing-oil",
  "medicube-collagen-jelly-cream",
  "medicube-collagen-night-wrapping-mask",
  "dr-althea-147-barrier-cream",
  "torriden-dive-in-low-molecular-hyaluronic-acid-serum",
  "round-lab-1025-dokdo-toner",
];

/** Seoul Beauty catalogue cash price minus R$ 20 (owner's request, 2026-10-12). */
const CATALOG_PRICES: Record<string, number> = {
  "skin1004-madagascar-centella-ampoule-foam": 12999,
  "skin1004-madagascar-centella-light-cleansing-oil": 13999,
  "skin1004-madagascar-centella-ampoule": 17999,
  "skin1004-madagascar-centella-tone-brightening-capsule-ampoule": 17999,
  "medicube-zero-pore-pad": 17999,
  "dr-althea-345-relief-cream": 17999,
  "celimax-the-vita-a-retinal-shot": 16499,
  "numbuzin-no9-volumetox-eye-cream": 14999,
  "celimax-pore-dark-spot-brightening-cream": 12999,
  "medicube-pdrn-pink-peptide-serum": 15999,
  "medicube-pdrn-pink-collagen-gel-mask": 2499,
};
let adminId: string;
let outsiderId: string;

const one = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];
const all = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const productId = async (slug: string) => (await one<{ id: string }>(`select id from products where slug = $1`, [slug])).id;
/** Every order needs a registered customer (migration 014). */
const CUSTOMER = JSON.stringify({ name: "Cliente Teste", email: "cliente@teste.com", phone: "11999990000" });
const WITH_CUSTOMER = `p_customer => '${CUSTOMER}'::jsonb`;
let customerSeq = 0;
/** A distinct customer (e.g. for first-purchase checks). */
const newCustomer = (phone?: string) => {
  customerSeq += 1;
  return JSON.stringify({ name: `Cliente ${customerSeq}`, email: `cliente${customerSeq}@teste.com`, phone: phone ?? `1197777${String(customerSeq).padStart(4, "0")}` });
};

beforeAll(async () => {
  db = await createTestDb();
  adminId = (await one<{ id: string }>(`insert into auth.users (email) values ('owner@mivora.test') returning id`)).id;
  outsiderId = (await one<{ id: string }>(`insert into auth.users (email) values ('someone@mivora.test') returning id`)).id;
  await db.query(`select public.grant_admin_by_email('owner@mivora.test', 'owner')`);
}, 60_000);

describe("initial catalogue (Teste 10 / 12)", () => {
  it("has the nine stock products, published, with brand and categories", async () => {
    const rows = await all<{ slug: string; brand: string; types: number; price_cents: number | null; stock_quantity: number | null }>(`
      select p.slug, b.name as brand, p.price_cents, p.stock_quantity,
             (select count(*)::int from product_categories pc join categories c on c.id = pc.category_id
               where pc.product_id = p.id and c.kind = 'product_type') as types
        from products p join brands b on b.id = p.brand_id join product_private pp on pp.product_id = p.id
       where pp.sourcing_status = 'stock_confirmed' and p.status = 'published' order by p.sort_order`);
    expect(rows).toHaveLength(9);
    expect(new Set(rows.map((r) => r.brand))).toEqual(new Set(["Medicube", "SKIN1004", "Celimax", "Dr. Althea", "Numbuzin"]));
    for (const r of rows) {
      expect(r.types, r.slug).toBeGreaterThanOrEqual(1);
      expect(r.price_cents, `${r.slug} price must come from the supplier catalogue`).toBe(CATALOG_PRICES[r.slug] ?? null);
      expect(r.stock_quantity, `${r.slug} must not have an invented stock`).toBeNull();
    }
  });

  it("maps each supplied photo to the right product (catalogue photos fill the gaps)", async () => {
    const rows = await all<{ slug: string; url: string | null; media_pending: boolean }>(`
      select p.slug, i.url, p.media_pending from products p
      left join product_images i on i.product_id = p.id and i.is_primary order by p.slug`);
    const bySlug = Object.fromEntries(rows.map((r) => [r.slug, r]));
    expect(bySlug["skin1004-madagascar-centella-ampoule"].url).toBe("/products/skin1004-madagascar-centella-ampoule.webp");
    expect(bySlug["skin1004-madagascar-centella-tone-brightening-capsule-ampoule"].url).toBe(
      "/products/skin1004-madagascar-centella-tone-brightening-capsule-ampoule.webp",
    );
    expect(bySlug["dr-althea-345-relief-cream"].url).toBe("/products/dr-althea-345-relief-cream.webp");
    expect(bySlug["celimax-pore-dark-spot-brightening-cream"].url).toBe("/products/celimax-pore-dark-spot-brightening-cream.webp");
    expect(bySlug["medicube-deep-vita-c-pad"].url).toBe("/products/medicube-deep-vita-c-pad.webp");
    // These three had no photo; the Catálogo MIVORA 2026 provides them
    for (const slug of ["medicube-pdrn-pink-peptide-serum", "medicube-zero-pore-pad", "celimax-the-vita-a-retinal-shot"]) {
      expect(bySlug[slug].url).toBe(`/products/${slug}.webp`);
      expect(bySlug[slug].media_pending).toBe(false);
    }
  });

  it("keeps planned products out of the public catalogue", async () => {
    const n = await one<{ n: number }>(`select count(*)::int as n from products where (name ilike '%Atobarrier%' or name ilike '%Banila%' or name ilike '%EGF%') and status = 'published'`);
    expect(n.n).toBe(0);
    const s = await one<{ n: number }>(`select count(*)::int as n from product_suggestions`);
    expect(s.n).toBe(6);
  });
});

describe("Catálogo MIVORA 2026 (50 produtos)", () => {
  const catalogueCounts = async () =>
    one<{ products: number; images: number; brands: number; categories: number; links: number }>(`
      select (select count(*)::int from products) as products,
             (select count(*)::int from product_images) as images,
             (select count(*)::int from brands) as brands,
             (select count(*)::int from categories) as categories,
             (select count(*)::int from product_categories) as links`);

  it("adds the 34 missing products as 'Sob consulta', without price or stock, each with its photo", async () => {
    const rows = await all<{ slug: string; status: string; availability: string; price_cents: number | null; track_inventory: boolean; url: string | null; sourcing_status: string; regulatory_status: string; content_verified: boolean; types: number }>(`
      select p.slug, p.status, p.availability, p.price_cents, p.track_inventory, i.url,
             pp.sourcing_status, pp.regulatory_status, pp.content_verified,
             (select count(*)::int from product_categories pc join categories c on c.id = pc.category_id
               where pc.product_id = p.id and c.kind = 'product_type') as types
        from products p
        join product_private pp on pp.product_id = p.id
        left join product_images i on i.product_id = p.id and i.is_primary
       where p.sort_order between 101 and 150`);
    expect(rows).toHaveLength(34);
    for (const r of rows) {
      expect(r, r.slug).toMatchObject({
        status: "published",
        availability: "on_request",
        price_cents: null,
        track_inventory: false,
        url: `/products/${r.slug}.webp`,
        sourcing_status: "planned",
        regulatory_status: "not_verified",
        content_verified: false,
      });
      expect(r.types, r.slug).toBeGreaterThanOrEqual(1);
    }
  });

  it("creates the new brands and categories and links sunscreen to the ritual", async () => {
    const brands = await all<{ slug: string }>(`select slug from brands where slug in ('victorias-secret', 'olaplex', 'k18', 'kerastase', 'lilyeve')`);
    expect(brands).toHaveLength(5);
    const tree = await all<{ slug: string; parent: string | null }>(`
      select c.slug, p.slug as parent from categories c left join categories p on p.id = c.parent_id
       where c.slug in ('protecao-solar', 'cuidados-capilares', 'shampoos', 'fragrancias', 'body-splash', 'bases-e-cushions') order by c.slug`);
    expect(Object.fromEntries(tree.map((t) => [t.slug, t.parent]))).toEqual({
      "bases-e-cushions": "maquiagem",
      "body-splash": "fragrancias",
      "cuidados-capilares": null,
      fragrancias: null,
      "protecao-solar": null,
      shampoos: "cuidados-capilares",
    });
    const step = await one<{ slug: string }>(`select c.slug from ritual_steps r join categories c on c.id = r.category_id where r.step_number = 6`);
    expect(step.slug).toBe("protecao-solar");
  });

  it("never replaces existing photos, prices or the owner's photos", async () => {
    const rows = await all<{ slug: string; images: number; url: string; price_cents: number | null }>(`
      select p.slug, count(i.*)::int as images, min(i.url) as url, p.price_cents
        from products p join product_images i on i.product_id = p.id
       where p.slug in ('dr-althea-345-relief-cream', 'celimax-pore-dark-spot-brightening-cream', 'skin1004-madagascar-centella-ampoule')
       group by p.slug, p.price_cents order by p.slug`);
    expect(rows.map((r) => [r.slug, r.images, r.url, r.price_cents])).toEqual([
      ["celimax-pore-dark-spot-brightening-cream", 1, "/products/celimax-pore-dark-spot-brightening-cream.webp", 12999],
      ["dr-althea-345-relief-cream", 1, "/products/dr-althea-345-relief-cream.webp", 17999],
      ["skin1004-madagascar-centella-ampoule", 1, "/products/skin1004-madagascar-centella-ampoule.webp", 17999],
    ]);
    const jelly = await one<{ volume: string }>(`select volume from products where slug = 'medicube-collagen-jelly-cream'`);
    expect(jelly.volume).toBe("50 ml");
  });

  it("shows 'Sob consulta' products to visitors but never accepts them in an order", async () => {
    const pid = await productId("olaplex-no3-hair-perfector");
    await asRole(db, "anon", null, async () => {
      expect(await all(`select id from products where id = $1`, [pid])).toHaveLength(1);
      await expect(db.query(`select create_order_intent($1::jsonb, ${WITH_CUSTOMER})`, [JSON.stringify([{ product_id: pid, quantity: 1 }])])).rejects.toThrow(/item_unavailable/);
    });
    // and they still cannot be put on sale without the documentation check
    await asRole(db, "authenticated", adminId, async () => {
      await expect(db.query(`update products set availability = 'in_stock' where id = $1`, [pid])).rejects.toThrow(/compliance_required/);
    });
  });

  it("re-running the catalogue migration changes nothing (idempotent)", async () => {
    const before = await catalogueCounts();
    const file = readdirSync(path.join(process.cwd(), "supabase", "migrations")).find((f) => f.includes("catalogo_mivora_2026"))!;
    await db.exec(readFileSync(path.join(process.cwd(), "supabase", "migrations", file), "utf8"));
    expect(await catalogueCounts()).toEqual(before);
  });
});

describe("search document", () => {
  const search = (term: string) =>
    all<{ slug: string }>(`select slug from products where status = 'published' and search_text like '%' || normalize_search($1) || '%' order by slug`, [term]);

  it("finds by ingredient, brand, need and ignores accents/case", async () => {
    expect((await search("CENTELLA")).length).toBeGreaterThanOrEqual(3);
    const medicube = (await search("medicube")).map((r) => r.slug);
    expect(medicube).toHaveLength(10);
    expect(medicube.every((slug) => slug.startsWith("medicube-"))).toBe(true);
    expect(await search("body splash")).toHaveLength(10);
    expect((await search("olaplex")).map((r) => r.slug)).toEqual(["olaplex-no3-hair-perfector"]);
    // the cleansing oil also matches ("remove maquiagem e protetor solar")
    expect((await search("protetor solar")).map((r) => r.slug)).toEqual(
      expect.arrayContaining(["beauty-of-joseon-relief-sun-rice-probiotics", "skin1004-madagascar-centella-hyalu-cica-water-fit-sun-serum"]),
    );
    expect((await search("vitamina c")).map((r) => r.slug)).toContain("medicube-deep-vita-c-pad");
    expect((await search("poros")).map((r) => r.slug)).toContain("medicube-zero-pore-pad");
    expect((await search("pele sensivel")).map((r) => r.slug)).toContain("dr-althea-345-relief-cream");
    expect((await search("ácido tranexâmico")).map((r) => r.slug)).toEqual([
      "anua-niacinamide-10-txa-4-dark-spot-correcting-serum",
      "celimax-pore-dark-spot-brightening-cream",
    ]);
  });
});

describe("row level security (Teste 9)", () => {
  it("anon sees published catalogue but never private or order data", async () => {
    const published = (await one<{ n: number }>(`select count(*)::int as n from products where status = 'published'`)).n;
    expect(published).toBe(53);
    await asRole(db, "anon", null, async () => {
      expect((await all(`select id from products`)).length).toBe(published);
      expect(await all(`select * from product_private`)).toHaveLength(0);
      expect(await all(`select * from order_intents`)).toHaveLength(0);
      expect(await all(`select * from audit_log`)).toHaveLength(0);
      expect(await all(`select * from product_suggestions`)).toHaveLength(0);
      await expect(db.query(`update products set price_cents = 1 where true`)).resolves.toMatchObject({ affectedRows: 0 });
      await expect(db.query(`insert into brands (slug, name) values ('x', 'X')`)).rejects.toThrow(/row-level security/);
      await expect(db.query(`select public.admin_dashboard_stats()`)).rejects.toThrow(/permission denied|not_authorized/);
      await expect(db.query(`select public.grant_admin_by_email('someone@mivora.test')`)).rejects.toThrow(/permission denied/);
    });
  });

  it("authenticated non-admin users have no admin powers", async () => {
    await asRole(db, "authenticated", outsiderId, async () => {
      expect(await all(`select * from product_private`)).toHaveLength(0);
      await expect(db.query(`insert into admin_users (user_id, role) values ($1, 'owner')`, [outsiderId])).rejects.toThrow(/row-level security/);
      const pid = (await one<{ id: string }>(`select id from products limit 1`)).id;
      await expect(db.query(`select admin_adjust_stock($1, null, 'in', 5, 'x')`, [pid])).rejects.toThrow(/not_authorized/);
    });
  });
});

describe("admin catalogue management (Testes 1, 2, 7)", () => {
  it("admin creates, prices, publishes and unpublishes a product", async () => {
    const brandId = (await one<{ id: string }>(`select id from brands where slug = 'medicube'`)).id;
    await asRole(db, "authenticated", adminId, async () => {
      const p = await one<{ id: string }>(
        `insert into products (slug, name, brand_id, status, price_cents) values ('teste-produto', 'Produto Teste', $1, 'draft', 12990) returning id`,
        [brandId],
      );
      await db.query(`insert into product_private (product_id, cost_cents, sku, regulatory_status) values ($1, 5000, 'SKU-TESTE', 'verified')`, [p.id]);
      await db.query(`insert into product_images (product_id, url, is_primary) values ($1, 'https://x/y.webp', true)`, [p.id]);
      await db.query(`update products set status = 'published' where id = $1`, [p.id]);
    });
    await asRole(db, "anon", null, async () => {
      const row = await one<{ price_cents: number; published_at: string }>(`select price_cents, published_at from products where slug = 'teste-produto'`);
      expect(row.price_cents).toBe(12990);
      expect(row.published_at).not.toBeNull();
      expect(await all(`select * from product_images where url = 'https://x/y.webp'`)).toHaveLength(1);
    });
    await asRole(db, "authenticated", adminId, () => db.query(`update products set price_cents = 9990 where slug = 'teste-produto'`));
    await asRole(db, "anon", null, async () => {
      expect((await one<{ price_cents: number }>(`select price_cents from products where slug = 'teste-produto'`)).price_cents).toBe(9990);
    });
    await asRole(db, "authenticated", adminId, () => db.query(`update products set status = 'draft' where slug = 'teste-produto'`));
    await asRole(db, "anon", null, async () => {
      expect(await all(`select * from products where slug = 'teste-produto'`)).toHaveLength(0);
      expect(await all(`select * from product_images where url = 'https://x/y.webp'`)).toHaveLength(0);
    });
    const audit = await all<{ action: string }>(`select action from audit_log where entity = 'products' and actor_id = $1`, [adminId]);
    expect(audit.length).toBeGreaterThanOrEqual(3);
  });
});

describe("order intents (Testes 4, 5, 6, 8)", () => {
  it("computes subtotals on the server and never prices unpriced items", async () => {
    const centella = await productId("skin1004-madagascar-centella-ampoule");
    const cream = await productId("dr-althea-345-relief-cream");
    const vitac = await productId("medicube-deep-vita-c-pad");
    await db.query(`update products set price_cents = 11990 where id = $1`, [centella]);
    await db.query(`update products set price_cents = 15900 where id = $1`, [cream]);

    const res = await asRole(db, "anon", null, () =>
      one<{ r: { code: string; subtotal_cents: number; has_unpriced_items: boolean; items: { unit_price_cents: number | null }[] } }>(
        `select create_order_intent($1::jsonb, ${WITH_CUSTOMER}) as r`,
        [JSON.stringify([
          { product_id: centella, quantity: 2 },
          { product_id: cream, quantity: 1 },
          { product_id: vitac, quantity: 3 },
        ])],
      ),
    );
    expect(res.r.code).toMatch(/^MIV-\d{6}$/);
    expect(res.r.subtotal_cents).toBe(2 * 11990 + 15900);
    expect(res.r.has_unpriced_items).toBe(true);
    expect(res.r.items[2].unit_price_cents).toBeNull();
    expect((res.r.items as unknown as { code: string }[]).every((i) => /^MV[0-9]{4}$/.test(i.code))).toBe(true);

    const order = await one<{ status: string; inventory_state: string }>(`select status, inventory_state from order_intents where code = $1`, [res.r.code]);
    expect(order.status).toBe("started");
    expect(order.inventory_state).toBe("none");
    const stats = await asRole(db, "authenticated", adminId, () => one<{ s: Record<string, number> }>(`select admin_dashboard_stats() as s`));
    expect(stats.s.orders_started).toBeGreaterThanOrEqual(1);
    expect(stats.s.orders_completed).toBe(0);
    expect(stats.s.sales_completed_cents).toBe(0);
  });

  it("rejects out-of-stock tracked products and tampered quantities", async () => {
    const pid = await productId("celimax-pore-dark-spot-brightening-cream");
    await db.query(`update products set track_inventory = true, stock_quantity = 0 where id = $1`, [pid]);
    await asRole(db, "anon", null, async () => {
      await expect(db.query(`select create_order_intent($1::jsonb, ${WITH_CUSTOMER})`, [JSON.stringify([{ product_id: pid, quantity: 1 }])])).rejects.toThrow(/item_unavailable/);
      await expect(db.query(`select create_order_intent($1::jsonb, ${WITH_CUSTOMER})`, [JSON.stringify([{ product_id: pid, quantity: 500 }])])).rejects.toThrow(/invalid_quantity/);
      await expect(db.query(`select create_order_intent('[]'::jsonb)`)).rejects.toThrow(/empty_cart/);
    });
    await db.query(`update products set stock_quantity = 2 where id = $1`, [pid]);
    await asRole(db, "anon", null, async () => {
      await expect(db.query(`select create_order_intent($1::jsonb, ${WITH_CUSTOMER})`, [JSON.stringify([{ product_id: pid, quantity: 3 }])])).rejects.toThrow(/insufficient_stock/);
    });
  });

  it("moves stock only on manual confirmation / completion / cancellation", async () => {
    const pid = await productId("celimax-pore-dark-spot-brightening-cream");
    await db.query(`update products set track_inventory = true, stock_quantity = 5, reserved_quantity = 0, price_cents = 8990 where id = $1`, [pid]);
    const r = await asRole(db, "anon", null, () =>
      one<{ r: { id: string } }>(`select create_order_intent($1::jsonb, ${WITH_CUSTOMER}) as r`, [JSON.stringify([{ product_id: pid, quantity: 2 }])]),
    );
    const stock = () => one<{ stock_quantity: number; reserved_quantity: number }>(`select stock_quantity, reserved_quantity from products where id = $1`, [pid]);
    expect(await stock()).toEqual({ stock_quantity: 5, reserved_quantity: 0 });

    await asRole(db, "authenticated", adminId, () => db.query(`select admin_set_order_status($1, 'confirmed', 'Cliente confirmou')`, [r.r.id]));
    expect(await stock()).toEqual({ stock_quantity: 5, reserved_quantity: 2 });

    await asRole(db, "authenticated", adminId, () => db.query(`select admin_set_order_status($1, 'completed')`, [r.r.id]));
    expect(await stock()).toEqual({ stock_quantity: 3, reserved_quantity: 0 });

    await asRole(db, "authenticated", adminId, () => db.query(`select admin_set_order_status($1, 'cancelled', 'Devolução')`, [r.r.id]));
    expect(await stock()).toEqual({ stock_quantity: 5, reserved_quantity: 0 });

    const moves = await all<{ movement_type: string }>(`select movement_type from inventory_movements where order_id = $1 order by id`, [r.r.id]);
    expect(moves.map((m) => m.movement_type)).toEqual(["reservation", "sale", "return"]);
    const history = await all<{ from_status: string | null; to_status: string }>(`select from_status, to_status from order_status_history where order_id = $1 order by id`, [r.r.id]);
    expect(history.map((h) => `${h.from_status}->${h.to_status}`)).toEqual(["null->started", "started->confirmed", "confirmed->completed", "completed->cancelled"]);
  });

  it("supports manual stock entry and blocks negative stock", async () => {
    const pid = await productId("medicube-zero-pore-pad");
    await asRole(db, "authenticated", adminId, async () => {
      await db.query(`select admin_adjust_stock($1, null, 'in', 10, 'Entrada de mercadoria')`, [pid]);
      await expect(db.query(`select admin_adjust_stock($1, null, 'out', 11, 'x')`, [pid])).rejects.toThrow(/insufficient_stock/);
    });
    const p = await one<{ stock_quantity: number; track_inventory: boolean; is_available: boolean }>(
      `select stock_quantity, track_inventory, is_available from products where id = $1`, [pid]);
    expect(p).toEqual({ stock_quantity: 10, track_inventory: true, is_available: true });
  });
});

describe("catalogue expansion (29 products)", () => {
  const counts = async () =>
    one<{ products: number; brands: number; slugs: number; links: number; categories: number }>(`
      select (select count(*)::int from products where slug <> 'teste-produto') as products,
             (select count(*)::int from brands) as brands,
             (select count(distinct slug)::int from products) as slugs,
             (select count(*)::int from product_categories) as links,
             (select count(*)::int from categories) as categories`);

  it("has 63 records (29 + 34 from the catalogue), 29 brands and every product in a product type", async () => {
    const c = await counts();
    expect(c.products).toBe(63);
    expect(c.brands).toBe(29);
    const orphans = await all<{ slug: string }>(`
      select p.slug from products p where p.slug <> 'teste-produto' and not exists (
        select 1 from product_categories pc join categories c on c.id = pc.category_id
         where pc.product_id = p.id and c.kind = 'product_type')`);
    expect(orphans).toEqual([]);
  });

  it("keeps the 20 expansion records without invented price or stock (catalogue items visible as 'Sob consulta')", async () => {
    const rows = await all<{ slug: string; status: string; availability: string; price_cents: number | null; stock_quantity: number | null; sourcing_status: string; images: number }>(`
      select p.slug, p.status, p.availability, p.price_cents, p.stock_quantity, pp.sourcing_status,
             (select count(*)::int from product_images i where i.product_id = p.id) as images
        from products p join product_private pp on pp.product_id = p.id
       where p.sort_order between 10 and 29 and p.slug <> 'teste-produto'`);
    expect(rows).toHaveLength(20);
    for (const r of rows) {
      const inCatalogue = CATALOGUE_DRAFTS.includes(r.slug);
      expect(r, r.slug).toMatchObject({
        status: inCatalogue ? "published" : "draft",
        availability: inCatalogue ? "on_request" : "coming_soon",
        price_cents: CATALOG_PRICES[r.slug] ?? null,
        stock_quantity: null,
        images: inCatalogue ? 1 : 0,
      });
    }
    expect(rows.filter((r) => r.sourcing_status === "planned")).toHaveLength(14);
    expect(rows.filter((r) => r.sourcing_status === "evaluating")).toHaveLength(6);
  });

  it("re-running the data migration changes nothing (idempotent)", async () => {
    const before = await counts();
    const file = readdirSync(path.join(process.cwd(), "supabase", "migrations")).find((f) => f.includes("catalog_expansion_data"))!;
    await db.exec(readFileSync(path.join(process.cwd(), "supabase", "migrations", file), "utf8"));
    expect(await counts()).toEqual(before);
  });

  it("hides drafts from visitors and never lets 'Em breve' products be ordered", async () => {
    const pid = await productId("aestura-atobarrier365-cream");
    await asRole(db, "anon", null, async () => {
      expect(await all(`select id from products where id = $1`, [pid])).toHaveLength(0);
    });
    await db.query(`update products set status = 'published' where id = $1`, [pid]);
    await asRole(db, "anon", null, async () => {
      expect(await all(`select id from products where id = $1`, [pid])).toHaveLength(1);
      await expect(db.query(`select create_order_intent($1::jsonb, ${WITH_CUSTOMER})`, [JSON.stringify([{ product_id: pid, quantity: 1 }])])).rejects.toThrow(/item_unavailable/);
    });
    await db.query(`update products set status = 'draft' where id = $1`, [pid]);
  });

  it("blocks sales of new products until documentation is verified", async () => {
    const pid = await productId("torriden-dive-in-low-molecular-hyaluronic-acid-serum");
    await asRole(db, "authenticated", adminId, async () => {
      await expect(db.query(`update products set status = 'published', availability = 'in_stock' where id = $1`, [pid])).rejects.toThrow(/compliance_required/);
      await db.query(`update product_private set regulatory_status = 'verified', regulatory_reference = 'teste' where product_id = $1`, [pid]);
      await db.query(`update products set status = 'published', availability = 'in_stock' where id = $1`, [pid]);
      await expect(db.query(`update product_private set regulatory_status = 'in_progress' where product_id = $1`, [pid])).rejects.toThrow(/compliance_required/);
    });
    const priv = await one<{ regulatory_verified_by: string }>(`select regulatory_verified_by from product_private where product_id = $1`, [pid]);
    expect(priv.regulatory_verified_by).toBe(adminId);
    // Originals (confirmed stock) keep selling
    const original = await productId("dr-althea-345-relief-cream");
    await db.query(`update products set availability = 'out_of_stock' where id = $1`, [original]);
    await db.query(`update products set availability = 'in_stock' where id = $1`, [original]);
  });

  it("exposes manual related products only between published items", async () => {
    const a = await productId("skin1004-madagascar-centella-ampoule");
    const draft = await productId("skin1004-madagascar-centella-ampoule-foam");
    const pub = await productId("dr-althea-345-relief-cream");
    await db.query(`insert into product_relations (product_id, related_product_id) values ($1, $2), ($1, $3)`, [a, draft, pub]);
    await asRole(db, "anon", null, async () => {
      const rows = await all<{ related_product_id: string }>(`select related_product_id from product_relations where product_id = $1`, [a]);
      expect(rows.map((r) => r.related_product_id)).toEqual([pub]);
    });
  });
});

describe("welcome offer (first purchase coupon)", () => {
  const order = (items: unknown, coupon: string | null, phone: string | null = null) =>
    asRole(db, "anon", null, () =>
      one<{ r: { id: string; subtotal_cents: number; discount_cents: number; coupon_code: string | null; discount_percent: number | null } }>(
        `select create_order_intent($1::jsonb, p_coupon_code => $2, p_customer => $3::jsonb) as r`,
        [JSON.stringify(items), coupon, newCustomer(phone ?? undefined)],
      ),
    );

  it("applies the configured percentage on priced items only, computed on the server", async () => {
    const ampoule = await productId("skin1004-madagascar-centella-ampoule");
    const vitac = await productId("medicube-deep-vita-c-pad"); // no price
    await db.query(`update products set price_cents = 17999 where id = $1`, [ampoule]);
    const res = await order([{ product_id: ampoule, quantity: 2 }, { product_id: vitac, quantity: 1 }], "bemvinda10");
    expect(res.r.subtotal_cents).toBe(35998);
    expect(res.r.discount_cents).toBe(3599);
    expect(res.r).toMatchObject({ coupon_code: "BEMVINDA10", discount_percent: 10 });
    const stored = await one<{ discount_cents: number; coupon_code: string }>(`select discount_cents, coupon_code from order_intents where id = $1`, [res.r.id]);
    expect(stored).toEqual({ discount_cents: 3599, coupon_code: "BEMVINDA10" });
  });

  it("rejects unknown codes, disabled offers and repeat customers (by phone)", async () => {
    const ampoule = await productId("skin1004-madagascar-centella-ampoule");
    await expect(order([{ product_id: ampoule, quantity: 1 }], "DESCONTO50")).rejects.toThrow(/coupon_invalid/);

    const first = await order([{ product_id: ampoule, quantity: 1 }], null, "(11) 98888-7777");
    await asRole(db, "authenticated", adminId, () => db.query(`select admin_set_order_status($1, 'confirmed')`, [first.r.id]));
    await expect(order([{ product_id: ampoule, quantity: 1 }], "BEMVINDA10", "11988887777")).rejects.toThrow(/coupon_not_first_purchase/);

    await db.query(`update store_settings set welcome_offer_enabled = false`);
    await expect(order([{ product_id: ampoule, quantity: 1 }], "BEMVINDA10")).rejects.toThrow(/coupon_invalid/);
    await db.query(`update store_settings set welcome_offer_enabled = true`);
    const none = await order([{ product_id: ampoule, quantity: 1 }], null);
    expect(none.r.discount_cents).toBe(0);
  });
});

describe("shipping calculator", () => {
  type OrderResult = {
    id: string;
    delivery: { name: string; method: string; fee_cents: number | null; estimate: string | null } | null;
    destination: { cep: string; city: string | null; uf: string | null } | null;
  };
  const order = (items: unknown, zoneId: string | null, shipping: unknown) =>
    asRole(db, "anon", null, () =>
      one<{ r: OrderResult }>(`select create_order_intent($1::jsonb, null, null, null, $2::uuid, null, $3::jsonb, $4::jsonb) as r`, [
        JSON.stringify(items),
        zoneId,
        shipping == null ? null : JSON.stringify(shipping),
        CUSTOMER,
      ]),
    );
  const stored = (id: string) =>
    one(
      `select delivery_zone_id, delivery_method, delivery_fee_cents, shipping_cep, shipping_city, shipping_uf, shipping_service, shipping_estimate
         from order_intents where id = $1`,
      [id],
    );

  it("restricts delivery zones by CEP range or city and checks coverage on the server", async () => {
    const ampoule = await productId("skin1004-madagascar-centella-ampoule");
    const zone = await one<{ id: string }>(
      `insert into delivery_zones (name, method, fee_cents, estimate, cep_ranges, cities)
       values ('Grande Vitória', 'local_delivery', 1500, '1 dia útil', '{29000000-29099999}', '{"Vila Velha/ES"}') returning id`,
    );
    await expect(db.query(`insert into delivery_zones (name, method, cep_ranges) values ('x', 'local_delivery', '{29099999-29000000}')`)).rejects.toThrow(/cep_ranges_valid/);
    await expect(db.query(`insert into delivery_zones (name, method, cities) values ('x', 'local_delivery', '{"Vitória/es"}')`)).rejects.toThrow(/cities_valid/);

    const covers = async (cep: string, city: string | null, uf: string | null) =>
      (await one<{ c: boolean }>(`select delivery_zone_covers($1, $2, $3, $4) as c`, [zone.id, cep, city, uf])).c;
    expect(await covers("29055100", "Vitória", "ES")).toBe(true);
    expect(await covers("29100010", "VILA VELHA", "ES")).toBe(true);
    expect(await covers("29100010", "Vila Velha", "SP")).toBe(false);
    expect(await covers("01001000", "São Paulo", "SP")).toBe(false);

    const ok = await order([{ product_id: ampoule, quantity: 1 }], zone.id, { cep: "29055-100", city: "Vitória", uf: "ES" });
    expect(ok.r.delivery).toMatchObject({ name: "Grande Vitória", method: "local_delivery", fee_cents: 1500 });
    expect(ok.r.destination).toEqual({ cep: "29055100", city: "Vitória", uf: "ES" });
    expect(await stored(ok.r.id)).toEqual({
      delivery_zone_id: zone.id,
      delivery_method: "local_delivery",
      delivery_fee_cents: 1500,
      shipping_cep: "29055100",
      shipping_city: "Vitória",
      shipping_uf: "ES",
      shipping_service: "Grande Vitória",
      shipping_estimate: "1 dia útil",
    });

    await expect(order([{ product_id: ampoule, quantity: 1 }], zone.id, { cep: "01001000", city: "São Paulo", uf: "SP" })).rejects.toThrow(/delivery_zone_unavailable/);
    await expect(order([{ product_id: ampoule, quantity: 1 }], zone.id, { cep: "2905" })).rejects.toThrow(/invalid_cep/);
    await db.query(`update delivery_zones set is_active = false where id = $1`, [zone.id]);
  });

  it("records carrier quotes and 'a combinar' orders with the destination", async () => {
    const ampoule = await productId("skin1004-madagascar-centella-ampoule");
    const sedex = await order([{ product_id: ampoule, quantity: 1 }], null, {
      cep: "01001000",
      city: "São Paulo",
      uf: "sp",
      service: "Correios SEDEX",
      fee_cents: 4379,
      estimate: "3 dias úteis",
    });
    expect(sedex.r.delivery).toEqual({ name: "Correios SEDEX", method: "shipping", fee_cents: 4379, estimate: "3 dias úteis" });
    expect(sedex.r.destination).toEqual({ cep: "01001000", city: "São Paulo", uf: "SP" });
    expect(await stored(sedex.r.id)).toMatchObject({ delivery_zone_id: null, delivery_method: "shipping", delivery_fee_cents: 4379, shipping_service: "Correios SEDEX" });

    await expect(order([{ product_id: ampoule, quantity: 1 }], null, { cep: "01001000", service: "PAC", fee_cents: "-5" })).rejects.toThrow(/invalid_shipping/);
    await expect(order([{ product_id: ampoule, quantity: 1 }], null, { service: "PAC", fee_cents: 100 })).rejects.toThrow(/invalid_cep/);
    await expect(order([{ product_id: ampoule, quantity: 1 }], null, [1])).rejects.toThrow(/invalid_shipping/);

    const arrange = await order([{ product_id: ampoule, quantity: 1 }], null, { cep: "29055100", city: "Vitória", uf: "ES" });
    expect(arrange.r.delivery).toBeNull();
    expect(arrange.r.destination).toEqual({ cep: "29055100", city: "Vitória", uf: "ES" });
    expect(await stored(arrange.r.id)).toMatchObject({ delivery_method: "to_arrange", delivery_fee_cents: null, shipping_cep: "29055100", shipping_service: null });
  });

  it("keeps calculator settings and product dimensions within limits; coverage is public, destinations are not", async () => {
    expect(await one(`select shipping_calculator_enabled, carrier_quotes_enabled, shipping_handling_days, shipping_default_weight_g from store_settings where id = 1`)).toEqual({
      shipping_calculator_enabled: true,
      carrier_quotes_enabled: false,
      shipping_handling_days: 1,
      shipping_default_weight_g: 300,
    });
    await expect(db.query(`update products set weight_g = 0 where slug = 'skin1004-madagascar-centella-ampoule'`)).rejects.toThrow(/check/);
    await expect(db.query(`update store_settings set shipping_origin_cep = '2905-100' where id = 1`)).rejects.toThrow(/check/);
    await expect(db.query(`update store_settings set shipping_markup_percent = 150 where id = 1`)).rejects.toThrow(/check/);
    await asRole(db, "anon", null, async () => {
      expect((await all<{ cep_ranges: string[] }>(`select cep_ranges, cities from delivery_zones where is_active`)).length).toBeGreaterThan(0);
      expect(await all(`select weight_g, height_cm from products where status = 'published' limit 1`)).toHaveLength(1);
      expect(await all(`select shipping_cep from order_intents`)).toHaveLength(0);
    });
  });
});

describe("home carousel", () => {
  // the owner's own art, in the order she sent it (migration 013)
  const ART = ["/banners/home-mivora-serum.webp", "/banners/home-mivora-creme.webp", "/banners/home-mivora-gel.webp", "/banners/home-mivora-mascara.webp"];
  type Slide = {
    title: string;
    image_desktop_url: string | null;
    image_alt: string | null;
    cta_label: string | null;
    cta_href: string | null;
    cta2_label: string | null;
    product_slug: string | null;
    background_color: string | null;
    layout: string;
  };
  const slides = () =>
    asRole(db, "anon", null, () =>
      all<Slide>(
        `select b.title, b.image_desktop_url, b.image_alt, b.cta_label, b.cta_href, b.cta2_label, p.slug as product_slug, b.background_color, b.layout
           from banners b left join products p on p.id = b.product_id
          where b.placement = 'hero' order by b.sort_order`,
      ),
    );

  it("opens with the mockup slide (real serum photo on rosé), then the owner's four banners, each with copy and a link", async () => {
    const rows = await slides();
    expect(rows[0]).toMatchObject({
      title: "Sua pele, seu ritual.",
      product_slug: "medicube-pdrn-pink-peptide-serum",
      image_desktop_url: null,
      cta_href: "/produtos",
      background_color: "#F6E4E1",
      layout: "split",
    });
    expect(rows.slice(1).map((r) => r.image_desktop_url)).toEqual(ART);
    expect(rows.slice(1).every((r) => r.layout === "full")).toBe(true);
    expect(rows[1]).toMatchObject({ title: "Seu momento de autocuidado", cta2_label: null });
    expect(rows[2]).toMatchObject({ title: "Hidratação que deixa a pele macia", cta_href: "/categorias/hidratantes" });
    // no campaign photo with people is left
    expect(rows.some((r) => r.image_desktop_url?.includes("medicube") || r.image_desktop_url?.includes("aparelho"))).toBe(false);
    expect(new Set(rows.map((r) => r.title)).size).toBe(rows.length);
    for (const r of rows) {
      expect(r.cta_label).toBeTruthy();
      expect(r.cta_href).toMatch(/^\//);
      expect(r.background_color).toMatch(/^#[0-9A-F]{6}$/);
      if (r.image_desktop_url) {
        expect(r.image_alt).toBeTruthy();
        expect(existsSync(path.join(process.cwd(), "public", r.image_desktop_url))).toBe(true);
      }
      const slug = r.cta_href!.match(/^\/produtos\/(.+)$/)?.[1];
      if (slug) expect(await one(`select status from products where slug = $1`, [slug])).toEqual({ status: "published" });
    }
  });

  it("re-running the carousel, premium home and banner art migrations changes nothing (idempotent)", async () => {
    const before = await slides();
    const banners = await all(`select placement, title, sort_order from banners order by placement, sort_order`);
    for (const name of ["home_carousel", "premium_home", "authored_banners"]) {
      const file = readdirSync(path.join(process.cwd(), "supabase", "migrations")).find((f) => f.includes(name))!;
      await db.exec(readFileSync(path.join(process.cwd(), "supabase", "migrations", file), "utf8"));
    }
    expect(await slides()).toEqual(before);
    expect(await all(`select placement, title, sort_order from banners order by placement, sort_order`)).toEqual(banners);
    expect((await one<{ n: number }>(`select count(*)::int as n from banners where placement = 'hero'`)).n).toBe(5);
  });
});

describe("premium home", () => {
  it("has one banner for routines and one for upcoming launches, with the mockup copy", async () => {
    const rows = await all<{ placement: string; title: string; cta_href: string }>(
      `select placement, title, cta_href from banners where placement in ('routines', 'coming_soon') order by placement`,
    );
    expect(rows).toEqual([
      { placement: "coming_soon", title: "Em breve na MIVORA", cta_href: "/produtos?disponibilidade=em-breve" },
      { placement: "routines", title: "Rotinas de Skincare", cta_href: "/ritual" },
    ]);
    await expect(db.query(`insert into banners (placement, title) values ('popup', 'x')`)).rejects.toThrow(/placement_check/);
    await expect(db.query(`update banners set background_color = 'pink' where placement = 'routines'`)).rejects.toThrow(/check/);
  });

  it("features the five needs of the mockup, in order", async () => {
    const rows = await all<{ name: string }>(`select name from categories where kind = 'concern' and show_on_home order by sort_order, name`);
    expect(rows.map((r) => r.name)).toEqual(["Hidratação", "Luminosidade", "Poros e textura", "Anti-idade", "Pele sensível"]);
  });

  it("keeps the top bar editable, without claiming nationwide delivery", async () => {
    const s = await one<{ top_bar_messages: string[]; newsletter_enabled: boolean }>(`select top_bar_messages, newsletter_enabled from store_settings where id = 1`);
    expect(s.top_bar_messages).toHaveLength(3);
    expect(JSON.stringify(s)).not.toMatch(/todo o Brasil/i);
    expect(s.newsletter_enabled).toBe(true);
    await expect(db.query(`update store_settings set top_bar_messages = array['a','b','c','d','e'] where id = 1`)).rejects.toThrow(/top_bar_valid/);
    expect(await one(`select shipping_max_carrier_options from store_settings where id = 1`)).toEqual({ shipping_max_carrier_options: 4 });
    await expect(db.query(`update store_settings set shipping_max_carrier_options = 50 where id = 1`)).rejects.toThrow(/check/);
  });

  it("publishes testimonials only with the customer's authorisation and shows visitors only published ones", async () => {
    expect(await asRole(db, "anon", null, () => all(`select * from testimonials`))).toHaveLength(0);
    await expect(
      db.query(`insert into testimonials (author_name, body, is_published) values ('Ana', 'Gostei muito do atendimento.', true)`),
    ).rejects.toThrow(/publish_requires_consent/);
    await asRole(db, "authenticated", outsiderId, () =>
      expect(db.query(`insert into testimonials (author_name, body) values ('Ana', 'Gostei muito do atendimento.')`)).rejects.toThrow(/row-level security/),
    );
    await asRole(db, "authenticated", adminId, () =>
      db.query(
        `insert into testimonials (author_name, body, rating, consent_confirmed, is_published)
         values ('Ana S.', 'Gostei muito do atendimento.', 5, true, true), ('Bia', 'Rascunho ainda não publicado.', null, false, false)`,
      ),
    );
    const visible = await asRole(db, "anon", null, () => all<{ author_name: string }>(`select author_name from testimonials`));
    expect(visible.map((t) => t.author_name)).toEqual(["Ana S."]);
    await db.query(`delete from testimonials`);
  });

  it("subscribes to the newsletter only with consent and a valid e-mail, without revealing who is subscribed", async () => {
    const sub = (email: string, consent = true) =>
      asRole(db, "anon", null, () => one<{ r: string }>(`select subscribe_newsletter($1, $2) as r`, [email, consent]));
    await expect(sub("Cliente@Exemplo.com.br")).resolves.toEqual({ r: "ok" });
    await expect(sub("cliente@exemplo.com.br")).resolves.toEqual({ r: "ok" });
    await expect(sub("sem-arroba")).rejects.toThrow(/invalid_email/);
    await expect(sub("outra@exemplo.com", false)).rejects.toThrow(/consent_required/);
    expect(await asRole(db, "anon", null, () => all(`select * from newsletter_subscribers`))).toHaveLength(0);
    await expect(asRole(db, "anon", null, () => db.query(`insert into newsletter_subscribers (email) values ('x@y.com')`))).rejects.toThrow(
      /row-level security/,
    );
    const rows = await asRole(db, "authenticated", adminId, () => all<{ email: string }>(`select email from newsletter_subscribers`));
    expect(rows).toEqual([{ email: "cliente@exemplo.com.br" }]);
    await db.query(`update store_settings set newsletter_enabled = false where id = 1`);
    await expect(sub("nova@exemplo.com")).rejects.toThrow(/newsletter_disabled/);
    await db.query(`update store_settings set newsletter_enabled = true where id = 1`);
  });
});

describe("customer registration (lead capture)", () => {
  const items = async () => JSON.stringify([{ product_id: await productId("skin1004-madagascar-centella-ampoule"), quantity: 1 }]);
  const register = (name: string, email: string, phone: string, marketing = false) =>
    asRole(db, "anon", null, () => one<{ r: string }>(`select register_customer($1, $2, $3, $4, 'teste') as r`, [name, email, phone, marketing]));

  it("never registers an order without a customer", async () => {
    await expect(asRole(db, "anon", null, async () => db.query(`select create_order_intent($1::jsonb)`, [await items()]))).rejects.toThrow(/customer_required/);
  });

  it("validates the registration, keeps customers private and the internal function closed", async () => {
    await expect(register("A", "ana@teste.com", "11999990001")).rejects.toThrow(/invalid_name/);
    await expect(register("Ana Lima", "ana-sem-arroba", "11999990001")).rejects.toThrow(/invalid_email/);
    await expect(register("Ana Lima", "ana@teste.com", "1234")).rejects.toThrow(/invalid_phone/);
    await expect(register("  Ana   Lima ", "Ana@Teste.com", "+55 (11) 99999-0001")).resolves.toEqual({ r: "ok" });
    expect(await asRole(db, "anon", null, () => all(`select * from customers`))).toHaveLength(0);
    await expect(asRole(db, "anon", null, () => db.query(`select upsert_customer('x', 'x@y.com', '11999990000', null, 'x')`))).rejects.toThrow(/permission denied/);
    await expect(asRole(db, "anon", null, () => db.query(`insert into customers (name, email, phone) values ('x', 'x@y.com', '11999990000')`))).rejects.toThrow(
      /row-level security|permission denied/,
    );
    const ana = await asRole(db, "authenticated", adminId, () => one(`select name, email, phone, marketing_consent from customers where email = 'ana@teste.com'`));
    expect(ana).toEqual({ name: "Ana Lima", email: "ana@teste.com", phone: "11999990001", marketing_consent: false });
  });

  it("updates the record by e-mail, honours marketing opt-in (newsletter) and keeps it when an order says nothing", async () => {
    await register("Bia Souza", "bia@teste.com", "21988887777", true);
    await register("Beatriz Souza", "bia@teste.com", "21988886666", true);
    const after = await one<{ name: string; phone: string; marketing_consent: boolean; marketing_consent_at: string | null }>(
      `select name, phone, marketing_consent, marketing_consent_at from customers where email = 'bia@teste.com'`,
    );
    expect(after).toMatchObject({ name: "Beatriz Souza", phone: "21988886666", marketing_consent: true });
    expect(after.marketing_consent_at).not.toBeNull();
    expect(await one(`select source from newsletter_subscribers where email = 'bia@teste.com'`)).toEqual({ source: "cadastro" });

    // an order without the "marketing" key keeps the previous choice
    await asRole(db, "anon", null, async () =>
      db.query(`select create_order_intent($1::jsonb, p_customer => $2::jsonb)`, [await items(), JSON.stringify({ name: "Beatriz Souza", email: "bia@teste.com", phone: "21988886666" })]),
    );
    expect(await one(`select marketing_consent from customers where email = 'bia@teste.com'`)).toEqual({ marketing_consent: true });
    // explicit opt-out clears the consent date
    await register("Beatriz Souza", "bia@teste.com", "21988886666", false);
    expect(await one(`select marketing_consent, marketing_consent_at from customers where email = 'bia@teste.com'`)).toEqual({ marketing_consent: false, marketing_consent_at: null });
  });

  it("links the order to the customer, snapshots name and WhatsApp, counts orders and keeps the delivery city", async () => {
    const r = await asRole(db, "anon", null, async () =>
      one<{ r: { id: string } }>(`select create_order_intent($1::jsonb, null, null, 'Entregar à tarde', null, null, $2::jsonb, $3::jsonb) as r`, [
        await items(),
        JSON.stringify({ cep: "29055100", city: "Vitória", uf: "ES" }),
        JSON.stringify({ name: "Carla Dias", email: "carla@teste.com", phone: "(27) 99876-5432", marketing: false }),
      ]),
    );
    const order = await one<{ customer_name: string; customer_phone: string; customer_notes: string; email: string }>(
      `select o.customer_name, o.customer_phone, o.customer_notes, c.email from order_intents o join customers c on c.id = o.customer_id where o.id = $1`,
      [r.r.id],
    );
    expect(order).toEqual({ customer_name: "Carla Dias", customer_phone: "27998765432", customer_notes: "Entregar à tarde", email: "carla@teste.com" });
    expect(await one(`select orders_count, cep, city, uf from customers where email = 'carla@teste.com'`)).toEqual({ orders_count: 1, cep: "29055100", city: "Vitória", uf: "ES" });
  });

  it("refuses the welcome coupon to a customer who already bought, even with another phone", async () => {
    const ampoule = await productId("skin1004-madagascar-centella-ampoule");
    const dani = (phone: string) => JSON.stringify({ name: "Dani Rocha", email: "dani@teste.com", phone });
    const first = await asRole(db, "anon", null, () =>
      one<{ r: { id: string } }>(`select create_order_intent($1::jsonb, p_customer => $2::jsonb) as r`, [JSON.stringify([{ product_id: ampoule, quantity: 1 }]), dani("31911112222")]),
    );
    await asRole(db, "authenticated", adminId, () => db.query(`select admin_set_order_status($1, 'confirmed')`, [first.r.id]));
    await expect(
      asRole(db, "anon", null, () =>
        db.query(`select create_order_intent($1::jsonb, p_coupon_code => 'BEMVINDA10', p_customer => $2::jsonb)`, [JSON.stringify([{ product_id: ampoule, quantity: 1 }]), dani("31933334444")]),
      ),
    ).rejects.toThrow(/coupon_not_first_purchase/);
  });
});


describe("online payments (Mercado Pago)", () => {
  type Online = { id: string; code: string; payment_method: string; amount_due_cents: number; subtotal_cents: number; discount_cents: number; items: { ref: string }[] };
  const SEDEX = { cep: "01001000", city: "São Paulo", uf: "SP", service: "Correios SEDEX", fee_cents: 4100, estimate: "3 dias úteis", recipient: "Cliente Teste", street: "Praça da Sé", number: "100", district: "Sé" };
  const online = (items: unknown, shipping: unknown, coupon: string | null = null, method = "mercadopago") =>
    asRole(db, "anon", null, () =>
      one<{ r: Online }>(`select create_order_intent($1::jsonb, null, null, null, null, $2, $3::jsonb, $4::jsonb, $5) as r`, [
        JSON.stringify(items),
        coupon,
        shipping == null ? null : JSON.stringify(shipping),
        newCustomer(),
        method,
      ]),
    );
  type Applied = { changed: boolean; status: string; payment_status: string };
  const pay = (id: string, paymentId: string, status: string, amount: number | null, type = "pix") =>
    asRole(db, "service_role", null, () =>
      one<{ r: Applied }>(`select apply_payment_update($1, $2, $3, 'detail', $4, $5) as r`, [id, paymentId, status, type, amount]),
    );
  const order = (id: string) =>
    one<{ status: string; inventory_state: string; payment_status: string; payment_id: string | null; amount_paid_cents: number | null; paid_at: string | null; payment_type: string | null }>(
      `select status, inventory_state, payment_status, payment_id, amount_paid_cents, paid_at, payment_type from order_intents where id = $1`,
      [id],
    );
  const notes = async (id: string) => (await all<{ note: string }>(`select note from order_status_history where order_id = $1 order by id`, [id])).map((h) => h.note);
  let cream: string;
  const stock = () => one<{ stock_quantity: number; reserved_quantity: number }>(`select stock_quantity, reserved_quantity from products where id = $1`, [cream]);

  beforeAll(async () => {
    cream = await productId("numbuzin-no9-volumetox-eye-cream");
    await db.query(`update products set price_cents = 10000, track_inventory = true, stock_quantity = 5, reserved_quantity = 0, availability = 'in_stock' where id = $1`, [cream]);
  });

  it("starts disabled and only accepts a known total: priced items and a delivery with a fee", async () => {
    expect(await one(`select online_payment_enabled, online_payment_max_installments from store_settings where id = 1`)).toEqual({ online_payment_enabled: false, online_payment_max_installments: 12 });
    await expect(online([{ product_id: cream, quantity: 1 }], SEDEX)).rejects.toThrow(/online_payment_disabled/);
    await db.query(`update store_settings set online_payment_enabled = true where id = 1`);
    await expect(db.query(`update store_settings set online_payment_max_installments = 18 where id = 1`)).rejects.toThrow(/check/);

    const vitac = await productId("medicube-deep-vita-c-pad"); // no price
    await expect(online([{ product_id: cream, quantity: 1 }, { product_id: vitac, quantity: 1 }], SEDEX)).rejects.toThrow(/online_payment_unavailable/);
    await expect(online([{ product_id: cream, quantity: 1 }], { cep: "01001000", city: "São Paulo", uf: "SP" })).rejects.toThrow(/delivery_required/);
    await expect(online([{ product_id: cream, quantity: 1 }], null)).rejects.toThrow(/delivery_required/);
    await expect(online([{ product_id: cream, quantity: 1 }], SEDEX, null, "boleto")).rejects.toThrow(/invalid_payment_method/);

    const r = await online([{ product_id: cream, quantity: 2 }], SEDEX, "BEMVINDA10");
    expect(r.r).toMatchObject({ payment_method: "mercadopago", subtotal_cents: 20000, discount_cents: 2000, amount_due_cents: 20000 - 2000 + 4100 });
    expect(r.r.items[0].ref).toMatch(/^MV[0-9]{4}$/);
    expect(await one(`select payment_method, payment_status, amount_due_cents from order_intents where id = $1`, [r.r.id])).toEqual({
      payment_method: "mercadopago",
      payment_status: "pending",
      amount_due_cents: 22100,
    });
    expect(await stock()).toEqual({ stock_quantity: 5, reserved_quantity: 0 }); // nothing reserved before the payment

    const whatsapp = await online([{ product_id: cream, quantity: 1 }], { cep: "01001000" }, null, "whatsapp");
    expect(await one(`select payment_method, payment_status, amount_due_cents from order_intents where id = $1`, [whatsapp.r.id])).toEqual({ payment_method: "whatsapp", payment_status: "none", amount_due_cents: null });
  });

  it("is written only by the server, confirms the order and reserves stock once the full amount is approved", async () => {
    const r = await online([{ product_id: cream, quantity: 2 }], SEDEX);
    const due = r.r.amount_due_cents;
    expect(due).toBe(24100);
    for (const role of ["anon", "authenticated"] as const) {
      await expect(
        asRole(db, role, role === "anon" ? null : adminId, () => db.query(`select apply_payment_update($1, '1', 'approved', null, null, $2)`, [r.r.id, due])),
      ).rejects.toThrow(/permission denied/);
      await expect(
        asRole(db, role, role === "anon" ? null : adminId, () => db.query(`select set_order_checkout($1, 'pref', 'https://mp.test/pay', now())`, [r.r.id])),
      ).rejects.toThrow(/permission denied/);
    }

    expect((await pay(r.r.id, "101", "rejected", null, "credit_card")).r).toMatchObject({ changed: true, status: "started", payment_status: "rejected" });
    expect((await pay(r.r.id, "101", "rejected", null)).r.changed).toBe(false);
    await expect(pay(r.r.id, "102", "whatever", due)).rejects.toThrow(/invalid_payment_status/);
    await expect(pay(r.r.id, "1 or 1=1", "approved", due)).rejects.toThrow(/invalid_payment_id/);

    expect((await pay(r.r.id, "102", "approved", due)).r).toMatchObject({ changed: true, status: "confirmed", payment_status: "approved" });
    expect(await order(r.r.id)).toMatchObject({ status: "confirmed", inventory_state: "reserved", payment_status: "approved", payment_id: "102", amount_paid_cents: due, payment_type: "pix" });
    expect((await order(r.r.id)).paid_at).not.toBeNull();
    expect(await stock()).toEqual({ stock_quantity: 5, reserved_quantity: 2 });

    // repeated notification and a later failed attempt change nothing
    expect((await pay(r.r.id, "102", "approved", due)).r.changed).toBe(false);
    expect((await pay(r.r.id, "103", "rejected", null)).r.changed).toBe(false);
    expect((await order(r.r.id)).payment_id).toBe("102");
    expect(await stock()).toEqual({ stock_quantity: 5, reserved_quantity: 2 });

    // refund: recorded for the owner, stock and status stay until the owner decides
    expect((await pay(r.r.id, "102", "refunded", due)).r).toMatchObject({ changed: true, status: "confirmed", payment_status: "refunded" });
    const history = await notes(r.r.id);
    expect(history[0]).toMatch(/pagamento online/);
    expect(history.some((n) => /recusado/.test(n))).toBe(true);
    expect(history.some((n) => /confirmado automaticamente/.test(n))).toBe(true);
    expect(history.at(-1)).toMatch(/devolvido/);
    await asRole(db, "authenticated", adminId, () => db.query(`select admin_set_order_status($1, 'cancelled', 'Estorno')`, [r.r.id]));
    expect(await stock()).toEqual({ stock_quantity: 5, reserved_quantity: 0 });
  });

  it("does not confirm an underpaid order, a WhatsApp order or an order whose stock is gone", async () => {
    const under = await online([{ product_id: cream, quantity: 1 }], SEDEX);
    expect((await pay(under.r.id, "201", "approved", 100)).r).toMatchObject({ status: "started", payment_status: "approved" });
    expect((await notes(under.r.id)).at(-1)).toMatch(/valor menor/);
    expect(await stock()).toEqual({ stock_quantity: 5, reserved_quantity: 0 });

    const whatsapp = await online([{ product_id: cream, quantity: 1 }], { cep: "01001000" }, null, "whatsapp");
    await expect(pay(whatsapp.r.id, "202", "approved", 14100)).rejects.toThrow(/not_online_order/);
    await expect(pay("00000000-0000-0000-0000-000000000000", "203", "approved", 1)).rejects.toThrow(/order_not_found/);

    const late = await online([{ product_id: cream, quantity: 2 }], SEDEX);
    await db.query(`update products set stock_quantity = 1 where id = $1`, [cream]); // sold elsewhere meanwhile
    expect((await pay(late.r.id, "204", "approved", late.r.amount_due_cents)).r).toMatchObject({ status: "started", payment_status: "approved" });
    expect((await notes(late.r.id)).at(-1)).toMatch(/não foi possível reservar o estoque/);
    expect(await order(late.r.id)).toMatchObject({ inventory_state: "none", amount_paid_cents: late.r.amount_due_cents });
    await db.query(`update products set stock_quantity = 5 where id = $1`, [cream]);
  });

  it("shows the buyer a receipt without contact data, with the payment link while it is still payable", async () => {
    const r = await online([{ product_id: cream, quantity: 1 }], SEDEX);
    await asRole(db, "service_role", null, () =>
      db.query(`select set_order_checkout($1, 'pref-1', 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=pref-1', now() + interval '3 days')`, [r.r.id]),
    );
    type Receipt = Record<string, unknown> & { checkout_url: string | null; items: { name: string; quantity: number }[] };
    const receipt = async () => (await asRole(db, "anon", null, () => one<{ r: Receipt }>(`select get_order_receipt($1) as r`, [r.r.id]))).r;

    const before = await receipt();
    expect(before).toMatchObject({ code: r.r.code, status: "started", payment_status: "pending", amount_due_cents: 14100, shipping_service: "Correios SEDEX", first_name: "Cliente" });
    expect(before.checkout_url).toContain("pref_id=pref-1");
    expect(before.items).toEqual([{ name: expect.stringContaining("Volumetox"), quantity: 1, line_total_cents: 10000 }]);
    const keys = JSON.stringify(Object.keys(before));
    for (const secret of ["customer_phone", "email", "shipping_cep", "customer_notes", "admin_notes"]) expect(keys).not.toContain(secret);

    await pay(r.r.id, "301", "approved", 14100, "credit_card");
    const after = await receipt();
    expect(after).toMatchObject({ status: "confirmed", payment_status: "approved", payment_type: "credit_card", amount_paid_cents: 14100 });
    expect(after.checkout_url).toBeNull();
    expect((await asRole(db, "anon", null, () => one<{ r: unknown }>(`select get_order_receipt('00000000-0000-0000-0000-000000000000') as r`))).r).toBeNull();
    // the anon role still cannot read orders directly
    await asRole(db, "anon", null, async () => expect(await all(`select id from order_intents`)).toHaveLength(0));
    await db.query(`update store_settings set online_payment_enabled = false where id = 1`);
  });
});


describe("Apple Pay (Mercado Pago Orders API)", () => {
  it("starts off with public identifiers only, in strict formats (an access token never fits the public key)", async () => {
    expect(
      await one(`select apple_pay_enabled, apple_pay_merchant_id, apple_pay_certificate_id, apple_pay_product_id, mercadopago_public_key, apple_pay_domain_association from store_settings where id = 1`),
    ).toEqual({
      apple_pay_enabled: false,
      apple_pay_merchant_id: null,
      apple_pay_certificate_id: null,
      apple_pay_product_id: null,
      mercadopago_public_key: null,
      apple_pay_domain_association: null,
    });
    const set = (column: string, value: string) => db.query(`update store_settings set ${column} = $1 where id = 1`, [value]);
    await expect(set("apple_pay_merchant_id", "br.com.mivora")).rejects.toThrow(/check/);
    await expect(set("mercadopago_public_key", "APP_USR-ACCESS-TOKEN-FALSO-DE-TESTE")).rejects.toThrow(/check/);
    await expect(set("apple_pay_domain_association", "<script>alert(1)</script>")).rejects.toThrow(/check/);
    await expect(set("apple_pay_certificate_id", "cert id with spaces")).rejects.toThrow(/check/);
    await set("apple_pay_merchant_id", "merchant.br.com.mivoracosmeticos");
    await set("mercadopago_public_key", "APP_USR-6dd5f0f9-b2b4-4e1b-8f4a-0c3d7d1a2b3c");
    await set("apple_pay_certificate_id", "cert_0123-abc");
    await set("apple_pay_product_id", "prod.apple-pay_01");
    await set("apple_pay_domain_association", "7B227073704964223A2239373943394538");
    await db.query(`update store_settings set apple_pay_merchant_id = null, mercadopago_public_key = null, apple_pay_certificate_id = null, apple_pay_product_id = null, apple_pay_domain_association = null where id = 1`);
    const privacy = await one<{ body: string }>(`select body from pages where slug = 'politica-de-privacidade'`);
    expect(privacy.body).toContain("## Apple Pay");
    expect(privacy.body).toMatch(/CPF.*fica registrado no pedido/);
    // the first version's sentences no longer describe the checkout
    expect(privacy.body).toContain("## Conta, CPF e endereço");
    expect(privacy.body).toContain("CPF e endereço de entrega) e das observações");
    expect(privacy.body).not.toContain("Não coletamos dados de pagamento");
    expect(privacy.body).not.toContain("são opcionais e só são registrados");
  });

  it("records Orders API payments (ORD ids, type apple_pay): a refused attempt, then approval, then a refund", async () => {
    await db.query(`update store_settings set online_payment_enabled = true where id = 1`);
    const pid = await productId("medicube-pdrn-pink-peptide-serum");
    await db.query(`update products set price_cents = 15999, track_inventory = false, availability = 'in_stock' where id = $1`, [pid]);
    const r = await asRole(db, "anon", null, () =>
      one<{ r: { id: string; amount_due_cents: number } }>(`select create_order_intent($1::jsonb, null, null, null, null, null, $2::jsonb, $3::jsonb, 'mercadopago') as r`, [
        JSON.stringify([{ product_id: pid, quantity: 1 }]),
        JSON.stringify({ cep: "01001000", city: "São Paulo", uf: "SP", service: "Correios SEDEX", fee_cents: 4100, estimate: "3 dias úteis", recipient: "Cliente Teste", street: "Praça da Sé", number: "100", district: "Sé" }),
        newCustomer(),
      ]),
    );
    const pay = (id: string, status: string, amount: number | null) =>
      asRole(db, "service_role", null, () =>
        one<{ r: { changed: boolean; status: string; payment_status: string } }>(`select apply_payment_update($1, $2, $3, 'detail', 'apple_pay', $4) as r`, [r.r.id, id, status, amount]),
      );
    expect((await pay("ORD01AAAAAAAAAAAAAAAAAAAAAAAA", "rejected", null)).r).toMatchObject({ status: "started", payment_status: "rejected" });
    expect((await pay("ORD01BBBBBBBBBBBBBBBBBBBBBBBB", "approved", r.r.amount_due_cents)).r).toMatchObject({ status: "confirmed", payment_status: "approved" });
    expect(await one(`select payment_id, payment_type, amount_paid_cents from order_intents where id = $1`, [r.r.id])).toEqual({
      payment_id: "ORD01BBBBBBBBBBBBBBBBBBBBBBBB",
      payment_type: "apple_pay",
      amount_paid_cents: 15999 + 4100,
    });
    expect((await pay("ORD01BBBBBBBBBBBBBBBBBBBBBBBB", "refunded", r.r.amount_due_cents)).r).toMatchObject({ status: "confirmed", payment_status: "refunded" });
    await db.query(`update store_settings set online_payment_enabled = false where id = 1`);
  });
});


describe("checkout accounts, saved addresses and checkout attempts", () => {
  type Account = { email: string; email_verified: boolean; provider: string; provider_name: string | null; saved: boolean; first_name: string | null; last_name: string | null; phone: string | null; cpf: string | null; marketing: boolean };
  const ADDRESS = { recipient: "Ana Souza", street: "Praça da Sé", number: "100", complement: "ap 12", reference: "perto do metrô", district: "Sé" };
  const SEDEX = { cep: "01001000", city: "São Paulo", uf: "SP", service: "Correios SEDEX", fee_cents: 4100, estimate: "3 dias úteis", ...ADDRESS };
  let ana: string;
  let bia: string;
  let unverified: string;
  let product: string;
  const account = (uid: string) => asRole(db, "authenticated", uid, async () => (await one<{ a: Account }>(`select get_my_account() as a`)).a);
  const order = (uid: string | null, customer: Record<string, unknown>, opts: { shipping?: unknown; requestId?: string | null; method?: string } = {}) =>
    asRole(db, uid ? "authenticated" : "anon", uid, () =>
      one<{ r: { id: string; code: string; duplicate?: boolean; amount_due_cents: number } }>(
        `select create_order_intent($1::jsonb, null, null, null, null, null, $2::jsonb, $3::jsonb, $4, $5::uuid) as r`,
        [JSON.stringify([{ product_id: product, quantity: 1 }]), JSON.stringify(opts.shipping === undefined ? SEDEX : opts.shipping), JSON.stringify(customer), opts.method ?? "mercadopago", opts.requestId ?? null],
      ),
    );

  beforeAll(async () => {
    const user = async (email: string, confirmed: boolean, meta: object, provider: string) =>
      (await one<{ id: string }>(
        `insert into auth.users (email, email_confirmed_at, raw_user_meta_data, raw_app_meta_data) values ($1, case when $2 then now() end, $3::jsonb, $4::jsonb) returning id`,
        [email, confirmed, JSON.stringify(meta), JSON.stringify({ provider })],
      )).id;
    ana = await user("ana@conta.com", true, { full_name: "Ana Google", email: "ana@conta.com" }, "google");
    bia = await user("bia@privaterelay.appleid.com", true, {}, "apple");
    unverified = await user("sem-confirmacao@conta.com", false, {}, "email");
    product = await productId("skin1004-madagascar-centella-ampoule");
    await db.query(`update products set price_cents = 12999, track_inventory = false, availability = 'in_stock' where id = $1`, [product]);
    await db.query(`update store_settings set online_payment_enabled = true where id = 1`);
  });

  it("validates CPF check digits in the database", async () => {
    expect(await one(`select is_valid_cpf('529.982.247-25') as a, is_valid_cpf('12345678900') as b, is_valid_cpf('11111111111') as c, is_valid_cpf('5299822472') as d`)).toEqual({ a: true, b: false, c: false, d: false });
  });

  it("an account sees only what it saved itself; a visitor's record with the same e-mail is never shown or overwritten", async () => {
    // a visitor buys with Ana's e-mail before she has an account
    await order(null, { name: "Outra Pessoa", email: "ana@conta.com", phone: "11911112222", cpf: "529.982.247-25" });
    await expect(asRole(db, "anon", null, () => db.query(`select get_my_account()`))).rejects.toThrow(/permission denied/);
    expect(await account(ana)).toMatchObject({ email: "ana@conta.com", email_verified: true, provider: "google", provider_name: "Ana Google", saved: false, phone: null, cpf: null });
    expect(await account(bia)).toMatchObject({ email: "bia@privaterelay.appleid.com", provider: "apple", provider_name: null, saved: false });

    // saving links the verified e-mail's record to the account
    const saved = await asRole(db, "authenticated", ana, async () =>
      (await one<{ a: Account }>(`select save_my_account('Ana', 'Souza', '(11) 98888-7777', '529.982.247-25', true) as a`)).a,
    );
    expect(saved).toMatchObject({ saved: true, first_name: "Ana", last_name: "Souza", phone: "11988887777", cpf: "52998224725", marketing: true });
    expect(await one(`select name, user_id = $1 as linked from customers where email = 'ana@conta.com'`, [ana])).toEqual({ name: "Ana Souza", linked: true });

    // later visitors using that e-mail do not change the account holder's data; their order keeps what they typed
    const visitor = await order(null, { first_name: "Outra", last_name: "Pessoa", email: "ana@conta.com", phone: "(21) 95555-4444", cpf: "529.982.247-25" });
    expect(await one(`select name, phone from customers where email = 'ana@conta.com'`)).toEqual({ name: "Ana Souza", phone: "11988887777" });
    expect(await one(`select customer_name, customer_phone, user_id from order_intents where id = $1`, [visitor.r.id])).toEqual({ customer_name: "Outra Pessoa", customer_phone: "21955554444", user_id: null });

    // unverified e-mails cannot claim a record; invalid data is refused
    await expect(asRole(db, "authenticated", unverified, () => db.query(`select save_my_account('Sem', 'Confirmacao', '11911112222', null)`))).rejects.toThrow(/email_not_verified/);
    await expect(asRole(db, "authenticated", bia, () => db.query(`select save_my_account('Bia', 'Lima', '11911112222', '123.456.789-00')`))).rejects.toThrow(/invalid_cpf/);
    await expect(asRole(db, "authenticated", bia, () => db.query(`select save_my_account('Bia', '', '11911112222', null)`))).rejects.toThrow(/invalid_name/);
  });

  it("saved addresses belong to one account: 10 at most and a single default", async () => {
    const insert = (uid: string, extra: Record<string, unknown> = {}) =>
      asRole(db, "authenticated", uid, () =>
        one<{ id: string }>(
          `insert into customer_addresses (recipient, cep, street, number, complement, district, city, uf, is_default) values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
          [extra.recipient ?? "Ana Souza", extra.cep ?? "01001000", "Praça da Sé", "100", null, "Sé", "São Paulo", "SP", extra.is_default ?? false],
        ),
      );
    const first = await insert(ana, { is_default: true });
    const second = await insert(ana, { is_default: true, recipient: "Ana no trabalho" });
    expect(await all(`select recipient, is_default from customer_addresses where user_id = $1 order by created_at`, [ana])).toEqual([
      { recipient: "Ana Souza", is_default: false },
      { recipient: "Ana no trabalho", is_default: true },
    ]);
    await asRole(db, "authenticated", bia, async () => {
      expect(await all(`select id from customer_addresses`)).toHaveLength(0);
      const upd = await db.query(`update customer_addresses set recipient = 'Invasor' where id = $1`, [first.id]);
      expect(upd.affectedRows ?? 0).toBe(0);
      await expect(db.query(`insert into customer_addresses (user_id, recipient, cep, street, number, district, city, uf) values ($1, 'X', '01001000', 'Rua', '1', 'B', 'São Paulo', 'SP')`, [ana])).rejects.toThrow(/row-level security/);
    });
    await asRole(db, "anon", null, async () => expect(await all(`select id from customer_addresses`)).toHaveLength(0));
    await expect(insert(ana, { cep: "0100100" })).rejects.toThrow(/check/);
    for (let i = 0; i < 8; i++) await insert(ana);
    await expect(insert(ana)).rejects.toThrow(/too_many_addresses/);
    await asRole(db, "authenticated", ana, () => db.query(`delete from customer_addresses where id = $1`, [second.id]));
    expect((await all(`select id from customer_addresses where user_id = $1`, [ana])).length).toBe(9);
  });

  it("one order per checkout attempt; online deliveries need the full address; orders belong to the signed-in account", async () => {
    const customer = { first_name: "Ana", last_name: "Souza", email: "ana@conta.com", phone: "11988887777", cpf: "52998224725" };
    const attempt = "7d3c1f0e-1111-4c4c-9a9a-000000000001";
    const first = await order(ana, customer, { requestId: attempt });
    const again = await order(ana, customer, { requestId: attempt });
    expect(again.r).toMatchObject({ id: first.r.id, code: first.r.code, duplicate: true, amount_due_cents: 12999 + 4100 });
    expect(await one(`select count(*)::int as n from order_intents where client_request_id = $1`, [attempt])).toEqual({ n: 1 });
    expect(await one(`select user_id = $2 as mine, customer_cpf, shipping_recipient, shipping_street, shipping_number, shipping_complement, shipping_reference, shipping_district from order_intents where id = $1`, [first.r.id, ana])).toEqual({
      mine: true,
      customer_cpf: "52998224725",
      shipping_recipient: "Ana Souza",
      shipping_street: "Praça da Sé",
      shipping_number: "100",
      shipping_complement: "ap 12",
      shipping_reference: "perto do metrô",
      shipping_district: "Sé",
    });

    await expect(order(ana, customer, { shipping: { cep: "01001000", city: "São Paulo", uf: "SP", service: "Correios SEDEX", fee_cents: 4100 } })).rejects.toThrow(/address_required/);
    await expect(order(null, { ...customer, cpf: "11111111111" })).rejects.toThrow(/invalid_cpf/);
    // WhatsApp orders keep working without the full address
    await order(null, { name: "Cliente WhatsApp", email: "whats@teste.com", phone: "11977776666" }, { shipping: { cep: "01001000" }, method: "whatsapp" });

    const mine = await asRole(db, "authenticated", ana, async () => (await one<{ o: { code: string; total_cents: number }[] }>(`select get_my_orders() as o`)).o);
    expect(mine.map((o) => o.code)).toContain(first.r.code);
    expect(mine.find((o) => o.code === first.r.code)?.total_cents).toBe(12999 + 4100);
    expect(await asRole(db, "authenticated", bia, async () => (await one<{ o: unknown[] }>(`select get_my_orders() as o`)).o)).toEqual([]);
  });

  it("the receipt shows the Pix code while it can be paid; payment details are written by the server only", async () => {
    const r = await order(null, { first_name: "Caio", last_name: "Pix", email: "caio@pix.com", phone: "11966665555", cpf: "52998224725" });
    await expect(
      asRole(db, "anon", null, () => db.query(`select set_order_payment_info($1, null, null, 'x', null, null, null)`, [r.r.id])),
    ).rejects.toThrow(/permission denied/);
    await asRole(db, "service_role", null, () =>
      db.query(`select set_order_payment_info($1, null, null, '00020126pix', 'iVBORw0', 'https://www.mercadopago.com.br/payments/1/ticket', now() + interval '1 hour')`, [r.r.id]),
    );
    const receipt = async () => (await asRole(db, "anon", null, () => one<{ r: { pix: { qr_code: string } | null; payment_installments: number | null } }>(`select get_order_receipt($1) as r`, [r.r.id]))).r;
    expect((await receipt()).pix).toMatchObject({ qr_code: "00020126pix", qr_base64: "iVBORw0", ticket_url: "https://www.mercadopago.com.br/payments/1/ticket" });
    await asRole(db, "service_role", null, () => db.query(`select apply_payment_update($1, '777', 'approved', 'accredited', 'bank_transfer', $2)`, [r.r.id, r.r.amount_due_cents]));
    expect((await receipt()).pix).toBeNull();
    await asRole(db, "service_role", null, () => db.query(`select set_order_payment_info($1, 3, 'master', null, null, null, null)`, [r.r.id]));
    expect(await receipt()).toMatchObject({ payment_installments: 3, payment_brand: "master" });
    await db.query(`update store_settings set online_payment_enabled = false where id = 1`);
  });
});

describe("skin analysis: campaign, recommendation profiles, daily quota and saved reports", () => {
  let user: string;
  let other: string;
  let product: string;
  let draft: string;
  const report = { summary: "Pele com aparência ressecada.", observations: [], needs: [], limitations: [], products: [], analyzedAt: "2026-10-16T12:00:00.000Z" };

  beforeAll(async () => {
    const make = async (email: string) => (await one<{ id: string }>(`insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id`, [email])).id;
    user = await make("pele@conta.com");
    other = await make("outra@conta.com");
    product = await productId("skin1004-madagascar-centella-ampoule");
    draft = (await one<{ id: string }>(`select id from products where status = 'draft' limit 1`)).id;
  });

  it("seeds the launch pop-up and the home section as editable banners, and the settings with safe defaults", async () => {
    const banners = await asRole(db, "anon", null, () =>
      db.query<{ placement: string; title: string; highlights: string[]; footnote: string | null; cta_href: string; cta2_href: string | null }>(
        `select placement, title, highlights, footnote, cta_href, cta2_href from banners where placement in ('skin_popup', 'skin_home') order by placement`,
      ),
    );
    expect(banners.rows).toEqual([
      expect.objectContaining({ placement: "skin_home", title: "Sua pele é única. Sua rotina também deveria ser.", cta_href: "/analise-de-pele", footnote: expect.stringContaining("Rápido, personalizado") }),
      expect.objectContaining({ placement: "skin_popup", title: "Sua pele fala. A gente te ouve.", cta_href: "/analise-de-pele", cta2_href: "/#analise-de-pele", highlights: expect.arrayContaining(["Análise visual personalizada."]) }),
    ]);
    await expect(db.query(`update banners set highlights = array['1','2','3','4','5','6'] where placement = 'skin_popup'`)).rejects.toThrow(/banners_highlights_check/);
    expect(await one(`select skin_analysis_enabled, skin_popup_interval_days, skin_analysis_daily_limit from store_settings where id = 1`)).toEqual({
      skin_analysis_enabled: true,
      skin_popup_interval_days: 7,
      skin_analysis_daily_limit: 200,
    });
    await expect(db.query(`update store_settings set skin_popup_interval_days = 0 where id = 1`)).rejects.toThrow(/skin_popup_interval/);
  });

  it("recommendation profiles: public for published products, written only by admins", async () => {
    await db.query(`insert into product_skin_profiles (product_id, routine_step, precautions) values ($1, 'tratamento', 'Evite a área dos olhos.'), ($2, 'hidratante', null)`, [product, draft]);
    const visible = await asRole(db, "anon", null, () => db.query<{ product_id: string }>(`select product_id from product_skin_profiles`));
    expect(visible.rows.map((r) => r.product_id)).toEqual([product]);
    await expect(asRole(db, "authenticated", user, () => db.query(`update product_skin_profiles set recommendable = false where product_id = $1`, [product]))).resolves.toMatchObject({ affectedRows: 0 });
    await expect(asRole(db, "anon", null, () => db.query(`insert into product_skin_profiles (product_id) values ($1)`, [draft]))).rejects.toThrow(/permission denied|row-level security/);
    await expect(db.query(`insert into product_skin_profiles (product_id, alternative_product_id) values ($1, $1)`, [await productId("dr-althea-345-relief-cream")])).rejects.toThrow(/check/);
  });

  it("the daily quota is taken only by the server and follows the limit set in the admin", async () => {
    await expect(asRole(db, "anon", null, () => db.query(`select take_skin_analysis_slot()`))).rejects.toThrow(/permission denied/);
    await expect(asRole(db, "authenticated", user, () => db.query(`select take_skin_analysis_slot()`))).rejects.toThrow(/permission denied/);
    await db.query(`update store_settings set skin_analysis_daily_limit = 2 where id = 1`);
    const take = () => asRole(db, "service_role", null, async () => (await one<{ ok: boolean }>(`select take_skin_analysis_slot() as ok`)).ok);
    expect([await take(), await take(), await take()]).toEqual([true, true, false]);
    expect(await one(`select analyses from skin_analysis_usage`)).toEqual({ analyses: 2 });
    await expect(asRole(db, "anon", null, () => db.query(`select * from skin_analysis_usage`))).rejects.toThrow(/permission denied/);
    await db.query(`update store_settings set skin_analysis_daily_limit = 200 where id = 1`);
  });

  it("saved reports: text only, visible to their owner, at most 20 per account, older than 12 months removed", async () => {
    const save = (uid: string) => asRole(db, "authenticated", uid, () => db.query(`insert into skin_reports (result) values ($1::jsonb)`, [JSON.stringify(report)]));
    await save(user);
    await expect(asRole(db, "anon", null, () => db.query(`insert into skin_reports (result) values ('{}'::jsonb)`))).rejects.toThrow(/permission denied|row-level security|not-null/);
    expect((await asRole(db, "authenticated", other, () => db.query(`select id from skin_reports`))).rows).toEqual([]);
    expect((await asRole(db, "authenticated", user, () => db.query(`select id from skin_reports`))).rows).toHaveLength(1);
    // someone else's report cannot be deleted
    await asRole(db, "authenticated", other, () => db.query(`delete from skin_reports`));
    expect(await one(`select count(*)::int as n from skin_reports where user_id = $1`, [user])).toEqual({ n: 1 });
    // a report older than 12 months disappears with the next save
    await db.query(`insert into skin_reports (user_id, result, created_at) values ($1, $2::jsonb, now() - interval '13 months')`, [user, JSON.stringify(report)]);
    await save(user);
    expect(await one(`select count(*)::int as n from skin_reports where user_id = $1`, [user])).toEqual({ n: 2 });
    for (let i = 0; i < 18; i += 1) await save(user);
    await expect(save(user)).rejects.toThrow(/too_many_reports/);
    await db.query(`delete from skin_reports`);
  });

  it("the privacy policy explains the analysis, the provider and that the photo is not stored", async () => {
    const privacy = await one<{ body: string }>(`select body from pages where slug = 'politica-de-privacidade'`);
    expect(privacy.body).toContain("## Análise de pele com IA");
    expect(privacy.body).toMatch(/não é diagnóstico médico/);
    expect(privacy.body).toMatch(/Anthropic/);
    expect(privacy.body).toMatch(/não fica armazenada na MIVORA/);
  });
});
