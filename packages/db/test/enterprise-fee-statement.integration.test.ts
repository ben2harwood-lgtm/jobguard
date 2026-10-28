import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { EnterpriseFeeRepository, withTenant } from "../src/index.js";
import { cluster, code, world, type World } from "./contractor-billing-fixtures.js";

// CI ONLY. ENT-7b: statement revisions, disputes and exact finance approval (migration 0250).
let c: Awaited<ReturnType<typeof cluster>>;
beforeAll(async () => { c = await cluster(); }, 240000);
afterAll(async () => { await c?.close(); });

async function agreement(w: World) {
  const id = randomUUID();
  await c.admin.query(`INSERT INTO app.enterprise_agreement_version(tenant_id,id,agreement_ref,rate_numerator,rate_denominator,basis,policy_version,effective_from,end_of_job_check,content_hash,environment,operations_actor_ref)
    VALUES($1,$2,'fictional-agreement',1,10,'on_payment','enterprise_site_capture_policy_v1','2000-01-01T00:00:00Z',false,$3,'synthetic_demo','operations:fictional')`, [w.w.p.tenantId, id, "c".repeat(64)]);
  return id;
}
const period = async () => (await c.admin.query("SELECT to_char(clock_timestamp() AT TIME ZONE 'Europe/London','YYYY-MM') p")).rows[0].p as string;
const payment = (w: World, gross = 50000) => w.event("paid", { effectiveAt: "2026-10-03T12:00:00Z", reconciliationId: `r-${randomUUID()}`,
  amount: { netPence: Math.round(gross / 1.2), vatPence: gross - Math.round(gross / 1.2), grossPence: gross } });
const later = (minutes = 30) => new Date(Date.now() + minutes * 60_000).toISOString();

async function setUp() {
  const w = await world(c), repo = new EnterpriseFeeRepository(c.runtime), id = await agreement(w), p = await period();
  const invoice = await w.invoice();
  await w.repo.import(w.ctx, w.session, w.s.jobId, w.importInput([invoice, payment(w)]));
  const derive = () => repo.derive(w.ctx, w.session, { version: "enterprise-fee-derive.v1", commandId: randomUUID(), agreementVersionId: id, period: p });
  const prepare = (commandId = randomUUID()) => repo.prepareStatement(w.ctx, w.session, { version: "enterprise-fee-prepare-statement.v1", commandId, period: p });
  const read = (statementId: string) => repo.readStatement(w.ctx, w.session, statementId);
  const approve = (statementId: string, contentHash: string, totalDeltaPence: number, overrides: Record<string, unknown> = {}) =>
    repo.approveStatement(w.ctx, w.session, { version: "enterprise-fee-approve-statement.v1", commandId: randomUUID(), statementId, contentHash, totalDeltaPence, expiresAt: later(), ...overrides });
  const dispute = (statementId: string, reasonCode = "line_disputed") =>
    repo.disputeStatement(w.ctx, w.session, { version: "enterprise-fee-dispute-statement.v1", commandId: randomUUID(), statementId, reasonCode });
  return { w, repo, id, p, derive, prepare, read, approve, dispute };
}

it("prepares one revision per unchanged month from the latest derivation; replays return it", async () => {
  const t = await setUp();
  expect(await code(t.prepare())).toBe("FEE_NOT_FOUND"); // nothing derived yet
  await t.derive();
  const command = randomUUID(), first = await t.prepare(command);
  expect(first.replayed).toBe(false);
  expect(await t.prepare(command)).toEqual({ statementId: first.statementId, replayed: true });
  expect(await t.prepare()).toEqual({ statementId: first.statementId, replayed: true });
  const s = await t.read(first.statementId);
  expect(s).toMatchObject({ revision: 1, predecessorId: null, totalDeltaPence: 806, superseded: false, dispute: null, approval: null });
  expect(s.sections).toEqual([expect.objectContaining({ agreementVersionId: t.id, cumulativeFeePence: 806, priorNetPostedPence: 0, deltaPence: 806 })]);
});

it("exact approval creates one Decision, an approved resolution and one exact expiring authorisation", async () => {
  const t = await setUp(); await t.derive();
  const { statementId } = await t.prepare(), s = await t.read(statementId);
  const command = randomUUID();
  const approved = await t.repo.approveStatement(t.w.ctx, t.w.session, { version: "enterprise-fee-approve-statement.v1", commandId: command, statementId, contentHash: s.contentHash, totalDeltaPence: s.totalDeltaPence, expiresAt: later() });
  expect(await t.repo.approveStatement(t.w.ctx, t.w.session, { version: "enterprise-fee-approve-statement.v1", commandId: command, statementId, contentHash: s.contentHash, totalDeltaPence: s.totalDeltaPence, expiresAt: later() }))
    .toEqual({ authorizationId: approved.authorizationId, replayed: true });
  const auth = (await c.admin.query(`SELECT z.action_type,z.content_hash,z.amount_pence,z.currency,z.policy_version,z.aggregate_revision,r.resolution,d.subject_type,d.subject_ref
    FROM app.action_authorization z JOIN app.decision_resolution r ON(r.tenant_id,r.id)=(z.tenant_id,z.resolution_id) JOIN app.decision d ON(d.tenant_id,d.id)=(z.tenant_id,z.decision_id) WHERE z.id=$1`, [approved.authorizationId])).rows[0];
  expect(auth).toMatchObject({ action_type: "enterprise_fee_statement", content_hash: s.contentHash, amount_pence: "806", currency: "GBP",
    policy_version: "enterprise_site_capture_policy_v1", aggregate_revision: 1, resolution: "approved", subject_type: "enterprise_fee_statement", subject_ref: statementId });
  expect((await t.read(statementId)).approval).toMatchObject({ authorizationId: approved.authorizationId });
  expect(await code(t.approve(statementId, s.contentHash, s.totalDeltaPence))).toBe("STATEMENT_AUTHORITY_INVALID"); // approved once only
  expect(await code(t.prepare())).toBe("COMMAND_CONFLICT"); // an approved month is closed
  const events = (await c.admin.query("SELECT event_type FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2 ORDER BY sequence", [t.w.w.p.tenantId, statementId])).rows.map(r => r.event_type);
  expect(events).toEqual(["enterprise_fee.statement_prepared", "enterprise_fee.statement_approved"]);
});

it("approval is refused for a mismatched hash or total, a bad expiry, non-finance, and changed facts", async () => {
  const t = await setUp(); await t.derive();
  const { statementId } = await t.prepare(), s = await t.read(statementId);
  expect(await code(t.approve(statementId, "0".repeat(64), s.totalDeltaPence))).toBe("STATEMENT_AUTHORITY_INVALID");
  expect(await code(t.approve(statementId, s.contentHash, s.totalDeltaPence + 1))).toBe("STATEMENT_AUTHORITY_INVALID");
  expect(await code(t.approve(statementId, s.contentHash, s.totalDeltaPence, { expiresAt: later(-1) }))).toBe("INVALID_FEE_INPUT");
  expect(await code(t.approve(statementId, s.contentHash, s.totalDeltaPence, { expiresAt: later(25 * 60) }))).toBe("INVALID_FEE_INPUT");
  expect(await code(t.repo.approveStatement(t.w.ctx, randomUUID(), { version: "enterprise-fee-approve-statement.v1", commandId: randomUUID(), statementId, contentHash: s.contentHash, totalDeltaPence: s.totalDeltaPence, expiresAt: later() }))).toBe("EXTRA_FORBIDDEN");
  // A further payment moves the stored facts: the prepared statement can no longer be approved, nor re-prepared until derived again.
  await t.w.repo.import(t.w.ctx, t.w.session, t.w.s.jobId, t.w.importInput([payment(t.w, 20000)]));
  expect(await code(t.approve(statementId, s.contentHash, s.totalDeltaPence))).toBe("STALE_FACTS");
  expect(await code(t.prepare())).toBe("STALE_FACTS");
  expect((await c.admin.query("SELECT count(*)::int n FROM app.enterprise_fee_statement_approval WHERE tenant_id=$1", [t.w.w.p.tenantId])).rows[0].n).toBe(0);
});

it("a dispute closes the revision; preparing again makes the next revision, and only that one can be approved", async () => {
  const t = await setUp(); await t.derive();
  const first = await t.prepare(), s1 = await t.read(first.statementId);
  await t.dispute(first.statementId);
  expect(await code(t.dispute(first.statementId))).toBe("COMMAND_CONFLICT");
  expect(await code(t.approve(first.statementId, s1.contentHash, s1.totalDeltaPence))).toBe("STATEMENT_AUTHORITY_INVALID");
  const second = await t.prepare(), s2 = await t.read(second.statementId);
  expect(s2).toMatchObject({ revision: 2, predecessorId: first.statementId, totalDeltaPence: 806 });
  expect((await t.read(first.statementId))).toMatchObject({ superseded: true, dispute: { reason: "line_disputed" } });
  expect(await code(t.approve(first.statementId, s1.contentHash, s1.totalDeltaPence))).toBe("STATEMENT_AUTHORITY_INVALID");
  expect((await t.approve(second.statementId, s2.contentHash, s2.totalDeltaPence)).replayed).toBe(false);
});

it("direct runtime SQL can neither write statement tables, call the private helpers, nor approve with a wrong total", async () => {
  const t = await setUp(); await t.derive();
  const { statementId } = await t.prepare(), s = await t.read(statementId);
  for (const sql of [
    "SELECT * FROM app.enterprise_fee_statement",
    `INSERT INTO app.enterprise_fee_statement_approval(tenant_id,statement_id,command_id,decision_id,resolution_id,authorization_id,actor_membership_id) VALUES('${t.w.w.p.tenantId}','${statementId}','${randomUUID()}','${randomUUID()}','${randomUUID()}','${randomUUID()}','${randomUUID()}')`,
    `DELETE FROM app.enterprise_fee_statement_section WHERE statement_id='${statementId}'`,
    `SELECT app.ef_statement_begin('${t.w.session}','${t.p}')`,
    `SELECT app.ef_audit('${randomUUID()}','x','y','${randomUUID()}','{}'::jsonb)`,
  ]) await expect(withTenant(c.runtime, t.w.ctx, db => db.$client.query(sql))).rejects.toMatchObject({ code: "42501" });
  await expect(withTenant(c.runtime, t.w.ctx, db => db.$client.query("SELECT app.ef_approve_statement($1,$2,$3,$4,$5,$6)",
    [t.w.session, randomUUID(), statementId, s.contentHash, s.totalDeltaPence - 1, later()]))).rejects.toMatchObject({ message: "STATEMENT_AUTHORITY_INVALID" });
  await expect(c.admin.query("UPDATE app.enterprise_fee_statement SET total_delta_pence=0 WHERE id=$1", [statementId])).rejects.toMatchObject({ message: "ENTERPRISE_FEE_IMMUTABLE" });
});
