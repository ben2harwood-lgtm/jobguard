import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWorkFixture, closeWorkFixture, workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
import { meterCompany } from "./meter-persistence-fixtures.js";
import { PrivacyOperationsRepository } from "../src/privacy-operations-repository.js";
import { MIGRATION_URLS, migrate } from "../src/migrate.js";
import { readFile } from "node:fs/promises";
let f: WorkFixture, repo: PrivacyOperationsRepository;
type Company = Awaited<ReturnType<typeof meterCompany>>;
const categories = ["source", "derived", "accounting", "legal", "log", "backup", "queued_work", "inflight_work", "access_grant"];
async function subject(a: Company, kind = "resident") {
  const id = randomUUID();
  await workTenant(f.admin, a.tenantId, async db => {
    await db.query("INSERT INTO app.privacy_subject(tenant_id,id,kind) VALUES($1,$2,$3)", [a.tenantId, id, kind]);
    for (const category of categories) await db.query("INSERT INTO app.privacy_artifact(tenant_id,subject_id,id,category,payload) VALUES($1,$2,$3,$4,$5)", [a.tenantId,id,randomUUID(),category,JSON.stringify({ fictional: `${a.tenantId}:${category}` })]);
  }); return id;
}
const command = (a: Company, value: Record<string, unknown>) => repo.command(a.context, a.digest, { version: "privacy-command.v1", commandId: randomUUID(), ...value });
const read = (a: Company, requestId: unknown) => repo.read(a.context, a.digest, { version: "privacy-query.v1", requestId });
const artifacts = async (a: Company, id: string) => (await f.admin.query("SELECT category,payload,state FROM app.privacy_artifact WHERE tenant_id=$1 AND subject_id=$2 ORDER BY category", [a.tenantId,id])).rows;
const open = (a: Company, subjectId: string, operation = "export") => command(a, { action: "open", subjectId, operation });
const instruct = (a: Company, requestId: unknown) => command(a, { action: "instruct", requestId, expectedRevision: 0, instructionRef: randomUUID(), instructionHash: "a".repeat(64) });
describe("M0-13c synthetic PostgreSQL privacy rehearsal", () => {
  beforeAll(async () => { f = await createWorkFixture(); repo = new PrivacyOperationsRepository(f.runtime); }, 120000);
  afterAll(async () => closeWorkFixture(f));
  it("routes resident/client requests to the contractor and requires a recorded exact instruction", async () => {
    const a = await meterCompany(f);
    for (const kind of ["resident", "client"]) {
      const id = await subject(a, kind), before = await artifacts(a,id), req = await open(a,id);
      expect(req).toMatchObject({ controller: "contractor", state: "awaiting_instruction", backupsErased: false });
      await expect(command(a, { action: "execute", requestId: req.requestId, expectedRevision: 0 })).rejects.toMatchObject({ code: "PRIVACY_INSTRUCTION_REQUIRED" });
      expect(await artifacts(a,id)).toEqual(before); expect((await read(a,req.requestId)).document).toBeNull();
      expect((await f.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2",[a.tenantId,req.requestId])).rows[0].n).toBe(1);
      await instruct(a,req.requestId);
      expect(await read(a,req.requestId)).toMatchObject({ instructionActor: a.actorId, instructionHash: "a".repeat(64), state: "ready" });
      await command(a, { action: "execute", requestId: req.requestId, expectedRevision: 1 });
      const exported = await read(a,req.requestId);
      expect(exported.document).toHaveLength(5); expect(JSON.stringify(exported)).toContain(`${a.tenantId}:source`); expect(JSON.stringify(exported)).toContain(`${a.tenantId}:derived`);
    }
  });
  it("deletes source/derived, clears previous exports, fences access/work, retains legal/accounting/backups and preserves another tenant", async () => {
    const a = await meterCompany(f), b = await meterCompany(f), sa = await subject(a), sb = await subject(b);
    const untouched = await artifacts(b,sb), exp = await open(a,sa); await instruct(a,exp.requestId);
    await command(a, { action: "execute", requestId: exp.requestId, expectedRevision: 1 });
    const del = await open(a,sa,"delete"); await instruct(a,del.requestId);
    expect(await command(a, { action: "execute", requestId: del.requestId, expectedRevision: 1 })).toMatchObject({ state: "rehearsed", backupsErased: false, realExternalActions: 0 });
    const after = await artifacts(a,sa);
    for (const row of after) {
      if (["source","derived","log"].includes(row.category)) expect(row).toMatchObject({ state: "redacted", payload: null });
      if (["accounting","legal","backup"].includes(row.category)) expect(row).toMatchObject({ state: "retained", payload: expect.any(Object) });
      if (row.category === "queued_work") expect(row).toMatchObject({ state: "cancelled", payload: null });
      if (row.category === "inflight_work") expect(row.state).toBe("outcome_unknown");
      if (row.category === "access_grant") expect(row).toMatchObject({ state: "revoked", payload: null });
    }
    expect((await read(a,exp.requestId)).document).toBeNull();
    expect((await f.admin.query("SELECT revoked_at FROM app.privacy_subject WHERE tenant_id=$1 AND id=$2", [a.tenantId,sa])).rows[0].revoked_at).not.toBeNull();
    expect(await artifacts(b,sb)).toEqual(untouched);
    await expect(read(b,del.requestId)).rejects.toMatchObject({ code: "PRIVACY_NOT_FOUND" });
    await expect(open(a,sb,"delete")).rejects.toMatchObject({ code: "PRIVACY_NOT_FOUND" });
    await expect(instruct(b,del.requestId)).rejects.toMatchObject({ code: "PRIVACY_NOT_FOUND" });
    const bReq = await open(b,sb,"access"); await instruct(b,bReq.requestId);
    await command(b,{ action: "execute", requestId: bReq.requestId, expectedRevision: 1 });
    const bExport = JSON.stringify(await read(b,bReq.requestId)); expect(bExport).toContain(b.tenantId); expect(bExport).not.toContain(a.tenantId);
  });
  it("replays once, rejects conflicts/stale revisions, and concurrent executes append one audit effect", async () => {
    const a = await meterCompany(f), id = await subject(a,"builder");
    const value = { action: "open", subjectId: id, operation: "delete", commandId: randomUUID() };
    const req = await command(a,value); expect(await command(a,value)).toEqual(req);
    await expect(command(a,{ ...value, operation: "export" })).rejects.toMatchObject({ code: "PRIVACY_CONFLICT" });
    const execute = { action: "execute", requestId: req.requestId, expectedRevision: 0, commandId: randomUUID() };
    const both = await Promise.all([command(a,execute), command(a,execute)]); expect(both[0]).toEqual(both[1]);
    await expect(command(a,{ ...execute, commandId: randomUUID() })).rejects.toMatchObject({ code: "PRIVACY_CONFLICT" });
    const events = (await f.admin.query("SELECT payload FROM app.audit_event WHERE tenant_id=$1 AND event_type='privacy.execute'", [a.tenantId])).rows;
    expect(events).toHaveLength(1); expect(JSON.stringify(events)).not.toContain("fictional");
  });
  it("refuses direct table access, forged tenant context/digest, revoked membership/session and malformed SQL input", async () => {
    const a = await meterCompany(f), b = await meterCompany(f), id = await subject(a);
    await expect(repo.command(b.context,a.digest,{version:"privacy-command.v1",commandId:randomUUID(),action:"open",subjectId:id,operation:"export"})).rejects.toMatchObject({code:"PRIVACY_FORBIDDEN"});
    for (const table of ["privacy_subject","privacy_artifact","privacy_request","privacy_command"]) {
      await expect(f.runtime.query(`SELECT * FROM app.${table}`)).rejects.toMatchObject({code:"42501"});
      expect((await f.admin.query("SELECT has_table_privilege('jobguard_runtime',$1,'INSERT,UPDATE,DELETE,TRUNCATE') allowed", [`app.${table}`])).rows[0].allowed).toBe(false);
    }
    await expect(workTenant(f.runtime,a.tenantId, db => db.query("SELECT app.privacy_command($1,$2,$3)",[a.tenantId,a.digest,{version:"privacy-command.v1",commandId:randomUUID(),action:"open",subjectId:id,operation:"export",approved:true}]))).rejects.toMatchObject({code:"22023"});
    const req = await open(a,id); await f.admin.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1",[a.sessionId]);
    await expect(read(a,req.requestId)).rejects.toMatchObject({code:"PRIVACY_FORBIDDEN"});
    await workTenant(f.admin,b.tenantId,db=>db.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE id=$1",[b.actorId]));
    await expect(open(b,await subject(b))).rejects.toMatchObject({code:"PRIVACY_FORBIDDEN"});
  });
  it("upgrades the immediately preceding schema without changing existing rows and can rerun migrate", async () => {
    const upgrade = await createWorkFixture(false, "postgres");
    try {
      const index = MIGRATION_URLS.findIndex(url => url.pathname.endsWith("0539_privacy_operations.sql")); expect(index).toBeGreaterThan(0);
      await upgrade.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
      for (const url of MIGRATION_URLS.slice(0,index)) {
        await upgrade.admin.query(await readFile(url,"utf8"));
        await upgrade.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[url.pathname.split("/").at(-1)]);
      }
      const tenant = randomUUID(); await upgrade.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)",[tenant]);
      await upgrade.admin.query(await readFile(MIGRATION_URLS[index]!,"utf8"));
      expect((await upgrade.admin.query("SELECT id FROM control_plane.tenant WHERE id=$1",[tenant])).rows).toHaveLength(1);
      expect((await upgrade.admin.query("SELECT count(*)::int n FROM app.privacy_request")).rows[0].n).toBe(0);
      await expect(upgrade.admin.query("SELECT app.privacy_read($1,$2,$3)",[tenant,"a".repeat(64),randomUUID()])).rejects.toMatchObject({message:"PRIVACY_DISABLED"});
      // The main fixture already has the real migration registry: reruns are no-ops.
      await migrate(f.admin);
    } finally { await closeWorkFixture(upgrade); }
  },120000);
});
