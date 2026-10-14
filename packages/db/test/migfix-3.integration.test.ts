import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { createWatchdogHarness } from "./watchdog-command-harness.js";
import { ProofApplicationRecords } from "../src/proof-application-repository.js";
import { withTenant } from "../src/tenant-context.js";

const h = createWatchdogHarness("migfix-3", 62300);
beforeAll(() => h.boot(), 120000);
afterAll(() => h.stop());
const complete = (jobId: string, evidenceId: string, commandId = randomUUID()) => ({
  version: "proof.complete.v1", commandId, actorMembershipId: h.member, jobId,
  scopeItemId: h.st(jobId).scope, stage: "electrical-stage", evidenceId,
  requiredEvidenceType: "electrical_certificate", decisionId: null, deriveDecision: true,
});
const invalidation = (evidenceId: string, commandId = randomUUID()) => ({
  version: "proof.invalidate.v1", commandId, actorMembershipId: h.member, evidenceId, reasonCode: "object_revoked",
});
async function replacement(jobId: string, suffix: string) {
  const upload = await h.repos.evidence.beginUpload(h.ctx, { jobId, scopeItemId: h.st(jobId).scope,
    expectedSha256: h.pngHash, contentType: "image/png", maximumBytes: 100,
    expiresAt: new Date("2099-01-01") });
  h.storage.put(upload.objectKey, suffix, h.png);
  await h.repos.evidence.finalize(h.ctx, { commandId: randomUUID(), uploadId: upload.id,
    objectVersionId: suffix, evidenceType: "electrical_certificate" });
  return upload.id;
}
async function initial() {
  const job = await h.live(), evidence = await h.pre.evidence(job);
  const command = complete(job, evidence);
  const result = await h.repos.proof.complete(h.ctx, command) as { completionId: string; evidenceId: string; state: string; decisionId: string | null };
  return { job, evidence, command, result };
}
const current = async (job: string) => (await h.admin.query(`SELECT * FROM app.current_stage_proof WHERE job_id=$1`, [job])).rows;

describe("MIGFIX-3 original-stage replacement", () => {
  it("[MIGFIX-3.1] replacement proof resolves rework for the original stage", async () => {
    const f = await initial();
    await h.repos.proof.invalidate(h.ctx, invalidation(f.evidence));
    const evidence = await replacement(f.job, "E2");
    const repaired = await h.repos.proof.complete(h.ctx, complete(f.job, evidence)) as { decisionId: string | null };
    expect(await current(f.job)).toEqual([expect.objectContaining({ id: f.result.completionId,
      stage: "electrical-stage", evidence_id: evidence, review_required: false })]);
    expect((await h.admin.query("SELECT id,evidence_link_id FROM app.stage_completion WHERE job_id=$1", [f.job])).rows).toHaveLength(1);
    expect((await h.admin.query("SELECT * FROM app.stage_proof_replacement WHERE job_id=$1", [f.job])).rows).toHaveLength(1);
    expect((await h.admin.query("SELECT resolution FROM app.decision_resolution WHERE tenant_id=$1 AND decision_id=$2", [h.tenant, repaired.decisionId])).rows).toEqual([{ resolution: "approved" }]);
    expect(await h.repos.proof.complete(h.ctx, f.command)).toEqual(f.result);
  });
  it("[MIGFIX-3.2] replacement proof can itself be invalidated and repaired", async () => {
    const f = await initial(); await h.repos.proof.invalidate(h.ctx, invalidation(f.evidence));
    const e2 = await replacement(f.job, "E2"); await h.repos.proof.complete(h.ctx, complete(f.job, e2));
    await h.repos.proof.invalidate(h.ctx, invalidation(e2));
    expect(await current(f.job)).toEqual([expect.objectContaining({ review_required: true, evidence_id: e2 })]);
    await expect(h.repos.proof.complete(h.ctx, complete(f.job, e2))).rejects.toMatchObject({ code: "PROOF_NOT_FINAL" });
    const e3 = await replacement(f.job, "E3"); await h.repos.proof.complete(h.ctx, complete(f.job, e3));
    expect(await current(f.job)).toEqual([expect.objectContaining({ review_required: false, evidence_id: e3 })]);
    const history = (await h.admin.query(`SELECT old.evidence_id previous,new.evidence_id replacement FROM app.stage_proof_replacement r
      JOIN app.evidence_invalidation old ON(old.tenant_id,old.id)=(r.tenant_id,r.evidence_invalidation_id)
      JOIN app.evidence_link new ON(new.tenant_id,new.id)=(r.tenant_id,r.evidence_link_id) WHERE r.job_id=$1 ORDER BY r.generation`, [f.job])).rows;
    expect(history).toEqual([{ previous: f.evidence, replacement: e2 }, { previous: e2, replacement: e3 }]);
  });
  it("[MIGFIX-3.3] invalidation replays once and rejects changed payloads", async () => {
    const f = await initial(), command = invalidation(f.evidence);
    const records = new ProofApplicationRecords(h.runtime);
    const spec = { commandId: command.commandId, jobId: f.job, action: "invalidate" as const, requestHash: "a".repeat(64) };
    const response = { version: "fixture.v1", reviewRequired: true };
    const run = () => h.repos.proof.invalidate(h.ctx, command, async db => { await records.recordIn(db, h.tenant, { ...spec, response }); });
    const first = await run(); expect(await run()).toEqual(first);
    expect(await records.replay(h.ctx, { ...spec, actorMembershipId: h.member })).toEqual({ response });
    for (const change of [{ evidenceId: randomUUID() }, { reasonCode: "wrong_subject" }])
      await expect(h.repos.proof.invalidate(h.ctx, { ...command, ...change })).rejects.toMatchObject({ code: "COMMAND_CONFLICT" });
    await expect(records.replay(h.ctx, { ...spec, jobId: randomUUID(), actorMembershipId: h.member })).rejects.toMatchObject({ code: "COMMAND_CONFLICT" });
    await expect(h.repos.proof.complete(h.ctx, complete(f.job, f.evidence, command.commandId))).rejects.toMatchObject({ code: "COMMAND_CONFLICT" });
    const rows = (await h.admin.query("SELECT payload FROM app.audit_event WHERE event_type='proof.rework_required' AND subject_ref=$1", [f.evidence])).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].payload.references.invalidationId).toBe((await h.admin.query("SELECT id FROM app.evidence_invalidation WHERE evidence_id=$1", [f.evidence])).rows[0].id);
    await h.repos.proof.invalidate(h.ctx, invalidation(f.evidence));
    expect((await h.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE event_type='proof.rework_required' AND subject_ref=$1", [f.evidence])).rows[0].n).toBe(1);
  });
  it("[MIGFIX-3.4] identical and conflicting command IDs have one durable result and old identities collide", async () => {
    const f = await initial(), c = invalidation(f.evidence);
    const answers = await Promise.all([h.repos.proof.invalidate(h.ctx, c), h.repos.proof.invalidate(h.ctx, c)]);
    expect(answers[0]).toEqual(answers[1]);
    const other = await h.live(), e = await h.pre.evidence(other), id = randomUUID();
    const raced = await Promise.allSettled([h.repos.proof.invalidate(h.ctx, invalidation(e, id)),
      h.repos.proof.invalidate(h.ctx, { ...invalidation(e, id), reasonCode: "wrong_subject" })]);
    expect(raced.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(raced.filter(r => r.status === "rejected")).toHaveLength(1);
    await expect(h.repos.proof.invalidate(h.ctx, invalidation(e, f.command.commandId))).rejects.toMatchObject({ code: "COMMAND_CONFLICT" });
    await expect(withTenant(h.runtime, h.ctx, db => db.$client.query(`INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id)
      VALUES($1::uuid,$2::uuid,'fixture.command',$2::text,repeat('a',64),'processing',$3)`, [h.tenant, c.commandId, h.member]))).rejects.toThrow(/IDEMPOTENCY_CONFLICT/);
  });
  it("[MIGFIX-3.5] response failure rolls back effects; revoked and expired actors fail before effects", async () => {
    const f = await initial(), c = invalidation(f.evidence);
    await expect(h.repos.proof.invalidate(h.ctx, c, async () => { throw new Error("response_failed"); })).rejects.toThrow("response_failed");
    for (const table of ["evidence_invalidation", "proof_invalidation_command"])
      expect((await h.admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1 AND ${table === "evidence_invalidation" ? "evidence_id" : "command_id"}=$2`, [h.tenant, table === "evidence_invalidation" ? f.evidence : c.commandId])).rows[0].n).toBe(0);
    expect((await h.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE event_type='proof.rework_required' AND subject_ref=$1", [f.evidence])).rows[0].n).toBe(0);
    for (const column of ["revoked_at", "expires_at"]) {
      await h.admin.query(`UPDATE app.membership SET ${column}=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND id=$2`, [h.tenant, h.otherMember]);
      await expect(h.repos.proof.invalidate(h.ctx, { ...c, actorMembershipId: h.otherMember })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await h.admin.query(`UPDATE app.membership SET ${column}=NULL WHERE tenant_id=$1 AND id=$2`, [h.tenant, h.otherMember]);
    }
  });
  it("[MIGFIX-3.6 B1/B3a] invalidation upload lock prevents completion using a stale eligibility snapshot", async () => {
    const job = await h.live(), e = await h.pre.evidence(job), upload = await h.admin.connect();
    await upload.query("BEGIN");
    try {
      await upload.query("SELECT 1 FROM app.evidence_upload WHERE tenant_id=$1 AND id=$2 FOR UPDATE", [h.tenant, e]);
      const pending = h.repos.proof.complete(h.ctx, complete(job, e));
      // Poll the server's lock catalogue: this is a barrier, not a timed guess.
      let waiting = false;
      for (let i = 0; i < 100 && !waiting; i++) {
        waiting = (await h.admin.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%evidence_upload%') waiting")).rows[0].waiting;
        if (!waiting) await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
      await upload.query("INSERT INTO app.evidence_invalidation(id,tenant_id,evidence_id,actor_membership_id,reason_code)VALUES($1,$2,$3,$4,'object_revoked')", [randomUUID(), h.tenant, e, h.member]);
      await upload.query("COMMIT");
      await expect(pending).rejects.toMatchObject({ code: "PROOF_NOT_FINAL" });
      expect((await h.admin.query("SELECT * FROM app.stage_completion WHERE job_id=$1", [job])).rows).toHaveLength(0);
    } finally { await upload.query("ROLLBACK"); upload.release(); }
  });
  it("[MIGFIX-3.6 B1/B3a] completion holding the upload commits before invalidation records original-stage rework", async () => {
    const job = await h.live(), evidence = await h.pre.evidence(job);
    let resume!: () => void, reached!: () => void;
    const suspended = new Promise<void>(resolve => { resume = resolve; });
    const ready = new Promise<void>(resolve => { reached = resolve; });
    const completion = h.repos.proof.complete(h.ctx, complete(job, evidence), async () => { reached(); await suspended; });
    await ready;
    const invalidating = h.repos.proof.invalidate(h.ctx, invalidation(evidence));
    try {
      let waiting = false;
      for (let i = 0; i < 100 && !waiting; i++) {
        waiting = (await h.admin.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'SELECT app.invalidate_proof_command%') waiting")).rows[0].waiting;
        if (!waiting) await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
    } finally { resume(); }
    await Promise.all([completion, invalidating]);
    expect(await current(job)).toEqual([expect.objectContaining({ review_required: true })]);
    expect((await h.admin.query("SELECT * FROM app.stage_review_event r JOIN app.stage_completion s ON(s.tenant_id,s.id)=(r.tenant_id,r.stage_completion_id) WHERE s.job_id=$1", [job])).rows).toHaveLength(1);
  });
  it("[MIGFIX-3.4/5] replacement retries are unique and response failures leave rework outstanding", async () => {
    const f = await initial(); await h.repos.proof.invalidate(h.ctx, invalidation(f.evidence));
    const evidence = await replacement(f.job, "replacement-retry"), c = complete(f.job, evidence);
    await expect(h.repos.proof.complete(h.ctx, c, async () => { throw new Error("replacement_response_failed"); })).rejects.toThrow("replacement_response_failed");
    expect(await current(f.job)).toEqual([expect.objectContaining({ evidence_id: f.evidence, review_required: true })]);
    expect((await h.admin.query("SELECT * FROM app.stage_proof_replacement WHERE job_id=$1", [f.job])).rows).toHaveLength(0);
    const answers = await Promise.all([h.repos.proof.complete(h.ctx, c), h.repos.proof.complete(h.ctx, c)]);
    expect(answers[0]).toEqual(answers[1]);
    expect((await h.admin.query("SELECT * FROM app.stage_proof_replacement WHERE job_id=$1", [f.job])).rows).toHaveLength(1);
  });
  it("[MIGFIX-3.5] a missing audit event refuses commit and rolls back the checked invalidation", async () => {
    const f = await initial(), command = randomUUID();
    await expect(withTenant(h.runtime, h.ctx, db => db.$client.query("SELECT app.invalidate_proof_command($1,$2,$3,$4,'object_revoked',$5)",
      [h.tenant,command,h.member,f.evidence,"a".repeat(64)]))).rejects.toThrow(/PROOF_AUDIT_REQUIRED|foreign key/);
    expect((await h.admin.query("SELECT * FROM app.proof_invalidation_command WHERE command_id=$1", [command])).rows).toHaveLength(0);
    expect((await h.admin.query("SELECT * FROM app.evidence_invalidation WHERE evidence_id=$1", [f.evidence])).rows).toHaveLength(0);
  });
  it("[MIGFIX-3.5/7] authority precedes lifecycle and invalid proof keeps PROOF_NOT_FINAL", async () => {
    const job = await h.live(), evidence = await h.pre.evidence(job), actor = randomUUID();
    for (const jobId of [job,randomUUID()]) await expect(h.repos.proof.complete(h.ctx, { ...complete(job,evidence), jobId, actorMembershipId: actor })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await h.admin.query("UPDATE app.job SET status='invoiced' WHERE id=$1", [job]);
    await expect(h.repos.proof.complete(h.ctx, { ...complete(job,evidence), actorMembershipId: actor })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const live = await h.live(), valid = await h.pre.evidence(live);
    for (const change of [{ evidenceId: randomUUID() }, { requiredEvidenceType: "wrong_type" }, { scopeItemId: randomUUID() }]) {
      await expect(h.repos.proof.complete(h.ctx, { ...complete(live,valid), ...change })).rejects.toMatchObject({ code: "PROOF_NOT_FINAL" });
    }
  });
  it("[MIGFIX-3.7] pending, rejected, wrong-job and foreign-tenant evidence cannot repair a stage", async () => {
    const f = await initial(); await h.repos.proof.invalidate(h.ctx, invalidation(f.evidence));
    const upload = await h.repos.evidence.beginUpload(h.ctx, { jobId: f.job, scopeItemId: h.st(f.job).scope,
      expectedSha256: h.pngHash, contentType: "image/png", maximumBytes: 100, expiresAt: new Date("2099-01-01") });
    for (const state of ["pending","rejected"]) {
      if(state === "rejected") await h.admin.query("UPDATE app.evidence_upload SET state='rejected',rejection_code='content_mismatch' WHERE id=$1", [upload.id]);
      await expect(h.repos.proof.complete(h.ctx, complete(f.job,upload.id))).rejects.toMatchObject({ code: "PROOF_NOT_FINAL" });
    }
    const otherJob = await h.live(), otherEvidence = await h.pre.evidence(otherJob);
    await expect(h.repos.proof.complete(h.ctx, complete(f.job,otherEvidence))).rejects.toMatchObject({ code: "PROOF_NOT_FINAL" });
    const foreign = testTenantContext(randomUUID());
    for (const table of ["stage_proof_replacement","proof_invalidation_command","proof_invalidation_response"])
      expect(await withTenant(h.runtime,foreign,async db => (await db.$client.query(`SELECT * FROM app.${table}`)).rows)).toEqual([]);
    await expect(h.repos.proof.complete(foreign,complete(f.job,f.evidence))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("[MIGFIX-3.7] new history is tenant-isolated, append-only and has no runtime write grants", async () => {
    for (const table of ["stage_proof_replacement", "proof_invalidation_command", "proof_invalidation_response"]) {
      const flags = (await h.admin.query(`SELECT relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) owner,
        has_table_privilege('jobguard_runtime',oid,'INSERT,UPDATE,DELETE,TRUNCATE') writable FROM pg_class WHERE oid=$1::regclass`, [`app.${table}`])).rows[0];
      expect(flags).toEqual({ relrowsecurity: true, relforcerowsecurity: true, owner: "jobguard_migration", writable: false });
      await expect(withTenant(h.runtime, h.ctx, db => db.$client.query(`DELETE FROM app.${table}`))).rejects.toThrow(/permission denied/);
    }
  });
  const receipt = (id: string) => ({ text: `INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id)
    VALUES($1::uuid,$2::uuid,'fixture.command',$2::text,repeat('a',64),'processing',$3)`, values: [h.tenant, id, h.member] });
  it("[MIGFIX-3.4] an unlocked command_receipt insert racing an invalidation with the same id never commits in both namespaces (both orders)", async () => {
    // Receipt first (uncommitted, no per-id reservation of its own beyond the guard): the invalidation waits for it, then finds it committed.
    const f = await initial(), id = randomUUID(), holder = await h.admin.connect();
    await holder.query("BEGIN");
    try {
      await holder.query(receipt(id));
      const pending = h.repos.proof.invalidate(h.ctx, invalidation(f.evidence, id)), outcome = expect(pending).rejects.toMatchObject({ code: "COMMAND_CONFLICT" });
      let waiting = false;
      for (let i = 0; i < 200 && !waiting; i++) {
        waiting = (await h.admin.query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype IN('transactionid','advisory') AND NOT granted) waiting")).rows[0].waiting;
        if (!waiting) await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
      await holder.query("COMMIT");
      await outcome;
    } finally { await holder.query("ROLLBACK"); holder.release(); }
    expect((await h.admin.query("SELECT * FROM app.proof_invalidation_command WHERE command_id=$1", [id])).rows).toHaveLength(0);
    expect((await h.admin.query("SELECT * FROM app.evidence_invalidation WHERE evidence_id=$1", [f.evidence])).rows).toHaveLength(0);
    // Invalidation first (suspended before commit): the unlocked receipt insert waits for it and then fails rather than slipping in beside it.
    const id2 = randomUUID();
    let resume!: () => void, reached!: () => void;
    const suspended = new Promise<void>(resolve => { resume = resolve; }), ready = new Promise<void>(resolve => { reached = resolve; });
    const invalidating = h.repos.proof.invalidate(h.ctx, invalidation(f.evidence, id2), async () => { reached(); await suspended; });
    await ready;
    const racing = h.admin.query(receipt(id2)), refused = expect(racing).rejects.toThrow(/IDEMPOTENCY_CONFLICT/);
    try {
      let waiting = false;
      for (let i = 0; i < 200 && !waiting; i++) {
        waiting = (await h.admin.query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype IN('transactionid','advisory') AND NOT granted) waiting")).rows[0].waiting;
        if (!waiting) await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
    } finally { resume(); }
    await refused;
    await invalidating;
    expect((await h.admin.query("SELECT * FROM app.command_receipt WHERE command_id=$1", [id2])).rows).toHaveLength(0);
    expect((await h.admin.query("SELECT * FROM app.proof_invalidation_command WHERE command_id=$1", [id2])).rows).toHaveLength(1);
  });
  it("[MIGFIX-3.7] every 0152 routine is migration-owned, SECURITY DEFINER, search_path pinned and has exact EXECUTE grantees; nothing in app is runtime-owned", async () => {
    const routines = (await h.admin.query(`SELECT p.proname,pg_get_userbyid(p.proowner) owner,p.prosecdef,p.proconfig,
      has_function_privilege('jobguard_runtime',p.oid,'EXECUTE') runtime,has_function_privilege('jobguard_infrastructure',p.oid,'EXECUTE') infrastructure,
      has_function_privilege('public',p.oid,'EXECUTE') public_
      FROM pg_proc p WHERE p.pronamespace='app'::regnamespace AND p.proname = ANY($1) ORDER BY p.proname`,
      [["require_proof_writer","guard_proof_command_namespace","invalidate_proof_command","record_invalidation_response","replace_stage_proof","verify_proof_history_audit"]])).rows;
    expect(routines.map(r => r.proname)).toEqual(["guard_proof_command_namespace","invalidate_proof_command","record_invalidation_response","replace_stage_proof","require_proof_writer","verify_proof_history_audit"]);
    const runtimeCallable = new Set(["invalidate_proof_command","record_invalidation_response","replace_stage_proof"]);
    for (const r of routines)
      expect(r, r.proname).toMatchObject({ owner: "jobguard_migration", prosecdef: true, proconfig: ["search_path=pg_catalog, app"],
        runtime: runtimeCallable.has(r.proname), infrastructure: false, public_: false });
    expect((await h.admin.query("SELECT proname FROM pg_proc WHERE pronamespace='app'::regnamespace AND pg_get_userbyid(proowner)='jobguard_runtime'")).rows).toEqual([]);
    expect((await h.admin.query("SELECT relname FROM pg_class WHERE relnamespace='app'::regnamespace AND pg_get_userbyid(relowner)='jobguard_runtime'")).rows).toEqual([]);
  });
});
