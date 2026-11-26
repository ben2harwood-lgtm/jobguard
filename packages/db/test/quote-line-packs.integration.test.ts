// QW-6 pack count on real PostgreSQL: the quote-line read and its "confirmed" rule, across jobs and tenants.
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { calculateMaterialPackCount } from "@jobguard/core";
import { migrate, DEMO_TENANT_ID as T, DEMO_MEMBERSHIP_ID as M, QuoteAcceptanceRepository, QuoteDeliveryRepository, QuoteLinePackRepository, QuoteRepository, prepareActivationFixtureV3, withTenant } from "../src/index.js";
import { authenticatePracticeSession, authorizePracticeJob, issuePracticeSession } from "../src/practice-session.js";
import { seedSyntheticPartyFixture } from "../src/synthetic-party-fixture.js";
import { freePort, closeTestPools, syntheticOwnerPool } from "./pool-test-utils.js";
import { testBoundTenantContext } from "./tenant-context-test-utils.js";

const original = process.env.JOBGUARD_ENV, recipient = "fixture-customer@example.invalid";
let pg: EmbeddedPostgres, admin: Pool, runtime: Pool, dir: string;
type Practice = Awaited<ReturnType<typeof authenticatePracticeSession>>;
beforeAll(async () => {
  process.env.JOBGUARD_ENV = "synthetic_demo";
  dir = await mkdtemp(join(tmpdir(), "qw6-packs-pg-"));
  const port = await freePort(57700, 200);
  pg = new EmbeddedPostgres({ databaseDir: dir, port, user: "postgres", password: "synthetic", persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await pg.initialise(); await pg.start();
  admin = await syntheticOwnerPool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic" });
  await migrate(admin);
  await admin.query(`INSERT INTO control_plane.tenant(id)VALUES('${T}');INSERT INTO identity.identity_user(id)VALUES('d1500000-0000-4000-8000-000000000001');INSERT INTO app.account(id,tenant_id,name)VALUES('d1550000-0000-4000-8000-000000000002','${T}','Synthetic');INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role)VALUES('${M}','${T}','d1550000-0000-4000-8000-000000000002','d1500000-0000-4000-8000-000000000001','owner');CREATE ROLE qw6_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOBYPASSRLS;GRANT jobguard_runtime TO qw6_login;`);
  runtime = new Pool({ host: "127.0.0.1", port, database: "jobguard_synthetic_demo", user: "qw6_login", password: "synthetic", max: 6 });
}, 90_000);
afterAll(async () => {
  await closeTestPools(runtime, admin); await pg?.stop(); await rm(dir, { recursive: true, force: true });
  if (original === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = original;
});

const practice = async () => authenticatePracticeSession(runtime, await issuePracticeSession(runtime));
/** A fictional quoting job with one draft quote line of the given quantity; optionally sent to the customer. */
async function quotedJob(auth: Practice, quantity: string, unit: string, send: boolean) {
  const jobId = randomUUID(), scope = randomUUID(), scopeRevision = randomUUID();
  await withTenant(admin, auth.context, async db => {
    await db.$client.query(`INSERT INTO app.job(id,tenant_id,title,status,practice_session_digest,practice_scenario) VALUES($1,$2,'Fictional tiling','quoting',$3,'capture')`, [jobId, auth.context.tenantId, auth.digest]);
    await seedSyntheticPartyFixture(db.$client, auth.context.tenantId, jobId);
    await db.$client.query(`INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')`, [scope, auth.context.tenantId, jobId]);
    await db.$client.query(`INSERT INTO app.scope_revision(id,tenant_id,job_id,scope_item_id,revision,description,quantity_decimal,unit,unit_price_pence,total_pence) VALUES($1,$2,$3,$4,1,'Fictional floor tiling',$5,$6,1000,6000)`, [scopeRevision, auth.context.tenantId, jobId, scope, quantity, unit]);
  });
  await new QuoteRepository(runtime).saveDraft(auth.context, { jobId, draftId: randomUUID(), expectedRevision: 0, currency: "GBP", taxPolicyVersion: "candidate_m1_standard_v1", blockingQuestions: [], effectiveAt: new Date(),
    lines: [{ id: randomUUID(), scopeItemId: scope, scopeRevisionId: scopeRevision, description: "Fictional floor tiling", origin: "captured", included: true, exclusionReason: null, quantity, unit, unitRatePence: 1000, discountPercent: "0", taxTreatment: "standard_rate_20", rateProvenance: "entered", category: "Work", region: null }] } as never);
  // Saving a draft mints the stored line's own id.
  const lineId: string = (await new QuoteRepository(runtime).readWorkspace(auth.context, jobId)).revisions[0]!.lines[0]!.id;
  let document: { documentId: string; hash: string; version: number } | undefined;
  if (send) {
    const delivery = new QuoteDeliveryRepository(runtime), preview = await delivery.preview(auth.context, jobId, recipient);
    await delivery.issue(auth.context, jobId, { commandId: randomUUID(), documentId: preview.documentId, contentHash: preview.hash, recipient });
    await delivery.execute(auth.context, jobId, preview.documentId, "success");
    document = { documentId: preview.documentId, hash: preview.hash, version: preview.document.documentVersion };
  }
  return { jobId, lineId, document };
}
/** The same read the route makes: the line through the quote workspace, then whether its revision is confirmed. */
async function packs(auth: Practice, jobId: string, lineId: string) {
  const workspace = await new QuoteRepository(runtime).readWorkspace(auth.context, jobId);
  const revision = workspace.revisions.find(r => r.lines.some((l: { id: string }) => l.id === lineId));
  if (!revision) return null;
  const line = revision.lines.find((l: { id: string }) => l.id === lineId)!;
  const confirmed = await new QuoteLinePackRepository(runtime).revisionConfirmed(auth.context, jobId, revision.id);
  return { confirmed, result: calculateMaterialPackCount({ measurement: { quantity: line.quantity, unit: line.unit, confirmed }, wastageMultiplier: "1.10", product: { packSize: { quantity: "1.2", unit: "m²" } }, confirmedUsablePacksSetAside: 1n }) };
}

it("a sent 6 m² line is confirmed: 6 packs, 1 on site, order 5; an unsent draft line is not", async () => {
  const auth = await practice();
  const sent = await quotedJob(auth, "6", "m²", true), draft = await quotedJob(auth, "6", "m²", false);
  expect(await packs(auth, sent.jobId, sent.lineId)).toEqual({ confirmed: true, result: { status: "calculated", grossPacks: 6n, setAsidePacksUsed: 1n, neededPacks: 5n } });
  expect(await packs(auth, draft.jobId, draft.lineId)).toEqual({ confirmed: false, result: { status: "needs_input", reason: "measurement" } });
});

it("an accepted quote stays confirmed; a declined one does not", async () => {
  const auth = await practice();
  const accepted = await prepareActivationFixtureV3(admin, auth.context, `Fictional accepted ${randomUUID()}`, 100000, runtime, 100000, auth.digest);
  const revision = (await new QuoteRepository(runtime).readWorkspace(auth.context, accepted)).revisions.at(-1)!;
  expect(await new QuoteLinePackRepository(runtime).revisionConfirmed(auth.context, accepted, revision.id)).toBe(true);
  const declined = await quotedJob(auth, "6", "m²", true), d = declined.document!;
  await new QuoteAcceptanceRepository(runtime).disposition(auth.context, declined.jobId, { commandId: randomUUID(), documentId: d.documentId, documentHash: d.hash, documentVersion: d.version, kind: "declined", occurredAt: new Date().toISOString() });
  expect((await packs(auth, declined.jobId, declined.lineId))?.confirmed).toBe(false);
});

it("never reads another job's or another tenant's quote line", async () => {
  const auth = await practice();
  const a = await quotedJob(auth, "6", "m²", true), b = await quotedJob(auth, "6", "m²", true);
  // Line a under job b: not found, and job a's revision is never confirmed through job b.
  expect(await packs(auth, b.jobId, a.lineId)).toBeNull();
  const aRevision = (await new QuoteRepository(runtime).readWorkspace(auth.context, a.jobId)).revisions[0]!;
  expect(await new QuoteLinePackRepository(runtime).revisionConfirmed(auth.context, b.jobId, aRevision.id)).toBe(false);
  // Practice sessions share the synthetic tenant, so the route reaches the line only after the session's own job check,
  // the same check every practice quote read makes. Another practice session is refused job a before any line read.
  await expect(authorizePracticeJob(runtime, await issuePracticeSession(runtime), a.jobId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  // A different tenant altogether sees nothing.
  const tenant = randomUUID(), user = randomUUID(), account = randomUUID(), member = randomUUID();
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenant]);
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [user]);
  await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional other builder')", [account, tenant]);
  await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [member, tenant, account, user]);
  const foreign = await testBoundTenantContext(admin, tenant, member);
  expect((await new QuoteRepository(runtime).readWorkspace(foreign, a.jobId)).revisions).toEqual([]);
  expect(await new QuoteLinePackRepository(runtime).revisionConfirmed(foreign, a.jobId, aRevision.id)).toBe(false);
});
