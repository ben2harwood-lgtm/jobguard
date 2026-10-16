import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MaterialRepository, migrate } from "../src/index.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

// Real PostgreSQL/runtime-role proof; NOT RUN in the builder's socket-free sandbox.
let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool;
beforeAll(async () => {
  const directory = await mkdtemp(join(tmpdir(), "jg-later-b15-")), port = await freePort(56600, 300);
  const credential = randomUUID();
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: credential,
    persistent: false, createPostgresUser: process.getuid?.() === 0,
    initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start();
  admin = new Pool({ host: "127.0.0.1", port, database: "postgres", user: "postgres", password: credential });
  await migrate(admin);
  const role = await admin.query("SELECT format('CREATE ROLE later_b15_login LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %L', $1::text) sql", [credential]);
  await admin.query(role.rows[0].sql);
  await admin.query("GRANT jobguard_runtime TO later_b15_login");
  runtime = new Pool({ host: "127.0.0.1", port, database: "postgres", user: "later_b15_login", password: credential });
}, 60000);
afterAll(async () => { await closeTestPools(runtime, admin); await postgres?.stop(); });

async function fixture() {
  const tenant = randomUUID(), context = testTenantContext(tenant);
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenant]);
  const input = { merchantName: "Fictional pack supplier", sku: "PACK-B15", description: "Synthetic material",
    pricePence: 10000, priceUnit: "box" as const, taxBasis: "net" as const, effectiveFrom: "2026-10-01",
    packEachQuantity: "5", sourceLabel: "synthetic original", expectedVersion: 0 };
  return { tenant, context, input, repo: new MaterialRepository(runtime) };
}
async function history(tenant: string) {
  return {
    packs: (await admin.query("SELECT row_to_json(p)::text snapshot FROM app.material_pack_conversion p WHERE tenant_id=$1 ORDER BY effective_from", [tenant])).rows,
    rates: (await admin.query("SELECT row_to_json(r)::text snapshot FROM app.material_rate_revision r WHERE tenant_id=$1 ORDER BY version", [tenant])).rows,
  };
}

describe("L083 api-file-material#4 material pack correction history", () => {
  it("L083: same-date price correction reuses identical pack conversion and preserves version history", async () => {
    const { tenant, context, input, repo } = await fixture();
    const first = await repo.addRate(context, input), before = await history(tenant);
    const second = await repo.addRate(context, { ...input, pricePence: 11000, sourceLabel: "synthetic correction", expectedVersion: 1 });
    const third = await repo.addRate(context, { ...input, packEachQuantity: "5.000000", pricePence: 12000, expectedVersion: 2 });
    expect([first.version, second.version, third.version]).toEqual([1, 2, 3]);
    expect(second.skuId).toBe(first.skuId); expect(third.skuId).toBe(first.skuId);
    const after = await history(tenant);
    expect(after.packs).toEqual(before.packs);
    expect(after.rates[0]).toEqual(before.rates[0]);
    expect((await admin.query("SELECT version,price_pence::text pence FROM app.material_rate_revision WHERE tenant_id=$1 ORDER BY version", [tenant])).rows)
      .toEqual([{ version: 1, pence: "10000" }, { version: 2, pence: "11000" }, { version: 3, pence: "12000" }]);
  });
  it("L083: different same-date conversion content conflicts without overwriting or appending a price", async () => {
    const { tenant, context, input, repo } = await fixture();
    await repo.addRate(context, input); const before = await history(tenant);
    await expect(repo.addRate(context, { ...input, packEachQuantity: "10", pricePence: 11000, expectedVersion: 1 }))
      .rejects.toThrow("MATERIAL_PACK_CONVERSION_CONFLICT");
    expect(await history(tenant)).toEqual(before);
    expect(await repo.addRate(context, { ...input, pricePence: 11000, expectedVersion: 1 })).toMatchObject({ version: 2 });
  });
  it("L083: concurrent price corrections append once and refuse the stale revision", async () => {
    const { tenant, context, input, repo } = await fixture();
    await repo.addRate(context, input);
    const results = await Promise.allSettled([11000, 12000].map(pricePence => repo.addRate(context, { ...input, pricePence, expectedVersion: 1 })));
    expect(results.filter(x => x.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(x => x.status === "rejected")).toMatchObject([{ reason: { message: "STALE_MATERIAL_RATE_REVISION" } }]);
    expect((await history(tenant)).packs).toHaveLength(1);
    expect((await history(tenant)).rates).toHaveLength(2);
  });
  it("L083: a later dated conversion appends and earlier conversion and price rows remain unchanged", async () => {
    const { tenant, context, input, repo } = await fixture();
    await repo.addRate(context, input); const before = await history(tenant);
    await repo.addRate(context, { ...input, effectiveFrom: "2026-10-02", packEachQuantity: "10", expectedVersion: 1 });
    const after = await history(tenant);
    expect(after.packs).toHaveLength(2); expect(after.rates).toHaveLength(2);
    expect(after.packs[0]).toEqual(before.packs[0]); expect(after.rates[0]).toEqual(before.rates[0]);
  });
  it("L083: matching catalogue names in separate tenants never reuse each other's conversion", async () => {
    const first = await fixture(), second = await fixture();
    await first.repo.addRate(first.context, first.input);
    await second.repo.addRate(second.context, { ...second.input, packEachQuantity: "10" });
    await first.repo.addRate(first.context, { ...first.input, expectedVersion: 1 });
    await second.repo.addRate(second.context, { ...second.input, packEachQuantity: "10", expectedVersion: 1 });
    const a = await history(first.tenant), b = await history(second.tenant);
    expect(a.packs).toHaveLength(1); expect(b.packs).toHaveLength(1);
    expect(JSON.parse(a.packs[0]!.snapshot).each_quantity_decimal).toBe("5");
    expect(JSON.parse(b.packs[0]!.snapshot).each_quantity_decimal).toBe("10");
  });
});
