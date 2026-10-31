import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWorkFixture, closeWorkFixture, workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
import { meterCompany } from "./meter-persistence-fixtures.js";
import { PrivacyOperationsRepository } from "../src/privacy-operations-repository.js";
import { MIGRATION_URLS, migrate } from "../src/migrate.js";
let f: WorkFixture, repo: PrivacyOperationsRepository;
type Company = Awaited<ReturnType<typeof meterCompany>>;
const categories = ["source","derived","accounting","legal","log","backup","queued_work","inflight_work","access_grant",
  "observation","model","cache","native","connector","connector_copy","locked_evidence","key","consent"];
async function subject(a: Company, kind = "builder") {
  const id = randomUUID();
  await workTenant(f.admin,a.tenantId,async db => {
    await db.query("INSERT INTO app.privacy_subject(tenant_id,id,kind) VALUES($1,$2,$3)",[a.tenantId,id,kind]);
    for (const category of categories) await db.query(`INSERT INTO app.privacy_artifact(tenant_id,subject_id,id,category,payload,retention_basis,retention_review_ref)
      VALUES($1,$2,$3,$4,$5,'synthetic_reference_only',$6)`,[a.tenantId,id,randomUUID(),category,{ fictional: `${a.tenantId}:${category}` },randomUUID()]);
  }); return id;
}
const command = (a: Company, value: Record<string,unknown>) => repo.command(a.context,a.digest,{version:"privacy-command.v2",commandId:randomUUID(),...value});
const read = (a: Company, requestId: unknown) => repo.read(a.context,a.digest,{version:"privacy-query.v1",requestId});
const open = (a: Company, subjectId: string, operation = "offboard") => command(a,{action:"open",subjectId,operation});
const instruct = (a: Company, requestId: unknown) => command(a,{action:"instruct",requestId,expectedRevision:0,instructionRef:randomUUID(),instructionHash:"a".repeat(64)});
const review = (a: Company, requestId: unknown, expectedRevision: number) => command(a,{action:"review",requestId,expectedRevision,identityRef:randomUUID(),authorityRef:randomUUID(),retentionReviewRef:randomUUID(),reviewHash:"b".repeat(64)});
const execute = (a: Company, requestId: unknown, expectedRevision: number) => command(a,{action:"execute",requestId,expectedRevision});
const artifacts = async (a: Company) => (await f.admin.query("SELECT * FROM app.privacy_artifact WHERE tenant_id=$1 ORDER BY id",[a.tenantId])).rows;

describe("M5-11 expanded dark DSAR and tenant exit", () => {
  beforeAll(async()=>{ f=await createWorkFixture(); repo=new PrivacyOperationsRepository(f.runtime); },120000);
  afterAll(async()=>closeWorkFixture(f));
  it("requires exact controller instruction, identity/authority review and immutable inventory binding", async()=>{
    const a=await meterCompany(f), b=await meterCompany(f), id=await subject(a,"resident");
    const req=await open(a,id,"export");
    await expect(execute(a,req.requestId,0)).rejects.toMatchObject({code:"PRIVACY_INSTRUCTION_REQUIRED"});
    await expect(instruct(b,req.requestId)).rejects.toMatchObject({code:"PRIVACY_NOT_FOUND"});
    await instruct(a,req.requestId);
    await expect(execute(a,req.requestId,1)).rejects.toMatchObject({code:"PRIVACY_CONFLICT"});
    await review(a,req.requestId,1);
    await expect(command(a,{version:"privacy-command.v1",action:"execute",requestId:req.requestId,expectedRevision:2})).rejects.toMatchObject({code:"PRIVACY_INVALID"});
    await workTenant(f.admin,a.tenantId,db=>db.query("UPDATE app.privacy_artifact SET hold_ref=$1 WHERE tenant_id=$2 AND category='source'",[randomUUID(),a.tenantId]));
    await expect(execute(a,req.requestId,2)).rejects.toMatchObject({code:"PRIVACY_CONFLICT"});
    expect((await read(a,req.requestId)).document).toBeNull();
    await expect(open(b,id,"delete")).rejects.toMatchObject({code:"PRIVACY_NOT_FOUND"});
  });
  it("exports scoped source/derived observations/models, records exclusions and never exports keys", async()=>{
    const a=await meterCompany(f), b=await meterCompany(f), id=await subject(a);
    await subject(b);
    for (const operation of ["access","export"]) {
      const req=await open(a,id,operation); await review(a,req.requestId,0); await execute(a,req.requestId,1);
      const result=await read(a,req.requestId), doc=JSON.stringify(result.document);
      expect(doc).toContain(`${a.tenantId}:model`); expect(doc).toContain(`${a.tenantId}:observation`);
      expect(doc).not.toContain(`${a.tenantId}:key`); expect(doc).not.toContain(b.tenantId);
      expect(result.receipt).toMatchObject({synthetic:true,backupsErased:false,offlineDevicesErased:false,newCharges:0});
      await expect(read(b,req.requestId)).rejects.toMatchObject({code:"PRIVACY_NOT_FOUND"});
    }
  });
  it("offboards every subject in one tenant, fences future work and preserves locked/held/financial records and other tenants", async()=>{
    const a=await meterCompany(f), b=await meterCompany(f), id=await subject(a);
    const resident=await subject(a,"resident"); await subject(b); const untouched=await artifacts(b);
    // Existing exports are removed, including those belonging to a different subject in the exiting tenant.
    const exp=await open(a,id,"export"); await review(a,exp.requestId,0); await execute(a,exp.requestId,1);
    await workTenant(f.admin,a.tenantId,db=>db.query("UPDATE app.privacy_artifact SET hold_ref=$1 WHERE tenant_id=$2 AND category IN('source','access_grant')",[randomUUID(),a.tenantId]));
    const req=await open(a,id); await instruct(a,req.requestId); await review(a,req.requestId,1);
    const value={action:"execute",requestId:req.requestId,expectedRevision:2,commandId:randomUUID()};
    const [one,two]=await Promise.all([command(a,value),command(a,value)]); expect(two).toEqual(one);
    const receipt=one.receipt as {completed: unknown[];exceptions: unknown[];pending: unknown[]};
    expect(receipt.completed.length).toBeGreaterThan(0); expect(receipt.exceptions.length).toBeGreaterThan(0);
    expect(receipt.pending).toHaveLength(10);
    for (const row of await artifacts(a)) {
      if (["accounting","legal","locked_evidence","source"].includes(row.category)) expect(row).toMatchObject({state:"retained",payload:expect.any(Object)});
      if (["observation","model","cache","derived","log"].includes(row.category)) expect(row).toMatchObject({state:"redacted",payload:null});
      if (["access_grant","consent"].includes(row.category)) expect(row.state).toBe("revoked");
      if (row.category==="connector") expect(row).toMatchObject({state:"disconnected",payload:null});
      if (row.category==="queued_work") expect(row.state).toBe("cancelled");
      if (row.category==="inflight_work") expect(row.state).toBe("outcome_unknown");
    }
    expect((await read(a,exp.requestId)).document).toBeNull();
    expect((await f.admin.query("SELECT id FROM app.privacy_subject WHERE tenant_id=$1 AND revoked_at IS NOT NULL",[a.tenantId])).rows).toHaveLength(2);
    await expect(open(a,resident,"access")).rejects.toMatchObject({code:"PRIVACY_CONFLICT"});
    await expect(subject(a)).rejects.toMatchObject({message:"PRIVACY_CONFLICT"});
    await expect(workTenant(f.admin,a.tenantId,db=>db.query("INSERT INTO app.privacy_artifact(tenant_id,subject_id,id,category) VALUES($1,$2,$3,'queued_work')",[a.tenantId,id,randomUUID()]))).rejects.toMatchObject({message:"PRIVACY_CONFLICT"});
    expect(await artifacts(b)).toEqual(untouched);
    const events=(await f.admin.query("SELECT payload FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2 AND event_type='privacy.execute'",[a.tenantId,req.requestId])).rows;
    expect(events).toHaveLength(1); expect(JSON.stringify(events)).not.toContain("fictional");
    await f.admin.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1",[a.sessionId]);
    await expect(command(a,value)).rejects.toMatchObject({code:"PRIVACY_FORBIDDEN"});
  });
  it("subject deletion preserves holds without exiting the tenant; legacy cannot bypass the expanded inventory",async()=>{
    const a=await meterCompany(f), id=await subject(a);
    const legacy=await command(a,{version:"privacy-command.v1",action:"open",subjectId:id,operation:"delete"});
    await expect(command(a,{version:"privacy-command.v1",action:"execute",requestId:legacy.requestId,expectedRevision:0})).rejects.toMatchObject({code:"PRIVACY_INVALID"});
    const req=await open(a,id,"delete"); await review(a,req.requestId,0); await execute(a,req.requestId,1);
    await expect(workTenant(f.admin,a.tenantId,db=>db.query("INSERT INTO app.privacy_artifact(tenant_id,subject_id,id,category) VALUES($1,$2,$3,'queued_work')",[a.tenantId,id,randomUUID()]))).rejects.toMatchObject({message:"PRIVACY_CONFLICT"});
    expect(await subject(a)).toEqual(expect.any(String));
  });
  it("upgrades 0539 without rewriting inventory, preserves table isolation and exposes no new runtime privilege",async()=>{
    const upgrade=await createWorkFixture(false,"postgres");
    try {
      const index=MIGRATION_URLS.findIndex(u=>u.pathname.endsWith("0546_dsar_offboarding.sql")); expect(index).toBeGreaterThan(0);
      for(const url of MIGRATION_URLS.slice(0,index)) await upgrade.admin.query(await readFile(url,"utf8"));
      const tenant=randomUUID(), subjectId=randomUUID(), artifactId=randomUUID();
      await upgrade.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)",[tenant]);
      await workTenant(upgrade.admin,tenant,async db=>{
        await db.query("INSERT INTO app.privacy_subject(tenant_id,id,kind) VALUES($1,$2,'builder')",[tenant,subjectId]);
        await db.query("INSERT INTO app.privacy_artifact(tenant_id,subject_id,id,category,payload) VALUES($1,$2,$3,'source',$4)",[tenant,subjectId,artifactId,{fictional:"upgrade fixture"}]);
      });
      await upgrade.admin.query(await readFile(MIGRATION_URLS[index]!,"utf8"));
      expect((await upgrade.admin.query("SELECT payload,state,hold_ref FROM app.privacy_artifact WHERE id=$1",[artifactId])).rows).toEqual([{payload:{fictional:"upgrade fixture"},state:"active",hold_ref:null}]);
      for(const table of ["privacy_artifact","privacy_subject","privacy_request","privacy_command"]) {
        const row=(await upgrade.admin.query("SELECT relrowsecurity,relforcerowsecurity,has_table_privilege('jobguard_runtime',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') allowed FROM pg_class WHERE oid=$1::regclass",[`app.${table}`])).rows[0];
        expect(row).toEqual({relrowsecurity:true,relforcerowsecurity:true,allowed:false});
      }
      expect((await upgrade.admin.query("SELECT has_function_privilege('jobguard_runtime','app.privacy_inventory_fence()','EXECUTE') allowed")).rows[0].allowed).toBe(false);
      await migrate(f.admin);
    } finally { await closeWorkFixture(upgrade); }
  },120000);
});
