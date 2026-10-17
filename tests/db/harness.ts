import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Boots an in-memory Postgres (PGlite) that mimics the parts of Supabase the
 * migrations depend on (auth/storage schemas, anon/authenticated roles and
 * default grants), then applies every migration in supabase/migrations.
 */
export async function createTestDb() {
  const db = await PGlite.create({ extensions: { pg_trgm } });

  await db.exec(readFileSync(path.join(process.cwd(), "scripts", "local-stack", "supabase-stub.sql"), "utf8"));

  const dir = path.join(process.cwd(), "supabase", "migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    try {
      await db.exec(readFileSync(path.join(dir, file), "utf8"));
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
    }
  }
  return db;
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>;

let defaultUser = "";
/** Statements outside asRole act for this signed-in customer (orders require an account since migration 021). */
export async function setDefaultUser(db: TestDb, userId: string) {
  defaultUser = userId;
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId]);
}

/** Runs `fn` as an API role (anon, an authenticated user or the server's service_role), like PostgREST does. */
export async function asRole<T>(
  db: TestDb,
  role: "anon" | "authenticated" | "service_role",
  userId: string | null,
  fn: () => Promise<T>,
): Promise<T> {
  await db.exec(`set role ${role}`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId ?? ""]);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role`);
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [defaultUser]);
  }
}
