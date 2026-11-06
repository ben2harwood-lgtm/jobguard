// Real PostgreSQL coverage for CI; restricted builder sandbox cannot bind localhost.
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ConnectorPromotionRepository } from "../src/connector-promotion-repository.js";
import { MIGRATION_URLS } from "../src/migrate.js";
import { cluster, world } from "./contractor-billing-fixtures.js";
import { closeWorkFixture, createWorkFixture } from "./job-work-state-fixtures.js";

const own = "0862_connector_export_delivery_staging.sql";
const token = "fictional-export-ack-database-token-0001";
const tokenHash = createHash("sha256").update(token).digest("hex");
const input = { version: "connector-input.v1", eventId: "fixture:export_received", kind: "export_delivery",
  subject: "fixture:export_batch", revision: 1, outcome: "received" };
let c: Awaited<ReturnType<typeof cluster>>, connector: Pool;
async function asConnector<T>(run: (db: PoolClient) => Promise<T>) {
  const db = await connector.connect();
  try {
    await db.query("BEGIN"); await db.query("SET LOCAL ROLE jobguard_connector");
    const result = await run(db); await db.query("COMMIT"); return result;
  } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
}
async function binding(tenant: string = randomUUID()) {
  const id = randomUUID();
  await c.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1) ON CONFLICT DO NOTHING", [tenant]);
  await c.admin.query(`INSERT INTO connector.binding(tenant_id,id,namespace,environment,endpoint_kind,token_sha256,expires_at)
    VALUES($1,$2,'fixture:export_source','synthetic_demo','fake',$3,clock_timestamp()+interval '1 hour')`, [tenant, id, tokenHash]);
  return { id, tenant };
}
const stage = (id: string, value: unknown = input, secret = token) => asConnector(async db =>
  (await db.query("SELECT connector.intake($1,$2,$3::jsonb) receipt", [id, secret, JSON.stringify(value)])).rows[0]!.receipt);
async function domainSnapshot(tenant: string) {
  const tables = ["billing_export_batch", "billing_export_line", "billing_export_delivery", "billing_status_import",
    "billing_fact", "billing_line_match", "billing_quarantine", "billing_allocation_run", "billing_application_event",
    "contractor_receipt_line_allocation", "action_outbox", "enterprise_fee_statement", "extra_origin", "connector_promotion"];
  const result: Record<string, unknown> = {};
  for (const table of tables) {
    result[table] = (await c.admin.query(`SELECT to_jsonb(r) row FROM app.${table} r WHERE tenant_id=$1 ORDER BY to_jsonb(r)::text`, [tenant])).rows;
  }
  return result;
}

describe("ENT-13A-EXPORT-ACK RED staged partner acknowledgements", () => {
  beforeAll(async () => {
    c = await cluster();
    const login = `export_ack_${randomUUID().replaceAll("-", "")}`, password = randomUUID();
    await c.admin.query(`CREATE ROLE ${login} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD '${password}'; GRANT jobguard_connector TO ${login}`);
    connector = new Pool({ ...c.admin.options, user: login, password, max: 2 });
  }, 180_000);
  afterAll(async () => { await connector?.end(); await c?.close(); vi.unstubAllEnvs(); });

  it("stages once, preserves the first receipt across retries/rotation, conflicts on changed payload and changes no export/billing rows", async () => {
    const f = await world(c), invoice = await f.invoice();
    const batch = (await c.admin.query("SELECT id FROM app.billing_export_batch WHERE tenant_id=$1 AND job_id=$2", [f.w.p.tenantId, f.s.jobId])).rows[0]!;
    const acknowledgement = { ...input, subject: `fixture:export_${(batch.id as string).replaceAll("-", "")}` };
    // The fixture label represents this existing synthetic export batch. Intake intentionally
    // does not resolve the label or claim that the partner's assertion is authoritative.
    expect((await c.admin.query("SELECT id FROM app.billing_export_batch WHERE tenant_id=$1 AND id=$2", [f.w.p.tenantId, batch.id])).rowCount).toBe(1);
    await f.repo.import(f.ctx, f.session, f.s.jobId, f.importInput([invoice]));
    const b = await binding(f.w.p.tenantId), before = await domainSnapshot(b.tenant);
    const results = await Promise.all([stage(b.id, acknowledgement), stage(b.id, acknowledgement)]);
    expect(results[0]).toEqual({ version: "connector-receipt.v1", eventId: input.eventId, state: "staged", domainEffects: 0 });
    expect(results[1]).toEqual(results[0]);
    await expect(new ConnectorPromotionRepository(c.runtime).promote(f.session, {
      version: "connector-promotion.v1", namespace: "fixture:export_source", eventId: input.eventId,
    })).rejects.toBeDefined();
    expect(await stage(b.id, Object.fromEntries(Object.entries(acknowledgement).reverse()))).toEqual(results[0]);
    expect(await stage((await binding(b.tenant)).id, acknowledgement)).toEqual(results[0]);
    await expect(stage(b.id, { ...acknowledgement, outcome: "rejected" })).rejects.toMatchObject({ code: "23505" });
    await expect(stage(b.id, { ...acknowledgement, eventId: "fixture:competing" })).rejects.toMatchObject({ code: "23505" });
    expect((await c.admin.query("SELECT receipt FROM connector.input_event WHERE tenant_id=$1", [b.tenant])).rows).toEqual([{ receipt: results[0] }]);
    expect((await c.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND event_type='connector.input_staged'", [b.tenant])).rows[0].n).toBe(1);
    for (const revision of [3, 2]) {
      expect(await stage(b.id, { ...acknowledgement, eventId: `fixture:revision_${revision}`, revision, outcome: "rejected" })).toMatchObject({ state: "staged", domainEffects: 0 });
    }
    expect(await domainSnapshot(b.tenant)).toEqual(before);
  });

  it("keeps tenant binding, secrets and revocation checks ahead of duplicate receipts", async () => {
    const a = await binding(), b = await binding();
    await stage(a.id); await stage(b.id);
    expect((await c.admin.query("SELECT tenant_id FROM connector.input_event WHERE event_id=$1 AND tenant_id IN($2,$3)", [input.eventId, a.tenant, b.tenant])).rowCount).toBe(2);
    await expect(stage(a.id, input, "fictional-wrong-token-with-32-bytes")).rejects.toMatchObject({ code: "42501" });
    await c.admin.query("UPDATE connector.binding SET revoked_at=clock_timestamp() WHERE id=$1", [a.id]);
    await expect(stage(a.id)).rejects.toMatchObject({ code: "42501" });
    await c.admin.query("UPDATE connector.binding SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [b.id]);
    await expect(stage(b.id)).rejects.toMatchObject({ code: "42501" });
  });

  it("refuses malformed, oversized, unknown-outcome and authority-bearing input at the SQL boundary", async () => {
    const b = await binding();
    const { outcome: _outcome, ...missingOutcome } = input;
    for (const value of [null, [], {}, missingOutcome, { ...input, outcome: null }, { ...input, outcome: "unknown" },
      { ...input, revision: 0 }, { ...input, revision: 1.5 }, { ...input, revision: "1" }, { ...input, revision: 2147483648 },
      { ...input, subject: "fixture:x\n" }, { ...input, subject: "fixture:" + "x".repeat(113) },
      { ...input, eventId: null }, { ...input, outcome: "x".repeat(17000) }]) {
      await expect(stage(b.id, value)).rejects.toThrow("CONNECTOR_INPUT_REFUSED");
    }
    for (const field of ["document", "status", "rawContent", "unexpected", "money", "amountPence", "price", "allocation",
      "tenant", "job", "bill", "statement", "origin", "approval"]) {
      await expect(stage(b.id, { ...input, [field]: "fixture:forbidden" })).rejects.toThrow("CONNECTOR_INPUT_REFUSED");
    }
    for (const kind of ["approve", "price", "write_origin", "read_statement"]) {
      await expect(stage(b.id, { ...input, kind })).rejects.toThrow("CONNECTOR_INPUT_REFUSED");
    }
    expect((await c.admin.query("SELECT * FROM connector.input_event WHERE tenant_id=$1", [b.tenant])).rows).toEqual([]);
  });

  it("retains principal limits: no approval, pricing, origin writes, statement reads or promotion", async () => {
    for (const sql of ["SELECT * FROM app.enterprise_fee_statement", "SELECT * FROM app.prompt_resolution",
      "UPDATE app.work_order_line SET rate_pence=1", "UPDATE app.extra_origin SET kind='site_user'",
      "SELECT app.connector_promotion(NULL,NULL,NULL,NULL,NULL)", "SET LOCAL ROLE jobguard_runtime",
      "SET LOCAL ROLE jobguard_migration", "SELECT * FROM connector.input_event"]) {
      await expect(asConnector(db => db.query(sql))).rejects.toMatchObject({ code: "42501" });
    }
    expect((await c.admin.query(`SELECT rolcanlogin,rolsuper,rolinherit,rolbypassrls FROM pg_roles WHERE rolname='jobguard_connector'`)).rows[0])
      .toEqual({ rolcanlogin: false, rolsuper: false, rolinherit: false, rolbypassrls: false });
  });

  it("upgrades populated staging without changing rows, owner, search_path, ACLs or other function bodies", async () => {
    const upgrade = await createWorkFixture(false);
    try {
      const index = MIGRATION_URLS.findIndex(u => u.pathname.endsWith(own));
      expect(index).toBeGreaterThan(0);
      for (const url of MIGRATION_URLS.slice(0, index)) await upgrade.admin.query(await readFile(url, "utf8"));
      const tenant = randomUUID(), id = randomUUID();
      await upgrade.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenant]);
      await upgrade.admin.query(`INSERT INTO connector.binding(tenant_id,id,namespace,environment,endpoint_kind,token_sha256,expires_at)
        VALUES($1,$2,'fixture:upgrade','synthetic_demo','fake',$3,clock_timestamp()+interval '1 hour')`, [tenant, id, tokenHash]);
      const old = { ...input, kind: "materials_issue", eventId: "fixture:materials", document: "fixture:document" };
      const { outcome: _outcome, ...material } = old;
      await upgrade.admin.query("SELECT connector.intake($1,$2,$3::jsonb)", [id, token, JSON.stringify(material)]);
      const catalog = async () => (await upgrade.admin.query(`SELECT n.nspname,c.relname,c.relowner,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname IN('connector','app','identity','control_plane','audit_control') AND c.relkind='r' ORDER BY n.nspname,c.relname`)).rows;
      const routines = async () => (await upgrade.admin.query(`SELECT oid,proowner,proacl::text,prosecdef,proconfig,
        CASE WHEN oid='connector.intake(uuid,text,jsonb)'::regprocedure THEN NULL ELSE prosrc END body
        FROM pg_proc WHERE pronamespace='connector'::regnamespace ORDER BY oid`)).rows;
      const rows = (await upgrade.admin.query("SELECT * FROM connector.input_event ORDER BY event_id")).rows;
      const before = await catalog(), beforeRoutines = await routines();
      await upgrade.admin.query(await readFile(MIGRATION_URLS[index]!, "utf8"));
      expect(await catalog()).toEqual(before); expect(await routines()).toEqual(beforeRoutines);
      expect((await upgrade.admin.query("SELECT * FROM connector.input_event ORDER BY event_id")).rows).toEqual(rows);
      expect((await upgrade.admin.query("SELECT connector.intake($1,$2,$3::jsonb) receipt", [id, token, JSON.stringify(input)])).rows[0].receipt)
        .toMatchObject({ state: "staged", domainEffects: 0 });
    } finally { await closeWorkFixture(upgrade); }
  }, 180_000);
});
