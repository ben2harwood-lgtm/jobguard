import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { EvidencePackRepository, EvidenceService, FinalAccountLockRepository, PracticeInvoiceRepository, ProofCommandService, verifiedTenantContextFromMembership, withTenant, type AuthenticatedMembership } from "../src/index.js";
import { LOCK_OWNER, LOCK_USER, seedAccount, publishFixtureCompletion } from "./sv5pre-fixtures.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { MemoryStorage, pngBytes } from "./site-extra-evidence-fixtures.js";
import { auditActorAttribution, verifyAuditChain, type AuditEvent } from "../src/audit.js";
import { jobDoorsActor, jobDoorsDatabase, transaction, type JobDoorsDatabase } from "./lp-job-doors-fixtures.js";
import { seedEvidencePackFixture } from "./evidence-pack-fixture.js";
let db: JobDoorsDatabase;
beforeAll(async () => { db = await jobDoorsDatabase(); }, 300_000);
afterAll(async () => { await db?.close(); });
async function principal() {
  const a = await jobDoorsActor(db.owner), credential = randomBytes(32).toString("hex");
  await db.owner.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2)", [`${a.person}@fictional.invalid`, a.person]);
  await db.owner.query("INSERT INTO identity.membership_locator VALUES($1,$2,$3)", [a.person, a.tenant, a.member]);
  await db.owner.query(`INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at)
    VALUES($1,$2,'synthetic_demo',$3,'fictional',clock_timestamp()+interval '1 hour')`, [randomUUID(), a.person, credential]);
  return { ...a, credential };
}
const input = (extra = {}) => ({ id: randomUUID(), version: "audit.v1", actorRef: `membership:${randomUUID()}`,
  eventType: "statement.recorded", subjectType: "job", subjectRef: randomUUID(), payload: {}, ...extra });
const bind = (c: PoolClient, p: Awaited<ReturnType<typeof principal>>) => c.query("SELECT app.bind_request('real',$1,$2)", [p.credential,p.tenant]);
const append = (c: PoolClient, events: unknown[]) => c.query("SELECT * FROM app.append_audit($1)", [JSON.stringify(events)]);
async function chain(tenant: string, owner = db.owner): Promise<AuditEvent[]> {
  return (await owner.query(`SELECT id,version,tenant_id AS "tenantId",sequence::int,actor_ref AS "actorRef",
    event_type AS "eventType",subject_type AS "subjectType",subject_ref AS "subjectRef",payload,
    occurred_at AS "occurredAt",payload_hash AS "payloadHash",previous_hash AS "previousHash",event_hash AS "eventHash"
    FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence`, [tenant])).rows;
}
it("stamps A despite a claim naming B; verifier agrees", async () => {
  const p = await principal(), peer = await jobDoorsActor(db.owner,p.tenant);
  await transaction(db.runtime,p.tenant,async c => { await bind(c,p); await append(c,[input({actorRef:`membership:${peer.member}`})]); });
  const events = await chain(p.tenant); verifyAuditChain(events); expect(events).toHaveLength(1);
  expect(events[0]!.actorRef).toBe(`membership:${p.member}`); expect(auditActorAttribution(events[0]!)).toBe("bound_member");
});
it("refuses unbound runtime despite caller-selected GUCs", async () => {
  const p = await principal();
  await expect(transaction(db.runtime,p.tenant,c => append(c,[input()]))).rejects.toMatchObject({ code: "42501" });
});
it.each(["actor", "tenant", "type", "actorRef", "auditActorKind"])("refuses collision %s across payload sections", async key => {
  const p = await principal();
  for (const section of ["references", "hashes", "classifications"]) {
    await expect(transaction(db.runtime,p.tenant,async c => { await bind(c,p); await append(c,[input({ payload: { [section]: { [key]: "forged" } } })]); }))
      .rejects.toMatchObject({ code: "22023", message: "AUDIT_INPUT_INVALID" });
  }
  expect(await chain(p.tenant)).toEqual([]);
});
it.each(["approval.approved", "payment.settled", "command.completed", "quote.accepted", "invoice.issued"])("refuses generic %s and direct checked sealing", async eventType => {
  const p = await principal();
  await expect(transaction(db.runtime,p.tenant,async c => { await bind(c,p); await append(c,[input({ eventType })]); }))
    .rejects.toMatchObject({ code: "42501", message: "AUDIT_CHECKED_OPERATION_REQUIRED" });
  await expect(transaction(db.runtime,p.tenant,async c => { await bind(c,p); await c.query("SELECT * FROM app.lp4_seal_audit($1,'checked_operation')",[JSON.stringify([input({eventType})])]); }))
    .rejects.toMatchObject({ code: "42501" });
  expect(await chain(p.tenant)).toEqual([]);
});
it("rollback after append restores rows/head; retry commits", async () => {
  const p = await principal(), event = input();
  const head = () => db.owner.query("SELECT sequence,event_hash FROM audit_control.audit_head WHERE tenant_id=$1",[p.tenant]);
  const before = (await head()).rows;
  await expect(transaction(db.runtime,p.tenant,async c => { await bind(c,p); await append(c,[event]); throw new Error("rollback"); })).rejects.toThrow("rollback");
  expect(await chain(p.tenant)).toEqual([]); expect((await head()).rows).toEqual(before);
  await transaction(db.runtime,p.tenant,async c => { await bind(c,p); await append(c,[event]); });
  verifyAuditChain(await chain(p.tenant));
});
it("owner-side checked writers record system work rather than a supplied person", async () => {
  const p = await principal();
  await transaction(db.owner,p.tenant,async c => {
    await c.query("SELECT * FROM app.lp4_seal_audit($1,'checked_operation')",[JSON.stringify([input({actorRef:`membership:${p.member}`,eventType:"payment.settled"})])]);
    await c.query("SELECT app.append_final_lock_audit($1,$2,$3,'final_account.locked',$4)",[randomUUID(),p.member,randomUUID(),JSON.stringify({revisionId:randomUUID()})]);
  });
  const events = await chain(p.tenant); expect(events).toHaveLength(2); verifyAuditChain(events);
  for (const event of events) { expect(auditActorAttribution(event)).toBe("system"); expect(event.actorRef).toBe("system:database:postgres"); }
});
it("rejects a GUC tenant substituted after binding", async () => {
  const p = await principal(), other = await jobDoorsActor(db.owner);
  await expect(transaction(db.runtime,p.tenant,async c => {
    await bind(c,p); await c.query("SELECT set_config('app.tenant_id',$1,true)",[other.tenant]); await append(c,[input()]);
  })).rejects.toMatchObject({code:"42501",message:"AUDIT_CONTEXT_REQUIRED"});
  expect(await chain(p.tenant)).toEqual([]); expect(await chain(other.tenant)).toEqual([]);
});
it("duplicate IDs roll back the whole batch and head", async () => {
  const p = await principal(), event = input();
  await expect(transaction(db.runtime,p.tenant,async c => { await bind(c,p); await append(c,[event,event]); })).rejects.toMatchObject({code:"23505"});
  expect(await chain(p.tenant)).toEqual([]);
  expect((await db.owner.query("SELECT 1 FROM audit_control.audit_head WHERE tenant_id=$1",[p.tenant])).rowCount).toBe(0);
});

it("serializes concurrent bound appends with contiguous authenticated attribution", async () => {
  const p = await principal();
  await Promise.all(Array.from({ length: 4 }, () => transaction(db.runtime,p.tenant,async c => {
    await bind(c,p); await append(c,[input(),input()]);
  })));
  const events = await chain(p.tenant);
  expect(events.map(event => event.sequence)).toEqual([1,2,3,4,5,6,7,8]);
  expect(events.every(event => event.actorRef === `membership:${p.member}` && event.version === "audit.v3")).toBe(true);
  verifyAuditChain(events);
});
it("binding expiry cannot fall back to a system identity during append", async () => {
  const p = await principal();
  const deadline = (await db.owner.query("UPDATE identity.session SET expires_at=clock_timestamp()+interval '5 seconds' WHERE token_digest=$1 RETURNING expires_at",[p.credential])).rows[0].expires_at;
  await expect(transaction(db.runtime,p.tenant,async c => {
    await bind(c,p);
    expect((await c.query("SELECT app.current_actor() actor")).rows[0].actor).toBe(p.member);
    await c.query("SELECT pg_sleep(greatest(0,extract(epoch FROM ($1::timestamptz-clock_timestamp())))+0.02)",[deadline]);
    await append(c,[input()]);
  })).rejects.toMatchObject({code:"42501"});
  expect(await chain(p.tenant)).toEqual([]);
});

it("keeps every retired/private audit overload unavailable to a bound runtime", async () => {
  const p = await principal();
  const names = ["lock_audit_head", "advance_audit_head", "lp4_seal_audit", "append_final_lock_audit", "append_shadow_audit", "append_final_check_audit"];
  const rows = (await db.owner.query<{ name: string; args: string; executable: boolean }>(`
    SELECT p.proname name,oidvectortypes(p.proargtypes) args,
      has_function_privilege('lp2_login',p.oid,'EXECUTE') executable
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='app' AND p.proname=ANY($1::text[]) AND p.prokind='f'`, [names])).rows;
  expect(new Set(rows.map(row => row.name))).toEqual(new Set(names));
  for (const row of rows) {
    expect(row.executable, row.name + "(" + row.args + ")").toBe(false);
    const args = row.args ? row.args.split(", ").map(type => `NULL::${type}`).join(",") : "";
    await expect(transaction(db.runtime,p.tenant,async c => {
      await bind(c,p); await c.query(`SELECT app.${row.name}(${args})`);
    })).rejects.toMatchObject({ code: "42501" });
  }
  expect(await chain(p.tenant)).toEqual([]);
});
it("cannot reuse an authenticated append's binding in the next pooled transaction", async () => {
  const p = await principal(), pool = db.freshRuntime();
  try {
    await transaction(pool,p.tenant,async c => { await bind(c,p); await append(c,[input()]); });
    await expect(transaction(pool,p.tenant,c => append(c,[input()]))).rejects.toMatchObject({ code: "42501" });
    const events = await chain(p.tenant); expect(events).toHaveLength(1); verifyAuditChain(events);
  } finally { await pool.end(); }
});
it("uses a protected binding even for an owner-side checked writer", async () => {
  const p = await principal(), peer = await jobDoorsActor(db.owner,p.tenant);
  await transaction(db.owner,p.tenant,async c => {
    await bind(c,p);
    await c.query("SELECT app.append_final_lock_audit($1,$2,$3,'final_account.locked',$4)",
      [randomUUID(),peer.member,randomUUID(),JSON.stringify({revisionId:randomUUID()})]);
  });
  const events = await chain(p.tenant); verifyAuditChain(events);
  expect(events).toHaveLength(1);
  expect(events[0]!.actorRef).toBe(`membership:${p.member}`);
  expect(auditActorAttribution(events[0]!)).toBe("bound_member");
});
it("refuses a binding that expires while waiting for the audit head", async () => {
  const p = await principal();
  // Create a real head before taking the contended lock.
  await transaction(db.runtime,p.tenant,async c => { await bind(c,p); await append(c,[input()]); });
  const deadline = (await db.owner.query("UPDATE identity.session SET expires_at=clock_timestamp()+interval '5 seconds' WHERE token_digest=$1 RETURNING expires_at",[p.credential])).rows[0].expires_at;
  const blocker = await db.owner.connect(), caller = await db.runtime.connect();
  let outcome: Promise<unknown> | undefined;
  try {
    await caller.query("BEGIN"); await bind(caller,p);
    await caller.query("SELECT set_config('app.tenant_id',$1,true)",[p.tenant]);
    const pid = (await caller.query("SELECT pg_backend_pid() pid")).rows[0].pid;
    await blocker.query("BEGIN");
    await blocker.query("SELECT 1 FROM audit_control.audit_head WHERE tenant_id=$1 FOR UPDATE",[p.tenant]);
    // Capture either outcome immediately, including an unexpected early failure.
    outcome = append(caller,[input()]).then(() => null, (error: unknown) => error);
    let waiting = false;
    for (let attempt = 0; attempt < 200; attempt++) {
      waiting = (await db.owner.query("SELECT cardinality(pg_blocking_pids($1))>0 waiting",[pid])).rows[0].waiting;
      if (waiting) break;
      await db.owner.query("SELECT pg_sleep(0.01)");
    }
    expect(waiting).toBe(true);
    await blocker.query("SELECT pg_sleep(greatest(0,extract(epoch FROM ($1::timestamptz-clock_timestamp())))+0.02)",[deadline]);
    await blocker.query("COMMIT");
    expect(await outcome).toMatchObject({code:"42501"});
  } finally {
    await blocker.query("ROLLBACK"); blocker.release();
    try { await outcome; } finally { await caller.query("ROLLBACK"); caller.release(); }
  }
  const events = await chain(p.tenant); expect(events).toHaveLength(1); verifyAuditChain(events);
});


it("keeps product invoice, payment and proof writes compatible after 0785", async () => {
  const practice = await jobDoorsDatabase(true);
  try {
    expect((await practice.owner.query("SELECT 1 FROM public.jobguard_schema_migration WHERE migration_name='0785_lp6e_audit_attribution.sql'")).rowCount).toBe(1);
    await installLegacySyntheticPartyFixtures(practice.owner);
    const a = await seedAccount(practice.owner), credential = randomBytes(32).toString("hex");
    await practice.owner.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2)", ["lp6e@fictional.invalid", LOCK_USER]);
    await practice.owner.query("INSERT INTO identity.membership_locator VALUES($1,$2,$3)", [LOCK_USER,a.tenantId,LOCK_OWNER]);
    await practice.owner.query(`INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at)
      VALUES($1,$2,'synthetic_demo',$3,'fictional',clock_timestamp()+interval '1 hour')`, [randomUUID(),LOCK_USER,credential]);
    const context = verifiedTenantContextFromMembership({ tenantId:a.tenantId, membershipId:LOCK_OWNER, identityUserId:LOCK_USER } as AuthenticatedMembership, { kind:"real",credential });
    await transaction(practice.owner,a.tenantId,async c => {
      await c.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES($1,$2,'small_builder','synthetic_demo','legacy_synthetic_live_fixture')",[a.tenantId,a.jobId]);
      await c.query("INSERT INTO app.scope_progress(tenant_id,job_id,scope_item_id,stage) VALUES($1,$2,$3,'in_progress')",[a.tenantId,a.jobId,a.scopeItemId]);
    });
    const storage = new MemoryStorage(), bytes = pngBytes(6), evidence = new EvidenceService(practice.runtime,storage);
    const upload = await evidence.beginUpload(context,{ jobId:a.jobId,scopeItemId:a.scopeItemId,
      expectedSha256:createHash("sha256").update(bytes).digest("hex"),contentType:"image/png",maximumBytes:10000,
      retentionClass:"standard_evidence",expiresAt:new Date(Date.now()+3600000) });
    storage.put(upload.objectKey,"lp6e-v1",bytes);
    await evidence.finalize(context,{uploadId:upload.id,objectVersionId:"lp6e-v1",evidenceType:"completion_photo"});
    const proof = await new ProofCommandService(practice.runtime,storage).complete(context,{
      version:"proof.complete.v1",commandId:randomUUID(),actorMembershipId:LOCK_OWNER,jobId:a.jobId,
      scopeItemId:a.scopeItemId,stage:"completion",evidenceId:upload.id,requiredEvidenceType:"completion_photo" });
    expect(proof.state).toBe("complete");
    const locks = new FinalAccountLockRepository(practice.runtime);
    await locks.acceptTerms(context,{actorMembershipId:LOCK_OWNER,commandId:randomUUID(),termsVersion:"synthetic_final_check_terms.v1"});
    await locks.disposition(context,{jobId:a.jobId,actorMembershipId:LOCK_OWNER,commandId:randomUUID(),scopeItemId:a.scopeItemId,disposition:"done"});
    await locks.lock(context,a.input);
    // Only the synthetic detector result is fixture work; product writes use runtime.
    await publishFixtureCompletion(practice.owner,practice.owner,a.tenantId,a.jobId);
    const invoices = new PracticeInvoiceRepository(practice.runtime);
    const invoice = await invoices.issue(context,{jobId:a.jobId,finalAccountRevisionId:a.revisionId,
      actorMembershipId:LOCK_OWNER,commandId:randomUUID(),recipient:"practice-customer@example.invalid",issuedOn:"2026-11-06"});
    const payment = await invoices.recordReceipt(context,{jobId:a.jobId,invoiceId:invoice.id,actorMembershipId:LOCK_OWNER,
      commandId:randomUUID(),paidOn:"2026-11-06",amountPence:100,method:"bank_transfer",reference:"fictional"});
    expect(payment.paymentId).toBeTruthy();
    // Also exercise the formerly reserved hash names through the public SQL writer.
    await withTenant(practice.runtime,context,async tx => {
      await append(tx.$client,[input({payload:{hashes:{payloadHash:"a".repeat(64),payload:"b".repeat(64)}}})]);
    });
    const events = await chain(a.tenantId,practice.owner);
    verifyAuditChain(events);
    for (const eventType of ["customer_invoice.synthetic_issued","customer_payment.synthetic_recorded","proof.completed"]) {
      const event = events.find(e => e.eventType === eventType);
      expect(event).toMatchObject({version:"audit.v3",actorRef:`membership:${LOCK_OWNER}`,
        payload:{references:{auditTrust:"lower_trust",auditActorKind:"bound_member"}}});
    }
  } finally { await practice.close(); }
},300_000);

it.each(["PROOF.COMPLETED", "proof.completed.forged", "customer_payment.recorded.forged"])("refuses a variant of a legacy name: %s", async eventType => {
  const p = await principal();
  await expect(transaction(db.runtime,p.tenant,async c => { await bind(c,p); await append(c,[input({eventType})]); }))
    .rejects.toMatchObject({code:"42501",message:"AUDIT_CHECKED_OPERATION_REQUIRED"});
  expect(await chain(p.tenant)).toEqual([]);
});

it("records attachment approval through the product repository after 0785", async () => {
  await installLegacySyntheticPartyFixtures(db.owner);
  const fixture = await seedEvidencePackFixture(db.owner), credential = randomBytes(32).toString("hex");
  await db.owner.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2)", ["lp6e-pack@fictional.invalid",fixture.identityId]);
  await db.owner.query("INSERT INTO identity.membership_locator VALUES($1,$2,$3)", [fixture.identityId,fixture.tenantId,fixture.memberId]);
  await db.owner.query(`INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at)
    VALUES($1,$2,'synthetic_demo',$3,'fictional',clock_timestamp()+interval '1 hour')`, [randomUUID(),fixture.identityId,credential]);
  const context = verifiedTenantContextFromMembership({ tenantId:fixture.tenantId, membershipId:fixture.memberId,
    identityUserId:fixture.identityId } as AuthenticatedMembership, { kind:"real",credential });
  const repo = new EvidencePackRepository(db.runtime), actorRef = `membership:${fixture.memberId}`;
  const pack = await repo.generate(context,fixture.caseId,{commandId:randomUUID()},actorRef);
  const approval = {commandId:randomUUID(),expectedManifestHash:pack.manifestHash,expectedContentHash:pack.contentHash};
  expect(await repo.approveAttachment(context,fixture.caseId,pack.id,approval,actorRef)).toMatchObject({attachmentApprovalValid:true});
  await repo.approveAttachment(context,fixture.caseId,pack.id,approval,actorRef);
  const events = await chain(fixture.tenantId);
  verifyAuditChain(events);
  const approvals = events.filter(event => event.eventType === "evidence_pack.attachment_approved");
  expect(approvals).toHaveLength(1);
  expect(approvals[0]).toMatchObject({version:"audit.v3",actorRef,subjectRef:pack.id,
    payload:{references:{caseId:fixture.caseId,jobId:fixture.jobId,auditTrust:"lower_trust",auditActorKind:"bound_member"},
      hashes:{manifest:pack.manifestHash,content:pack.contentHash}}});
});
