import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { asRole, createTestDb, type TestDb } from "./harness";

let db: TestDb;
let adminId: string;
let outsiderId: string;
let batchId: string;

const one = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];
const all = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

/** A window that contains now (São Paulo time) or one that does not. */
async function setWindow(open: boolean) {
  const hour = (await one<{ h: number }>(`select extract(hour from now() at time zone 'America/Sao_Paulo')::int as h`)).h;
  const [first, last] = open ? ["00:00", "23:59"] : hour < 12 ? ["18:00", "19:00"] : ["03:00", "04:00"];
  await db.query(`update vip_settings set first_post_time = $1, last_post_time = $2 where id = 1`, [first, last]);
}

let position = 0;
async function post(status: string, extra: Record<string, unknown> = {}) {
  position += 1;
  const row: Record<string, unknown> = { status, scheduled_for: status === "agendado" ? new Date(Date.now() - 60_000).toISOString() : null, ...extra };
  return (
    await one<{ id: string }>(
      `insert into vip_posts (batch_id, position, source_line, name, dedupe_key, body, status, scheduled_for, sent_at, provider_message_id)
       values ($1, $2, 'Lattafa Asad EDP 100ml R$ 189,90', 'Lattafa Asad', 'asad lattafa|Eau de Parfum|100', 'Texto', $3, $4, $5, $6) returning id`,
      [batchId, position, row.status, row.scheduled_for, row.sent_at ?? null, row.provider_message_id ?? null],
    )
  ).id;
}

const claim = () => asRole(db, "service_role", null, () => all<{ id: string; status: string; attempts: number }>(`select id, status, attempts from public.vip_claim_next_post()`));

beforeAll(async () => {
  db = await createTestDb();
  adminId = (await one<{ id: string }>(`insert into auth.users (email) values ('owner@mivora.test') returning id`)).id;
  outsiderId = (await one<{ id: string }>(`insert into auth.users (email) values ('someone@mivora.test') returning id`)).id;
  await db.query(`select public.grant_admin_by_email('owner@mivora.test', 'owner')`);
  batchId = (await one<{ id: string }>(`insert into vip_batches (list_text, status) values ('Lattafa Asad EDP 100ml R$ 189,90', 'aprovado') returning id`)).id;
}, 60_000);

beforeEach(async () => {
  await db.query(`delete from vip_posts`);
  await db.query(`update vip_settings set sending_enabled = true, announcement_group_id = '120363012345678901-group', interval_minutes = 90 where id = 1`);
  await setWindow(true);
});

describe("Comunidade VIP: access", () => {
  it("only admins see or change the lists, posts, sheets and settings", async () => {
    await post("pronto");
    for (const [role, user] of [
      ["anon", null],
      ["authenticated", outsiderId],
    ] as const) {
      await asRole(db, role, user, async () => {
        for (const table of ["vip_settings", "vip_batches", "vip_posts", "vip_fragrances"]) {
          const read = db.query(`select * from ${table}`);
          if (role === "anon") await expect(read).rejects.toThrow(/permission denied/);
          else expect((await read).rows).toHaveLength(0);
        }
        await expect(db.query(`select * from public.vip_claim_next_post()`)).rejects.toThrow(/permission denied/);
      });
    }
    await asRole(db, "authenticated", outsiderId, async () => {
      await expect(db.query(`insert into vip_batches (list_text) values ('Lista qualquer')`)).rejects.toThrow(/row-level security/);
      await expect(db.query(`update vip_settings set sending_enabled = false where true`)).resolves.toMatchObject({ affectedRows: 0 });
    });
    await asRole(db, "authenticated", adminId, async () => {
      expect(await all(`select * from vip_posts`)).toHaveLength(1);
      expect(await all(`select * from vip_settings`)).toHaveLength(1);
      await expect(db.query(`select * from public.vip_claim_next_post()`)).rejects.toThrow(/permission denied/);
    });
  });

  it("a post can only be marked sent with the WhatsApp confirmation", async () => {
    const id = await post("enviando");
    await expect(db.query(`update vip_posts set status = 'enviado' where id = $1`, [id])).rejects.toThrow(/check constraint/);
    await db.query(`update vip_posts set status = 'enviado', sent_at = now(), provider_message_id = 'ABC123' where id = $1`, [id]);
  });
});

describe("Comunidade VIP: the sender takes one due post at a time", () => {
  it("takes the oldest due approved post and marks it as being sent", async () => {
    const later = await post("agendado", { scheduled_for: new Date(Date.now() + 3_600_000).toISOString() });
    const due = await post("agendado");
    await post("pronto");
    const claimed = await claim();
    expect(claimed).toEqual([{ id: due, status: "enviando", attempts: 1 }]);
    // nothing else goes out until that one is confirmed and the spacing has passed
    expect(await claim()).toEqual([]);
    expect((await one<{ status: string }>(`select status from vip_posts where id = $1`, [later])).status).toBe("agendado");
  });

  it("respects the spacing after the last post sent", async () => {
    await post("enviado", { sent_at: new Date(Date.now() - 10 * 60_000).toISOString(), provider_message_id: "X1" });
    await post("agendado");
    expect(await claim()).toEqual([]);
    await db.query(`update vip_posts set sent_at = now() - interval '50 minutes' where status = 'enviado'`);
    expect(await claim()).toHaveLength(1);
  });

  it("sends nothing when paused, without a group or outside the daily window", async () => {
    await post("agendado");
    await db.query(`update vip_settings set sending_enabled = false where id = 1`);
    expect(await claim()).toEqual([]);
    await db.query(`update vip_settings set sending_enabled = true, announcement_group_id = null where id = 1`);
    expect(await claim()).toEqual([]);
    await db.query(`update vip_settings set announcement_group_id = '120363012345678901-group' where id = 1`);
    await setWindow(false);
    expect(await claim()).toEqual([]);
    await setWindow(true);
    expect(await claim()).toHaveLength(1);
  });

  it("a send never confirmed is marked as failed (never retried by itself)", async () => {
    const stuck = await post("enviando");
    await db.query(`alter table vip_posts disable trigger vip_posts_updated_at`);
    await db.query(`update vip_posts set updated_at = now() - interval '20 minutes' where id = $1`, [stuck]);
    await db.query(`alter table vip_posts enable trigger vip_posts_updated_at`);
    expect(await claim()).toEqual([]);
    const row = await one<{ status: string; problems: string[] }>(`select status, problems from vip_posts where id = $1`, [stuck]);
    expect(row.status).toBe("falhou");
    expect(row.problems[0]).toMatch(/não foi confirmado/);
  });
});

describe("Comunidade VIP: full technical sheet (migration 025)", () => {
  it("stores the whole sheet and accepts ratings only from Fragrantica or Parfumo", async () => {
    await db.query(
      `insert into vip_fragrances (lookup_key, status, accords, perfumers, launch_year, longevity, sillage, performance_source, image_url, image_source, sheet_version)
       values ('asad lattafa|Eau de Parfum', 'confirmada', '{âmbar,especiado}', '{}', 2021, 'duradoura', 'moderada', 'Fragrantica', 'https://x.supabase.co/storage/v1/object/public/product-media/vip/a.jpg', 'Fragrantica', 2)`,
    );
    const row = await one<{ sheet_version: number; launch_year: number }>(`select sheet_version, launch_year from vip_fragrances where lookup_key = 'asad lattafa|Eau de Parfum'`);
    expect(row).toEqual({ sheet_version: 2, launch_year: 2021 });
    await expect(
      db.query(`insert into vip_fragrances (lookup_key, status, longevity, performance_source) values ('outro|', 'confirmada', 'eterna', 'Blog do perfume')`),
    ).rejects.toThrow(/check constraint/);
    await expect(db.query(`insert into vip_fragrances (lookup_key, status, launch_year) values ('ano|', 'confirmada', 21)`)).rejects.toThrow(/check constraint/);
    // sheets researched before the full sheet are marked as version 1, so they are researched again
    expect((await one<{ v: number }>(`select sheet_version as v from vip_fragrances where lookup_key = 'asad lattafa|Eau de Parfum'`)).v).toBe(2);
    expect((await one<{ d: string }>(`select column_default as d from information_schema.columns where table_name = 'vip_fragrances' and column_name = 'sheet_version'`)).d).toBe("1");
  });
});
