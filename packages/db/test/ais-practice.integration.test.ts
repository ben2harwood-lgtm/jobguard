import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { FakeTrueLayerAisAdapter, SyntheticAisTokenVault, aisHash, type AisPage } from "../src/ais-adapter.js";
import { DarkAisRepository } from "../src/ais-repository.js";
import { closeWorkFixture, createWorkFixture, workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
import { meterCompany } from "./meter-persistence-fixtures.js";
let f: WorkFixture;
beforeAll(async () => { f = await createWorkFixture(); }, 120_000);
afterAll(async () => closeWorkFixture(f));
const window = { version: "ais-window.v1", from: "2026-10-01", to: "2026-10-31", cursor: null };
async function setup() {
  const a = await meterCompany(f), other = await meterCompany(f);
  const adapter = new FakeTrueLayerAisAdapter(), vault = new SyntheticAisTokenVault();
  const repository = new DarkAisRepository(f.runtime, adapter, vault, "synthetic_demo"), id = randomUUID();
  const consent = await repository.start(a.context, a.digest, { version: "ais-start.v1", connectionId: id, expiresAt: new Date(Date.now() + 3_600_000).toISOString() });
  const page: AisPage = { version: "ais-page.v1", nextCursor: null, observations: (["pending", "settled", "reversed"] as const).map(status => ({
    version: "ais-observation.v1", accountRef: "fake_practice_account", movementRef: `fake_${status}`, providerRef: `fake_provider_${status}`,
    revision: 1, status, amount: { pence: 32000, currency: "GBP" }, bookedOn: "2026-10-02",
  })) };
  const code = adapter.register({ version: "ais-binding.v1", tenantId: a.tenantId, connectionId: id, stateHash: aisHash(consent.state) }, "fake_practice_account", new Map([["first", page]]));
  const callback = { version: "ais-callback.v1", state: consent.state, code };
  await repository.callback(a.context, a.digest, id, callback);
  return { a, other, repository, id, vault, adapter, callback };
}
it("persists distinct pending, settled and reversed movements across reload without duplicates or financial effects", async () => {
  const s = await setup();
  // Snapshot every non-AIS business row in this tenant, including cases, allocations,
  // fee journals and all receipt varieties. AIS audit appends are explicitly excluded.
  const snapshot = async () => {
    const tables = (await f.admin.query<{ table_name: string }>(`SELECT table_name FROM information_schema.columns
      WHERE table_schema='app' AND column_name='tenant_id' AND table_name NOT LIKE 'ais_%'
      AND table_name NOT IN ('audit_event','audit_chain_head') ORDER BY table_name`)).rows;
    const rows: Record<string, unknown> = {};
    for (const { table_name: name } of tables) {
      if (name.startsWith("audit_")) continue;
      rows[name] = (await f.admin.query(`SELECT to_jsonb(r) row FROM app."${name}" r WHERE tenant_id=$1 ORDER BY to_jsonb(r)::text`, [s.a.tenantId])).rows;
    }
    return rows;
  };
  const before = await snapshot();
  await s.repository.pull(s.a.context, s.a.digest, s.id, window);
  const first = await s.repository.movements(s.a.context, s.a.digest);
  expect(first.connection).toEqual({ connectionId: s.id, status: "linked" });
  expect(first.movements.map(m => m.status).sort()).toEqual(["pending", "reversed", "settled"]);
  await s.repository.pull(s.a.context, s.a.digest, s.id, window);
  const reloaded = new DarkAisRepository(f.runtime, s.adapter, s.vault, "synthetic_demo");
  expect(await reloaded.movements(s.a.context, s.a.digest)).toEqual(first);
  expect(await snapshot()).toEqual(before);
  expect(JSON.stringify(first)).not.toMatch(/stateHash|fake_token_|code|accountRef/u);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.ais_observation WHERE tenant_id=$1", [s.a.tenantId])).rows[0].n).toBe(3);
  await expect(s.repository.movements(s.other.context, s.other.digest, s.id)).rejects.toThrow("AIS_NOT_FOUND");
  expect((await s.repository.movements(s.other.context, s.other.digest)).connection).toBeNull();
  await expect(s.repository.movements(s.a.context, s.other.digest, s.id)).rejects.toThrow("AIS_FORBIDDEN");
  await expect(s.repository.callback(s.a.context, s.a.digest, s.id, s.callback)).rejects.toThrow("AIS_CALLBACK_INVALID");
});
it("unlink, revoke, expiry and lost tokens refuse pulls without storing observations", async () => {
  for (const kind of ["unlinked", "revoked", "expired", "token_revoked"] as const) {
    const s = await setup();
    if (kind === "expired") {
      await f.admin.query("ALTER TABLE app.ais_connection DISABLE TRIGGER immutable_rows");
      try { await f.admin.query("UPDATE app.ais_connection SET created_at=clock_timestamp()-interval '2 days',expires_at=clock_timestamp()-interval '1 day' WHERE tenant_id=$1", [s.a.tenantId]); }
      finally { await f.admin.query("ALTER TABLE app.ais_connection ENABLE TRIGGER immutable_rows"); }
    } else if (kind === "token_revoked") await s.vault.revoke(s.id);
    else await s.repository.stop(s.a.context, s.a.digest, s.id, kind);
    await expect(s.repository.pull(s.a.context, s.a.digest, s.id, window)).rejects.toThrow(kind === "token_revoked" ? "AIS_TOKEN_REVOKED" : "AIS_INACTIVE");
    expect((await s.repository.movements(s.a.context, s.a.digest)).connection?.status).toBe(kind);
    expect((await f.admin.query("SELECT count(*)::int n FROM app.ais_observation WHERE tenant_id=$1", [s.a.tenantId])).rows[0].n).toBe(0);
  }
});
it("read-only routine has the exact runtime grant and requires an active owner session", async () => {
  const s = await setup();
  const catalog = (await f.admin.query(`SELECT pg_get_userbyid(proowner) owner,prosecdef,proconfig,proacl::text acl
    FROM pg_proc WHERE oid='app.ais_movement_read(uuid,text,uuid)'::regprocedure`)).rows[0];
  expect(catalog).toEqual({ owner: "jobguard_migration", prosecdef: true, proconfig: ["search_path=pg_catalog"],
    acl: "{jobguard_migration=X/jobguard_migration,jobguard_runtime=X/jobguard_migration}" });
  await f.admin.query("UPDATE app.membership SET role='read_only' WHERE tenant_id=$1", [s.a.tenantId]);
  await expect(s.repository.movements(s.a.context, s.a.digest)).rejects.toThrow("AIS_FORBIDDEN");
  await expect(workTenant(f.runtime, s.other.tenantId, db => db.query("SELECT app.ais_movement_read($1,$2,$3)", [s.a.tenantId, s.a.digest, s.id]))).rejects.toThrow();
});
