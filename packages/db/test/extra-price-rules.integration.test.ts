import { testActorContext } from "./tenant-context-test-utils.js";
// Synthetic PostgreSQL regressions; authored for CI, not run in the restricted builder sandbox.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { ExtraApprovalRepository, withTenant } from "../src/index.js";
import { approveInput, chainWorld, cluster, newJob, raiseOn, reviseRules, submitted, type ChainWorld, type Cluster } from "./extra-approval-chain-fixtures.js";

let c: Cluster, w: ChainWorld, repo: ExtraApprovalRepository;
beforeAll(async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  c = await cluster(); w = await chainWorld(c); repo = new ExtraApprovalRepository(c.runtime);
}, 240_000);
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });

it("Q01 only a surveyor can price; re-pricing requires ReviseExtra and preserves the first snapshot and source", async () => {
  const jobId = await newJob(c, w), extraId = await raiseOn(c, w, jobId), ctx = await w.ctx;
  const price = (netPence: number) => ({ version: "price-extra.v1", commandId: randomUUID(), jobId, extraId, netPence });
  for (const role of ["owner", "admin", "operative", "supervisor", "commercial_manager", "finance", "read_only", "client_approver"] as const) {
    await expect(repo.priceExtra(await testActorContext(c.admin, ctx, w.members[role].member), w.members[role].member, price(100))).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  }
  for (const net of [0, -1, 1.5, 1_000_000_000_001]) {
    await expect(repo.priceExtra(await testActorContext(c.admin, ctx, w.members.surveyor.member), w.members.surveyor.member, price(net))).rejects.toMatchObject({ code: "INVALID_COMMAND" });
  }
  await repo.priceExtra(await testActorContext(c.admin, ctx, w.members.surveyor.member), w.members.surveyor.member, price(25000));
  const first = await repo.submitExtra(await testActorContext(c.admin, ctx, w.members.supervisor.member), w.members.supervisor.member, { version: "submit-extra.v1", commandId: randomUUID(), jobId, extraId });
  const snapshot = async () => (await c.admin.query("SELECT * FROM app.extra_approval_request WHERE id=$1", [first.requestId])).rows[0];
  const source = async () => (await c.admin.query(`SELECT b.*,r.signed_delta_pence,r.content_hash FROM app.extra_approval_revision_binding b
    JOIN app.variation_revision r ON (r.tenant_id,r.id)=(b.tenant_id,b.source_revision_id)
    WHERE b.variation_id=$1 AND b.logical_revision=1`, [extraId])).rows[0];
  const before = await snapshot(), original = await source();
  expect(before.comparisons).toMatchObject({ withinProceedLimit: true, aboveClientThreshold: false, aboveClientBeforeWorkThreshold: false });
  await repo.approveExtraStep(await testActorContext(c.admin, ctx, w.members.supervisor.member), w.members.supervisor.member, approveInput({ jobId, requestId: String(first.requestId), hash: String(first.revisionHash), net: 25000 }, 0));
  await expect(repo.priceExtra(await testActorContext(c.admin, ctx, w.members.surveyor.member), w.members.surveyor.member, price(25001))).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  const revised = await repo.reviseExtra(await testActorContext(c.admin, ctx, w.members.surveyor.member), w.members.surveyor.member, { ...price(25001), version: "revise-extra.v1" });
  expect(revised.requestRevision).toBe(2); expect(revised.requestId).not.toBe(first.requestId);
  expect(await snapshot()).toEqual(before); expect(await source()).toEqual(original);
});

it("Q03 rejects a missing job contract with RULES_NOT_FOUND; no default rules are consulted", async () => {
  // Invoke the private request opener as the fixture administrator: a runtime caller cannot execute it.
  await expect(withTenant(c.admin, await w.ctx, db => db.$client.query(
    "SELECT app.xa_open_request($1,$2,$3,$4,$5,NULL,NULL,$6,NULL)",
    [w.p.tenantId, randomUUID(), randomUUID(), randomUUID(), w.members.supervisor.member.membershipId, "a".repeat(64)],
  ))).rejects.toMatchObject({ message: "RULES_NOT_FOUND" });
});

it("Q03 structurally refuses a second candidate contract for the same job and a contract without rules", async () => {
  const jobId = await newJob(c, w);
  // A second candidate cannot reach submission: the job/work-order binding is unique.
  await expect(c.admin.query(`INSERT INTO app.work_order(tenant_id,id,job_id,client_id,contract_id,contract_version_id,reference)
    SELECT tenant_id,$2,job_id,client_id,contract_id,contract_version_id,$3 FROM app.work_order WHERE job_id=$1`,
    [jobId, randomUUID(), `fictional-${randomUUID()}`])).rejects.toMatchObject({ code: "23505" });
  // Contract versions cannot exist without a valid rule version (NOT NULL and tenant/contract-qualified FK).
  for (const rule of [null, randomUUID()]) {
    await expect(c.admin.query(`INSERT INTO app.client_contract_version(tenant_id,id,client_id,contract_id,revision,document,rule_version_id)
      SELECT tenant_id,$2,client_id,contract_id,revision+10000,document,$3 FROM app.client_contract_version WHERE id=$1`,
      [(await c.admin.query("SELECT contract_version_id FROM app.work_order WHERE job_id=$1", [jobId])).rows[0].contract_version_id, randomUUID(), rule],
    )).rejects.toMatchObject({ code: rule === null ? "23502" : "23503" });
  }
});

it("Q03 freezes the bound contract and rules even when newer versions exist before submission", async () => {
  const jobId = await newJob(c, w), extraId = await raiseOn(c, w, jobId);
  const bound = (await c.admin.query(`SELECT w.contract_version_id,c.rule_version_id FROM app.work_order w
    JOIN app.client_contract_version c ON(c.tenant_id,c.id)=(w.tenant_id,w.contract_version_id) WHERE w.job_id=$1`, [jobId])).rows[0];
  const rules = (await c.admin.query("SELECT document FROM app.approval_rule_version WHERE id=$1", [bound.rule_version_id])).rows[0].document;
  await reviseRules(c, w, { ...rules, proceedLimit: { pence: 1, currency: "GBP" } });
  const result = await repo.submitExtra(await w.ctx, w.members.supervisor.member, { version: "submit-extra.v1", commandId: randomUUID(), jobId, extraId });
  const request = (await c.admin.query("SELECT contract_version_id,rule_version_id FROM app.extra_approval_request WHERE id=$1", [result.requestId])).rows[0];
  expect(request).toEqual(bound);
  const fresh = await submitted(c, w, 1);
  expect((await c.admin.query("SELECT contract_version_id FROM app.extra_approval_request WHERE id=$1", [fresh.requestId])).rows[0].contract_version_id).not.toBe(bound.contract_version_id);
});
