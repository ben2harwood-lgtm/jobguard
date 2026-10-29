// CI PostgreSQL only. All jobs, sessions, cash and evidence are fictional.
import { evaluateBillabilityPolicy } from "@jobguard/core";
import { createHash, randomUUID } from "node:crypto";
import { beforeAll, afterAll, expect, it } from "vitest";
import { createFinalCheckFixture, closeFinalCheckFixture, seedFinalCheckJob, finalCheckTenant, type FinalCheckFixture } from "./final-check-fixture.js";
import { realReceiptFixture } from "./stored-receipt-case-fixture.js";
import { StoredReceiptCaseAllocationRepository } from "../src/stored-receipt-case-allocation-repository.js";
import { RecoveryBillabilityRepository } from "../src/recovery-billability-repository.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
let f: FinalCheckFixture;
const environment = process.env.JOBGUARD_ENV;
beforeAll(async () => { f = await createFinalCheckFixture(); }, 120000);
afterAll(async () => { if (f) await closeFinalCheckFixture(f); if (environment === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = environment; });
type Fixture = Awaited<ReturnType<typeof realReceiptFixture>>;
const repo = () => new RecoveryBillabilityRepository(f.runtime, "synthetic_demo");
async function allocate(x: Fixture) {
  const revision = (await f.admin.query("SELECT revision FROM app.recovery_case_current WHERE tenant_id=$1 AND id=$2", [x.context.tenantId, x.caseId])).rows[0].revision;
  const p = { version: "stored-receipt-case-command.v1", commandId: randomUUID(), action: "review", factLineId: x.fact.lineAllocationId, caseId: x.caseId, workId: x.workId, expectedCaseRevision: revision };
  const r = new StoredReceiptCaseAllocationRepository(f.runtime, "synthetic_demo"), review = await r.command(x.context, x.jobId, x.auth.digest, p);
  return r.command(x.context, x.jobId, x.auth.digest, { ...p, action: "approve", commandId: randomUUID(), reviewId: review.reviewId, approvalHash: review.approvalHash });
}
async function ready() {
  const x = await realReceiptFixture(f); await allocate(x);
  const revision = (await f.admin.query("SELECT revision FROM app.recovery_case_current WHERE tenant_id=$1 AND id=$2", [x.context.tenantId, x.caseId])).rows[0].revision;
  const command = { version: "recovery-billability-command.v1", action: "review", commandId: randomUUID(), caseId: x.caseId, workId: x.workId, lineId: x.line, expectedCaseRevision: revision, claimedEligiblePrincipalPence: 80000, reasons: "Fictional reviewed catch" };
  return { x, command };
}
async function ownerSession(x: Fixture, samePerson = false) {
  const user = samePerson ? x.actor.identityUserId : randomUUID(), member = samePerson ? x.actor.membershipId : randomUUID();
  const digest = createHash("sha256").update(randomUUID()).digest("hex");
  await f.admin.query("INSERT INTO identity.identity_user(id) VALUES($1) ON CONFLICT DO NOTHING", [user]);
  await finalCheckTenant(f.admin, x.context.tenantId, async db => {
    if (!samePerson) {
      const account = (await db.query("SELECT account_id FROM app.membership WHERE tenant_id=$1 AND id=$2", [x.context.tenantId, x.actor.membershipId])).rows[0].account_id;
      await db.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [member, x.context.tenantId, account, user]);
    }
  });
  await f.admin.query("INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at) VALUES($1,$2,'synthetic_demo',$3,$4,clock_timestamp()+interval '1 hour')", [randomUUID(), user, digest, randomUUID()]);
  return { digest, member };
}
const approval = (p: Awaited<ReturnType<typeof ready>>["command"]) => {
  const { claimedEligiblePrincipalPence: _principal, reasons: _reasons, ...base } = p;
  return { ...base, action: "approve", commandId: randomUUID(), reviewCommandId: p.commandId };
};
const send = (x: Fixture, command: unknown, digest = x.auth.digest) => repo().command(x.context, x.jobId, digest, command);

it("stored-fact derivation rejects caller allocationState, disclosedBeforeLock, builderCaptured and lockId", async () => {
  const { x, command } = await ready();
  for (const [key, value] of Object.entries({ allocationState: "available", disclosedBeforeLock: false, builderCaptured: false, lockId: randomUUID(), finalAccountLockId: randomUUID() })) {
    await expect(send(x, { ...command, [key]: value })).rejects.toThrow("INVALID_BILLABILITY_INPUT");
    await expect(finalCheckTenant(f.runtime, x.context.tenantId, db => db.query("SELECT app.recovery_billability($1,$2,$3::jsonb)", [x.jobId, x.auth.digest, { ...command, [key]: value }]))).rejects.toThrow("INVALID_BILLABILITY_INPUT");
  }
  const result = await send(x, command);
  expect(result).toMatchObject({ snapshot: { allocationState: "available", builderCaptured: false, disclosedBeforeLock: false, finalAccountLockId: x.fact.invoiceBinding.lockId }, assessment: { classification: "eligible_for_review" } });
});
it("UNIQUE(tenant, command_id) replays the first review and approval; different input conflicts", async () => {
  const { x, command } = await ready(), reviewer = await ownerSession(x);
  const [first, replay] = await Promise.all([send(x, command), send(x, command)]);
  expect(replay).toEqual(first);
  await expect(send(x, { ...command, reasons: "Different reason" })).rejects.toThrow("BILLABILITY_REPLAY_CONFLICT");
  const p = approval(command), approved = await send(x, p, reviewer.digest);
  expect(await send(x, p, reviewer.digest)).toEqual(approved);
  await expect(send(x, { ...p, reviewCommandId: randomUUID() }, reviewer.digest)).rejects.toThrow("BILLABILITY_REPLAY_CONFLICT");
  expect(approved).toMatchObject({ productionEnabled: false, approvedBy: { membershipId: reviewer.member } });
  expect((await f.admin.query("SELECT count(*)::int n FROM app.recovery_billability_command WHERE tenant_id=$1 AND job_id=$2", [x.context.tenantId, x.jobId])).rows[0].n).toBe(2);
});
it("approver = requester refused in database, including a different session for the same membership", async () => {
  const { x, command } = await ready(); await send(x, command); const same = await ownerSession(x, true);
  await expect(finalCheckTenant(f.runtime, x.context.tenantId, db => db.query("SELECT app.recovery_billability($1,$2,$3::jsonb)", [x.jobId, same.digest, approval(command)]))).rejects.toThrow("BILLABILITY_FORBIDDEN");
});
it("the same person with two owner memberships cannot approve their own review in the database", async () => {
  const { x, command } = await ready(); await send(x, command);
  const same = await ownerSession(x, true), secondMembership = randomUUID();
  await finalCheckTenant(f.admin, x.context.tenantId, async db => {
    const account = (await db.query("SELECT account_id FROM app.membership WHERE tenant_id=$1 AND id=$2", [x.context.tenantId, x.actor.membershipId])).rows[0].account_id;
    await db.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [secondMembership, x.context.tenantId, account, x.actor.identityUserId]);
  });
  // The session person matches two active owners: never choose either arbitrarily.
  await expect(finalCheckTenant(f.runtime, x.context.tenantId, db => db.query("SELECT app.recovery_billability($1,$2,$3::jsonb)", [x.jobId, same.digest, approval(command)]))).rejects.toThrow("BILLABILITY_FORBIDDEN");
  // With only the second membership active, resolution is unambiguous but the
  // stored requester person must still forbid approval. The transaction rolls back.
  await expect(finalCheckTenant(f.admin, x.context.tenantId, async db => {
    await db.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [x.context.tenantId, x.actor.membershipId]);
    await db.query("SELECT app.recovery_billability($1,$2,$3::jsonb)", [x.jobId, same.digest, approval(command)]);
  })).rejects.toThrow("BILLABILITY_FORBIDDEN");
  // Even bypassing the command routine cannot persist same-person approval
  // under another membership: the identity-bound foreign keys and CHECK apply.
  await expect(finalCheckTenant(f.admin, x.context.tenantId, db => db.query(`
    INSERT INTO app.recovery_billability_command(tenant_id,command_id,job_id,case_id,
      actor_membership_id,requester_membership_id,actor_identity_user_id,requester_identity_user_id,
      action,review_command_id,payload,result)
    SELECT tenant_id,$3,job_id,case_id,$4,requester_membership_id,
      requester_identity_user_id,requester_identity_user_id,'approve',command_id,payload,result
    FROM app.recovery_billability_command WHERE tenant_id=$1 AND command_id=$2`,
    [x.context.tenantId, command.commandId, randomUUID(), secondMembership]))).rejects.toThrow("check constraint");
});
it("audit failure rolls back eligibility and command; successful retry records one audit", async () => {
  const { x, command } = await ready();
  await f.admin.query(`CREATE FUNCTION app.m42_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='recovery.billability.review' THEN RAISE EXCEPTION 'M42_AUDIT_FAILURE'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER m42_audit_failure BEFORE INSERT ON app.audit_event FOR EACH ROW EXECUTE FUNCTION app.m42_audit_failure()`);
  try { await expect(send(x, command)).rejects.toThrow("M42_AUDIT_FAILURE"); }
  finally { await f.admin.query("ALTER TABLE app.audit_event DISABLE TRIGGER m42_audit_failure"); }
  expect((await f.admin.query("SELECT count(*)::int n FROM app.recovery_billability_command WHERE tenant_id=$1 AND command_id=$2", [x.context.tenantId, command.commandId])).rows[0].n).toBe(0);
  await send(x, command); await send(x, command);
  const events = (await f.admin.query("SELECT payload FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2 AND event_type='recovery.billability.review'", [x.context.tenantId, x.jobId])).rows;
  expect(events).toHaveLength(1); expect(JSON.stringify(events)).not.toContain(command.reasons);
});
it.each(["refund", "evidence", "membership"] as const)("%s after review prevents approval without changing history", async kind => {
  const { x, command } = await ready(), reviewer = await ownerSession(x); const first = await send(x, command);
  if (kind === "refund") await x.invoices.reverseReceipt(x.context, { jobId: x.jobId, invoiceId: x.invoiceId, paymentId: x.paymentId, actorMembershipId: x.actor.membershipId, commandId: randomUUID(), reason: "Fictional refund" });
  else if (kind === "evidence") await finalCheckTenant(f.admin, x.context.tenantId, db => db.query("INSERT INTO app.evidence_invalidation(id,tenant_id,evidence_id,actor_membership_id,reason_code) VALUES($1,$2,$3,$4,'verification_invalid')", [randomUUID(), x.context.tenantId, x.evidence, x.actor.membershipId]));
  else await f.admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [x.context.tenantId, reviewer.member]);
  await expect(send(x, approval(command), reviewer.digest)).rejects.toThrow();
  expect(await send(x, command)).toEqual(first);
});
it("reversal before allocation cannot create qualifying cash", async () => {
  const x = await realReceiptFixture(f);
  await x.invoices.reverseReceipt(x.context, { jobId: x.jobId, invoiceId: x.invoiceId, paymentId: x.paymentId, actorMembershipId: x.actor.membershipId, commandId: randomUUID(), reason: "Fictional early reversal" });
  await expect(allocate(x)).rejects.toThrow();
});
it("cross-tenant and wrong-job requests, pre-lock reads, raw table reads and live mode stay closed", async () => {
  const { x, command } = await ready(), other = await realReceiptFixture(f);
  await expect(repo().command(testTenantContext(randomUUID()), x.jobId, x.auth.digest, command)).rejects.toThrow();
  await expect(repo().command(x.context, other.jobId, x.auth.digest, command)).rejects.toThrow();
  const unlocked = await seedFinalCheckJob(f);
  await expect(repo().command(unlocked.context, unlocked.jobId, unlocked.digest, command)).rejects.toThrow("BILLABILITY_FORBIDDEN");
  await expect(finalCheckTenant(f.runtime, x.context.tenantId, db => db.query("SELECT * FROM app.recovery_billability_command"))).rejects.toThrow("permission denied");
  for (const mode of ["production", "pilot_no_charge", "unconfigured"]) await expect(new RecoveryBillabilityRepository(f.runtime, mode).command(x.context, x.jobId, x.auth.digest, command)).rejects.toThrow("BILLABILITY_FORBIDDEN");
});
// Attack the INSERT guard through an admin transaction that always rolls back.
// Immutable source corruption is deliberately confined to adversarial tests.
async function cloneAllocation(x: Fixture, change: string, values: unknown[] = []) {
  return finalCheckTenant(f.admin, x.context.tenantId, async db => {
    await db.query("CREATE TEMP TABLE m42_allocation AS SELECT * FROM app.stored_receipt_case_allocation WHERE tenant_id=$1 AND job_id=$2 LIMIT 1", [x.context.tenantId, x.jobId]);
    await db.query("UPDATE m42_allocation SET id=gen_random_uuid(),command_id=gen_random_uuid()");
    await db.query(change, values);
    await db.query("INSERT INTO app.stored_receipt_case_allocation SELECT * FROM m42_allocation");
    throw new Error("GUARD_FAILED_TO_REJECT");
  });
}
it("#346 allocation writer refuses a receipt/feed event from another job of the same tenant", async () => {
  const { x } = await ready(), other = await realReceiptFixture(f);
  const movement = (await f.admin.query("SELECT movement_id,movement_hash FROM app.receipt_allocation_fact_source WHERE tenant_id=$1 AND job_id=$2 LIMIT 1", [x.context.tenantId, other.jobId])).rows[0];
  await expect(cloneAllocation(x, `ALTER TABLE app.receipt_allocation_fact_source DISABLE TRIGGER USER;
    UPDATE app.receipt_allocation_fact_source SET movement_id='${movement.movement_id}',movement_hash='${movement.movement_hash}' WHERE job_id='${x.jobId}';
    ALTER TABLE app.receipt_allocation_fact_source ENABLE TRIGGER USER`)).rejects.toThrow("BILLABILITY_ALLOCATION_JOB_REQUIRED");
});
it("#356 allocation writer refuses cumulative principal over line net", async () => {
  const { x } = await ready();
  await expect(cloneAllocation(x, "UPDATE m42_allocation SET id=gen_random_uuid()")).rejects.toThrow("RECEIPT_LINE_CAPACITY_EXCEEDED");
});
it("#356 two work items cannot cite the same line", async () => {
  const { x } = await ready();
  await expect(cloneAllocation(x, "UPDATE m42_allocation SET work_id=gen_random_uuid()")).rejects.toThrow("BILLABILITY_ALLOCATION_LINE_ALREADY_BOUND");
});
it("#368 line from a different or unlocked revision refused; supplementary descendant accepted", async () => {
  const { x, command } = await ready();
  expect(await send(x, command)).toMatchObject({ assessment: { classification: "eligible_for_review" } });
  await expect(cloneAllocation(x, `ALTER TABLE app.final_account_line DISABLE TRIGGER USER;
    UPDATE app.final_account_line SET final_account_revision_id='${x.lock.finalAccountRevisionId}' WHERE id='${x.line}';
    ALTER TABLE app.final_account_line ENABLE TRIGGER USER`)).rejects.toThrow("STORED_RECEIPT_LINE_BINDING_REQUIRED");
});

it("stored pre-lock disclosure overrides the review request and remains non-billable", async () => {
  const { x } = await ready();
  await expect(finalCheckTenant(f.admin, x.context.tenantId, async db => {
    await db.query("ALTER TABLE app.shadow_commercial_signal DISABLE TRIGGER USER");
    await db.query("UPDATE app.shadow_commercial_signal SET disclosed_before_lock=true WHERE tenant_id=$1 AND job_id=$2", [x.context.tenantId, x.jobId]);
    await db.query("ALTER TABLE app.shadow_commercial_signal ENABLE TRIGGER USER");
    const snapshot = (await db.query("SELECT app.billability_snapshot($1,$2,$3,$4,$5,$6) snapshot", [x.context.tenantId, x.jobId, x.caseId, x.workId, x.line, x.actor.membershipId])).rows[0].snapshot;
    expect(snapshot.disclosedBeforeLock).toBe(true);
    expect(evaluateBillabilityPolicy(snapshot).classification).toBe("non_billable");
    throw new Error("ROLLBACK_DISCLOSURE_ATTACK");
  })).rejects.toThrow("ROLLBACK_DISCLOSURE_ATTACK");
});
