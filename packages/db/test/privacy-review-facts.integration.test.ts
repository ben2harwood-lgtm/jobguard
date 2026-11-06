import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeWorkFixture, createWorkFixture, workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
import { meterCompany } from "./meter-persistence-fixtures.js";
import { PrivacyOperationsRepository } from "../src/privacy-operations-repository.js";
import { snapshotRows } from "./upgrade-proof-utils.js";
import { MIGRATION_URLS } from "../src/migrate.js";

let f: WorkFixture, repo: PrivacyOperationsRepository;
type Company = Awaited<ReturnType<typeof meterCompany>>;
const command = (a: Company, value: Record<string, unknown>) => repo.command(a.context, a.digest,
  { version: "privacy-command.v2", commandId: randomUUID(), ...value });
async function open(a: Company, kind = "builder") {
  const subjectId = randomUUID();
  await workTenant(f.admin, a.tenantId, db => db.query(
    "INSERT INTO app.privacy_subject(tenant_id,id,kind) VALUES($1,$2,$3)", [a.tenantId, subjectId, kind]));
  return command(a, { action: "open", subjectId, operation: "export" });
}
const verify = (a: Company, requestId: unknown, expectedRevision: number, kind = "identity") =>
  command(a, { action: "verify", requestId, expectedRevision, kind, evidenceHash: "a".repeat(64) });
const review = (a: Company, requestId: unknown, expectedRevision: number, identityRef: unknown, authorityRef: unknown) =>
  command(a, { action: "review", requestId, expectedRevision, identityRef, authorityRef,
    retentionReviewRef: randomUUID(), reviewHash: "b".repeat(64) });
const facts = async (a: Company) => (await f.admin.query(
  "SELECT * FROM app.privacy_review_fact WHERE tenant_id=$1 ORDER BY id", [a.tenantId])).rows;

describe("M5-11 recorded identity and authority checks (synthetic only)", () => {
  beforeAll(async () => { f = await createWorkFixture(); repo = new PrivacyOperationsRepository(f.runtime); }, 120000);
  afterAll(async () => closeWorkFixture(f));

  it("rejects unknown, other-request, cross-tenant and wrong-kind references identically without mutation", async () => {
    const a = await meterCompany(f), b = await meterCompany(f);
    const req = await open(a), other = await open(a), foreign = await open(b);
    const identity = await verify(a, req.requestId, 0), authority = await verify(a, req.requestId, 1, "authority");
    const otherIdentity = await verify(a, other.requestId, 0), otherAuthority = await verify(a, other.requestId, 1, "authority");
    const foreignIdentity = await verify(b, foreign.requestId, 0), foreignAuthority = await verify(b, foreign.requestId, 1, "authority");
    const before = await facts(a);
    for (const [i, u] of [[randomUUID(), randomUUID()], [otherIdentity.factId, authority.factId],
      [identity.factId, otherAuthority.factId], [foreignIdentity.factId, authority.factId],
      [identity.factId, foreignAuthority.factId], [authority.factId, authority.factId],
      [identity.factId, identity.factId], [authority.factId, identity.factId]]) {
      await expect(review(a, req.requestId, 2, i, u)).rejects.toMatchObject({ code: "PRIVACY_INVALID", message: "PRIVACY_INVALID" });
    }
    expect(await facts(a)).toEqual(before);
    expect((await f.admin.query("SELECT revision,review_record FROM app.privacy_request WHERE tenant_id=$1 AND id=$2",
      [a.tenantId, req.requestId])).rows).toEqual([{ revision: 2, review_record: null }]);
    await review(a, req.requestId, 2, identity.factId, authority.factId);
    const result = await command(a, { action: "execute", requestId: req.requestId, expectedRevision: 3 });
    expect(result.receipt).toMatchObject({ review: { identityRef: identity.factId, authorityRef: authority.factId,
      identityMethod: "synthetic_fixture", authorityMethod: "synthetic_fixture" } });
    expect(JSON.stringify(result.receipt)).not.toContain("@meter.invalid");
    const audit = (await f.admin.query("SELECT payload FROM app.audit_event WHERE tenant_id=$1", [a.tenantId])).rows;
    for (const forbidden of ["@meter.invalid", "evidenceHash", "synthetic_fixture"]) expect(JSON.stringify(audit)).not.toContain(forbidden);
  });

  it("serializes replays and races, rejects changed content, stale revisions and revoked actors", async () => {
    const a = await meterCompany(f), req = await open(a);
    const value = { action: "verify", requestId: req.requestId, expectedRevision: 0, kind: "identity",
      evidenceHash: "a".repeat(64), commandId: randomUUID() };
    const [one, two] = await Promise.all([command(a, value), command(a, value)]);
    expect(two).toEqual(one); expect(one).toMatchObject({ revision: 1, factId: expect.any(String) });
    expect(await facts(a)).toHaveLength(1);
    await expect(command(a, { ...value, evidenceHash: "b".repeat(64) })).rejects.toMatchObject({ code: "PRIVACY_CONFLICT" });
    await expect(verify(a, req.requestId, 0)).rejects.toMatchObject({ code: "PRIVACY_CONFLICT" });
    const raced = await Promise.allSettled([verify(a, req.requestId, 1, "authority"), verify(a, req.requestId, 1, "authority")]);
    expect(raced.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(raced.find(r => r.status === "rejected")).toMatchObject({ reason: { code: "PRIVACY_CONFLICT" } });
    expect(await facts(a)).toHaveLength(2);
    await f.admin.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1", [a.sessionId]);
    await expect(command(a, value)).rejects.toMatchObject({ code: "PRIVACY_FORBIDDEN" });
  });

  it("still requires contractor instruction and the exact reviewed inventory", async () => {
    const a = await meterCompany(f), req = await open(a, "resident");
    const identity = await verify(a, req.requestId, 0), authority = await verify(a, req.requestId, 1, "authority");
    await expect(review(a, req.requestId, 2, identity.factId, authority.factId)).rejects.toMatchObject({ code: "PRIVACY_INVALID" });
    await expect(command(a, { action: "execute", requestId: req.requestId, expectedRevision: 2 }))
      .rejects.toMatchObject({ code: "PRIVACY_INSTRUCTION_REQUIRED" });
    await command(a, { action: "instruct", requestId: req.requestId, expectedRevision: 2,
      instructionRef: randomUUID(), instructionHash: "c".repeat(64) });
    await review(a, req.requestId, 3, identity.factId, authority.factId);
    await expect(verify(a, req.requestId, 4)).rejects.toMatchObject({ code: "PRIVACY_INVALID" });
    await workTenant(f.admin, a.tenantId, db => db.query(`INSERT INTO app.privacy_artifact(tenant_id,id,subject_id,category,payload)
      SELECT tenant_id,$1,subject_id,'source','{"fictional":"changed inventory"}'::jsonb FROM app.privacy_request WHERE tenant_id=$2 AND id=$3`,
    [randomUUID(), a.tenantId, req.requestId]));
    await expect(command(a, { action: "execute", requestId: req.requestId, expectedRevision: 4 }))
      .rejects.toMatchObject({ code: "PRIVACY_CONFLICT" });
  });

  it("validates verify at the database boundary without trusting the parser", async () => {
    const a = await meterCompany(f), req = await open(a);
    const value = { version: "privacy-command.v2", action: "verify", requestId: req.requestId,
      expectedRevision: 0, kind: "identity", evidenceHash: "a".repeat(64), commandId: randomUUID() };
    for (const patch of [{ version: "privacy-command.v1" }, { kind: "retention" },
      { evidenceHash: "g".repeat(64) }, { evidenceHash: null }, { method: "synthetic_fixture" }, { verifiedBy: a.actorId }]) {
      await expect(workTenant(f.runtime, a.tenantId, db => db.query(
        "SELECT app.privacy_command($1,$2,$3::jsonb)", [a.tenantId, a.digest, JSON.stringify({ ...value, ...patch })])))
        .rejects.toMatchObject({ code: "22023", message: "PRIVACY_INVALID" });
    }
    expect(await facts(a)).toEqual([]);
  });

  it("enforces immutable facts, synthetic method, tenant keys and zero runtime privileges", async () => {
    const a = await meterCompany(f), b = await meterCompany(f), req = await open(a), foreign = await open(b);
    await verify(a, req.requestId, 0);
    const before = await facts(a);
    const invisible = await workTenant(f.admin, b.tenantId, async db => {
      await db.query("SET LOCAL ROLE jobguard_migration");
      return (await db.query("SELECT * FROM app.privacy_review_fact")).rows;
    });
    expect(invisible).toEqual([]);
    for (const sql of ["UPDATE app.privacy_review_fact SET evidence_hash=repeat('b',64)",
      "DELETE FROM app.privacy_review_fact", "TRUNCATE app.privacy_review_fact"]) {
      await expect(f.admin.query(sql)).rejects.toMatchObject({ code: "55000" });
      expect(await facts(a)).toEqual(before);
    }
    const insert = (requestId: unknown, actor: string, method: string) => workTenant(f.admin, a.tenantId, async db => {
      await db.query("SET LOCAL ROLE jobguard_migration");
      return db.query(
        "INSERT INTO app.privacy_review_fact(tenant_id,id,request_id,kind,method,evidence_hash,verified_by) VALUES($1,$2,$3,'identity',$4,$5,$6)",
        [a.tenantId, randomUUID(), requestId, method, "a".repeat(64), actor]);
    });
    await expect(insert(req.requestId, a.actorId, "real_person")).rejects.toMatchObject({ code: "23514" });
    await expect(insert(foreign.requestId, a.actorId, "synthetic_fixture")).rejects.toMatchObject({ code: "23503" });
    await expect(insert(req.requestId, b.actorId, "synthetic_fixture")).rejects.toMatchObject({ code: "23503" });
    expect((await f.admin.query(`SELECT relrowsecurity,relforcerowsecurity,
      has_table_privilege('jobguard_runtime',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') allowed
      FROM pg_class WHERE oid='app.privacy_review_fact'::regclass`)).rows)
      .toEqual([{ relrowsecurity: true, relforcerowsecurity: true, allowed: false }]);
    await expect(workTenant(f.runtime, a.tenantId, db => db.query("SELECT * FROM app.privacy_review_fact")))
      .rejects.toMatchObject({ code: "42501" });
    expect(await facts(a)).toEqual(before);
  });

  it("upgrades existing requests and reviews without rewriting rows or other routine definitions", async () => {
    const upgrade = await createWorkFixture(false);
    try {
      const index = MIGRATION_URLS.findIndex(u => u.pathname.endsWith("0630_privacy_review_facts.sql"));
      expect(index).toBeGreaterThan(0);
      for (const url of MIGRATION_URLS.slice(0, index)) await upgrade.admin.query(await readFile(url, "utf8"));
      const a = await meterCompany(upgrade), subjectId = randomUUID(), requestId = randomUUID();
      const originalReview = { identityRef: randomUUID(), authorityRef: randomUUID(), retentionReviewRef: randomUUID(), synthetic: true };
      await workTenant(upgrade.admin, a.tenantId, async db => {
        await db.query("INSERT INTO app.privacy_subject(tenant_id,id,kind) VALUES($1,$2,'builder')", [a.tenantId, subjectId]);
        await db.query(`INSERT INTO app.privacy_request(tenant_id,id,subject_id,operation,controller,state,opened_by,expanded,review_record)
          VALUES($1,$2,$3,'export','jobguard','ready',$4,true,$5)`, [a.tenantId, requestId, subjectId, a.actorId, originalReview]);
      });
      const rows = async () => (await upgrade.admin.query("SELECT to_jsonb(r) row FROM app.privacy_request r ORDER BY tenant_id,id")).rows;
      const routines = async () => (await upgrade.admin.query(`SELECT p.oid,pg_get_functiondef(p.oid) definition,proacl,proowner,proconfig
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('app','identity','control_plane')
        AND p.prokind='f' AND p.oid<>'app.privacy_command(uuid,text,jsonb)'::regprocedure ORDER BY p.oid`)).rows;
      const beforeRows = await rows(), beforeRoutines = await routines(), beforeAllRows = await snapshotRows(upgrade.admin);
      await upgrade.admin.query(await readFile(MIGRATION_URLS[index]!, "utf8"));
      expect(await rows()).toEqual(beforeRows); expect(await routines()).toEqual(beforeRoutines);
      expect(await snapshotRows(upgrade.admin)).toEqual({ ...beforeAllRows, "app.privacy_review_fact": [] });
      const result = await new PrivacyOperationsRepository(upgrade.runtime).read(a.context, a.digest,
        { version: "privacy-query.v1", requestId });
      expect(result).toMatchObject({ requestId, state: "ready" });
      expect((await upgrade.admin.query("SELECT review_record FROM app.privacy_request WHERE id=$1", [requestId])).rows[0].review_record).toEqual(originalReview);
      expect((await upgrade.admin.query("SELECT * FROM app.privacy_review_fact")).rows).toEqual([]);
    } finally { await closeWorkFixture(upgrade); }
  }, 120000);
});
