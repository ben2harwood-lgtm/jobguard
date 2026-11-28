// EP-CC-S1: pricing contract v2 (docs/contracts/extra-price-rules-v2.md) on real PostgreSQL 16. Made-up data only.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ExtraApprovalRepository, SiteExtraRepository, withTenant, type AuthenticatedMembership } from "../src/index.js";
import { approveInput, chainWorld, cluster, newJob, raiseOn, submitted, type ChainWorld, type Cluster } from "./extra-approval-chain-fixtures.js";
import { photo } from "./site-extra-evidence-fixtures.js";
import { testActorContext } from "./tenant-context-test-utils.js";

let c: Cluster, w: ChainWorld, repo: ExtraApprovalRepository;
const code = (p: Promise<unknown>) => p.then(() => "ok", (e: { code?: string; message?: string }) => e.code ?? e.message ?? String(e));
const as = async (m: AuthenticatedMembership) => testActorContext(c.admin, await w.ctx, m);
const surveyor = () => w.members.surveyor.member, supervisor = () => w.members.supervisor.member;
const quoted = (netPence: number, extra: Record<string, unknown> = {}) => ({ kind: "surveyor_quoted", netPence, method: "quotation", note: "Fictional quotation basis", ...extra });
const sor = (sorCode: string, claimedQuantity: string) => ({ kind: "server_sor", sorCode, claimedQuantity });
const price = (jobId: string, extraId: string, basis: unknown, commandId = randomUUID()) => ({ version: "price-extra.v2", commandId, jobId, extraId, basis });
const revise = (jobId: string, extraId: string, basis: unknown, answersRequestId: string, reason = "response_to_rejection", extra: Record<string, unknown> = {}) =>
  ({ version: "revise-extra.v2", commandId: randomUUID(), jobId, extraId, basis, reason, answersRequestId, ...extra });
const basisRows = async (extraId: string) => (await c.admin.query("SELECT * FROM app.extra_pricing_basis WHERE variation_id=$1 ORDER BY revision", [extraId])).rows;
const dbPrice = async (quantity: string, rate: number) => Number((await c.admin.query("SELECT app.sor_line_net_pence($1,$2,-35,1000) n", [quantity, rate])).rows[0].n);
async function tables(tenant: string) {
  const out: Record<string, number> = {};
  for (const t of ["variation_revision", "extra_approval_revision_binding", "extra_pricing_basis", "extra_approval_request", "command_receipt", "audit_event"])
    out[t] = (await c.admin.query(`SELECT count(*)::int n FROM app.${t} WHERE tenant_id=$1`, [tenant])).rows[0].n;
  return out;
}

beforeAll(async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  c = await cluster(); w = await chainWorld(c); repo = new ExtraApprovalRepository(c.runtime);
}, 300_000);
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });

describe("price-extra.v2 surveyor_quoted", () => {
  it("first manual pricing records its method, note and binding; submission uses that net; replay and conflict follow the receipt", async () => {
    const jobId = await newJob(c, w), extraId = await raiseOn(c, w, jobId), input = price(jobId, extraId, quoted(25000, { method: "dayworks", note: "Fictional dayworks sheet, 4 hours" }));
    const priced = await repo.priceExtra(await as(surveyor()), surveyor(), input);
    expect(priced).toMatchObject({ netPence: 25000, bindingId: expect.any(String), revisionId: expect.any(String), basis: { pricingBasis: "surveyor_quoted", netPence: 25000, method: "dayworks" } });
    const [row] = await basisRows(extraId);
    expect(row).toMatchObject({ revision: 1, pricing_basis: "surveyor_quoted", basis_version: "extra-pricing-basis.v2", command_version: "price-extra.v2", binding_id: priced.bindingId,
      net_pence: "25000", quote_method: "dayworks", basis_note: "Fictional dayworks sheet, 4 hours", basis_evidence_id: null, sor_code: null, revision_reason: null, answers_request_id: null });
    expect(row.basis_hash).toMatch(/^[0-9a-f]{64}$/u);
    // The audit event names the basis by reference and hash only; the note stays in the tenant table.
    const audit = (await c.admin.query("SELECT payload::text p FROM app.audit_event WHERE subject_ref=$1 AND event_type='contractor.extra.priced'", [extraId])).rows;
    expect(audit).toHaveLength(1); expect(audit[0].p).not.toContain("dayworks sheet"); expect(audit[0].p).toContain(row.basis_hash);
    // Identical replay returns the stored answer; the same command id with a changed basis or evidence conflicts.
    const before = await tables(w.p.tenantId);
    expect(await repo.priceExtra(await as(surveyor()), surveyor(), input)).toEqual(priced);
    expect(await code(repo.priceExtra(await as(surveyor()), surveyor(), { ...input, basis: quoted(25001, { method: "dayworks", note: "Fictional dayworks sheet, 4 hours" }) }))).toBe("COMMAND_CONFLICT");
    expect(await code(repo.priceExtra(await as(surveyor()), surveyor(), { ...input, basis: { ...input.basis, evidenceId: randomUUID() } }))).toBe("COMMAND_CONFLICT");
    expect(await tables(w.p.tenantId)).toEqual(before);
    const submittedAnswer = await repo.submitExtra(await as(supervisor()), supervisor(), { version: "submit-extra.v1", commandId: randomUUID(), jobId, extraId });
    expect(submittedAnswer).toMatchObject({ netPence: 25000, state: "awaiting_approval" });
    const read = await repo.pricingBasis(await as(surveyor()), surveyor(), { version: "extra-pricing-basis-query.v1", jobId, extraId });
    expect(read.prices).toEqual([{ bindingId: priced.bindingId, logicalRevision: 1, netPence: 25000, basisStatus: "recorded",
      basis: { kind: "surveyor_quoted", source: "extra-pricing-basis.v2", recordedAt: expect.any(String), method: "dayworks", note: "Fictional dayworks sheet, 4 hours", evidenceId: null } }]);
  });

  it("refuses no basis, a malformed basis, out-of-bound pence and non-surveyors, writing nothing; accepts both bounds", async () => {
    const jobId = await newJob(c, w), extraId = await raiseOn(c, w, jobId), before = await tables(w.p.tenantId);
    const refusals: Array<[unknown, string]> = [
      [{ version: "price-extra.v2", commandId: randomUUID(), jobId, extraId }, "BASIS_REQUIRED"],
      [{ version: "price-extra.v2", commandId: randomUUID(), jobId, extraId, basis: null }, "BASIS_REQUIRED"],
      [price(jobId, extraId, { kind: "guess", netPence: 100 }), "INVALID_COMMAND"],
      [price(jobId, extraId, quoted(0)), "INVALID_COMMAND"], [price(jobId, extraId, quoted(-1)), "INVALID_COMMAND"],
      [price(jobId, extraId, quoted(1.5)), "INVALID_COMMAND"], [price(jobId, extraId, quoted(1_000_000_000_001)), "INVALID_COMMAND"],
      [price(jobId, extraId, quoted(100, { method: "estimate" })), "INVALID_COMMAND"], [price(jobId, extraId, quoted(100, { note: "" })), "INVALID_COMMAND"],
      [price(jobId, extraId, quoted(100, { note: "   " })), "INVALID_COMMAND"], [price(jobId, extraId, quoted(100, { note: "x".repeat(501) })), "INVALID_COMMAND"],
      [price(jobId, extraId, { ...quoted(100), sorCode: "REPAIR-DOOR" }), "INVALID_COMMAND"],
      [{ ...price(jobId, extraId, quoted(100)), netPence: 100 }, "INVALID_COMMAND"],
      [{ version: "price-extra.v1", commandId: randomUUID(), jobId, extraId, netPence: 100 }, "BASIS_REQUIRED"],
    ];
    for (const [input, expected] of refusals) expect(await code(repo.priceExtra(await as(surveyor()), surveyor(), input)), JSON.stringify(input)).toBe(expected);
    for (const role of ["owner", "operative", "supervisor", "commercial_manager", "finance", "client_approver"] as const)
      expect(await code(repo.priceExtra(await as(w.members[role].member), w.members[role].member, price(jobId, extraId, quoted(100))))).toBe("PERMISSION_DENIED");
    expect(await tables(w.p.tenantId)).toEqual(before);
    for (const net of [1, 1_000_000_000_000]) {
      const target = await raiseOn(c, w, jobId);
      expect(await repo.priceExtra(await as(surveyor()), surveyor(), price(jobId, target, quoted(net, { note: "x".repeat(500) })))).toMatchObject({ netPence: net });
    }
    // The database refuses the same shapes for any caller that reaches the routine directly.
    await expect(withTenant(c.runtime, await w.ctx, db => db.$client.query("INSERT INTO app.extra_pricing_basis(tenant_id,id) VALUES($1,$2)", [w.p.tenantId, randomUUID()]))).rejects.toMatchObject({ code: "42501" });
  });

  it("accepts verified evidence of the same job and refuses evidence of another job, a pending upload or an unknown id", async () => {
    const jobId = await newJob(c, w), otherJob = await newJob(c, w), ctx = await w.ctx;
    const objectOf = async (uploadId: string) => (await c.admin.query("SELECT id FROM app.evidence_object WHERE upload_id=$1", [uploadId])).rows[0]?.id as string | undefined;
    const same = await objectOf((await photo(c, { ctx, jobId })).id), other = await objectOf((await photo(c, { ctx, jobId: otherJob })).id);
    const pending = (await photo(c, { ctx, jobId }, { finalize: false })).id;
    expect(same).toBeDefined(); expect(other).toBeDefined();
    const before = await tables(w.p.tenantId);
    for (const evidenceId of [other!, pending, randomUUID()]) {
      const extraId = await raiseOn(c, w, jobId), now = await tables(w.p.tenantId);
      expect(await code(repo.priceExtra(await as(surveyor()), surveyor(), price(jobId, extraId, quoted(5000, { evidenceId }))))).toBe("EVIDENCE_NOT_FOUND");
      expect(await tables(w.p.tenantId)).toEqual(now);
    }
    expect((await tables(w.p.tenantId)).extra_pricing_basis).toBe(before.extra_pricing_basis);
    const extraId = await raiseOn(c, w, jobId);
    await repo.priceExtra(await as(surveyor()), surveyor(), price(jobId, extraId, quoted(5000, { evidenceId: same })));
    expect((await basisRows(extraId))[0].basis_evidence_id).toBe(same);
  });
});

describe("price-extra.v2 server_sor", () => {
  it("prices a rate code from the bound rate list and tendered adjustment, equal to the database function, including £100 at -35/1000 = £96.50", async () => {
    const jobId = await newJob(c, w);
    const order = (await c.admin.query(`SELECT r.id,r.sor_version_id,r.adjustment_numerator::text n,r.adjustment_denominator::text d FROM app.work_order wo
      JOIN app.work_order_current cur ON(cur.tenant_id,cur.work_order_id)=(wo.tenant_id,wo.id) JOIN app.work_order_revision r ON(r.tenant_id,r.id)=(cur.tenant_id,cur.revision_id) WHERE wo.job_id=$1`, [jobId])).rows[0];
    expect([order.n, order.d]).toEqual(["-35", "1000"]);
    // REPAIR-DOOR (10000p) is on every demo order at quantity 1; CLEAR-GUTTER (350p) never is.
    const rows: Array<[string, string, string, number, number]> = [
      ["REPAIR-DOOR", "2", "1", 10000, 9650], // excess 1 of £100 at -35/1000 = £96.50
      ["REPAIR-DOOR", "1.5", "0.5", 10000, 4825],
      ["REPAIR-DOOR", "4", "3", 10000, 28950],
      ["CLEAR-GUTTER", "2", "2", 350, 676], // 675.5, tie, odd below: half-even up
      ["CLEAR-GUTTER", "1.625", "1.625", 350, 549],
      ["CLEAR-GUTTER", "0.002", "0.002", 350, 1], // the lower bound: 0.6755p
    ];
    for (const [sorCode, claimed, priced, rate, expected] of rows) {
      const extraId = await raiseOn(c, w, jobId);
      const result = await repo.priceExtra(await as(surveyor()), surveyor(), price(jobId, extraId, sor(sorCode, claimed)));
      expect(result.netPence, `${sorCode} ${claimed}`).toBe(expected);
      expect(await dbPrice(priced, rate)).toBe(expected);
      expect(result.basis).toMatchObject({ pricingBasis: "server_sor", sorCode, ratePence: rate, claimedQuantity: claimed, pricedQuantity: priced, adjustment: { numerator: "-35", denominator: "1000" },
        coverage: sorCode === "REPAIR-DOOR" ? "excess" : "new", instructedQuantity: sorCode === "REPAIR-DOOR" ? "1" : null });
      const [row] = await basisRows(extraId);
      expect(row).toMatchObject({ pricing_basis: "server_sor", sor_code: sorCode, rate_pence: String(rate), sor_version_id: order.sor_version_id, work_order_revision_id: order.id,
        adjustment_numerator: "-35", adjustment_denominator: "1000", claimed_quantity: claimed, priced_quantity: priced, net_pence: String(expected), quote_method: null, basis_note: null });
      expect(Number((await c.admin.query("SELECT signed_delta_pence n FROM app.variation_revision WHERE id=$1", [result.revisionId])).rows[0].n)).toBe(expected);
    }
  });

  it("refuses at or below the instructed quantity, unknown codes, zero, too-fine quantities, non-positive prices and the money bound, writing nothing", async () => {
    const jobId = await newJob(c, w), extraId = await raiseOn(c, w, jobId), before = await tables(w.p.tenantId);
    const cases: Array<[unknown, string]> = [
      [sor("REPAIR-DOOR", "1"), "ALREADY_ON_ORDER"], [sor("REPAIR-DOOR", "0.5"), "ALREADY_ON_ORDER"],
      [sor("NO-SUCH-CODE", "1"), "RATE_NOT_FOUND"], [sor("CLEAR-GUTTER", "0"), "INVALID_QUANTITY"],
      [sor("CLEAR-GUTTER", "1.1234567"), "INVALID_COMMAND"], [sor("CLEAR-GUTTER", "-1"), "INVALID_COMMAND"], [sor("CLEAR-GUTTER", "1e3"), "INVALID_COMMAND"],
      [sor("CLEAR-GUTTER", "0.001"), "EXTRA_NOT_POSITIVE"], [sor("CLEAR-VOID", "999999999999"), "MONEY_OUT_OF_RANGE"],
      [{ ...sor("CLEAR-GUTTER", "1"), netPence: 999 }, "INVALID_COMMAND"], [{ ...sor("CLEAR-GUTTER", "1"), ratePence: 1 }, "INVALID_COMMAND"],
    ];
    for (const [basis, expected] of cases) expect(await code(repo.priceExtra(await as(surveyor()), surveyor(), price(jobId, extraId, basis))), JSON.stringify(basis)).toBe(expected);
    expect(await tables(w.p.tenantId)).toEqual(before);
  });

  it("late pricing of a submitted unpriced extra supersedes the unpriced request with a rate-code price", async () => {
    const s = await submitted(c, w, null);
    expect(s.result).toMatchObject({ netPence: null });
    const unpriced = (await c.admin.query("SELECT * FROM app.extra_approval_request WHERE id=$1", [s.requestId])).rows[0];
    const late = await repo.priceExtra(await as(surveyor()), surveyor(), price(s.jobId, s.extraId, sor("CLEAR-GUTTER", "2")));
    expect(late).toMatchObject({ supersededRequestId: s.requestId, requestRevision: 2, netPence: 676, state: "awaiting_approval", basis: { pricingBasis: "server_sor", netPence: 676 } });
    expect((await c.admin.query("SELECT net_pence::int n FROM app.extra_approval_request WHERE id=$1", [late.requestId])).rows[0].n).toBe(676);
    expect((await c.admin.query("SELECT * FROM app.extra_approval_request WHERE id=$1", [s.requestId])).rows[0]).toEqual(unpriced);
    // The old unpriced request is stale; the priced one is approvable at its exact amount.
    expect(await code(repo.approveExtraStep(await as(supervisor()), supervisor(), approveInput({ ...s, hash: String(unpriced.revision_hash), net: 676 }, 0)))).toBe("STALE_REVISION");
  });
});

describe("revise-extra.v2", () => {
  it("revises an existing rate-code-priced extra in response to a rejection without billing the instructed quantity again; history is unchanged", async () => {
    const jobId = await newJob(c, w), operative = w.members.operative.member;
    const logged = await new SiteExtraRepository(c.runtime).logSorSiteExtra(await as(operative), operative, { commandId: randomUUID(), jobId, sorCode: "REPAIR-DOOR", quantity: "3", note: "Fictional rate-code extra" });
    const extraId = logged.variationId;
    const first = await repo.submitExtra(await as(supervisor()), supervisor(), { version: "submit-extra.v1", commandId: randomUUID(), jobId, extraId });
    expect(first.netPence).toBe(19300); // excess 2 of the instructed 1
    await repo.rejectExtra(await as(supervisor()), supervisor(), { version: "reject-extra.v1", commandId: randomUUID(), jobId, requestId: first.requestId, stepIndex: 0, revisionHash: first.revisionHash, netPence: 19300, reasonCode: "not_agreed" });
    const history = async () => ({
      request: (await c.admin.query("SELECT * FROM app.extra_approval_request WHERE id=$1", [first.requestId])).rows,
      outcome: (await c.admin.query("SELECT * FROM app.extra_approval_outcome WHERE request_id=$1", [first.requestId])).rows,
      steps: (await c.admin.query("SELECT * FROM app.extra_approval_step_fact WHERE request_id=$1", [first.requestId])).rows,
      sor: (await c.admin.query("SELECT * FROM app.extra_sor_revision WHERE variation_id=$1", [extraId])).rows,
      binding: (await c.admin.query("SELECT * FROM app.extra_approval_revision_binding WHERE variation_id=$1 AND logical_revision=1", [extraId])).rows,
      basis: (await c.admin.query("SELECT * FROM app.extra_pricing_basis WHERE variation_id=$1 AND revision=1", [extraId])).rows,
    });
    const before = await history(), counts = await tables(w.p.tenantId);
    // Refusals first: no reason, a stale or unknown answered request, a reason that does not fit, the same amount, and the old v1 body.
    const refusals: Array<[unknown, string]> = [
      [{ ...revise(jobId, extraId, sor("REPAIR-DOOR", "2"), first.requestId), reason: undefined }, "INVALID_COMMAND"],
      [{ ...revise(jobId, extraId, sor("REPAIR-DOOR", "2"), first.requestId), reason: "because" }, "INVALID_COMMAND"],
      [revise(jobId, extraId, sor("REPAIR-DOOR", "2"), randomUUID()), "STALE_REVISION"],
      [revise(jobId, extraId, sor("REPAIR-DOOR", "3"), first.requestId, "quantity_corrected"), "INVALID_TRANSITION"],
      [revise(jobId, extraId, sor("REPAIR-DOOR", "1"), first.requestId), "ALREADY_ON_ORDER"],
      [{ version: "revise-extra.v2", commandId: randomUUID(), jobId, extraId, reason: "response_to_rejection", answersRequestId: first.requestId }, "BASIS_REQUIRED"],
      [{ version: "revise-extra.v1", commandId: randomUUID(), jobId, extraId, netPence: 9650 }, "BASIS_REQUIRED"],
    ];
    for (const [input, expected] of refusals) expect(await code(repo.reviseExtra(await as(surveyor()), surveyor(), input)), JSON.stringify(input)).toBe(expected);
    expect(await tables(w.p.tenantId)).toEqual(counts);
    const input = revise(jobId, extraId, sor("REPAIR-DOOR", "2"), first.requestId, "response_to_rejection", { reasonNote: "Fictional: client says one door only" });
    const revised = await repo.reviseExtra(await as(surveyor()), surveyor(), input);
    expect(revised).toMatchObject({ requestRevision: 2, netPence: 9650, state: "awaiting_approval", basis: { pricingBasis: "server_sor", pricedQuantity: "1", claimedQuantity: "2", instructedQuantity: "1", reason: "response_to_rejection", answersRequestId: first.requestId } });
    expect(revised.requestId).not.toBe(first.requestId);
    const row = (await basisRows(extraId)).find(r => r.revision === 2)!;
    expect(row).toMatchObject({ command_version: "revise-extra.v2", revision_reason: "response_to_rejection", revision_note: "Fictional: client says one door only", answers_request_id: first.requestId, net_pence: "9650", priced_quantity: "1" });
    expect(await history()).toEqual(before);
    // An identical retry after success replays the stored answer although the extra has moved on to the new, undecided request
    // (the command names the request it answered, never the current one); the same id answering the new request conflicts.
    const latestNow = (await c.admin.query("SELECT id FROM app.extra_approval_request WHERE variation_id=$1 ORDER BY request_revision DESC LIMIT 1", [extraId])).rows[0].id;
    expect(latestNow).toBe(revised.requestId);
    const receiptsBefore = (await c.admin.query("SELECT count(*)::int n FROM app.command_receipt WHERE tenant_id=$1", [w.p.tenantId])).rows[0].n;
    expect(await repo.reviseExtra(await as(surveyor()), surveyor(), input)).toEqual(revised);
    expect((await c.admin.query("SELECT count(*)::int n FROM app.command_receipt WHERE tenant_id=$1", [w.p.tenantId])).rows[0].n).toBe(receiptsBefore);
    expect(await code(repo.reviseExtra(await as(surveyor()), surveyor(), { ...input, answersRequestId: latestNow, reason: "quantity_corrected" }))).toBe("COMMAND_CONFLICT");
    expect(await code(repo.reviseExtra(await as(surveyor()), surveyor(), { ...input, reason: "pricing_error" }))).toBe("COMMAND_CONFLICT");
    // The read shows the origin capture's recorded basis and the revision's reason.
    const read = await repo.pricingBasis(await as(supervisor()), supervisor(), { version: "extra-pricing-basis-query.v1", jobId, extraId });
    expect(read.prices).toMatchObject([
      { logicalRevision: 1, netPence: 19300, basisStatus: "recorded", basis: { kind: "server_sor", source: "origin_capture", sorCode: "REPAIR-DOOR", claimedQuantity: "3", pricedQuantity: "2", instructedQuantity: "1" } },
      { logicalRevision: 2, netPence: 9650, basisStatus: "recorded", basis: { kind: "server_sor", source: "extra-pricing-basis.v2", pricedQuantity: "1" }, revision: { reason: "response_to_rejection", answersRequestId: first.requestId } },
    ]);
    expect(await code(repo.pricingBasis(await as(w.members.client_approver.member), w.members.client_approver.member, { version: "extra-pricing-basis-query.v1", jobId, extraId }))).toBe("PERMISSION_DENIED");
  });

  it("revises an approved manual price with a quoted basis; response_to_rejection is refused for an approved request", async () => {
    const s = await submitted(c, w, null);
    await repo.priceExtra(await as(surveyor()), surveyor(), price(s.jobId, s.extraId, quoted(30000)));
    const latest = (await c.admin.query("SELECT id,revision_hash,net_pence::int net FROM app.extra_approval_request WHERE variation_id=$1 ORDER BY request_revision DESC LIMIT 1", [s.extraId])).rows[0];
    await repo.approveExtraStep(await as(supervisor()), supervisor(), approveInput({ jobId: s.jobId, requestId: latest.id, hash: latest.revision_hash, net: 30000 }, 0));
    expect(await code(repo.reviseExtra(await as(surveyor()), surveyor(), revise(s.jobId, s.extraId, quoted(28000), latest.id)))).toBe("INVALID_TRANSITION");
    const revised = await repo.reviseExtra(await as(surveyor()), surveyor(), revise(s.jobId, s.extraId, quoted(28000, { method: "agreed_lump_sum", note: "Fictional agreed sum" }), latest.id, "pricing_error"));
    expect(revised).toMatchObject({ netPence: 28000, basis: { pricingBasis: "surveyor_quoted", reason: "pricing_error" } });
    expect((await c.admin.query("SELECT kind FROM app.extra_approval_outcome WHERE request_id=$1", [latest.id])).rows).toEqual([{ kind: "approved" }]);
  });

  it("the unchanged v1 writer cannot commit a price without a basis, even reached directly through the command lifecycle", async () => {
    const jobId = await newJob(c, w), extraId = await raiseOn(c, w, jobId), before = await tables(w.p.tenantId);
    const runner = repo as unknown as { run: (...args: unknown[]) => Promise<unknown> }, commandId = randomUUID();
    await expect(runner.run(await as(surveyor()), surveyor(), "PriceExtra", commandId, `extra-price:${jobId}:${extraId}:${commandId}`, { jobId, extraId, netPence: 40000 },
      async (db: { $client: { query: (s: string, a: unknown[]) => Promise<unknown> } }, _t: string, m: string) => {
        await db.$client.query("SELECT app.xa_price($1,$2,$3,$4,$5,false) r", [jobId, extraId, commandId, m, 40000]);
        return { result: {}, audits: [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${m}`, eventType: "contractor.extra.priced", subjectType: "extra", subjectRef: extraId,
          payload: { references: { command: commandId, job: jobId, extra: extraId, environment: "synthetic_demo" }, classifications: { action: "commercial" } } }] };
      })).rejects.toMatchObject({ code: "BASIS_REQUIRED" });
    expect(await tables(w.p.tenantId)).toEqual(before);
  });
});
