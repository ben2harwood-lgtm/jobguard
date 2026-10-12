import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, test } from "@playwright/test";
import { openQuote, startWatchdogJob } from "./helpers/capture-journey";
import { testTenantContext } from "../../../packages/db/test/tenant-context-test-utils";
import { withTenant } from "../../../packages/db/src/tenant-context";
const T="11111111-1111-4111-8111-111111111111";
test("I: mandatory must-surface Decision survives reload and return through Jobs",async({page})=>{
 await openQuote(page);await startWatchdogJob(page);const jobId=new URL(page.url()).pathname.split('/').pop()!;
 const credential=process.env.SV3_E2E_OWNER_CREDENTIAL??["sbox","e2e","owner"].join('-');
 const admin=new Pool({host:"127.0.0.1",port:55432,database:"jobguard_synthetic_demo",user:"postgres",password:credential,max:1});
 const signal=randomUUID(),evidence=randomUUID(),upload=randomUUID(),firing=randomUUID(),decision=randomUUID(),disclosure=randomUUID(),login=`sv3_browser_${randomUUID().replaceAll('-','')}`,value=randomUUID();
 let shadow:Pool|undefined;
 try{
  await admin.query(`CREATE ROLE ${login} LOGIN PASSWORD '${value}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;GRANT jobguard_shadow TO ${login}`);
  shadow=new Pool({host:"127.0.0.1",port:55432,database:"jobguard_synthetic_demo",user:login,password:value,max:1});
  await withTenant(admin,testTenantContext(T),async db=>{
   await db.$client.query("INSERT INTO app.evidence_upload(id,tenant_id,job_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at) VALUES($1,$2,$3,$1::text,repeat('a',64),'image/png',100,'standard_evidence','2099-10-01')",[upload,T,jobId]);
   await db.$client.query("INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at) VALUES($1,$2,$3,$4,'original','completion_photo',$3::text,'synthetic-v1',repeat('a',64),100,'image/png','standard_evidence','2026-10-01','2026-10-01')",[evidence,T,upload,jobId]);
  });
  await withTenant(shadow,testTenantContext(T),async db=>{
   await db.$client.query("INSERT INTO app.shadow_commercial_signal(tenant_id,job_id,id,work_id,signal_type,detector_kind,detector_version,evidence_cutoff_at,description,confidence_band,estimated_value_pence,must_surface_now) VALUES($1,$2,$3,$3,'possible_extra','deterministic','synthetic:I','2026-10-01','Fictional significant extra','low',800000,true)",[T,jobId,signal]);
   await db.$client.query("INSERT INTO app.shadow_signal_evidence(tenant_id,job_id,signal_id,evidence_id,object_version_id,sha256,source_received_at) VALUES($1,$2,$3,$4,'synthetic-v1',repeat('a',64),'2026-10-01')",[T,jobId,signal,evidence]);
  });
  await withTenant(shadow,testTenantContext(T),db=>db.$client.query("SELECT app.surface_shadow_signal_early($1,$2,$3,$4,$5,$6,'prior_written_agreement','shadow_attribution_policy_v3',$7,'synthetic-v1',$8::jsonb)",
   [T,jobId,signal,firing,decision,disclosure,evidence,JSON.stringify({workReference:"synthetic:I",scopeArea:"job",description:"Fictional significant extra",status:"requested",estimatedValuePence:800000,safetyImplication:false,customerClearlyRequested:true,needsPriorWrittenAgreement:true,significantWork:{basis:"synthetic_fixture",sourceRef:"synthetic:I",significant:true},activeDispute:false,silenceMateriallyWorsensDispute:false,disclosureDuty:false})]));
  async function verify(){await page.goto('/');await page.getByRole('button',{name:/Decisions/u}).first().click();const primary=page.getByRole('button',{name:/Fictional significant extra/u});await primary.focus();await expect(primary).toBeFocused();const target=await primary.boundingBox();expect(target!.height).toBeGreaterThanOrEqual(44);expect(target!.width).toBeGreaterThanOrEqual(44);await page.keyboard.press('Enter');await expect(page.getByTestId('decision-source-ref')).toHaveText(signal);await expect(page.locator('.decision-detail .decision-kind')).toHaveText('mandatory');await expect(page.getByRole('button',{name:'Dismiss suggestion',exact:true})).toHaveCount(0);
   const response=await page.request.get(`/api/decisions?tenantId=${T}&jobId=${jobId}`);expect(response.status()).toBe(200);expect((await response.json()).decisions).toContainEqual(expect.objectContaining({id:decision,classification:'mandatory',source:expect.objectContaining({subjectRef:signal})}));}
  await verify();await page.reload();await verify();await page.getByRole('button',{name:'← Jobs',exact:true}).click();await verify();
  await expect(page.getByText('Practice sandbox — synthetic data; nothing is sent or charged',{exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
  expect((await admin.query("SELECT state,disclosed_before_lock FROM app.shadow_commercial_signal WHERE id=$1",[signal])).rows).toEqual([{state:'surfaced_early',disclosed_before_lock:true}]);
 }finally{await shadow?.end();await admin.query(`DROP OWNED BY ${login};DROP ROLE ${login}`);await admin.end()}
});
