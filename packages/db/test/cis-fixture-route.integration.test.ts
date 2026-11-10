import { createHash, randomUUID } from "node:crypto";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { cluster, type Cluster } from "./extra-fixtures.js";
import { seedWorkJob, type WorkFixture } from "./job-work-state-fixtures.js";
const state = vi.hoisted(() => ({ identity: null as unknown, credentials: {} as Record<string, string>, pool: null as unknown }));
vi.mock("server-only", () => ({}));
vi.mock("@jobguard/api/workspace", async () => import("../../../apps/api/dist/workspace/index.js"));
vi.mock("../../../apps/web/app/lib/identity-server", () => ({ identityApplication: () => state.identity, identityCredentials: async () => state.credentials }));
vi.mock("../../../apps/web/app/lib/synthetic-server", () => ({ syntheticPool: () => state.pool }));
import { GET, POST } from "../../../apps/web/app/api/jobs/[id]/cis-fixtures/route.js";
let c: Cluster;
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); c = await cluster(); state.pool = c.runtime; }, 240000);
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });
async function setup() {
  const a = await seedWorkJob(c as unknown as WorkFixture);
  const user = (await c.admin.query("SELECT identity_user_id FROM app.membership WHERE tenant_id=$1 AND id=$2", [a.tenantId, a.actorId])).rows[0].identity_user_id as string;
  state.credentials = { sessionToken: "s".repeat(32), csrfToken: "c".repeat(24), tenantHeader: a.tenantId, origin: "https://company.invalid" };
  const sessionId = randomUUID(), sessionCredential = createHash("sha256").update(randomUUID()).digest("hex");
  await c.admin.query("INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at) VALUES($1,$2,'synthetic_demo',$3,$4,clock_timestamp()+interval '1 hour')",
    [sessionId, user, sessionCredential, state.credentials.csrfToken]);
  // LP-6b binds the real session, so give the fictional owner the identity rows a signed-in member has.
  await c.admin.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [`${user}@fictional.invalid`, user]);
  await c.admin.query("INSERT INTO identity.membership_locator(user_id,tenant_id,membership_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [user, a.tenantId, a.actorId]);
  state.identity = { allowedOrigin: "https://company.invalid", provider: {
    authenticate: async (token: string) => token === state.credentials.sessionToken ? { identityUserId: user, sessionId, sessionCredential, csrfToken: state.credentials.csrfToken } : undefined,
    findMembership: async (_principal: unknown, tenant: string) => tenant === a.tenantId ? { id: a.actorId, tenantId: a.tenantId, identityUserId: user, role: "owner" } : undefined,
  } };
  const params = { params: Promise.resolve({ id: a.jobId }) };
  const get = () => GET(new Request("https://company.invalid"), params);
  const post = (body: unknown) => POST(new Request("https://company.invalid", { method: "POST", headers: { origin: "https://company.invalid" }, body: JSON.stringify(body) }), params);
  const initial = await get(); expect(initial.status).toBe(404);
  const { starter } = await initial.json();
  const { tenantId: _tenant, jobId, ...fixture } = starter;
  const input = { version: "cis.persist-fixture.v1", commandId: randomUUID(), jobId, fixture };
  return { a, get, post, input };
}
async function commercialSnapshot(tenant: string) {
  // Inspect actual catalogs, including every tenant business table, rather than a hand-maintained subset.
  const tables = (await c.admin.query(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='app' AND c.relkind='r' AND c.relname<>'cis_fixture_record'
    AND EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='tenant_id' AND NOT a.attisdropped)`)).rows as { relname: string }[];
  const result: Record<string, number> = {};
  for (const { relname } of tables) result[relname] = Number((await c.admin.query(`SELECT count(*) n FROM app."${relname.replaceAll('"', '""')}" WHERE tenant_id=$1`, [tenant])).rows[0].n);
  return result;
}
it("the actual screen route appends only CIS fixtures: no invoice, receipt, fee, collection, ledger or outbox effects", async () => {
  const { a, get, post, input } = await setup();
  const paymentId = randomUUID();
  input.fixture.payments = [{ version: "cis.payment-fixture.v1", id: paymentId, tenantId: a.tenantId, jobId: a.jobId,
    paymentReference: "Fictional route payment", paymentDate: "2026-10-31", evidenceId: randomUUID(), cashPence: 3400, reversalOfPaymentId: null }];
  input.fixture.statements[0].paymentRecordIds = [paymentId];
  const before = await commercialSnapshot(a.tenantId);
  for (const pattern of [/invoice/u, /receipt/u, /fee/u, /collection/u, /journal|ledger/u, /outbox/u]) expect(Object.keys(before).some(name => pattern.test(name))).toBe(true);
  expect((await post(input)).status).toBe(201); expect((await post(input)).status).toBe(201);
  const saved = await (await get()).json(); expect(saved.stored.records).toHaveLength(1);
  expect(saved.stored.reconciliation.statements[0]).toMatchObject({ invoiceNet: { pence: 10000 }, vatToSupplier: { pence: 2000 }, reverseChargeVat: { pence: 0 }, retention: { pence: 1000 }, cisDeduction: { pence: 600 }, actualCash: { pence: 3400 }, unpaidCash: { pence: 0 }, feeEligibleRecovery: { pence: 0 } });
  const changed = structuredClone(input); changed.fixture.statements[0].documentReference = "changed";
  const conflict = await post(changed); expect(conflict.status).toBe(409); expect(await conflict.json()).toMatchObject({ code: "CIS_FIXTURE_CONFLICT" });
  const correction = structuredClone(input); correction.commandId = randomUUID(); correction.fixture.verifications = []; correction.fixture.payments = []; correction.fixture.statements[0].paymentRecordIds = [];
  Object.assign(correction.fixture.statements[0], { id: randomUUID(), previousStatementId: input.fixture.statements[0].id,
    kind: "correction", correctionOfStatementId: input.fixture.statements[0].id, documentReference: "Correction", cumulativePaidNetPence: 2000 });
  expect((await post(correction)).status).toBe(201);
  const corrected = await (await get()).json(); expect(corrected.stored.book.statements[0]).toEqual(saved.stored.book.statements[0]);
  expect(corrected.stored.records).toHaveLength(2);
  expect(saved.stored.records[0].actor.membershipId).toBe(a.actorId);
  const reused = structuredClone(input); reused.commandId = randomUUID(); reused.fixture.verifications = [];
  Object.assign(reused.fixture.statements[0], { id: randomUUID(), previousStatementId: correction.fixture.statements[0].id, documentReference: "Reused cash" });
  expect((await post(reused)).status).toBe(409);
  expect(await commercialSnapshot(a.tenantId)).toEqual(before);
});
it("stores nothing for missing/stale verification, forged fields, unsupported corrections and unauthorized owners", async () => {
  const { a, post, input } = await setup();
  const sourceTamper = structuredClone(input); sourceTamper.fixture.vatBook.documents[0].documentReference = "forged starting source";
  expect((await post(sourceTamper)).status).toBe(409);
  const foreign = await seedWorkJob(c as unknown as WorkFixture);
  for (const job of [foreign.jobId, randomUUID()]) {
    const response = await GET(new Request("https://company.invalid"), { params: Promise.resolve({ id: job }) });
    expect(response.status).toBe(404); expect((await response.json()).code).toBe("CIS_FIXTURE_NOT_FOUND");
  }
  const missing = structuredClone(input); missing.fixture.verifications = [];
  expect((await post(missing)).status).toBe(400);
  const stale = structuredClone(input); stale.fixture.verifications[0].validThrough = "2026-10-30";
  expect((await post(stale)).status).toBe(400);
  for (const key of ["tenantId", "actor", "enabled", "CIS_ENABLED"]) expect((await post({ ...input, [key]: true })).status).toBe(400);
  const correction = structuredClone(input); correction.fixture.statements[0].kind = "correction";
  expect((await post(correction)).status).toBe(400);
  for (const role of ["finance", "admin", "read_only", "foreman", "estimator"]) {
    await c.admin.query("UPDATE app.membership SET role=$1 WHERE tenant_id=$2 AND id=$3", [role, a.tenantId, a.actorId]);
    expect((await post(input)).status).toBe(404);
  }
  await c.admin.query("UPDATE app.membership SET role='owner',revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [a.tenantId, a.actorId]);
  expect((await post(input)).status).toBe(404);
  expect((await c.admin.query("SELECT count(*)::int n FROM app.cis_fixture_record WHERE tenant_id=$1", [a.tenantId])).rows[0].n).toBe(0);
});
