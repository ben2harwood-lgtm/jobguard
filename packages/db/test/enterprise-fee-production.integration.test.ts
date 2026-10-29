import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { ContractorRepository, EnterpriseFeeRepository, ExtraApprovalRepository, migrate, withTenant } from "../src/index.js";
import { code, world, type World } from "./contractor-billing-fixtures.js";
import { approveInput, command, demoRules, submitted } from "./extra-approval-chain-fixtures.js";
import { applyMigration, counts, startBeforeMigration } from "./contractor-practice-session-fixtures.js";
import { proofBefore, proofDifferences } from "./upgrade-proof-utils.js";

// PostgreSQL CI only. Every source, agreement, person and amount is fictional. No policy is approved here.
const migration = "0429_enterprise_fee_production_safety.sql";
let c: Awaited<ReturnType<typeof startBeforeMigration>>;
beforeAll(async () => { c = await startBeforeMigration(migration); }, 240000);
afterAll(async () => { await c?.close(); });
const repo = () => new EnterpriseFeeRepository(c.runtime);
async function agreement(w: World) {
  const id = randomUUID();
  await c.admin.query(`INSERT INTO app.enterprise_agreement_version(tenant_id,id,agreement_ref,rate_numerator,rate_denominator,basis,policy_version,effective_from,end_of_job_check,content_hash,environment,operations_actor_ref)
    VALUES($1,$2,'fictional-m4-9',1,10,'on_payment','enterprise_site_capture_policy_v1','2000-01-01T00:00:00Z',false,$3,'synthetic_demo','operations:fictional')`, [w.w.p.tenantId, id, "c".repeat(64)]);
  return id;
}
const month = async () => (await c.admin.query("SELECT to_char(clock_timestamp() AT TIME ZONE 'Europe/London','YYYY-MM') p")).rows[0].p as string;
const next = (p: string) => { const [y, m] = p.split("-").map(Number) as [number, number]; return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`; };
const derive = (w: World, id: string, period: string) => repo().derive(w.ctx, w.session, { version: "enterprise-fee-derive.v1", commandId: randomUUID(), agreementVersionId: id, period });
async function approve(w: World, period: string) {
  const { statementId } = await repo().prepareStatement(w.ctx, w.session, { version: "enterprise-fee-prepare-statement.v1", commandId: randomUUID(), period });
  const st = await repo().readStatement(w.ctx, w.session, statementId);
  const { authorizationId } = await repo().approveStatement(w.ctx, w.session, { version: "enterprise-fee-approve-statement.v1", commandId: randomUUID(), statementId,
    contentHash: st.contentHash, totalDeltaPence: st.totalDeltaPence, expiresAt: new Date(Date.now() + 600000).toISOString() });
  return { st, statementId, authorizationId };
}
const post = (w: World, a: Awaited<ReturnType<typeof approve>>, commandId = randomUUID()) => repo().postStatement(w.ctx, w.session,
  { version: "enterprise-fee-post-statement.v1", commandId, statementId: a.statementId, authorizationId: a.authorizationId });
async function rebuild(w: World, id: string) {
  const client = await c.admin.connect();
  try {
    await client.query("BEGIN"); await client.query("SELECT set_config('app.tenant_id',$1,true)", [w.w.p.tenantId]);
    await client.query("SELECT app.ef_assert_rebuild($1,$2)", [w.w.p.tenantId, id]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
async function paidWorld() {
  const w = await world(c), id = await agreement(w), p = await month(), invoice = await w.invoice();
  const paid = w.event("paid", { effectiveAt: "2026-10-03T12:00:00Z", reconciliationId: randomUUID(), amount: { netPence: 41667, vatPence: 8333, grossPence: 50000 } });
  await w.repo.import(w.ctx, w.session, w.s.jobId, w.importInput([invoice, paid]));
  return { w, id, p, paid };
}

it("upgrades populated fee history without editing statements, receipts, journals, source facts or audit", async () => {
  const t = await paidWorld(); await derive(t.w, t.id, t.p); const a = await approve(t.w, t.p); await post(t.w, a);
  const before = await proofBefore(c.admin, ["app.platform_enterprise_fee", "app.platform_enterprise_fee_line", "app.enterprise_fee_derivation",
    "app.enterprise_fee_contribution", "app.enterprise_fee_statement", "app.enterprise_fee_statement_approval", "app.command_receipt", "app.audit_event", "app.billing_fact"]);
  await applyMigration(c, migration); await migrate(c.admin); await migrate(c.admin);
  expect(await proofDifferences(c.admin, before)).toEqual({ rows: [], types: [] });
  expect(await post(t.w, a)).toMatchObject({ replayed: true, journals: 1 });
});

it("production derive/accrue refuses supplied approvals, flags, tenant references and replays without writes or leaks", async () => {
  const t = await paidWorld(), other = await world(c); await derive(t.w, t.id, t.p); const a = await approve(t.w, t.p);
  const tables = ["app.platform_enterprise_fee", "app.command_receipt", "app.audit_event"];
  const before = await counts(c.admin, tables);
  const input = { version: "enterprise-fee-production.v1", action: "accrue", commandId: randomUUID(), statementId: a.statementId, authorizationId: a.authorizationId };
  for (const w of [t.w, other]) {
    for (let i = 0; i < 2; i++) expect(await code(repo().productionCommand(w.ctx, w.session, input))).toBe("FEE_GATE_CLOSED");
    await expect(withTenant(c.runtime, w.ctx, async db => {
      await db.$client.query("SELECT set_config('app.fee_production_enabled','true',true)");
      return db.$client.query("SELECT app.ef_production_command($1,$2)", [w.session, { ...input, policyApproved: true, gate: "G4-C", environment: "production_billing" }]);
    })).rejects.toMatchObject({ message: "FEE_GATE_CLOSED" });
    expect(await code(repo().productionCommand(w.ctx, w.session, { version: input.version, action: "derive", commandId: randomUUID(), agreementVersionId: t.id, period: t.p }))).toBe("FEE_GATE_CLOSED");
  }
  expect(await counts(c.admin, tables)).toEqual(before);
});

it("rebuilds exact liability and source attribution; repeated imports/derives and racing posts retain one journal", async () => {
  const t = await paidWorld(), d = await derive(t.w, t.id, t.p);
  await rebuild(t.w, d.derivationId);
  await t.w.repo.import(t.w.ctx, t.w.session, t.w.s.jobId, t.w.importInput([t.paid]));
  const repeated = await Promise.all([derive(t.w, t.id, t.p), derive(t.w, t.id, t.p)]);
  for (const r of repeated) expect(r.derivationId).toBe(d.derivationId);
  const a = await approve(t.w, t.p), key = randomUUID();
  const posts = await Promise.all([post(t.w, a, key), post(t.w, a, key), post(t.w, a)]);
  expect(posts.filter(p => !p.replayed)).toHaveLength(1);
  expect(await repo().readPostings(t.w.ctx, t.w.session, a.statementId)).toHaveLength(1);
  await rebuild(t.w, d.derivationId);
  const other = await world(c);
  await expect(rebuild(other, d.derivationId)).rejects.toMatchObject({ message: "FEE_NOT_FOUND" });
  await expect(withTenant(c.runtime, t.w.ctx, db => db.$client.query("SELECT app.ef_assert_rebuild($1,$2)", [t.w.w.p.tenantId, d.derivationId]))).rejects.toMatchObject({ code: "42501" });
});

it("a reversal invalidates stale derivations and yields linked compensation without erasing the original", async () => {
  const t = await paidWorld(), first = await derive(t.w, t.id, t.p), a = await approve(t.w, t.p); await post(t.w, a);
  const original = await repo().readPostings(t.w.ctx, t.w.session, a.statementId);
  await t.w.repo.import(t.w.ctx, t.w.session, t.w.s.jobId, t.w.importInput([t.w.event("payment_reversed", {
    originalEventId: t.paid.sourceEventId, reconciliationId: randomUUID(), effectiveAt: "2026-10-05T12:00:00Z", amount: t.paid.amount,
  })]));
  await expect(rebuild(t.w, first.derivationId)).rejects.toMatchObject({ message: "STALE_FACTS" });
  const second = await derive(t.w, t.id, next(t.p)); await rebuild(t.w, second.derivationId);
  const b = await approve(t.w, next(t.p)); expect(b.st.totalDeltaPence).toBe(-806);
  await Promise.all([post(t.w, b), post(t.w, b)]);
  expect(await repo().readPostings(t.w.ctx, t.w.session, b.statementId)).toEqual([
    expect.objectContaining({ kind: "compensation", amountPence: 806, compensatesFeeId: original[0]!.id }),
  ]);
  expect(await repo().readPostings(t.w.ctx, t.w.session, a.statementId)).toEqual(original);
});

it("two paid 5p extras on different contracts share one cumulative agreement rounding and posting lock", async () => {
  const w = await world(c, 5), id = await agreement(w), p = await month(), contractId = randomUUID();
  const view = await new ContractorRepository(c.runtime).query(w.w.p, { version: "contractor-query.v1", tenantId: w.w.p.tenantId, resource: "contracts" });
  const document = view.contracts.find(x => x.contract_id === w.contract)?.document ?? view.contracts.at(-1)!.document;
  await command(c, w.w, { kind: "contract.revise", clientId: w.w.demo.clientId, contractId, document: { ...(document as object), reference: "Fictional M4-9 second contract" }, rules: demoRules });
  const secondWorld = { ...w.w, demo: { ...w.w.demo, contractId } };
  const second = await submitted(c, secondWorld, 5);
  await new ExtraApprovalRepository(c.runtime).approveExtraStep(w.ctx, w.w.members.supervisor.member, approveInput(second, 0));
  async function fund(jobId: string, extraId: string, clientContractId: string) {
    const { batchId } = await w.repo.finalise(w.ctx, w.session, jobId, { version: "billing-finalise.v1", commandId: randomUUID(), clientContractId });
    const line = (await w.repo.read(w.ctx, w.session, jobId)).exports.find(e => e.id === batchId)!.artifact.lines.find(l => l.extraId === extraId)!;
    const amount = { netPence: 5, vatPence: 1, grossPence: 6 }, invoiceNumber = `FICTIONAL-${extraId}`;
    const invoiced = w.event("invoiced", { clientContractId, invoiceNumber, amount, composition: { declared: amount, lines: [{
      externalInvoiceLineId: extraId, kind: "extra", existedAt: "2026-10-01T00:00:00Z", ...amount,
      match: { exportLineId: line.exportLineId, jobId, extraId, scopeItemId: line.scopeItemId, revisionId: line.revisionId, revisionHash: line.revisionHash },
    }] } });
    await w.repo.import(w.ctx, w.session, jobId, w.importInput([invoiced, w.event("paid", { effectiveAt: "2026-10-03T12:00:00Z", clientContractId, invoiceNumber, amount, reconciliationId: randomUUID() })]));
  }
  await Promise.all([fund(w.s.jobId, w.s.extraId, w.contract), fund(second.jobId, second.extraId, contractId)]);
  const ds = await Promise.all([derive(w, id, p), derive(w, id, p)]);
  expect(ds[0]!.derivationId).toBe(ds[1]!.derivationId);
  const d = await repo().read(w.ctx, w.session, ds[0]!.derivationId);
  expect(d).toMatchObject({ cumulativeFeePence: 1, qualifyingPrincipal: { numerator: "10", denominator: "1" } });
  expect(d.contributions.map(x => x.extraId).sort()).toEqual([w.s.extraId, second.extraId].sort());
  const a = await approve(w, p); await Promise.all([post(w, a), post(w, a)]);
  expect(await repo().readPostings(w.ctx, w.session, a.statementId)).toEqual([expect.objectContaining({ amountPence: 1 })]);
  await rebuild(w, d.id);
});

it("direct runtime writes and oversized or mislinked journal attempts cannot exceed the rebuilt amount", async () => {
  const t = await paidWorld(); await derive(t.w, t.id, t.p); const a = await approve(t.w, t.p); await post(t.w, a);
  await expect(withTenant(c.runtime, t.w.ctx, db => db.$client.query(`INSERT INTO app.platform_enterprise_fee
    SELECT * FROM app.platform_enterprise_fee WHERE false`))).rejects.toMatchObject({ code: "42501" });
  const before = await counts(c.admin, ["app.platform_enterprise_fee", "app.platform_enterprise_fee_line"]);
  // Owner-only adversarial fixture: bypass the public posting routine, but retain all structural triggers.
  const client = await c.admin.connect();
  try {
    await client.query("BEGIN"); await client.query("SELECT set_config('app.tenant_id',$1,true)", [t.w.w.p.tenantId]);
    await expect(client.query(`INSERT INTO app.platform_enterprise_fee(tenant_id,id,kind,statement_id,agreement_version_id,derivation_id,
      authorization_id,amount_pence,compensates_fee_id,environment,command_id,actor_membership_id)
      SELECT tenant_id,gen_random_uuid(),'accrual',statement_id,agreement_version_id,derivation_id,authorization_id,
      amount_pence+1,NULL,environment,gen_random_uuid(),actor_membership_id FROM app.platform_enterprise_fee WHERE tenant_id=$1`,
    [t.w.w.p.tenantId])).rejects.toMatchObject({ message: "INVALID_FEE_INPUT" });
  } finally { await client.query("ROLLBACK"); client.release(); }
  expect(await counts(c.admin, ["app.platform_enterprise_fee", "app.platform_enterprise_fee_line"])).toEqual(before);
});
