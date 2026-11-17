import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authenticatePracticeSession, issuePracticeSession, practiceMaterialPool } from "../src/practice-session.js";
import { PracticeInvoiceRepository } from "../src/practice-invoice-repository.js";
import { withTenant } from "../src/tenant-context.js";
import { DEMO_ACCOUNT_ID, DEMO_IDENTITY_USER_ID, DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID } from "../src/demo-seed.js";
import { asFixtureTenant, closeLockFixture, createLockFixture, prepareInvoicePrerequisites } from "./sv5pre-fixtures.js";

describe("SV5PRE session-owned invoice issue", () => {
  let fixture: Awaited<ReturnType<typeof createLockFixture>>;
  const priorEnvironment = process.env.JOBGUARD_ENV;

  beforeAll(async () => {
    process.env.JOBGUARD_ENV = "synthetic_demo";
    fixture = await createLockFixture();
    await fixture.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [DEMO_TENANT_ID]);
    await fixture.admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [DEMO_IDENTITY_USER_ID]);
    await fixture.admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Synthetic session invoice account')", [DEMO_ACCOUNT_ID, DEMO_TENANT_ID]);
    await fixture.admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID, DEMO_ACCOUNT_ID, DEMO_IDENTITY_USER_ID]);
  }, 60_000);

  afterAll(async () => {
    if (priorEnvironment === undefined) delete process.env.JOBGUARD_ENV;
    else process.env.JOBGUARD_ENV = priorEnvironment;
    if (fixture) await closeLockFixture(fixture);
  });

  // Include every issue effect and existing sources. JSON text also detects
  // same-row updates (sequence/audit head) that counts alone would miss.
  async function effects() {
    const result: Record<string, { count: number; rows: string }> = {};
    for (const relation of [
      "app.job", "app.final_account_draft", "app.final_account_revision", "app.final_account_line",
      "app.final_account_lock", "app.final_account_lock_check", "app.shadow_final_check_completion",
      "app.customer_invoice_sequence", "app.customer_invoice", "app.customer_invoice_evidence",
      "app.final_account_invoice_binding", "app.final_account_invoiced_line",
      "app.decision", "app.decision_resolution", "app.action_authorization", "app.action_outbox",
      "app.command_receipt", "app.audit_event", "audit_control.audit_head", "infrastructure.outbox_signal",
      "app.customer_payment", "app.landing_allocation", "app.recovery_fee_derivation",
      "app.recovery_fee_journal", "app.journal", "app.journal_line",
    ]) {
      const row = (await fixture.admin.query<{ count: number; rows: string }>(
        `SELECT count(*)::int count, coalesce(jsonb_agg(value ORDER BY value::text),'[]'::jsonb)::text rows
         FROM (SELECT to_jsonb(t) value FROM ${relation} t WHERE tenant_id=$1) q`, [DEMO_TENANT_ID],
      )).rows[0]!;
      result[relation] = row;
    }
    return result;
  }

  it("refuses the same issue without a session digest as FORBIDDEN and writes nothing", async () => {
    const sessionId = await issuePracticeSession(fixture.runtime);
    const auth = await authenticatePracticeSession(fixture.runtime, sessionId);
    const job = (await fixture.admin.query<{ id: string; practice_session_digest: string }>(
      "SELECT id,practice_session_digest FROM app.job WHERE tenant_id=$1 AND practice_session_digest=$2 AND status='live'",
      [DEMO_TENANT_ID, auth.digest],
    )).rows;
    expect(job).toHaveLength(1);
    expect(job[0]!.practice_session_digest).toBe(auth.digest);
    const jobId = job[0]!.id, quoteId = randomUUID(), draftId = randomUUID(), revisionId = randomUUID(), scopeItemId = randomUUID();
    await asFixtureTenant(fixture.admin, DEMO_TENANT_ID, async db => {
      await db.query("INSERT INTO app.quote_version(id,tenant_id,job_id,version,content_hash,net_value_pence,status) VALUES($1,$2,$3,1,$4,110000,'accepted')", [quoteId, DEMO_TENANT_ID, jobId, "b".repeat(64)]);
      await db.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [scopeItemId, DEMO_TENANT_ID, jobId]);
      await db.query("INSERT INTO app.final_account_draft(id,tenant_id,job_id) VALUES($1,$2,$3)", [draftId, DEMO_TENANT_ID, jobId]);
      await db.query(`INSERT INTO app.final_account_revision(id,tenant_id,job_id,final_account_draft_id,revision,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings)
        VALUES($1,$2,$3,$4,1,$5,$6,'GBP','candidate_m1_standard_v1',110000,22000,132000,false,'[]')`, [revisionId, DEMO_TENANT_ID, jobId, draftId, "b".repeat(64), quoteId]);
      await db.query("INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,description,net_pence,ordinal) VALUES($1,$2,$3,$4,'baseline',$5,$6,$5,'Fictional baseline',110000,1)", [randomUUID(), DEMO_TENANT_ID, jobId, revisionId, quoteId, scopeItemId]);
      await db.query("UPDATE app.final_account_draft SET revision=1,current_revision_id=$3 WHERE tenant_id=$1 AND id=$2", [DEMO_TENANT_ID, draftId, revisionId]);
    });
    const scopedPool = practiceMaterialPool(fixture.runtime, auth.digest);
    await prepareInvoicePrerequisites(fixture.admin, scopedPool, DEMO_TENANT_ID, jobId, DEMO_MEMBERSHIP_ID, revisionId);
    const input = { jobId, finalAccountRevisionId: revisionId, actorMembershipId: DEMO_MEMBERSHIP_ID, commandId: randomUUID(), recipient: "practice@example.invalid", issuedOn: "2026-09-19" };

    // Same runtime login, but no scoped proxy and no transaction-local digest.
    const unscoped = new PracticeInvoiceRepository(fixture.runtime);
    const digest = await withTenant(unscoped.pool, auth.context, async db =>
      (await db.$client.query("SELECT nullif(current_setting('app.practice_material_digest',true),'') digest")).rows[0].digest,
    );
    expect(digest).toBeNull();
    const before = await effects();
    expect(before["app.final_account_lock"]!.count).toBe(1);
    expect(before["app.shadow_final_check_completion"]!.count).toBe(1);
    expect(before["app.customer_invoice"]!.count).toBe(0);
    await expect(unscoped.issue(auth.context, input)).rejects.toMatchObject({ message: "FORBIDDEN", code: "42501" });
    const after = await effects();
    expect(Object.fromEntries(Object.entries(after).map(([name, value]) => [name, value.count])))
      .toEqual(Object.fromEntries(Object.entries(before).map(([name, value]) => [name, value.count])));
    expect(after).toEqual(before);

    // Positive control: identical command and ready account succeed with the
    // persisted digest, so the refusal cannot be a missing lock/check failure.
    const issued = await new PracticeInvoiceRepository(scopedPool).issue(auth.context, input);
    expect(issued.totalPence).toBe(132000);
    const success = await effects();
    expect(success["app.customer_invoice"]!.count).toBe(1);
    expect(success["app.command_receipt"]!.count).toBe(before["app.command_receipt"]!.count + 1);
  });
});
