import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INTERIM_APPLICATIONS_ENABLED, assertInterimDocumentIssueAllowed } from "@jobguard/core";
import { InterimDraftRepository } from "../src/interim-draft-repository.js";
import { cluster, type Cluster } from "./extra-fixtures.js";
import { meterCompany } from "./meter-persistence-fixtures.js";
import { workTenant, type WorkFixture } from "./job-work-state-fixtures.js";

describe("M4-18 PostgreSQL synthetic draft books",()=>{
  let c:Cluster;
  beforeAll(async()=>{c=await cluster();},240000);
  afterAll(async()=>{await c?.close();});
  async function fixture() {
    const a=await meterCompany(c as unknown as WorkFixture), baseline=randomUUID(), revision=randomUUID();
    await c.admin.query("INSERT INTO app.quote_version(tenant_id,job_id,id,version,content_hash,net_value_pence,status) VALUES($1,$2,$3,1,$4,10000,'accepted')",
      [a.tenantId,a.jobId,baseline,"a".repeat(64)]);
    await c.admin.query("INSERT INTO app.scope_revision(tenant_id,job_id,id,scope_item_id,revision,description,quantity_decimal,unit,unit_price_pence,total_pence) VALUES($1,$2,$3,$4,1,'Fictional work','1','item',10000,10000)",
      [a.tenantId,a.jobId,revision,a.scopeId]);
    const schedule={id:randomUUID(),version:"interim.schedule.v1",revision:1,previousScheduleId:null,
      baselineSnapshotId:baseline,approvalDecisionId:randomUUID(),valuationDates:["2026-11-01"],jurisdiction:"synthetic_england_wales",
      arrangement:"synthetic_staged",d06TemplateVersion:null,d02TaxPolicyVersion:null,
      lines:[{id:randomUUID(),scopeItemId:a.scopeId,commercialRevisionId:revision,sourceDocumentId:baseline,
        kind:"baseline",approvalDecisionId:null,netPence:10000}]};
    const values=(netPence:number)=>[{scopeItemId:a.scopeId,netPence}];
    const application={id:randomUUID(),version:"interim.application.v1",applicationId:randomUUID(),revision:1,
      previousRevisionId:null,scheduleId:schedule.id,valuationDate:"2026-11-01",kind:"interim",cumulativeValues:values(8000)};
    const certification={id:randomUUID(),version:"interim.certification.v1",applicationRevisionId:application.id,
      certificateReference:randomUUID(),cumulativeValues:values(6000)};
    const invoice={id:randomUUID(),version:"interim.invoice-draft.v1",certificationId:certification.id,lines:values(6000),taxPence:1200};
    const repo=new InterimDraftRepository(c.runtime);
    const input=(record:unknown,commandId=randomUUID())=>({version:"interim.persist-command.v1",commandId,jobId:a.jobId,record});
    const append=(record:unknown)=>repo.command(a.context,a.digest,input(record));
    return {a,schedule,application,certification,invoice,values,repo,input,append};
  }
  it("serializes competing invoice drafts and deduplicates concurrent command replays",async()=>{
    const f=await fixture();
    const command=f.input(f.schedule);
    const results=await Promise.all([f.repo.command(f.a.context,f.a.digest,command),f.repo.command(f.a.context,f.a.digest,command)]);
    expect(results[0]).toEqual(results[1]);expect(results[0]?.rows).toHaveLength(1);
    await expect(f.repo.command(f.a.context,f.a.digest,{...command,record:{...f.schedule,jurisdiction:"changed"}})).rejects.toMatchObject({code:"CONFLICT"});
    await f.append(f.application);await f.append(f.certification);
    const competing=await Promise.allSettled([f.append(f.invoice),f.append({...f.invoice,id:randomUUID()})]);
    expect(competing.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    expect(competing.find(r=>r.status==="rejected")).toMatchObject({reason:{code:"VALUE_LIMIT"}});
    const stored=await new InterimDraftRepository(c.runtime).read(f.a.context,f.a.jobId);
    expect(stored.book.records).toHaveLength(4);expect(stored.reconciliation.netInvoiced.pence).toBe(6000);
    await expect(f.append({...f.invoice,taxPence:0})).rejects.toMatchObject({code:"REPLAY_CONFLICT"});
    for(const row of stored.rows)expect(row.watermark).toBe("SYNTHETIC DRAFT - NOT FOR ISSUE");
  });
  it("reconciles immutable applications, omissions, variations, credits and part receipts from storage",async()=>{
    const f=await fixture();
    for(const r of [f.schedule,f.application,f.certification,f.invoice])await f.append(r);
    const before=await f.repo.read(f.a.context,f.a.jobId);
    await f.append({id:randomUUID(),version:"interim.synthetic-receipt.v1",invoiceId:f.invoice.id,amountPence:2000});
    const paid=await f.repo.read(f.a.context,f.a.jobId);
    expect(paid.reconciliation.lines[0]?.certified.pence).toBe(6000);
    expect(paid.reconciliation.grossReceived.pence).toBe(2000);
    // An omission is a new stored variation revision, never a rewritten baseline.
    const variation=randomUUID(),variationRevision=randomUUID();
    await c.admin.query("INSERT INTO app.variation(tenant_id,job_id,id,scope_item_id,capture_kind,capture_text,description) VALUES($1,$2,$3,$4,'text','Fictional omission','Fictional omission')",
      [f.a.tenantId,f.a.jobId,variation,f.a.scopeId]);
    await c.admin.query(`INSERT INTO app.variation_revision(tenant_id,job_id,id,variation_id,scope_item_id,revision,description,quantity_decimal,unit,unit_rate_pence,signed_delta_pence,content_hash,confirmed_by_membership_id,rate_provenance_kind,rate_source_ref,rate_source_hash,rate_version)
      VALUES($1,$2,$3,$4,$5,1,'Fictional omission','1','item',5000,-5000,$6,$7,'human_entered','fixture',$6,'fixture.v1')`,
      [f.a.tenantId,f.a.jobId,variationRevision,variation,f.a.scopeId,"a".repeat(64),f.a.actorId]);
    const nextSchedule={...f.schedule,id:randomUUID(),revision:2,previousScheduleId:f.schedule.id,
      lines:[...f.schedule.lines,{id:randomUUID(),scopeItemId:f.a.scopeId,commercialRevisionId:variationRevision,
        sourceDocumentId:variation,kind:"approved_variation",approvalDecisionId:randomUUID(),netPence:-5000}]};
    await f.append(nextSchedule);
    const final={...f.application,id:randomUUID(),applicationId:randomUUID(),scheduleId:nextSchedule.id,kind:"final_account",cumulativeValues:f.values(5000)};
    await f.append(final);
    await f.append({...f.certification,id:randomUUID(),applicationRevisionId:final.id,certificateReference:randomUUID(),cumulativeValues:f.values(5000)});
    const credit={id:randomUUID(),version:"interim.credit-draft.v1",invoiceId:f.invoice.id,lines:f.values(1000),taxPence:200};
    await f.append(credit);
    const result=await new InterimDraftRepository(c.runtime).read(f.a.context,f.a.jobId);
    expect(result.book.records.slice(0,4)).toEqual(before.book.records);
    expect(result.reconciliation).toMatchObject({netInvoiced:{pence:5000},grossReceived:{pence:2000},grossOutstanding:{pence:4000},
      priorApplicationRevisionIds:[f.application.id,final.id],lines:[{scheduled:{pence:5000},certified:{pence:5000},invoiceable:{pence:0}}]});
    await expect(f.append({...credit,id:randomUUID(),lines:f.values(6000)})).rejects.toMatchObject({code:"VALUE_LIMIT"});
    expect(INTERIM_APPLICATIONS_ENABLED).toBe(false);expect(()=>assertInterimDocumentIssueAllowed()).toThrow();
    for(const sql of ["UPDATE app.interim_draft_record SET record=record WHERE tenant_id=$1", "DELETE FROM app.interim_draft_record WHERE tenant_id=$1"]) {
      await expect(workTenant(c.admin,f.a.tenantId,async db=>{await db.query("SET LOCAL ROLE jobguard_migration");return db.query(sql,[f.a.tenantId]);})).rejects.toThrow();
      await expect(workTenant(c.runtime,f.a.tenantId,db=>db.query(sql,[f.a.tenantId]))).rejects.toMatchObject({code:"42501"});
    }
    expect(await f.repo.read(f.a.context,f.a.jobId)).toEqual(result);
  });
  it("refuses foreign jobs and sources identically to missing ones without appending",async()=>{
    const f=await fixture(),other=await fixture();
    for(const jobId of [other.a.jobId,randomUUID()]) {
      await expect(f.repo.read(f.a.context,jobId)).rejects.toMatchObject({code:"NOT_FOUND"});
      await expect(f.repo.command(f.a.context,f.a.digest,{...f.input(f.schedule),jobId})).rejects.toMatchObject({code:"NOT_FOUND"});
    }
    const sameTenant=await meterCompany(c as unknown as WorkFixture,f.a.tenantId);
    for(const schedule of [
      {...f.schedule,baselineSnapshotId:other.schedule.baselineSnapshotId,lines:[{...f.schedule.lines[0],sourceDocumentId:other.schedule.baselineSnapshotId}]},
      {...f.schedule,lines:[{...f.schedule.lines[0],scopeItemId:other.a.scopeId}]},
      {...f.schedule,lines:[{...f.schedule.lines[0],scopeItemId:sameTenant.scopeId}]},
      {...f.schedule,lines:[{...f.schedule.lines[0],commercialRevisionId:other.schedule.lines[0]?.commercialRevisionId}]},
    ])await expect(f.append(schedule)).rejects.toMatchObject({code:"NOT_FOUND"});
    expect((await f.repo.read(f.a.context,f.a.jobId)).rows).toEqual([]);
    await expect(f.repo.command(f.a.context,other.a.digest,f.input(f.schedule))).rejects.toMatchObject({code:"UNAVAILABLE"});
    await c.admin.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1",[f.a.sessionId]);
    await expect(f.append(f.schedule)).rejects.toMatchObject({code:"UNAVAILABLE"});
  });
  it("restores the caller tenant setting and restricts raw runtime access",async()=>{
    const f=await fixture();await f.append(f.schedule);
    await workTenant(c.runtime,f.a.tenantId,async db=>{
      await db.query("SELECT app.interim_draft_records($1,$2,$3,'read','{}'::jsonb)",[f.a.tenantId,f.a.digest,f.a.jobId]);
      expect((await db.query("SELECT current_setting('app.tenant_id') t")).rows[0].t).toBe(f.a.tenantId);
    });
    await expect(c.runtime.query("SELECT * FROM app.interim_draft_record")).rejects.toMatchObject({code:"42501"});
    await expect(c.runtime.query("INSERT INTO app.interim_draft_record SELECT * FROM app.interim_draft_record")).rejects.toMatchObject({code:"42501"});
  });
});
