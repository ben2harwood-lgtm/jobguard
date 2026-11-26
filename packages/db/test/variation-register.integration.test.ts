// QW-3 weekly extras register on real PostgreSQL: as-at-close states, exact pence, only this session's jobs.
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { buildVariationRegisterV1, registerWeekWindowV1 } from "@jobguard/core";
import { createFinalCheckFixture, closeFinalCheckFixture, seedFinalCheckJob, FINAL_CHECK_ACTOR, type FinalCheckFixture } from "./final-check-fixture.js";
import { insertVariationProposal } from "../src/variation-repository.js";
import { withTenant } from "../src/tenant-context.js";
import { VariationRegisterRepository } from "../src/variation-register-repository.js";
import { workTenant } from "./job-work-state-fixtures.js";
import { testBoundTenantContext } from "./tenant-context-test-utils.js";

let f: FinalCheckFixture;
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); f = await createFinalCheckFixture(); }, 120000);
afterAll(async () => { await closeFinalCheckFixture(f); vi.unstubAllEnvs(); });

type Job = Awaited<ReturnType<typeof seedFinalCheckJob>>;
const hex = "b".repeat(64);
async function extra(a: Job, description: string) {
  const id = randomUUID();
  await withTenant(f.runtime, a.context, db => insertVariationProposal(db, a.tenantId, { version: "variation-proposal.v1", id, jobId: a.jobId, scopeItemId: id, existingScopeItemId: null, lineageParentScopeItemId: null, captureKind: "text", captureText: description, description, suggestion: null }));
  return id;
}
async function price(a: Job, variationId: string, pence: bigint, revision = 1, previous: string | null = null) {
  const id = randomUUID();
  await workTenant(f.admin, a.tenantId, async db => {
    await db.query(`INSERT INTO app.variation_revision(id,tenant_id,job_id,variation_id,scope_item_id,revision,previous_revision_id,description,quantity_decimal,unit,unit_rate_pence,signed_delta_pence,content_hash,confirmed_by_membership_id,rate_provenance_kind,rate_source_ref,rate_source_hash,rate_version)
      VALUES($1,$2,$3,$4,$4,$5,$6,$7,'1','item',$8,$9,$10,$11,'human_entered','fictional',$10,'v1')`, [id, a.tenantId, a.jobId, variationId, revision, previous, `Priced ${revision}`, (pence < 0n ? -pence : pence).toString(), pence.toString(), hex, FINAL_CHECK_ACTOR]);
    await db.query("UPDATE app.variation SET state='priced',current_revision_id=$1 WHERE tenant_id=$2 AND id=$3", [id, a.tenantId, variationId]);
  });
  return id;
}
async function approve(a: Job, variationId: string, revisionId: string) {
  await workTenant(f.admin, a.tenantId, async db => {
    await db.query(`INSERT INTO app.variation_approval(id,tenant_id,job_id,variation_id,revision_id,revision,content_hash,signed_delta_pence,method,actor_membership_id,approved_at)
      SELECT $1,$2,$3,$4,$5,revision,content_hash,signed_delta_pence,'builder_attestation',$6,clock_timestamp() FROM app.variation_revision WHERE tenant_id=$2 AND id=$5`, [randomUUID(), a.tenantId, a.jobId, variationId, revisionId, FINAL_CHECK_ACTOR]);
    await db.query("UPDATE app.variation SET state='approved' WHERE tenant_id=$1 AND id=$2", [a.tenantId, variationId]);
  });
}
async function reject(a: Job, variationId: string, revisionId: string) {
  await workTenant(f.admin, a.tenantId, async db => {
    await db.query("INSERT INTO app.variation_rejection(id,tenant_id,job_id,variation_id,revision_id,actor_membership_id,reason_code,rejected_at) VALUES($1,$2,$3,$4,$5,$6,'customer_declined',clock_timestamp())", [randomUUID(), a.tenantId, a.jobId, variationId, revisionId, FINAL_CHECK_ACTOR]);
    await db.query("UPDATE app.variation SET state='rejected' WHERE tenant_id=$1 AND id=$2", [a.tenantId, variationId]);
  });
}
const openWeek = () => ({ ...registerWeekWindowV1("2026-11-20"), closesAt: new Date(Date.now() + 60_000).toISOString() });
const cut = async () => { await sleep(20); const at = new Date().toISOString(); await sleep(20); return at; };

it("rebuilds each extra as at the close, with exact pence and only this session's live jobs", async () => {
  const a = await seedFinalCheckJob(f), b = await seedFinalCheckJob(f), repository = new VariationRegisterRepository(f.runtime);
  const approved = await extra(a, "Fictional rotten joist"), omission = await extra(a, "Fictional omitted tiling"), pending = await extra(a, "Fictional extra socket");
  const rejected = await extra(a, "Fictional skylight"), draft = await extra(a, "Fictional unpriced gate");
  const big = 9_007_199_254_740_993n;
  await approve(a, approved, await price(a, approved, 45_000n));
  await approve(a, omission, await price(a, omission, -12_550n));
  const first = await price(a, pending, 1_000n);
  const beforeRevise = await cut();
  await price(a, pending, big, 2, first);
  const skylight = await price(a, rejected, 80_000n);
  const beforeDecision = await cut();
  await reject(a, rejected, skylight);
  await extra(b, "Fictional other session's extra");

  const now = await repository.sources(a.context, a.digest, openWeek());
  expect(now.every(row => row.jobId === a.jobId)).toBe(true);
  const byId = new Map(now.map(row => [row.variationId, row]));
  expect(byId.get(approved)).toMatchObject({ approvedAt: expect.any(String), rejectedAt: null, revision: { signedDeltaPence: "45000" } });
  expect(byId.get(omission)?.revision?.signedDeltaPence).toBe("-12550");
  expect(byId.get(pending)?.revision).toMatchObject({ number: 2, signedDeltaPence: big.toString() });
  expect(byId.get(rejected)).toMatchObject({ approvedAt: null, rejectedAt: expect.any(String) });
  expect(byId.get(draft)?.revision).toBeNull();

  const register = buildVariationRegisterV1("2099-01-02", new Date("2099-01-03T00:00:00.000Z"), now);
  expect(register.totals).toEqual({ approvedPence: "32450", pendingPence: big.toString(), rejectedPence: "80000" });
  expect(register.jobs.map(job => job.jobId)).toEqual([a.jobId]);

  const atRevise = await repository.sources(a.context, a.digest, { ...openWeek(), closesAt: beforeRevise });
  expect(atRevise.find(row => row.variationId === pending)?.revision).toMatchObject({ number: 1, signedDeltaPence: "1000" });
  expect(atRevise.some(row => row.variationId === rejected)).toBe(true);
  expect(atRevise.find(row => row.variationId === rejected)?.revision).toBeNull();
  const atDecision = await repository.sources(a.context, a.digest, { ...openWeek(), closesAt: beforeDecision });
  expect(atDecision.find(row => row.variationId === rejected)).toMatchObject({ rejectedAt: null, revision: { signedDeltaPence: "80000" } });
});

it("never shows another session's or another tenant's jobs, and is empty before any extra", async () => {
  const a = await seedFinalCheckJob(f), b = await seedFinalCheckJob(f), repository = new VariationRegisterRepository(f.runtime);
  await extra(b, "Fictional session B extra");
  expect(await repository.sources(a.context, a.digest, openWeek())).toEqual([]);
  expect(await repository.sources(a.context, a.digest, registerWeekWindowV1("2020-01-03"))).toEqual([]);
  const tenant = randomUUID(), user = randomUUID(), account = randomUUID(), member = randomUUID();
  await f.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenant]);
  await f.admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [user]);
  await f.admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional other builder')", [account, tenant]);
  await f.admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [member, tenant, account, user]);
  const other = await testBoundTenantContext(f.admin, tenant, member);
  expect(await repository.sources(other, b.digest, openWeek())).toEqual([]);
});
