// QW-4 snag list on real PostgreSQL: the add, fixed, checked and reopen flow, the photo cap and
// job rules, isolation, pilot refusal, exact replay, and append-only rows.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SnagError, buildSnagListV1 } from "@jobguard/core";
import { createFinalCheckFixture, closeFinalCheckFixture, seedFinalCheckJob, finalCheckTenant, FINAL_CHECK_ACTOR, type FinalCheckFixture, type FinalCheckJob } from "./final-check-fixture.js";
import { SnagRepository } from "../src/snag-repository.js";
import { practiceMaterialPool } from "../src/practice-session.js";
import { withTenant } from "../src/tenant-context.js";

let f: FinalCheckFixture;
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); f = await createFinalCheckFixture(); }, 120000);
afterAll(async () => { await closeFinalCheckFixture(f); vi.unstubAllEnvs(); });

const repo = (job: FinalCheckJob, digest = job.digest) => new SnagRepository(practiceMaterialPool(f.runtime, digest));
const details = { title: "Fictional loose socket faceplate", location: "Fictional kitchen", assigneeLabel: "Dave (sparky)", dueOn: "2026-12-01" };
async function addSnag(job: FinalCheckJob, snagId = randomUUID()) {
  await repo(job).add(job.context, job.jobId, { version: "snag.v1", action: "add", commandId: randomUUID(), snagId, ...details });
  return snagId;
}
const event = (job: FinalCheckJob, snagId: string, action: "mark_fixed" | "mark_checked" | "reopen", commandId = randomUUID()) =>
  repo(job).recordEvent(job.context, job.jobId, snagId, { version: "snag-event.v1", commandId, action });
const refused = async (work: Promise<unknown>, code: string) => {
  const error = await work.then(() => null, (failure: unknown) => failure);
  expect(error, `expected ${code}`).toBeInstanceOf(SnagError);
  expect((error as SnagError).code).toBe(code);
};
async function photo(job: FinalCheckJob, snagId: string) {
  const r = repo(job), begun = await r.photo(job.context, job.jobId, snagId, { version: "snag-photo.v1", action: "begin", commandId: randomUUID(), fixture: "completion-photo" });
  return r.photo(job.context, job.jobId, snagId, { version: "snag-photo.v1", action: "finalize", commandId: randomUUID(), uploadId: begun.uploadId, objectVersionId: begun.objectVersionId });
}

describe("QW-4 snag flow", () => {
  it("adds, revises, fixes, checks and reopens, deriving the state from the events", async () => {
    const a = await seedFinalCheckJob(f), snagId = await addSnag(a), r = repo(a);
    expect((await r.read(a.context, a.jobId))[0]).toMatchObject({ id: snagId, revision: 1, ...details, events: [], photos: [], createdByMembershipId: FINAL_CHECK_ACTOR });
    await r.revise(a.context, a.jobId, { version: "snag.v1", action: "revise", commandId: randomUUID(), snagId, expectedRevision: 1, ...details, location: null, dueOn: "2026-12-02" });
    await refused(r.revise(a.context, a.jobId, { version: "snag.v1", action: "revise", commandId: randomUUID(), snagId, expectedRevision: 1, ...details }), "SNAG_REVISION_CONFLICT");
    await event(a, snagId, "mark_fixed");
    // A lone builder may tick both.
    await event(a, snagId, "mark_checked");
    await refused(r.revise(a.context, a.jobId, { version: "snag.v1", action: "revise", commandId: randomUUID(), snagId, expectedRevision: 2, ...details }), "SNAG_TRANSITION_REFUSED");
    await event(a, snagId, "reopen");
    const [row] = await r.read(a.context, a.jobId);
    expect(row).toMatchObject({ revision: 2, location: null, dueOn: "2026-12-02", title: details.title });
    expect(row!.events.map(e => [e.sequence, e.kind, e.actorMembershipId])).toEqual([[1, "fixed", FINAL_CHECK_ACTOR], [2, "checked", FINAL_CHECK_ACTOR], [3, "reopened", FINAL_CHECK_ACTOR]]);
    expect(buildSnagListV1(a.jobId, new Date("2026-12-03T12:00:00Z"), [row!]).snags[0]).toMatchObject({ state: "open", overdue: true });
  });

  it("refuses checked before fixed, a second fix, and reopening an open snag", async () => {
    const a = await seedFinalCheckJob(f), snagId = await addSnag(a);
    await refused(event(a, snagId, "mark_checked"), "SNAG_TRANSITION_REFUSED");
    await refused(event(a, snagId, "reopen"), "SNAG_TRANSITION_REFUSED");
    await event(a, snagId, "mark_fixed");
    await refused(event(a, snagId, "mark_fixed"), "SNAG_TRANSITION_REFUSED");
    expect((await repo(a).read(a.context, a.jobId))[0]!.events).toHaveLength(1);
  });

  it("needs a different person to check once another member works on the job's snag list", async () => {
    const a = await seedFinalCheckJob(f), snagId = await addSnag(a), other = randomUUID(), user = randomUUID();
    const account = (await f.admin.query("SELECT account_id FROM app.membership WHERE tenant_id=$1 AND id=$2", [a.tenantId, FINAL_CHECK_ACTOR])).rows[0].account_id;
    await f.admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [user]);
    await f.admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [other, a.tenantId, account, user]);
    await event(a, snagId, "mark_fixed");
    // Another member on the tenant who has not touched this job's list does not block the lone builder.
    const second = await addSnag(a);
    await event(a, second, "mark_fixed");
    await event(a, second, "mark_checked");
    // Once that member has worked on this job's snags, the fixer cannot also check.
    await finalCheckTenant(f.admin, a.tenantId, db => db.query("INSERT INTO app.snag(tenant_id,job_id,id,title,created_by_membership_id) VALUES($1,$2,$3,'Fictional other snag',$4)", [a.tenantId, a.jobId, randomUUID(), other]));
    await refused(event(a, snagId, "mark_checked"), "SNAG_CHECKER_MUST_DIFFER");
    // A revoked member no longer counts.
    await f.admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [a.tenantId, other]);
    await event(a, snagId, "mark_checked");
  });

  it("replays an exact retry and refuses a reused command id with another request", async () => {
    const a = await seedFinalCheckJob(f), r = repo(a), snagId = randomUUID(), commandId = randomUUID();
    const command = { version: "snag.v1", action: "add", commandId, snagId, ...details } as const;
    expect(await r.add(a.context, a.jobId, command)).toEqual(await r.add(a.context, a.jobId, command));
    await refused(r.add(a.context, a.jobId, { ...command, title: "Fictional changed title" }), "SNAG_COMMAND_CONFLICT");
    await refused(r.add(a.context, a.jobId, { ...command, commandId: randomUUID() }), "SNAG_COMMAND_CONFLICT");
    const fix = randomUUID();
    expect(await event(a, snagId, "mark_fixed", fix)).toEqual(await event(a, snagId, "mark_fixed", fix));
    await refused(event(a, snagId, "reopen", fix), "SNAG_COMMAND_CONFLICT");
    expect((await r.read(a.context, a.jobId)).map(s => s.events.length)).toEqual([1]);
  });
});

describe("QW-4 snag photos", () => {
  it("links verified photos in order and refuses a seventh", async () => {
    const a = await seedFinalCheckJob(f), snagId = await addSnag(a);
    const ids: string[] = [];
    for (let n = 0; n < 6; n++) ids.push((await photo(a, snagId)).evidenceId);
    const [row] = await repo(a).read(a.context, a.jobId);
    expect(row!.photos.map(p => [p.evidenceId, p.position, p.withdrawn])).toEqual(ids.map((id, n) => [id, n + 1, false]));
    await refused(photo(a, snagId), "PHOTO_LIMIT_REACHED");
  });

  it("replays a finalize retry and refuses another job's upload, a scoped proof upload and a foreign snag", async () => {
    const a = await seedFinalCheckJob(f), b = await seedFinalCheckJob(f), snagId = await addSnag(a), otherSnag = await addSnag(b), r = repo(a);
    const begun = await r.photo(a.context, a.jobId, snagId, { version: "snag-photo.v1", action: "begin", commandId: randomUUID(), fixture: "completion-photo" });
    const finalize = { version: "snag-photo.v1", action: "finalize", commandId: randomUUID(), uploadId: begun.uploadId, objectVersionId: begun.objectVersionId } as const;
    expect(await r.photo(a.context, a.jobId, snagId, finalize)).toEqual(await r.photo(a.context, a.jobId, snagId, finalize));
    expect((await r.read(a.context, a.jobId))[0]!.photos).toHaveLength(1);
    // Another job's snag (owned by another practice session) is not found from this job.
    await refused(r.photo(a.context, a.jobId, otherSnag, { version: "snag-photo.v1", action: "begin", commandId: randomUUID(), fixture: "completion-photo" }), "SNAG_NOT_FOUND");
    // Job b's upload cannot be finalized as a photo on job a.
    const foreign = await repo(b).photo(b.context, b.jobId, otherSnag, { version: "snag-photo.v1", action: "begin", commandId: randomUUID(), fixture: "completion-photo" });
    await refused(r.photo(a.context, a.jobId, snagId, { version: "snag-photo.v1", action: "finalize", commandId: randomUUID(), uploadId: foreign.uploadId, objectVersionId: foreign.objectVersionId }), "SNAG_PHOTO_REFUSED");
    // A proof upload on a scope item never becomes a snag photo.
    const scoped = randomUUID();
    await finalCheckTenant(f.admin, a.tenantId, db => db.query(`INSERT INTO app.evidence_upload(tenant_id,id,job_id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at)
      VALUES($1::uuid,$2::uuid,$3,$4,'tenants/'||$1::text||'/uploads/'||$2::text||'/original',$5,'image/png',1000,'standard_evidence',clock_timestamp()+interval '1 hour')`, [a.tenantId, scoped, a.jobId, a.scopeItemId, "c".repeat(64)]));
    await refused(r.photo(a.context, a.jobId, snagId, { version: "snag-photo.v1", action: "finalize", commandId: randomUUID(), uploadId: scoped, objectVersionId: "synthetic-snag-completion-photo" }), "SNAG_PHOTO_REFUSED");
  });

  it("refuses, in the routine itself, a photo of another type or another job", async () => {
    const a = await seedFinalCheckJob(f), b = await seedFinalCheckJob(f), snagId = await addSnag(a);
    const other = await photo(b, await addSnag(b));
    const attach = (evidence: string) => withTenant(practiceMaterialPool(f.runtime, a.digest), a.context, db => db.$client.query("SELECT app.snag_attach_photo($1,$2,$3)", [a.jobId, snagId, evidence]));
    await expect(attach(other.evidenceId)).rejects.toThrow("SNAG_PHOTO_REFUSED");
    const proof = randomUUID();
    await finalCheckTenant(f.admin, a.tenantId, async db => {
      await db.query(`INSERT INTO app.evidence_upload(tenant_id,id,job_id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at,state,object_version_id,server_received_at,server_verified_at)
        VALUES($1,$2::uuid,$3,NULL,$2::text,$4,'image/png',100,'standard_evidence',clock_timestamp()+interval '1 day','verified','v1',clock_timestamp(),clock_timestamp())`, [a.tenantId, proof, a.jobId, "d".repeat(64)]);
      await db.query(`INSERT INTO app.evidence_object(tenant_id,id,upload_id,job_id,scope_item_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at)
        VALUES($1,$2::uuid,$2::uuid,$3,NULL,'original','completion_photo',$2::text,'v1',$4,80,'image/png','standard_evidence',clock_timestamp(),clock_timestamp())`, [a.tenantId, proof, a.jobId, "d".repeat(64)]);
    });
    await expect(attach(proof)).rejects.toThrow("SNAG_PHOTO_REFUSED");
  });
});

describe("QW-4 isolation and refusals", () => {
  it("never shows or changes another practice session's job, even with its ids", async () => {
    // Reads are tenant-scoped here; the application checks job ownership before reading (snag.application.test.ts).
    const a = await seedFinalCheckJob(f), b = await seedFinalCheckJob(f), snagId = await addSnag(b);
    // a's session asking about b's job: the routine checks ownership against a's own digest.
    await refused(repo(a).add(a.context, b.jobId, { version: "snag.v1", action: "add", commandId: randomUUID(), snagId: randomUUID(), ...details }), "SNAG_NOT_FOUND");
    await refused(event(a, snagId, "mark_fixed"), "SNAG_NOT_FOUND");
    await refused(repo(a).recordEvent(a.context, b.jobId, snagId, { version: "snag-event.v1", commandId: randomUUID(), action: "mark_fixed" }), "SNAG_NOT_FOUND");
    // A supplied digest that is not the bound session is refused outright.
    await expect(new SnagRepository(practiceMaterialPool(f.runtime, b.digest)).add(a.context, b.jobId, { version: "snag.v1", action: "add", commandId: randomUUID(), snagId: randomUUID(), ...details })).rejects.toThrow("FORBIDDEN");
    expect((await repo(b).read(b.context, b.jobId)).map(s => s.events.length)).toEqual([0]);
  });

  it("keeps tenants apart under RLS", async () => {
    const b = await seedFinalCheckJob(f); await addSnag(b);
    const tenant = randomUUID();
    await f.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenant]);
    const seen = await finalCheckTenant(f.runtime, tenant, async db => (await db.query("SELECT count(*)::int n FROM app.snag WHERE job_id=$1", [b.jobId])).rows[0].n).catch(error => error);
    expect(seen === 0 || seen instanceof Error).toBe(true);
    const own = await finalCheckTenant(f.runtime, b.tenantId, async db => (await db.query("SELECT count(*)::int n FROM app.snag WHERE job_id=$1", [b.jobId])).rows[0].n, { practiceDigest: b.digest });
    expect(own).toBe(1);
  });

  it("refuses a job that is not live", async () => {
    const a = await seedFinalCheckJob(f);
    await finalCheckTenant(f.admin, a.tenantId, db => db.query("UPDATE app.job SET status='invoiced' WHERE tenant_id=$1 AND id=$2", [a.tenantId, a.jobId]));
    await expect(addSnag(a)).rejects.toMatchObject({ name: "WatchdogError", code: "JOB_NOT_LIVE" });
  });

  it("is append-only and the runtime cannot write the tables directly", async () => {
    const a = await seedFinalCheckJob(f), snagId = await addSnag(a);
    await event(a, snagId, "mark_fixed"); await photo(a, snagId);
    for (const table of ["snag", "snag_revision", "snag_event", "snag_photo", "snag_command"]) {
      await expect(f.admin.query(`UPDATE app.${table} SET tenant_id=tenant_id`)).rejects.toThrow();
      await expect(f.admin.query(`DELETE FROM app.${table}`)).rejects.toThrow();
      await expect(f.admin.query(`TRUNCATE app.${table} CASCADE`)).rejects.toThrow();
      await expect(finalCheckTenant(f.runtime, a.tenantId, db => db.query(`DELETE FROM app.${table}`), { practiceDigest: a.digest })).rejects.toThrow(/permission denied/u);
    }
    await expect(finalCheckTenant(f.runtime, a.tenantId, db => db.query("INSERT INTO app.snag(tenant_id,job_id,id,title,created_by_membership_id) VALUES($1,$2,$3,'Fictional',$4)", [a.tenantId, a.jobId, randomUUID(), FINAL_CHECK_ACTOR]), { practiceDigest: a.digest })).rejects.toThrow(/permission denied/u);
    const grants = (await f.admin.query(`SELECT table_name,privilege_type FROM information_schema.role_table_grants WHERE grantee='jobguard_runtime' AND table_schema='app' AND table_name LIKE 'snag%' ORDER BY 1,2`)).rows;
    expect(grants).toEqual(["snag", "snag_command", "snag_event", "snag_photo", "snag_revision"].map(table_name => ({ table_name, privilege_type: "SELECT" })));
  });

  it("refuses outside the practice database", async () => {
    const sql = (await f.admin.query("SELECT prosrc FROM pg_proc WHERE oid='app.snag_practice_actor(uuid,uuid)'::regprocedure")).rows[0].prosrc as string;
    expect(sql.indexOf("current_database()<>'jobguard_synthetic_demo'")).toBeGreaterThan(-1);
    expect(sql.indexOf("current_database()")).toBeLessThan(sql.indexOf("app.current_actor()"));
  });
});
