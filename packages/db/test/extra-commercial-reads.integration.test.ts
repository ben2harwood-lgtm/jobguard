// EP-CC-R1: real PostgreSQL. Made-up data only (Gate G1 closed).
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ExtraApprovalRepository, ExtraCommercialReadRepository, SiteExtraRepository, verifiedTenantContextFromMembership, type AuthenticatedMembership } from "../src/index.js";
import { testActorContext } from "./tenant-context-test-utils.js";
import { digestOf } from "./contractor-practice-session-fixtures.js";
import { world as billingWorld } from "./contractor-billing-fixtures.js";
import { cluster, chainWorld, submitted, approveInput, emailOf, newToken, newJob, raiseOn, command, type Cluster, type ChainWorld } from "./extra-approval-chain-fixtures.js";

let c: Cluster, identity: Pool;
beforeAll(async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  c = await cluster();
  await c.admin.query("ALTER ROLE jobguard_identity LOGIN PASSWORD 'synthetic'");
  identity = new Pool({ ...c.config, database: c.admin.options.database, user: "jobguard_identity", max: 2 });
}, 240_000);
afterAll(async () => { await identity?.end(); await c?.close(); vi.unstubAllEnvs(); });

const reads = () => new ExtraCommercialReadRepository(c.runtime);
const approvals = () => new ExtraApprovalRepository(c.runtime);
async function session(member: AuthenticatedMembership) {
  const id = randomUUID();
  await c.admin.query(`INSERT INTO control_plane.contractor_practice_session(session_id,tenant_id,membership_id,identity_user_id,session_digest,created_at,expires_at)
    SELECT $1,$2,$3,$4,$5,r.t,r.t+interval '7 days' FROM (SELECT clock_timestamp() t) r`, [id, member.tenantId, member.membershipId, member.identityUserId, digestOf(id)]);
  return { id, ctx: verifiedTenantContextFromMembership(member, { kind: "contractor_practice", credential: id }) };
}
type S = Awaited<ReturnType<typeof session>>;
const code = (p: Promise<unknown>) => p.then(() => "ok", (e: { code?: string }) => e.code);
const act = async (w: ChainWorld, m: AuthenticatedMembership) => testActorContext(c.admin, await w.ctx, m);
const all = (s: S, jobId: string, extraId: string, options: { clientContractId?: string } = {}) => ({
  entitlement: () => reads().entitlementContext(s.ctx, s.id, jobId, extraId, options),
  asked: () => reads().askedAgainstApproved(s.ctx, s.id, jobId, extraId, options),
  claim: () => reads().claimRecord(s.ctx, s.id, jobId, extraId, options),
  list: (q: Record<string, unknown> = {}) => reads().workList(s.ctx, s.id, { version: "extra-work-list-query.v1", ...q }),
});
const itemOf = async (s: S, extraId: string, q: Record<string, unknown> = {}) => (await all(s, "", "").list(q)).items.find(i => i.extraId === extraId);

describe("acceptance families 1-3 on stored rows", () => {
  let w: ChainWorld, sup: S, sur: S, cm: S, fin: S;
  beforeAll(async () => {
    w = await chainWorld(c);
    [sup, sur, cm, fin] = await Promise.all([w.members.supervisor, w.members.surveyor, w.members.commercial_manager, w.members.finance].map(a => session(a.member)));
  }, 240_000);

  it("family 3: £500 rejected as price_too_high, revised to £300 and approved, reads both figures and the rejection reason", async () => {
    const s = await submitted(c, w, 50000);
    expect((await itemOf(sup, s.extraId))).toMatchObject({ state: "waiting_for_contractor_approval", ownerRoles: ["supervisor"], nextAction: "approve_or_reject" });
    await approvals().rejectExtra(await act(w, w.members.supervisor.member), w.members.supervisor.member, { ...approveInput(s, 0), version: "reject-extra.v1", reasonCode: "price_too_high" });
    expect((await itemOf(sur, s.extraId))).toMatchObject({ state: "rejected", ownerRoles: ["surveyor"], nextAction: "revise" });
    const revised = await approvals().reviseExtra(await act(w, w.members.surveyor.member), w.members.surveyor.member, { version: "revise-extra.v1", commandId: randomUUID(), jobId: s.jobId, extraId: s.extraId, netPence: 30000 });
    const pending = await all(sur, s.jobId, s.extraId).asked();
    expect(pending).toMatchObject({ firstRequestedNetPence: 50000, pendingNetPence: 30000, approvedNetPence: null, differencePence: null });
    await approvals().approveExtraStep(await act(w, w.members.supervisor.member), w.members.supervisor.member,
      approveInput({ jobId: s.jobId, requestId: revised.requestId as string, hash: revised.revisionHash as string, net: 30000 }, 0));
    const asked = await all(cm, s.jobId, s.extraId).asked();
    expect(asked.revisions.map(r => [r.requestRevision, r.netPence, r.status, r.outcome?.reasonCode ?? null])).toEqual([[1, 50000, "rejected", "price_too_high"], [2, 30000, "approved", null]]);
    expect(asked).toMatchObject({ firstRequestedNetPence: 50000, pendingNetPence: null, approvedNetPence: 30000, differencePence: -20000 });
    // The revision's own reason and the rejection it answers are CC-S1's rows: explicit, never inferred.
    for (const r of asked.revisions) expect([r.revisionReason, r.answersRequest]).toEqual([{ status: "not_recorded", source: "CC-S1" }, { status: "not_recorded", source: "CC-S1" }]);
    expect(asked.revisions[0]!.steps).toEqual([]);
    expect(asked.revisions[1]!.steps).toMatchObject([{ stepIndex: 0, role: "supervisor", actorKind: "member", approvedNetPence: 30000 }]);
    expect((await itemOf(fin, s.extraId))).toMatchObject({ state: "approved_not_exported", ownerRoles: ["finance"], nextAction: "export" });
    const claim = await all(cm, s.jobId, s.extraId).claim();
    const kinds = claim.history.map(h => h.kind);
    expect(kinds.indexOf("raised")).toBeLessThan(kinds.indexOf("request_opened"));
    expect(claim.history.filter(h => h.kind === "outcome").map(h => h.detail)).toEqual([
      { kind: "rejected", reasonCode: "price_too_high", actorKind: "member" }, { kind: "approved", reasonCode: null, actorKind: "member" }]);
    expect([...claim.history].sort((a, b) => a.at.localeCompare(b.at))).toEqual(claim.history);
    expect(claim.fees).toEqual({ status: "not_disclosed_to_role" });
    expect(claim.billing).toMatchObject({ exportLine: null, invoiceLines: [], realConnection: { status: "not_recorded", source: "D5" } });
  });

  it("family 2: an unknown rate stays unpriced, then reads its manual price as basis not recorded", async () => {
    const jobId = await newJob(c, w), extraId = await raiseOn(c, w, jobId);
    expect(await itemOf(sur, extraId)).toMatchObject({ state: "waiting_for_pricing", rateCode: null, nextAction: "price" });
    const ctx0 = await all(sur, jobId, extraId).entitlement();
    expect(ctx0).toMatchObject({ extra: { rateCode: null }, rateItem: null, currentBinding: null, claimed: { status: "not_recorded", source: "CC-S1" },
      flags: { status: "not_recorded", source: "CC-S2" }, decision: { status: "not_recorded", source: "CC-S2" }, inclusionRule: { status: "not_recorded", source: "CC-S2" },
      requestEvidence: { status: "not_recorded", source: "CC-S2" }, orderRevisionCurrent: true });
    expect(ctx0.originOrder.lines.length).toBeGreaterThan(0);
    // Submitted unpriced: still waiting for pricing, and the asked figure is unknown, never zero.
    await approvals().submitExtra(await act(w, w.members.supervisor.member), w.members.supervisor.member, { version: "submit-extra.v1", commandId: randomUUID(), jobId, extraId });
    expect(await itemOf(sur, extraId)).toMatchObject({ state: "waiting_for_pricing" });
    expect(await all(sur, jobId, extraId).asked()).toMatchObject({ firstRequestedNetPence: null, latestUnpricedPending: true, approvedNetPence: null, differencePence: null,
      revisions: [{ requestRevision: 1, netPence: null, priced: false, status: "pending", basis: null }] });
    await approvals().priceExtra(await act(w, w.members.surveyor.member), w.members.surveyor.member, { version: "price-extra.v1", commandId: randomUUID(), jobId, extraId, netPence: 12345 });
    const asked = await all(sur, jobId, extraId).asked();
    expect(asked.revisions.map(r => [r.netPence, r.status, r.basis])).toEqual([[null, "superseded", null], [12345, "pending", { kind: "basis_not_recorded" }]]);
    expect(asked).toMatchObject({ firstRequestedNetPence: 12345, pendingNetPence: 12345 });
    expect((await all(sur, jobId, extraId).entitlement()).currentBinding).toMatchObject({ sourceKind: "ordinary", netPence: 12345, basis: { kind: "basis_not_recorded" } });
  });

  it("family 1 needs CC-S2 for the hold; today the context shows order lines against the claimed rate-code extra and its recorded basis", async () => {
    const jobId = await newJob(c, w);
    const priced = await new SiteExtraRepository(c.runtime).logSorSiteExtra(await act(w, w.members.supervisor.member), w.members.supervisor.member,
      { commandId: randomUUID(), jobId, sorCode: "CLEAR-GUTTER", quantity: "100", note: "Fictional R1 SoR" });
    const ctx = await all(sur, jobId, priced.variationId).entitlement();
    expect(ctx.claimed).toMatchObject({ rateCode: "CLEAR-GUTTER", claimedQuantity: "100" });
    expect(ctx.rateItem).toMatchObject({ code: "CLEAR-GUTTER" });
    expect(ctx.contract.clientContractId).toBe(w.demo.contractId);
    expect(ctx.flags).toEqual({ status: "not_recorded", source: "CC-S2" });
    expect(await itemOf(sup, priced.variationId)).toMatchObject({ state: "priced_not_submitted", rateCode: "CLEAR-GUTTER", nextAction: "submit" });
    await approvals().submitExtra(await act(w, w.members.supervisor.member), w.members.supervisor.member, { version: "submit-extra.v1", commandId: randomUUID(), jobId, extraId: priced.variationId });
    expect((await all(sur, jobId, priced.variationId).asked()).revisions[0]!.basis).toMatchObject({ kind: "server_sor" });
    // Filters: order reference, rate code, client contract, team and date range.
    const item = (await itemOf(sup, priced.variationId))!;
    for (const q of [{ orderReference: item.orderReference }, { rateCode: "CLEAR-GUTTER" }, { clientContractId: w.demo.contractId }, { teamId: w.demo.teamId },
      { raisedFrom: item.raisedAt, raisedTo: item.raisedAt }, { states: [item.state] }]) expect(await itemOf(sup, priced.variationId, q), JSON.stringify(q)).toBeDefined();
    for (const q of [{ orderReference: "WO-NONE" }, { rateCode: "NO-CODE" }, { clientContractId: randomUUID() }, { teamId: randomUUID() },
      { raisedFrom: new Date(Date.now() + 86_400_000).toISOString() }, { states: ["part_paid"] }]) expect(await itemOf(sup, priced.variationId, q), JSON.stringify(q)).toBeUndefined();
  });

  it("client step: the work list owner is the client approver, and pending stays apart from approved", async () => {
    const s = await submitted(c, w, 150000);
    await approvals().approveExtraStep(await act(w, w.members.supervisor.member), w.members.supervisor.member, approveInput(s, 0));
    expect(await itemOf(sup, s.extraId)).toMatchObject({ state: "waiting_for_contractor_approval" });
    await approvals().approveExtraStep(await act(w, w.supervisor2.member), w.supervisor2.member, approveInput(s, 1));
    expect(await itemOf(cm, s.extraId)).toMatchObject({ state: "waiting_for_client_approval", ownerRoles: ["client_approver"], nextAction: "client_approve_or_reject" });
    expect(await all(cm, s.jobId, s.extraId).asked()).toMatchObject({ pendingNetPence: 150000, approvedNetPence: null });
  });
});

describe("credits, reversals and part payments", () => {
  it("reads part paid with the exact balance after a part payment, an extra-line credit and a payment reversal", async () => {
    const b = await billingWorld(c, 24000);
    const [sup, cm] = await Promise.all([session(b.w.members.supervisor.member), session(b.w.members.commercial_manager.member)]);
    const fin = { id: b.session, ctx: b.ctx };
    expect(await itemOf(fin, b.s.extraId)).toMatchObject({ state: "approved_not_exported", nextAction: "export" });
    const invoice = { ...await b.invoice(), sourceEventId: "invoice" };
    expect(await itemOf(fin, b.s.extraId)).toMatchObject({ state: "exported_not_billed", nextAction: "chase_billing" });
    await b.repo.import(b.ctx, b.session, b.s.jobId, b.importInput([invoice]));
    expect(await itemOf(fin, b.s.extraId)).toMatchObject({ state: "billed_not_paid", balance: { numerator: "24000", denominator: "1" } });
    const payment = b.event("paid", { sourceEventId: "payment", effectiveAt: "2026-10-03T12:00:00Z", reconciliationId: "receipt", amount: { netPence: 41667, vatPence: 8333, grossPence: 50000 } });
    const credit = b.event("credited", { sourceEventId: "credit", originalEventId: "invoice", effectiveAt: "2026-10-04T12:00:00Z", amount: { netPence: 4000, vatPence: 800, grossPence: 4800 },
      lineAdjustments: [{ externalInvoiceLineId: "extra", netPence: 4000, vatPence: 800, grossPence: 4800 }] });
    const reversal = b.event("payment_reversed", { sourceEventId: "reversal", originalEventId: "payment", reconciliationId: "reversal", effectiveAt: "2026-10-05T12:00:00Z", amount: { netPence: 20000, vatPence: 4000, grossPence: 24000 } });
    await b.repo.import(b.ctx, b.session, b.s.jobId, b.importInput([invoice, payment]));
    const partPaid = await itemOf(fin, b.s.extraId);
    expect(partPaid).toMatchObject({ state: "part_paid", nextAction: "chase_balance" });
    await b.repo.import(b.ctx, b.session, b.s.jobId, b.importInput([invoice, payment, credit, reversal]));
    const claim = await all(fin, b.s.jobId, b.s.extraId).claim();
    expect(claim.billing.exportLine).toMatchObject({ approvedNetPence: 24000, requestId: b.s.requestId });
    const line = claim.billing.invoiceLines[0]!;
    expect(line).toMatchObject({ externalInvoiceLineId: "extra", billedNet: { numerator: "24000", denominator: "1" }, creditedNet: { numerator: "4000", denominator: "1" }, rejected: false });
    const toNumber = (x: { numerator: string; denominator: string }) => Number(x.numerator) / Number(x.denominator);
    expect(toNumber(line.balance)).toBeCloseTo(24000 - 4000 - toNumber(line.paidNet), 6);
    const after = await itemOf(fin, b.s.extraId);
    expect(after?.balance).toEqual(line.balance);
    expect(claim.billing.allocations.length).toBeGreaterThan(0);
    expect(claim.history.filter(h => h.kind === "billing_fact").map(h => h.detail.factType)).toEqual(expect.arrayContaining(["invoiced", "paid", "credited", "payment_reversed"]));
    expect(claim.history.some(h => h.kind === "exported")).toBe(true);
    // Fees: the retained fee reader sees the (empty) stored contributions; no other role sees fees at all.
    expect(claim.fees).toEqual({ contributions: [] });
    for (const s of [sup, cm]) expect((await all(s, b.s.jobId, b.s.extraId).claim()).fees).toEqual({ status: "not_disclosed_to_role" });
    // Finance never gets the entitlement context (it neither prices nor approves).
    expect(await code(all(fin, b.s.jobId, b.s.extraId).entitlement())).toBe("PERMISSION_DENIED");
  }, 240_000);
});

describe("wrong company, contract or team is refused on every read", () => {
  let w: ChainWorld, other: ChainWorld, s: Awaited<ReturnType<typeof submitted>>;
  beforeAll(async () => { w = await chainWorld(c); other = await chainWorld(c); s = await submitted(c, w, 40000); }, 240_000);

  it("refuses another company's session, another team's supervisor and another branch's surveyor", async () => {
    const outsiders = await Promise.all([other.members.supervisor.member, other.members.surveyor.member, w.otherSupervisor.member, w.otherSurveyor.member].map(session));
    for (const o of outsiders) {
      const r = all(o, s.jobId, s.extraId);
      for (const read of [r.entitlement, r.asked, r.claim]) expect(await code(read())).toBe("NOT_FOUND");
      expect((await r.list()).items.some(i => i.extraId === s.extraId)).toBe(false);
    }
    // The wrong-team supervisor still reads its own team's job (the scope is per grant, not a blanket refusal).
    const own = await session(w.members.supervisor.member);
    expect(await code(all(own, s.jobId, s.extraId).claim())).toBe("ok");
  });

  it("refuses a mismatched client contract and an extra that is not on the named job", async () => {
    const sup = await session(w.members.supervisor.member), r = all(sup, s.jobId, s.extraId, { clientContractId: randomUUID() });
    for (const read of [r.entitlement, r.asked, r.claim]) expect(await code(read())).toBe("NOT_FOUND");
    expect((await r.list({ clientContractId: randomUUID() })).items).toEqual([]);
    expect((await r.list({ clientContractId: w.demo.contractId })).items.some(i => i.extraId === s.extraId)).toBe(true);
    const right = all(sup, s.jobId, s.extraId, { clientContractId: w.demo.contractId });
    expect(await code(right.asked())).toBe("ok");
    const t = await submitted(c, w, 41000), wrong = all(sup, s.jobId, t.extraId);
    for (const read of [wrong.entitlement, wrong.asked, wrong.claim]) expect(await code(read())).toBe("NOT_FOUND");
  });

  it("refuses the operative, read-only, owner and the client approver on every read, and a revoked grant", async () => {
    for (const m of [w.members.operative.member, w.members.read_only.member, w.members.client_approver.member, w.members.owner.member]) {
      const r = all(await session(m), s.jobId, s.extraId);
      for (const read of [r.entitlement, r.asked, r.claim, () => r.list()]) expect(await code(read()), m.membershipId).toBe("PERMISSION_DENIED");
    }
    const sur = await session(w.members.surveyor.member);
    expect(await code(all(sur, s.jobId, s.extraId).asked())).toBe("ok");
    await command(c, w, { kind: "grant.revoke", grantId: w.members.surveyor.grant });
    const r = all(sur, s.jobId, s.extraId);
    for (const read of [r.entitlement, r.asked, r.claim]) expect(await code(read())).toBe("NOT_FOUND");
    expect((await r.list()).items).toEqual([]);
  });

  it("refuses malformed identifiers and widened queries before reading", async () => {
    const sup = await session(w.members.supervisor.member);
    expect(await code(reads().claimRecord(sup.ctx, sup.id, "not-a-uuid", s.extraId))).toBe("INVALID_QUERY");
    expect(await code(reads().workList(sup.ctx, sup.id, { version: "extra-work-list-query.v1", residentEmail: "x@y.invalid" }))).toBe("INVALID_QUERY");
    expect(await code(reads().workList(sup.ctx, randomUUID(), { version: "extra-work-list-query.v1" }))).not.toBe("ok");
  });

  it("never returns resident contact, capture text or a client recipient", async () => {
    const sup = await session(w.members.supervisor.member), r = all(sup, s.jobId, s.extraId);
    const text = JSON.stringify([await r.entitlement(), await r.asked(), await r.claim(), await r.list()]);
    const resident = (await c.admin.query("SELECT capture_text FROM app.variation WHERE id=$1", [s.extraId])).rows[0].capture_text as string;
    expect(text).not.toContain(resident);
    expect(text).not.toMatch(/@[^"]*\.invalid/u);
  });
});

describe("the client's narrow projection", () => {
  it("returns order lines, claimed, rate item and the client's own decisions only, under current authority", async () => {
    const w = await chainWorld(c), s = await submitted(c, w, 150000), repo = approvals();
    await repo.approveExtraStep(await act(w, w.members.supervisor.member), w.members.supervisor.member, approveInput(s, 0));
    await repo.approveExtraStep(await act(w, w.supervisor2.member), w.supervisor2.member, approveInput(s, 1));
    const actor = w.members.client_approver.member.membershipId, recipient = await emailOf(c, w, actor);
    const signin = randomUUID().replaceAll("-", "").repeat(2), sd = randomUUID().replaceAll("-", "").repeat(2);
    await repo.issueClientApproval(await act(w, w.members.surveyor.member), w.members.surveyor.member, { version: "issue-client-approval.v1", commandId: randomUUID(), jobId: s.jobId,
      requestId: s.requestId, approverMembershipId: actor, recipient, linkToken: newToken(), signinDigest: signin, expiresAt: new Date(Date.now() + 3600_000) });
    await identity.query("SELECT identity.extra_customer_use($1,$2,$3,$4,$5,'redeem')", [w.p.tenantId, s.jobId, actor, signin, sd]);
    const project = (input: Record<string, unknown>, who = actor, digest = sd) => identity.query("SELECT identity.extra_customer_entitlement($1,$2,$3,$4,$5::jsonb) r",
      [w.p.tenantId, s.jobId, who, digest, { version: "extra-customer.v1", action: "entitlement", jobId: s.jobId, requestId: s.requestId, ...input }]).then(r => r.rows[0].r);
    const view = await project({});
    expect(Object.keys(view).sort()).toEqual(["claimed", "decision", "inclusionRule", "orderLines", "ownDecisions", "rateItem", "requestId", "requestRevision", "version"]);
    expect(view).toMatchObject({ version: "extra-client-entitlement.v1", requestId: s.requestId, ownDecisions: [], inclusionRule: { status: "not_recorded", source: "CC-S2" },
      decision: { status: "not_recorded", source: "CC-S2" }, claimed: { status: "not_recorded", source: "CC-S1" } });
    expect(view.orderLines.length).toBeGreaterThan(0);
    const text = JSON.stringify(view);
    for (const hidden of ["rationale", "basisNote", "fee", "statement", recipient, "supervisor", "membership", "residentConfirmation"]) expect(text).not.toContain(hidden);
    // The client decides; the projection then lists that decision as its own.
    await identity.query("SELECT identity.extra_customer_approval($1,$2,$3,$4,$5::jsonb) r", [w.p.tenantId, s.jobId, actor, sd,
      { version: "extra-customer.v1", action: "decide", jobId: s.jobId, requestId: s.requestId, commandId: randomUUID(), revisionHash: s.hash, netPence: s.net, decision: "approve" }]);
    expect((await project({})).ownDecisions).toMatchObject([{ requestId: s.requestId, decision: "approve", netPence: 150000, reasonCode: null }]);
    // Refusals: another approver, another request, a supplied amount, another session digest, and lost authority.
    const refused = async (p: Promise<unknown>) => expect(await p.then(() => "ok", (e: { code?: string }) => e.code)).toBe("42501");
    await refused(project({}, w.client2.member.membershipId));
    await refused(project({ requestId: randomUUID() }));
    await refused(project({ netPence: 1 }));
    await refused(project({}, actor, "0".repeat(64)));
    await refused(identity.query("SELECT identity.extra_customer_entitlement($1,$2,$3,$4,$5::jsonb)", [randomUUID(), s.jobId, actor, sd, { version: "extra-customer.v1", action: "entitlement", jobId: s.jobId, requestId: s.requestId }]));
    await command(c, w, { kind: "grant.revoke", grantId: w.members.client_approver.grant });
    await refused(project({}));
    // The runtime role cannot call the client projection; the identity role cannot call the contractor reads.
    expect(await code(c.runtime.query("SELECT identity.extra_customer_entitlement($1,$2,$3,$4,'{}'::jsonb)", [w.p.tenantId, s.jobId, actor, sd]))).toBe("42501");
    expect(await code(identity.query("SELECT app.cr_read_scope($1)", [randomUUID()]))).toBe("42501");
    expect(await code(identity.query("SELECT app.cr_fee_trail($1,$2,$3)", [randomUUID(), s.jobId, s.extraId]))).toBe("42501");
  }, 240_000);
});
