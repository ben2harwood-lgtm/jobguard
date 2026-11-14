// Real PostgreSQL + actual worker ports. Private synthetic fixture only; no seeded detections.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { withTenant } from "../src/tenant-context.js";
import { practiceMaterialPool } from "../src/practice-session.js";
import { JobSourceRepository } from "../src/job-source-repository.js";
import { FinalCheckRepository } from "../src/final-check-repository.js";
import { FinalCheckCompletionRepository, practiceFinalCheckPorts } from "../src/shadow-detection-repository.js";
import { FinalCheckWorker } from "../../../apps/api/src/final-check.worker.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { createFinalCheckFixture, closeFinalCheckFixture, seedFinalCheckJob, finalCheckTenant, FINAL_CHECK_ACTOR, type FinalCheckFixture } from "./final-check-fixture.js";

let f: FinalCheckFixture;
const diary = "Customer asked for an extra heated towel rail while we were on site. Agreed 180 pounds. Fitted it today.";
const request = "Hi, yes please go ahead and fit the heated towel rail as well. 180 pounds is fine. Thanks.";
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); f = await createFinalCheckFixture(); }, 240000);
afterAll(async () => { await closeFinalCheckFixture(f); vi.unstubAllEnvs(); });
async function setup(note: string | null = diary, message: string | null = request, beforeLock?: (a: Awaited<ReturnType<typeof seedFinalCheckJob>>) => Promise<void>) {
  const a = await seedFinalCheckJob(f), sources = new JobSourceRepository(f.runtime);
  if (message !== null) await sources.intake(a.context, a.jobId, a.digest, "customer_message", { version: "customer-message-input.v1", commandId: randomUUID(), fictionalCustomer: { kind: "named_fictional_customer", name: "Fictional Alex" }, text: message });
  if (note !== null) await sources.intake(a.context, a.jobId, a.digest, "diary", { version: "job-diary-input.v1", commandId: randomUUID(), entryMode: "typed", onSite: false, text: note });
  if (beforeLock) await beforeLock(a);
  await a.lock();
  // LP-6c: shadow-side calls use an unbound tenant context, as main's final-check tests do.
  const shadow = testTenantContext(a.tenantId, { bound: false });
  const repo = new FinalCheckRepository(f.shadow), m = await repo.begin(shadow, a.jobId);
  const ports = practiceFinalCheckPorts(f.shadow, f.runtime, "f".repeat(64));
  const worker = new FinalCheckWorker(ports, "synthetic_demo");
  return { ...a, shadow, repo, m, ports, execute: () => worker.execute(shadow, { version: "final-check.task.v1", jobId: a.jobId, manifestId: m.id }) };
}
it.each([
  [diary, request, 18000],
  ...["£180", "180 pounds", "180 quid", "£180.00"].map(amount => [`Fitted the heated towel rail as an extra. Agreed ${amount}.`, request, 18000] as const),
  ["Fitted the heated towel rail as an extra.", request, 18000],
  [diary, "Please fit the heated towel rail as well.", 18000],
  ["Fitted the heated towel rail as an extra.", "Please fit the heated towel rail as well.", null],
  [diary, request.replace("180 pounds", "200 pounds"), null],
  [diary.replace("180 pounds", "£180 or £200"), request, null],
  [diary.replace("180 pounds", "£180. Agreed £180"), request, null],
  ["Weather was sunny today.", "Thanks for the update.", null],
] as const)("ordinary towel-rail words persist one possible extra with both sources and exact proposed pence: %s", async (note, message, estimate) => {
  const a = await setup(note, message), result = await a.execute() as { runId: string };
  const count = message.startsWith("Thanks") ? 0 : 1;
  const completed = await a.repo.manifest(a.shadow, a.jobId, a.m.id);
  expect(completed.sources.every(s => ["zero_result", "detected"].includes(s.status))).toBe(true);
  if (count === 0) expect(completed.sources.every(s => s.status === "zero_result")).toBe(true);
  const completion = new FinalCheckCompletionRepository(f.shadow), checkId = randomUUID();
  const publication = { version: "final-check-publication.v1" as const, jobId: a.jobId, runId: result.runId, checkId };
  await completion.publish(a.shadow, publication);
  await completion.publish(a.shadow, publication);
  expect(await a.execute()).toMatchObject({ runId: result.runId });
  const view = await new FinalCheckRepository(f.runtime).read(a.context, a.jobId, a.digest);
  expect(view).toMatchObject({ state: "completed" }); expect(view.items).toHaveLength(count);
  if (count) {
    const originalIds = (await f.admin.query("SELECT evidence_id FROM app.job_source_original WHERE tenant_id=$1 AND job_id=$2 ORDER BY evidence_id", [a.tenantId, a.jobId])).rows.map(row => row.evidence_id);
    expect((view.items[0]!.evidence as { id: string }[]).map(e => e.id).sort()).toEqual(originalIds);
    expect(originalIds).toHaveLength(note === null ? 1 : 2);
    const originals = (await f.admin.query("SELECT bytes FROM app.job_source_original WHERE tenant_id=$1 AND job_id=$2", [a.tenantId,a.jobId])).rows.map(row => row.bytes.toString("utf8"));
    expect(originals.sort()).toEqual([message,...(note === null ? [] : [note])].sort());
    expect((await finalCheckTenant(f.admin,a.tenantId,db=>db.query("SELECT estimated_value_pence FROM app.shadow_commercial_signal WHERE tenant_id=$1 AND job_id=$2 AND coalesced_into_signal_id IS NULL",[a.tenantId,a.jobId]))).rows)
      .toEqual([{estimated_value_pence: estimate === null ? null : String(estimate)}]);
    const proposals = (await finalCheckTenant(f.admin, a.tenantId, db => db.query("SELECT estimated_value_pence FROM app.shadow_commercial_signal WHERE tenant_id=$1 AND job_id=$2", [a.tenantId, a.jobId]))).rows;
    if (estimate !== null) expect(proposals.every(p => Number(p.estimated_value_pence) === estimate)).toBe(true);
    else expect(proposals.every(p => p.estimated_value_pence === null)).toBe(true);
  }
  const issueId = randomUUID();
  const issue = () => withTenant(practiceMaterialPool(f.runtime, a.digest), a.context, db => db.$client.query("SELECT app.issue_lock_bound_customer_invoice($1,$2,$3,$4,$5,'final','fictional@example.invalid','2026-11-09'::date,$6)", [a.tenantId, a.jobId, a.revisionId, FINAL_CHECK_ACTOR, issueId, "a".repeat(64)]));
  await issue(); await issue();
  expect((await f.admin.query("SELECT count(*)::int n FROM app.final_account_lock_check WHERE tenant_id=$1 AND job_id=$2", [a.tenantId, a.jobId])).rows[0].n).toBe(1);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.customer_invoice WHERE tenant_id=$1 AND job_id=$2", [a.tenantId, a.jobId])).rows[0].n).toBe(1);
});

it("preserves the reviewed must-surface fixture refusal in the actual worker", async () => {
  const a = await setup(null, "Fictional practice customer request: please build a garden room for £8,000 net; written agreement is required before work starts.");
  expect(await a.ports.process(a.shadow, a.m, a.m.sources[0]!)).toMatchObject({ status: "unsupported", failureCode: "UNSUPPORTED_SOURCE" });
  await expect(a.execute()).rejects.toThrow("FINAL_CHECK_PENDING");
  expect((await a.repo.manifest(a.shadow, a.jobId, a.m.id)).result).toBeNull();
});

it("rejects forged tenant/job/source/version/hash/time/length/frozen bindings at the actual worker port", async () => {
  const a = await setup(), s = a.m.sources[0]!, other = await seedFinalCheckJob(f);
  for (const changed of [
    { ...s, sourceKind: "email" }, { ...s, sourceRef: randomUUID() }, { ...s, evidenceId: randomUUID() },
    { ...s, objectVersionId: "wrong-version" }, { ...s, sha256: "0".repeat(64) }, { ...s, inputHash: "0".repeat(64) },
    { ...s, receivedAt: s.receivedAt.replace("Z", "+00:01") }, { ...s, input: { ...(s.input as object), byte_length: 1 } },
  ]) expect(await a.ports.process(a.shadow, a.m, changed)).toMatchObject({ status: "unsupported" });
  await expect(a.ports.process(testTenantContext(randomUUID(), { bound: false }), a.m, s)).rejects.toThrow();
  await expect(a.ports.process(a.shadow, { ...a.m, comparisons: { ...a.m.comparisons, jobId: other.jobId } }, s)).rejects.toThrow();
  // Another firm/session cannot read or process A's job merely by knowing IDs.
  await expect(new JobSourceRepository(f.runtime).read(a.context, a.jobId, other.digest, "diary")).rejects.toThrow();
  await f.admin.query("UPDATE control_plane.practice_session SET revoked_at=clock_timestamp() WHERE token_digest=$1", [a.digest]);
  expect(await a.ports.process(a.shadow, a.m, s)).toMatchObject({ status: "unsupported", failureCode: "SOURCE_INVALID" });
  await expect(new FinalCheckRepository(f.runtime).read(a.context, a.jobId, a.digest)).rejects.toThrow();
});

it("invalidated sources block completion/publication, and post-lock intake cannot change inventory", async () => {
  const a = await setup(), s = a.m.sources[0]!;
  // Owner-only simulation in this disposable cluster: 0666 refuses invalidating a locked verified source,
  // so bypass triggers for this one insert to model evidence invalidated by other means.
  await finalCheckTenant(f.admin, a.tenantId, async db => { await db.query("SET LOCAL session_replication_role='replica'"); return db.query("INSERT INTO app.evidence_invalidation(id,tenant_id,evidence_id,actor_membership_id,reason_code) VALUES($1,$2,$3,$4,'verification_invalid')", [randomUUID(), a.tenantId, s.evidenceId, FINAL_CHECK_ACTOR]); });
  expect(await a.ports.process(a.shadow, a.m, s)).toMatchObject({ status: "unsupported", failureCode: "SOURCE_INVALID" });
  await expect(a.execute()).rejects.toThrow("FINAL_CHECK_PENDING");
  await expect(new FinalCheckCompletionRepository(f.shadow).publish(a.shadow, { version: "final-check-publication.v1", jobId: a.jobId, runId: randomUUID(), checkId: randomUUID() })).rejects.toThrow();
  await expect(new JobSourceRepository(f.runtime).intake(a.context, a.jobId, a.digest, "diary", { version: "job-diary-input.v1", commandId: randomUUID(), entryMode: "typed", onSite: false, text: diary })).rejects.toMatchObject({ code: "POST_LOCK_WORK_REQUIRES_LINKED_JOB" });
  expect((await a.repo.manifest(a.shadow, a.jobId, a.m.id)).sources.map(source => source.id)).toEqual(a.m.sources.map(source => source.id));
});

it("missing, altered and invalid UTF-8 original bytes cannot become examined zero-results", async () => {
  const a = await setup(), s = a.m.sources[0]!;
  // Owner-only corruption simulation in this disposable PG cluster. Runtime still
  // has SELECT only; restore both the exact row and the constraint in finally.
  const original = (await f.admin.query("SELECT bytes FROM app.job_source_original WHERE tenant_id=$1 AND evidence_id=$2", [a.tenantId, s.evidenceId])).rows[0].bytes;
  const constraint = (await f.admin.query("SELECT pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid='app.job_source_original'::regclass AND conname='job_source_original_bytes_ck'")).rows[0].definition;
  await f.admin.query("ALTER TABLE app.job_source_original DROP CONSTRAINT job_source_original_bytes_ck, ALTER COLUMN bytes DROP NOT NULL");
  try {
    for (const bytes of [null, Buffer.from("Changed original"), Buffer.from([0xff, 0xfe])]) {
      await finalCheckTenant(f.admin, a.tenantId, async db => {
        await db.query("SET LOCAL session_replication_role='replica'");
        await db.query("UPDATE app.job_source_original SET bytes=$3 WHERE tenant_id=$1 AND evidence_id=$2", [a.tenantId, s.evidenceId, bytes]);
      });
      expect(await a.ports.process(a.shadow, a.m, s)).toMatchObject({ status: "unsupported", failureCode: "SOURCE_INVALID" });
      await expect(a.execute()).rejects.toThrow("FINAL_CHECK_PENDING");
    }
  } finally {
    await finalCheckTenant(f.admin, a.tenantId, async db => {
      await db.query("SET LOCAL session_replication_role='replica'");
      await db.query("UPDATE app.job_source_original SET bytes=$3 WHERE tenant_id=$1 AND evidence_id=$2", [a.tenantId, s.evidenceId, original]);
    });
    await f.admin.query(`ALTER TABLE app.job_source_original ALTER COLUMN bytes SET NOT NULL, ADD CONSTRAINT job_source_original_bytes_ck ${constraint}`);
  }
});

it.each([false, true])("reconciles before first persistence regardless of source order (reverse=%s)", async reverse => {
  const a = await setup("Fitted the heated towel rail as an extra.", request);
  for (const s of reverse ? [...a.m.sources].reverse() : a.m.sources)
    expect(await a.ports.process(a.shadow,a.m,s)).toMatchObject({status:"detected"});
  const snapshot = () => finalCheckTenant(f.admin,a.tenantId,db=>db.query("SELECT id,estimated_value_pence,coalesced_into_signal_id FROM app.shadow_commercial_signal WHERE tenant_id=$1 AND job_id=$2 ORDER BY id",[a.tenantId,a.jobId]));
  const before = (await snapshot()).rows;
  expect(before).toHaveLength(2);
  expect(before.every(row=>row.estimated_value_pence === "18000")).toBe(true);
  expect(before.filter(row=>row.coalesced_into_signal_id === null)).toHaveLength(1);
  await a.execute(); await a.execute();
  expect((await snapshot()).rows).toEqual(before);
});

it("preserves existing persisted provenance instead of retrofitting an old unpriced signal", async () => {
  const { readFinalCheckTypedText } = await import("../src/final-check-typed-text.js");
  const { observationV1, detectShadowObservations } = await import("@jobguard/core");
  const { ShadowDetectionRepository } = await import("../src/shadow-detection-repository.js");
  const a = await setup("Fitted the heated towel rail as an extra.", request);
  const s = a.m.sources.find(source=>source.sourceKind === "job_diary_text")!;
  const read = await readFinalCheckTypedText(f.runtime,a.shadow,a.m,s);
  expect(read.status).toBe("proposal"); if(read.status!=="proposal") throw new Error("Expected bounded proposal");
  const observation = observationV1.parse({version:"observation.v1",tenantId:a.tenantId,jobId:a.jobId,kind:"note_or_voice",...read.proposal,
    evidence:{id:s.evidenceId,objectVersionId:s.objectVersionId,sha256:s.sha256,serverReceivedAt:s.receivedAt}});
  await new ShadowDetectionRepository(f.shadow).persist(a.shadow,{version:"shadow-detection-batch.v1",jobId:a.jobId,observations:[observation],captures:[],proposals:detectShadowObservations([observation],[],new Date().toISOString())});
  const prior = (await finalCheckTenant(f.admin,a.tenantId,db=>db.query("SELECT id,estimated_value_pence FROM app.shadow_commercial_signal WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId]))).rows[0];
  expect(prior.estimated_value_pence).toBeNull();
  await a.execute(); await a.execute();
  expect((await finalCheckTenant(f.admin,a.tenantId,db=>db.query("SELECT id,estimated_value_pence FROM app.shadow_commercial_signal WHERE tenant_id=$1 AND job_id=$2 AND id=$3",[a.tenantId,a.jobId,prior.id]))).rows).toEqual([prior]);
});

it.each(["The agreed job price is £180", "no extra charge", "included in the agreed price", "not extra", "cancelled work", "Do not fit the towel rail as an extra"])("never creates a proposal from refusal: %s", async text => {
  const a = await setup(`${text}. Heated towel rail.`, null);
  await a.ports.process(a.shadow,a.m,a.m.sources[0]!);
  expect((await finalCheckTenant(f.admin,a.tenantId,db=>db.query("SELECT id FROM app.shadow_commercial_signal WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId]))).rows).toEqual([]);
});

async function photoJob(purpose: "completion_photo" | "electrical_certificate", known = true, recognizeDrainage = true) {
  const { EvidenceService } = await import("../src/evidence.js");
  const { generatePracticePng } = await import("../src/practice-proof-image.js");
  const { createHash } = await import("node:crypto");
  const a = await seedFinalCheckJob(f), bytes = generatePracticePng(known ? "completion-photo" : "j3-drainage-photo");
  // Shape only the disposable seed baseline, before its immutable lock. Its
  // generic kitchen seed would otherwise overlap the real kitchen-ceiling extra.
  await finalCheckTenant(f.admin,a.tenantId,async db=>{
    await db.query("SET LOCAL session_replication_role='replica'");
    await db.query("UPDATE app.final_account_line SET description='Fictional room decorating' WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId]);
  });
  const sha256 = createHash("sha256").update(bytes).digest("hex"), version = "fictional-photo-v1";
  const service = new EvidenceService(practiceMaterialPool(f.runtime,a.digest),{
    createUploadUrl:async()=>"memory://upload",createDownloadUrl:async()=>"memory://download",
    readExactVersion:async key=>({key,versionId:version,bytes,byteLength:bytes.length,contentType:"image/png"}),deleteExactVersion:async()=>undefined,
  });
  const upload = await service.beginUpload(a.context,{jobId:a.jobId,scopeItemId:a.scopeItemId,expectedSha256:sha256,contentType:"image/png",maximumBytes:10000,retentionClass:"standard_evidence",expiresAt:new Date(Date.now()+3600000)},async(tx,u)=>{
    await tx.$client.query("INSERT INTO app.synthetic_evidence_original(tenant_id,upload_id,job_id,scope_item_id,object_key,object_version_id,environment,content_type,bytes) VALUES($1,$2,$3,$4,$5,$6,'synthetic_demo','image/png',$7)",[a.tenantId,u.id,a.jobId,a.scopeItemId,u.objectKey,version,bytes]);
  });
  await service.finalize(a.context,{uploadId:upload.id,objectVersionId:version,evidenceType:purpose});
  const sources = new JobSourceRepository(f.runtime);
  await sources.intake(a.context,a.jobId,a.digest,"diary",{version:"job-diary-input.v1",commandId:randomUUID(),entryMode:"typed",onSite:false,text:"Painted the kitchen ceiling as an extra, customer asked for it. Estimated extra: £150"});
  await sources.intake(a.context,a.jobId,a.digest,"customer_message",{version:"customer-message-input.v1",commandId:randomUUID(),fictionalCustomer:{kind:"named_fictional_customer",name:"Fictional Alex"},text:"Please paint the kitchen ceiling."});
  await a.lock();
  const repo = new FinalCheckRepository(f.shadow), m = await repo.begin(a.workerContext,a.jobId);
  const ports = practiceFinalCheckPorts(f.shadow,f.runtime,createHash("sha256").update(generatePracticePng()).digest("hex"),recognizeDrainage ? createHash("sha256").update(generatePracticePng("j3-drainage-photo")).digest("hex") : undefined);
  return {...a,repo,m,ports,execute:()=>new FinalCheckWorker(ports,"synthetic_demo").execute(a.workerContext,{version:"final-check.task.v1",jobId:a.jobId,manifestId:m.id})};
}
it("the generated certificate produces no painted-walls finding beside a true ceiling extra", async () => {
  const a = await photoJob("electrical_certificate"), result = await a.execute() as {runId:string};
  await new FinalCheckCompletionRepository(f.shadow).publish(a.workerContext,{version:"final-check-publication.v1",jobId:a.jobId,runId:result.runId,checkId:randomUUID()});
  const view = await new FinalCheckRepository(f.runtime).read(a.context,a.jobId,a.digest);
  expect(view).toMatchObject({state:"completed"}); expect(view.items).toHaveLength(1);
  expect(view.items[0]).toMatchObject({description:"kitchen ceiling"});
  expect((await finalCheckTenant(f.admin,a.tenantId,db=>db.query("SELECT description,estimated_value_pence FROM app.shadow_commercial_signal WHERE tenant_id=$1 AND job_id=$2 AND coalesced_into_signal_id IS NULL",[a.tenantId,a.jobId]))).rows).toEqual([{description:"kitchen ceiling",estimated_value_pence:"15000"}]);
});
it("unknown certificate bytes cannot succeed by purpose alone, nor a forged source by known hash", async () => {
  const a = await photoJob("electrical_certificate",false,false), source=a.m.sources.find(s=>s.sourceKind==="electrical_certificate")!;
  expect(await a.ports.process(a.workerContext,a.m,source)).toMatchObject({status:"unsupported",failureCode:"UNSUPPORTED_SOURCE"});
  expect(await a.ports.process(a.workerContext,a.m,{...source,sha256:"f".repeat(64)})).toMatchObject({status:"unsupported",failureCode:"SOURCE_INVALID"});
  await expect(a.execute()).rejects.toThrow("FINAL_CHECK_PENDING");
});
it.each([true,false])("genuine completion/drainage photo recipes still detect (painted=%s)", async painted => {
  const a=await photoJob("completion_photo",painted);
  await a.execute();
  expect((await finalCheckTenant(f.admin,a.tenantId,db=>db.query("SELECT description FROM app.shadow_commercial_signal WHERE tenant_id=$1 AND job_id=$2 AND coalesced_into_signal_id IS NULL",[a.tenantId,a.jobId]))).rows.map(row=>row.description))
    .toContain(painted?"painted walls":"fitted garden drainage");
});

it.each(["baseline", "draft", "rejected", "withdrawn"] as const)("existing %s work remains excluded from a towel-rail catch", async kind => {
  const a=await setup(diary,request,async job=>{
    await finalCheckTenant(f.admin,job.tenantId,async db=>{
      if(kind === "baseline") {
        // Arrange the disposable seed's accepted baseline before locking.
        await db.query("SET LOCAL session_replication_role='replica'");
        await db.query("UPDATE app.final_account_line SET description='heated towel rail' WHERE tenant_id=$1 AND job_id=$2",[job.tenantId,job.jobId]);
      } else {
        const scope=randomUUID(),variation=randomUUID();
        await db.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')",[scope,job.tenantId,job.jobId]);
        await db.query("INSERT INTO app.variation(id,tenant_id,job_id,scope_item_id,capture_kind,capture_text,description,state) VALUES($1,$2,$3,$4,'text','heated towel rail','heated towel rail',$5)",[variation,job.tenantId,job.jobId,scope,kind === "withdrawn" ? "draft" : kind]);
        if(kind === "withdrawn") await db.query("INSERT INTO app.variation_withdrawal(tenant_id,job_id,id,variation_id,actor_membership_id,reason_code) VALUES($1,$2,$3,$4,$5,'builder_withdrawn')",[job.tenantId,job.jobId,randomUUID(),variation,FINAL_CHECK_ACTOR]);
      }
    });
  });
  const result=await a.execute() as {runId:string};
  await new FinalCheckCompletionRepository(f.shadow).publish(a.shadow,{version:"final-check-publication.v1",jobId:a.jobId,runId:result.runId,checkId:randomUUID()});
  expect(await new FinalCheckRepository(f.runtime).read(a.context,a.jobId,a.digest)).toMatchObject({state:"completed",items:[]});
});
it("an invalidated known generated certificate cannot become an examined zero", async () => {
  const a=await photoJob("electrical_certificate"),s=a.m.sources.find(source=>source.sourceKind==="electrical_certificate")!;
  await finalCheckTenant(f.admin,a.tenantId,async db=>{
    await db.query("SET LOCAL session_replication_role='replica'");
    await db.query("INSERT INTO app.evidence_invalidation(id,tenant_id,evidence_id,actor_membership_id,reason_code) VALUES($1,$2,$3,$4,'verification_invalid')",[randomUUID(),a.tenantId,s.evidenceId,FINAL_CHECK_ACTOR]);
  });
  expect(await a.ports.process(a.workerContext,a.m,s)).toMatchObject({status:"unsupported",failureCode:"SOURCE_INVALID"});
  await expect(a.execute()).rejects.toThrow("FINAL_CHECK_PENDING");
});

it("preserves the exact reviewed drainage recipe under the legacy certificate purpose", async () => {
  const a=await photoJob("electrical_certificate",false);
  await a.execute();
  expect((await finalCheckTenant(f.admin,a.tenantId,db=>db.query("SELECT description,estimated_value_pence FROM app.shadow_commercial_signal WHERE tenant_id=$1 AND job_id=$2 AND description='fitted garden drainage'",[a.tenantId,a.jobId]))).rows)
    .toEqual([{description:"fitted garden drainage",estimated_value_pence:"50000"}]);
});
