import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { beforeAll, afterAll, expect, it } from "vitest";
import { cluster, type Cluster } from "./extra-fixtures.js";
import { meterCompany } from "./meter-persistence-fixtures.js";
import { workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
import { MerchantReliabilityRepository } from "../src/merchant-reliability-repository.js";
let c:Cluster;
beforeAll(async()=>{c=await cluster();},240000);
afterAll(async()=>{await c?.close();});
const company=()=>meterCompany(c as unknown as WorkFixture);
type Company=Awaited<ReturnType<typeof company>>;
async function receipt(a:Company, orderId=randomUUID(), revision=1, supplier="Fictional merchant",status="ready") {
 // Administrative historical synthetic fixture: no commercial command or provider.
 await workTenant(c.admin,a.tenantId,async db=>{
  await db.query("SET LOCAL session_replication_role='replica'");
  const document=randomUUID();
  await db.query("INSERT INTO app.supplier_document(id,tenant_id,job_id,supplier_context,document_type,content_hash,status) VALUES($1,$2,$3,$4,'delivery',$5,$6)",[document,a.tenantId,a.jobId,supplier,randomUUID().replaceAll('-','').repeat(2),status]);
  await db.query("INSERT INTO app.goods_receipt(id,tenant_id,job_id,order_draft_id,document_id,revision,ordered_quantity,delivered_quantity,accepted_quantity,rejected_quantity,missing_quantity,unit) VALUES($1,$2,$3,$4,$5,$6,10,$7::numeric,$7::numeric,0,10-$7::numeric,'each')",[randomUUID(),a.tenantId,a.jobId,orderId,document,revision,revision===1?8:10]);
 }); return orderId;
}
it("counts latest once, keeps tenants/suppliers apart, excludes held latest and writes nothing",async()=>{
 const a=await company(),b=await company();
 const order=await receipt(a);await receipt(a,order,2);await receipt(a);await receipt(a);await receipt(a,randomUUID(),1,"fictional merchant");
 const held=await receipt(a);await receipt(a,held,2,"Fictional merchant","held");await receipt(b);
 const counts=()=>c.admin.query("SELECT (SELECT count(*) FROM app.goods_receipt) receipts,(SELECT count(*) FROM app.supplier_document) documents,(SELECT count(*) FROM app.purchase_order_draft) orders,(SELECT count(*) FROM app.material_rate_revision) rates,(SELECT count(*) FROM app.journal) journals,(SELECT count(*) FROM app.account) accounts");
 const before=(await counts()).rows;
 const repo=new MerchantReliabilityRepository(c.runtime);
 const view=await repo.read(a.context,a.digest,a.jobId);
 expect(view.suppliers).toEqual([expect.objectContaining({supplierContext:"Fictional merchant",ordersReceived:3,ordersAddedLater:1,sample:"counts"}),expect.objectContaining({supplierContext:"fictional merchant",ordersReceived:1,sample:"not enough to say"})]);
 expect((await counts()).rows).toEqual(before);
 await expect(repo.read(a.context,b.digest,a.jobId)).rejects.toThrow();
 await expect(repo.read(a.context,a.digest,b.jobId)).rejects.toThrow();
 await expect(repo.read(b.context,a.digest,a.jobId)).rejects.toThrow();
 await c.admin.query("UPDATE app.membership SET role='foreman' WHERE tenant_id=$1 AND id=$2",[a.tenantId,a.actorId]);
 await expect(repo.read(a.context,a.digest,a.jobId)).rejects.toThrow();
 await c.admin.query("UPDATE app.membership SET role='owner' WHERE tenant_id=$1 AND id=$2",[a.tenantId,a.actorId]);
 await c.admin.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1",[a.sessionId]);
 await expect(repo.read(a.context,a.digest,a.jobId)).rejects.toThrow();
});
it("catalogue proves no table grant, private helper and fixed migration-owned read",async()=>{
 const tableAcl=()=>c.admin.query("SELECT n.nspname,c.relname,c.relacl::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('app','identity') ORDER BY 1,2");
 const before=(await tableAcl()).rows;
 await c.admin.query("DROP FUNCTION app.merchant_delivery_record_read(uuid,text,uuid)");
 await c.admin.query(await readFile(new URL("../migrations/0618_merchant_delivery_record_read.sql",import.meta.url),"utf8"));
 expect((await tableAcl()).rows).toEqual(before);
 const row=(await c.admin.query("SELECT pg_get_userbyid(proowner) owner,prosecdef,proconfig,has_function_privilege('jobguard_runtime',oid,'EXECUTE') runtime,has_function_privilege('jobguard_infrastructure',oid,'EXECUTE') infrastructure FROM pg_proc WHERE oid='app.merchant_delivery_record_read(uuid,text,uuid)'::regprocedure")).rows[0];
 expect(row).toEqual({owner:"jobguard_migration",prosecdef:true,proconfig:["search_path=pg_catalog"],runtime:true,infrastructure:false});
 expect((await c.admin.query("SELECT has_function_privilege('jobguard_runtime','app.mon1_company_actor(uuid,text)','EXECUTE') allowed")).rows[0].allowed).toBe(false);
});
it("refuses a non-synthetic real PostgreSQL database",async()=>{
 const other=await cluster(false,"merchant_record_dark");
 try {await expect(other.runtime.query("SELECT app.merchant_delivery_record_read($1,$2,$3)",[randomUUID(),"a".repeat(64),randomUUID()])).rejects.toThrow("MERCHANT_RECORD_DARK");}
 finally {await other.close();}
},240000);
