// Real PostgreSQL CI tests. Administrative synthetic sources, not a practice-writer or live-provider claim.
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, it, expect } from "vitest";
import type { PlatformInvoiceIssueCommand, PlatformInvoiceProfile } from "@jobguard/core";
import { PlatformTaxInvoiceFixtureRepository } from "../src/platform-tax-invoice-fixture-repository.js";
import { createWorkFixture, closeWorkFixture, seedWorkJob, workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
import { meterCompany } from "./meter-persistence-fixtures.js";
import { feeSourceFixture } from "./platform-tax-invoice-fee-fixtures.js";
let f: WorkFixture;
beforeAll(async () => { f = await createWorkFixture(); }, 240000);
afterAll(async () => { await closeWorkFixture(f); });
async function setup(approved = true) {
  const a = await meterCompany(f), source = feeSourceFixture(a.jobId, 1, 28200);
  const insert = async (s: typeof source, approve: boolean) => workTenant(f.admin, a.tenantId, async db => {
    await db.query("INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES($1,$2,'simulation_fee_statement',$3,'success_fee.statement_approve')", [s.decisionId, a.tenantId, s.id]);
    await db.query(`INSERT INTO app.platform_fee_statement(tenant_id,job_id,id,sequence,namespace,source_hash,document,document_hash,decision_id)
      VALUES($1,$2,$3,$4,'success_fee.synthetic.v1',$5,$6::jsonb,$7,$8)`, [a.tenantId, a.jobId, s.id, s.sequence, s.source_hash, JSON.stringify(s.document), s.document_hash, s.decisionId]);
    if (approve) {
      const resolution = randomUUID();
      await db.query("INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES($1,$2,$3,'approved',$4)", [resolution, a.tenantId, s.decisionId, a.actorId]);
      await db.query(`INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,amount_pence,currency,aggregate_revision,policy_version,expires_at)
        VALUES($1,$2,$3,$4,$5,'success_fee.statement_approve',$6,$7,$8,'GBP',1,'reference_fee_policy_v3',clock_timestamp()+interval '1 hour')`,
      [s.approval_id, a.tenantId, s.decisionId, resolution, a.actorId, s.id, s.document_hash, s.document.documentPrincipal.pence]);
    }
  });
  await insert(source, approved);
  const profile: PlatformInvoiceProfile = { version: "platform-invoice-profile.v1", tenantId: a.tenantId, issuerId: randomUUID(),
    name: "JobGuard fictional issuer", address: "Fictional address — simulation only", vatRegistration: "SIMULATION-NOT-REGISTERED", environment: "synthetic_demo" };
  const command: PlatformInvoiceIssueCommand = { version: "platform-invoice-issue.v1", environment: "synthetic_demo", commandId: randomUUID(), issuerId: profile.issuerId,
    actorMembershipId: a.actorId, kind: "invoice", originalNumber: null, taxPolicy: "D02-pending-approval-example",
    lines: [{ id: randomUUID(), sourceKind: "success_fee", sourceId: source.id, expectedSourceHash: source.document_hash, taxPence: 0 }] };
  const repo = new PlatformTaxInvoiceFixtureRepository(f.admin);
  return { a, source, profile, command, insert, repo, issue: (raw: unknown = command) => repo.issue(a.context, a.digest, profile, raw) };
}
it("issues and replays stored approved fees; every source survives and full credit never releases the cross-issuer reservation", async () => {
  const t = await setup(), [invoice, replay] = await Promise.all([t.issue(), t.issue()]);
  expect(replay).toEqual(invoice); expect(invoice.principalPence).toBe(28200);
  expect(invoice.request.lines[0]!.provenance).toMatchObject({ sourceSnapshot: t.source.document.sourceSnapshot, priorSettlements: { state: "none_recorded" } });
  const credit = { ...t.command, commandId: randomUUID(), kind: "credit_note", originalNumber: invoice.number };
  const note = await t.issue(credit); expect(note.principalPence).toBe(28200); expect(await t.issue(credit)).toEqual(note);
  const profile = { ...t.profile, issuerId: randomUUID() };
  await expect(t.repo.issue(t.a.context, t.a.digest, profile, { ...t.command, issuerId: profile.issuerId, commandId: randomUUID() })).rejects.toThrow("PLATFORM_INVOICE_CONFLICT");
  await expect(t.issue({ ...credit, commandId: randomUUID() })).rejects.toThrow("PLATFORM_INVOICE_LIMIT");
  expect(invoice.collectionStarted).toBe(false);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.platform_fee_attempt WHERE tenant_id=$1", [t.a.tenantId])).rows[0].n).toBe(0);
});
it("refuses unapproved, foreign, missing, mismatched and superseded sources", async () => {
  const pending = await setup(false); await expect(pending.issue()).rejects.toThrow("PLATFORM_INVOICE_SOURCE_UNAVAILABLE");
  const t = await setup(), other = await setup();
  for (const patch of [{ sourceId: randomUUID() }, { sourceId: other.source.id, expectedSourceHash: other.source.document_hash }, { expectedSourceHash: "a".repeat(64) }])
    await expect(t.issue({ ...t.command, lines: [{ ...t.command.lines[0], ...patch }] })).rejects.toThrow("PLATFORM_INVOICE_SOURCE_UNAVAILABLE");
  // A newer persisted revision supersedes the old statement, even with a valid old approval/hash.
  const next = feeSourceFixture(t.a.jobId, 2, 1000); await t.insert(next, true);
  await expect(t.issue()).rejects.toThrow("PLATFORM_INVOICE_SOURCE_UNAVAILABLE");
  const invoice = await t.issue({ ...t.command, lines: [{ ...t.command.lines[0]!, sourceId: next.id, expectedSourceHash: next.document_hash }] });
  expect(invoice.principalPence).toBe(1000); // never invoice its cumulative 28200
});
it("refuses a different same-tenant actor and non-owner session, including on replay", async () => {
  const t = await setup(); await t.issue();
  const other = await seedWorkJob(f, t.a.tenantId);
  await expect(t.issue({ ...t.command, actorMembershipId: other.actorId })).rejects.toThrow("PLATFORM_INVOICE_FORBIDDEN");
  await f.admin.query("UPDATE app.membership SET role='admin' WHERE tenant_id=$1 AND id=$2", [t.a.tenantId, t.a.actorId]);
  await expect(t.issue()).rejects.toThrow("PLATFORM_INVOICE_FORBIDDEN");
});
it("reads statement-linked attempts and their events without banking metadata or collection effects", async () => {
  const t = await setup(), attempt = randomUUID();
  await workTenant(f.admin, t.a.tenantId, async db => {
    await db.query("INSERT INTO app.platform_fee_attempt VALUES($1,$2,$3,$4,$5,'collection',1000)", [t.a.tenantId, t.a.jobId, attempt, t.source.id, t.source.approval_id]);
    await db.query("INSERT INTO app.platform_fee_attempt_event VALUES($1,$2,$3,1,'pending'),($1,$2,$3,2,'settled')", [t.a.tenantId, t.a.jobId, attempt]);
  });
  const invoice = await t.issue();
  expect(invoice.request.lines[0]!.provenance).toMatchObject({ priorSettlements: { state: "recorded", attempts: [{ id: attempt, kind: "collection", amountPence: 1000,
    events: [{ revision: 1, state: "pending" }, { revision: 2, state: "settled" }] }] } });
  expect(JSON.stringify(invoice)).not.toMatch(/bank|integration_unavailable/u);
  expect(invoice.collectionStarted).toBe(false);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.platform_fee_attempt WHERE tenant_id=$1", [t.a.tenantId])).rows[0].n).toBe(1);
});
it("refuses revoked and expired statement authority even when replaying an issued invoice", async () => {
  for (const column of ["revoked_at", "expires_at"]) {
    const t = await setup(); await t.issue();
    // Administrative time/revocation fixture; no runtime authority writes.
    await workTenant(f.admin, t.a.tenantId, async db => {
      await db.query("ALTER TABLE app.action_authorization DISABLE TRIGGER USER");
      await db.query(`UPDATE app.action_authorization SET ${column}=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND id=$2`, [t.a.tenantId, t.source.approval_id]);
      await db.query("ALTER TABLE app.action_authorization ENABLE TRIGGER USER");
    });
    await expect(t.issue()).rejects.toThrow("PLATFORM_INVOICE_SOURCE_UNAVAILABLE");
  }
});
