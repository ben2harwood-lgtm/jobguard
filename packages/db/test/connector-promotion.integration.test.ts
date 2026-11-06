// Real PostgreSQL only; intentionally not executed in the restricted builder sandbox.
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { ConnectorPromotionRepository, ContractorRepository, WorkOrderRepository, generateWorkOrderSample, prepareWorkOrderDemo, withTenant, derivedUuid } from "../src/index.js";
import { cluster } from "./extra-fixtures.js";
import { seedActiveContractorAgreement } from "./contractor-agreement-test-fixture.js";
import { promptSession, promptFixture } from "./enterprise-live-prompt-fixtures.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
let c: Awaited<ReturnType<typeof cluster>>, repo: ConnectorPromotionRepository;
beforeAll(async()=>{process.env.JOBGUARD_ENV="synthetic_demo";c=await cluster();repo=new ConnectorPromotionRepository(c.runtime);},180_000);
afterAll(async()=>{await c?.close();});
async function organisation() {
 const p=await new ContractorRepository(c.runtime).startPractice(randomUUID());await seedActiveContractorAgreement(c.admin,p.tenantId);
 const demo=await prepareWorkOrderDemo(c.runtime,p), session=await promptSession(c,{member:p,grant:"unused"});
 return {p,demo,session};
}
async function stage(tenant:string,kind="work_order",document="fixture:starter_orders",revision=1,subject="fixture:demo-orders",eventId=`fixture:event_${randomUUID().replaceAll("-","")}`) {
 const binding=randomUUID(),token="fictional-promotion-token-long-enough-0001",namespace="fixture:promotion";
 await c.admin.query(`INSERT INTO connector.binding(tenant_id,id,namespace,environment,endpoint_kind,token_sha256,expires_at)
 VALUES($1,$2,$3,'synthetic_demo','fake',$4,clock_timestamp()+interval '1 hour')`,[tenant,binding,namespace,createHash("sha256").update(token).digest("hex")]);
 const input={version:"connector-input.v1",eventId,kind,subject,revision,...(kind==="billing_status"?{status:"paid"}:{document})};
 const receipt=(await c.admin.query("SELECT connector.intake($1,$2,$3::jsonb) value",[binding,token,JSON.stringify(input)])).rows[0].value;
 return {selection:{version:"connector-promotion.v1",namespace,eventId},receipt,binding,token,input};
}
async function counts(tenant:string) {
 const tables=["work_order","work_order_revision","work_order_line","materials_issue_fact","audit_event","connector_promotion","prompt_resolution","extra_origin"];
 return Object.fromEntries(await Promise.all(tables.map(async table=>[table,(await c.admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1`,[tenant])).rows[0].n])));
}
it("imports exactly ENT-2 generated baseline prices, replays once, and keeps the connector receipt staged",async()=>{
 const f=await organisation(),e=await stage(f.p.tenantId);
 const first=await repo.promote(f.session,e.selection),before=await counts(f.p.tenantId);
 expect(await repo.promote(f.session,e.selection)).toEqual(first);expect(await counts(f.p.tenantId)).toEqual(before);
 const generated=await new WorkOrderRepository(c.runtime).importCsv(f.p,{commandId:randomUUID(),name:"generated: starter_orders",kind:"generated",csv:generateWorkOrderSample("starter_orders",f.demo)});
 expect(first).toMatchObject({batchId:generated.batchId,rows:generated.rows,counts:generated.counts});
 expect(before.work_order).toBe(5);expect(before.connector_promotion).toBe(1);
 expect((await c.admin.query("SELECT receipt FROM connector.input_event WHERE tenant_id=$1 AND event_id=$2",[f.p.tenantId,e.selection.eventId])).rows[0].receipt).toEqual(e.receipt);
 expect(e.receipt).toMatchObject({state:"staged",domainEffects:0});
 const prices=(await c.admin.query("SELECT rate_pence,net_pence,origin FROM app.work_order_line WHERE tenant_id=$1 ORDER BY rate_pence,net_pence",[f.p.tenantId])).rows;
 expect(prices).toHaveLength(10);expect(prices.every(l=>l.origin==="client_instruction")).toBe(true);
 expect(prices.some(l=>Number(l.rate_pence)===10000 && Number(l.net_pence)===9650)).toBe(true);
});
it("uses the existing ENT-2 revision rules and never reimports a prior event after a later revision",async()=>{
 const f=await organisation(),e=await stage(f.p.tenantId);const first=await repo.promote(f.session,e.selection);
 const later=await stage(f.p.tenantId,"work_order","fixture:revised_orders",2);
 expect(await repo.promote(f.session,later.selection)).toMatchObject({counts:{revised:3,unchanged:1,rejected:0}});
 const before=await counts(f.p.tenantId);expect(await repo.promote(f.session,e.selection)).toEqual(first);expect(await counts(f.p.tenantId)).toEqual(before);
});
it("imports one materials fact through the existing authority, without confirming a prompt",async()=>{
 const f=await organisation();await repo.promote(f.session,(await stage(f.p.tenantId)).selection);
 const e=await stage(f.p.tenantId,"materials_issue","fixture:door-materials",1,"fixture:demo-order-1"),before=await counts(f.p.tenantId);
 const result=await repo.promote(f.session,e.selection);expect(await repo.promote(f.session,e.selection)).toEqual(result);
 const after=await counts(f.p.tenantId);expect(after.materials_issue_fact).toBe(before.materials_issue_fact+1);
 expect(after.prompt_resolution).toBe(before.prompt_resolution);expect(after.extra_origin).toBe(before.extra_origin);
});
it("hides foreign/altered event identities, refuses removed members and unauthorized members without writes",async()=>{
 const a=await organisation(),b=await organisation(),e=await stage(a.p.tenantId),before=await counts(a.p.tenantId);
 for(const selection of [e.selection,{...e.selection,eventId:"fixture:unknown"},{...e.selection,namespace:"fixture:other"}]) {
  await expect(repo.promote(b.session,selection)).rejects.toMatchObject({code:"NOT_FOUND"});
 }
 expect(await counts(a.p.tenantId)).toEqual(before);
 const f=await promptFixture(c),forbidden=await stage(f.p.tenantId);
 const state=await counts(f.p.tenantId);
 await expect(repo.promote(f.sessions.operative!,forbidden.selection)).rejects.toMatchObject({code:"NOT_FOUND"});
 expect(await counts(f.p.tenantId)).toEqual(state);
 await c.admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",[a.p.tenantId,a.p.membershipId]);
 await expect(repo.promote(a.session,e.selection)).rejects.toMatchObject({code:"NOT_FOUND"});
 expect(await counts(a.p.tenantId)).toEqual(before);
});
it("unknown fixture labels and billing composition holds write nothing",async()=>{
 const f=await organisation();
 for(const e of [await stage(f.p.tenantId,"work_order","fixture:unknown"),await stage(f.p.tenantId,"billing_status","fixture:unused",1,"fixture:invoice")]) {
  const before=await counts(f.p.tenantId);await expect(repo.promote(f.session,e.selection)).rejects.toMatchObject({code:"INVALID_COMMAND"});expect(await counts(f.p.tenantId)).toEqual(before);
 }
 expect((await repo.list(f.session)).find(e=>e.kind==="billing_status")?.hold).toBe("BILLING_COMPOSITION_REQUIRED");
});
it("promotion-record failure rolls back orders, revisions, prices, materials and every import audit",async()=>{
 await c.admin.query(`CREATE FUNCTION public.abort_connector_promotion() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fictional promotion failure'; END $$`);
 try {
  for(const scenario of ["create","revision","material"]) {
   const f=await organisation();if(scenario!=="create")await repo.promote(f.session,(await stage(f.p.tenantId)).selection);
   const e=scenario==="material"?await stage(f.p.tenantId,"materials_issue","fixture:door-materials",1,"fixture:demo-order-1")
    :scenario==="revision"?await stage(f.p.tenantId,"work_order","fixture:revised_orders",2):await stage(f.p.tenantId);
   const before=await counts(f.p.tenantId);
   await c.admin.query("CREATE TRIGGER fixture_promotion_abort BEFORE INSERT ON app.connector_promotion FOR EACH ROW EXECUTE FUNCTION public.abort_connector_promotion()");
   try {await expect(repo.promote(f.session,e.selection)).rejects.toMatchObject({code:"DATABASE_UNAVAILABLE"});expect(await counts(f.p.tenantId)).toEqual(before);}
   finally {await c.admin.query("DROP TRIGGER fixture_promotion_abort ON app.connector_promotion");}
   await expect(repo.promote(f.session,e.selection)).resolves.toBeDefined();
  }
 } finally {await c.admin.query("DROP FUNCTION public.abort_connector_promotion()");}
});
it("connector role cannot execute promotion or reach origin, prices, approvals or statements",async()=>{
 for(const sql of ["SELECT app.connector_promotion(NULL,NULL,NULL,NULL,NULL)","UPDATE app.extra_origin SET kind='site_user'","UPDATE app.work_order_line SET rate_pence=1","SELECT * FROM app.enterprise_fee_statement","SELECT * FROM app.prompt_resolution"]) {
  const db=await c.admin.connect();try {await db.query("BEGIN");await db.query("SET LOCAL ROLE jobguard_connector");await expect(db.query(sql)).rejects.toMatchObject({code:"42501"});}
  finally {await db.query("ROLLBACK");db.release();}
 }
 const f=await organisation();await expect(repo.promote(randomUUID(),(await stage(f.p.tenantId)).selection)).rejects.toMatchObject({code:"UNAUTHENTICATED"});
});
it("direct SQL cannot substitute a command id or forge an import effect",async()=>{
 const f=await organisation(),e=await stage(f.p.tenantId),context=testTenantContext(f.p.tenantId),before=await counts(f.p.tenantId);
 for(const command of [randomUUID(),derivedUuid(`${f.p.tenantId}:${e.selection.namespace}:${e.selection.eventId}`)]) {
  await expect(withTenant(c.runtime,context,db=>db.$client.query("SELECT app.connector_promotion($1,$2,$3,$4,$5::jsonb)",[f.session,e.selection.namespace,e.selection.eventId,command,JSON.stringify({batchId:randomUUID(),version:"work-order-import-result.v1"})]))).rejects.toBeDefined();
 }
 expect(await counts(f.p.tenantId)).toEqual(before);
});
