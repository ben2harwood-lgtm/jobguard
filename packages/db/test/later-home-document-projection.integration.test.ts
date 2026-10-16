import { randomUUID } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { ModuleKind, transpileModule } from "typescript";
import { afterAll, beforeAll, expect, it } from "vitest";
import * as database from "../src/index.js";
import { seedSyntheticPartyFixture } from "../src/synthetic-party-fixture.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";

let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool;
const priorEnvironment = process.env.JOBGUARD_ENV;
const credential = randomUUID();
type Summary = { id: string; title: string; document: { kind: string; reference: string | null; delivery: string } };
// Only Next request infrastructure is substituted. Authentication, repositories,
// tenant transactions and the exact production projection run on PostgreSQL.
async function workspace(session: string) {
  const exports: { syntheticWorkspace?: () => Promise<{ jobs: Summary[] }> } = {};
  const adapters: Record<string, unknown> = {
    "server-only": {}, "next/headers": { cookies: async () => ({ get: () => ({ value: session }) }) },
    "next/server": {}, "@jobguard/api/workspace": {}, "@jobguard/db": database, pg: { Pool },
  };
  const source = await readFile(new URL("../../../apps/web/app/lib/synthetic-server.ts", import.meta.url), "utf8");
  runInNewContext(transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText, {
    exports, require: (id: string) => {
      if (!(id in adapters)) throw new Error(`Unexpected dependency ${id}`);
      return adapters[id];
    }, process: { env: { JOBGUARD_ENV: "synthetic_demo", DATABASE_URL: "unused" } }, globalThis: { __jobguardSyntheticPool: runtime },
  });
  return exports.syntheticWorkspace!();
}

beforeAll(async () => {
  process.env.JOBGUARD_ENV = "synthetic_demo";
  const directory = await mkdtemp(join(tmpdir(), "later-b7-pg-")), port = await freePort(57800, 200);
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: credential, persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start();
  admin = new Pool({ host: "127.0.0.1", port, database: "postgres", user: "postgres", password: credential });
  await database.migrate(admin);
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [database.DEMO_TENANT_ID]);
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [database.DEMO_IDENTITY_USER_ID]);
  await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional B7 builder')", [database.DEMO_ACCOUNT_ID, database.DEMO_TENANT_ID]);
  await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [database.DEMO_MEMBERSHIP_ID, database.DEMO_TENANT_ID, database.DEMO_ACCOUNT_ID, database.DEMO_IDENTITY_USER_ID]);
  await admin.query(`CREATE ROLE later_b7_login LOGIN PASSWORD '${credential}' NOSUPERUSER NOBYPASSRLS; GRANT jobguard_runtime TO later_b7_login`);
  runtime = new Pool({ host: "127.0.0.1", port, database: "postgres", user: "later_b7_login", password: credential, max: 2 });
}, 90_000);
afterAll(async () => {
  if (priorEnvironment === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = priorEnvironment;
  await closeTestPools(runtime, admin); await postgres?.stop();
});

async function fixture() {
  const session = await database.issuePracticeSession(runtime), auth = await database.authenticatePracticeSession(runtime, session);
  const home = (await workspace(session)).jobs;
  const jobId = home.find(job => job.title === "Loft conversion")!.id;
  return { session, auth, jobId };
}
async function preview(f: Awaited<ReturnType<typeof fixture>>) {
  const scopeId = randomUUID(), revisionId = randomUUID();
  const client = await admin.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [database.DEMO_TENANT_ID]);
    await seedSyntheticPartyFixture(client, database.DEMO_TENANT_ID, f.jobId);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  await admin.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [scopeId, database.DEMO_TENANT_ID, f.jobId]);
  await admin.query("INSERT INTO app.scope_revision(id,tenant_id,job_id,scope_item_id,revision,description,quantity_decimal,unit,unit_price_pence,total_pence) VALUES($1,$2,$3,$4,1,'Fictional paint','1','item',10000,10000)", [revisionId, database.DEMO_TENANT_ID, f.jobId, scopeId]);
  await new database.QuoteRepository(runtime).saveDraft(f.auth.context, {
    jobId: f.jobId, draftId: randomUUID(), expectedRevision: 0, currency: "GBP", taxPolicyVersion: "candidate_m1_standard_v1", effectiveAt: new Date("2026-10-16T09:00:00Z"),
    lines: [{ id: randomUUID(), scopeItemId: scopeId, scopeRevisionId: revisionId, description: "Fictional paint", origin: "captured", included: true, exclusionReason: null, quantity: "1", unit: "item", unitRatePence: 10000, discountPercent: "0", taxTreatment: "standard_rate_20", rateProvenance: "entered", category: "Decorating", region: "London" }],
  });
  return new database.QuoteDeliveryRepository(runtime).preview(f.auth.context, f.jobId, "customer@example.invalid");
}
const summary = async (session: string, jobId: string) => (await workspace(session)).jobs.find(job => job.id === jobId)!.document;

it("L143-1 title alone cannot create Q1007 or delivered status on real PostgreSQL", async () => {
  const f = await fixture(), jobs = (await workspace(f.session)).jobs;
  expect(jobs.find(job => job.title === "Kitchen extension")!.document).toEqual({ kind: "none", reference: null, delivery: "not_sent" });
  expect(await summary(f.session, f.jobId)).toEqual({ kind: "none", reference: null, delivery: "not_sent" });
});

it("L143-2 L143-3 L143-4 persisted document and delivery state survive title change and new readers; source IDs and persisted state agree", async () => {
  const f = await fixture(), artifact = await preview(f), delivery = new database.QuoteDeliveryRepository(runtime);
  expect(await summary(f.session, f.jobId)).toEqual({ kind: "quote", reference: artifact.document.reference, delivery: "not_sent" });
  await delivery.issue(f.auth.context, f.jobId, { documentId: artifact.documentId, contentHash: artifact.hash, recipient: "customer@example.invalid", commandId: randomUUID() });
  expect(await summary(f.session, f.jobId)).toMatchObject({ delivery: "queued" });
  await delivery.execute(f.auth.context, f.jobId, artifact.documentId, "timeout");
  expect(await summary(f.session, f.jobId)).toMatchObject({ delivery: "outcome_unknown" });
  await delivery.execute(f.auth.context, f.jobId, artifact.documentId, "reconcile");
  const before = await summary(f.session, f.jobId);
  expect(before).toEqual({ kind: "quote", reference: artifact.document.reference, delivery: "delivered" });
  const source = (await admin.query("SELECT d.id,d.reference,o.status FROM app.quote_document_version d JOIN app.quote_send s ON(s.tenant_id,s.job_id,s.document_id)=(d.tenant_id,d.job_id,d.id) JOIN app.action_outbox o ON(o.tenant_id,o.id)=(s.tenant_id,s.outbox_action_id) WHERE d.tenant_id=$1 AND d.id=$2", [database.DEMO_TENANT_ID, artifact.documentId])).rows;
  expect(source).toEqual([{ id: artifact.documentId, reference: before.reference, status: "succeeded" }]);
  await admin.query("UPDATE app.job SET title='Renamed fictional loft' WHERE tenant_id=$1 AND id=$2", [database.DEMO_TENANT_ID, f.jobId]);
  expect(await summary(f.session, f.jobId)).toEqual(before);
  // A newer saved preview must not inherit delivery from the earlier identity.
  const next = await delivery.preview(f.auth.context, f.jobId, "different@example.invalid");
  expect(next.documentId).not.toBe(artifact.documentId);
  expect(await summary(f.session, f.jobId)).toEqual({ kind: "quote", reference: next.document.reference, delivery: "not_sent" });
});

it("L143-6 another practice session cannot see the document even when its job title matches", async () => {
  const owner = await fixture(), artifact = await preview(owner), stranger = await fixture();
  expect((await workspace(stranger.session)).jobs.some(job => job.id === owner.jobId)).toBe(false);
  await expect(database.authorizePracticeJob(runtime, stranger.session, owner.jobId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(await summary(stranger.session, stranger.jobId)).toEqual({ kind: "none", reference: null, delivery: "not_sent" });
  expect(await summary(owner.session, owner.jobId)).toMatchObject({ reference: artifact.document.reference });
});
