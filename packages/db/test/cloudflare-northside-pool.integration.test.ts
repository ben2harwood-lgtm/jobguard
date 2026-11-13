// Real PostgreSQL regression; CI owns execution because the builder cannot bind localhost.
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { northsideFacts, northsideTargets, seedNorthsideDemo } from "../src/index.js";
import { cluster, type Cluster } from "./extra-fixtures.js";
import { startSession } from "./contractor-practice-session-fixtures.js";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/server", () => ({ NextResponse: {} }));
vi.mock("@jobguard/api/workspace", () => ({ SYNTHETIC_SESSION: "fictional" }));
import { syntheticPool } from "../../../apps/web/app/lib/synthetic-server.js";

let c: Cluster;
beforeAll(async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  vi.stubEnv("JOBGUARD_HOSTING", "cloudflare");
  c = await cluster();
  const { host, port, password } = c.config;
  vi.stubEnv("DATABASE_URL", `postgresql://ent4b_login:${password}@${host}:${port}/jobguard_synthetic_demo`);
}, 240_000);
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });

it("LATER-SAFETY-141: one client times out under the seed lock; the Cloudflare pool stores the complete Northside seed", async () => {
  const session = await startSession(c);
  const pool = syntheticPool();
  expect(pool.options).toMatchObject({ max: 3, maxUses: 1, connectionTimeoutMillis: 10_000 });
  // Reproduce the old capacity with a bounded acquisition wait instead of the old
  // default (0 = forever), so the negative control can unwind and release its lock.
  const single = new Pool({ ...pool.options, max: 1, connectionTimeoutMillis: 1_000 });
  try {
    // Prove connectivity first: the later timeout is pool exhaustion, not an unreachable database.
    expect((await single.query("SELECT 1 AS connected")).rows[0].connected).toBe(1);
    await expect(seedNorthsideDemo(single, session.p, session.context)).rejects.toThrow("timeout exceeded when trying to connect");
    expect((await c.admin.query("SELECT count(*)::int n FROM app.work_order WHERE tenant_id=$1", [session.p.tenantId])).rows[0].n).toBe(0);

    const seed = await seedNorthsideDemo(pool, session.p, session.context);
    expect(seed.clientIds).toHaveLength(northsideTargets.clients);
    expect(await northsideFacts(pool, session.p, session.context)).toMatchObject({
      clients: northsideTargets.clients, operatives: northsideTargets.operatives,
      ordersThisMonth: northsideTargets.ordersPerMonth,
    });
    expect((await c.admin.query("SELECT count(*)::int n FROM app.work_order WHERE tenant_id=$1", [session.p.tenantId])).rows[0].n).toBe(northsideTargets.ordersPerMonth);
    // A fresh per-request pool must read the stored seed rather than creating it again.
    const next = syntheticPool();
    try {
      expect(next).not.toBe(pool);
      expect(await seedNorthsideDemo(next, session.p, session.context)).toEqual(seed);
    } finally { await next.end(); }
  } finally { await Promise.all([single.end(), pool.end()]); }
}, 600_000);
