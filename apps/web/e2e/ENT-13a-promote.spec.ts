import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import { seedActiveContractorAgreement } from "../../../packages/db/test/contractor-agreement-test-fixture.js";
import { expect, test } from "@playwright/test";
// Native import keeps @jobguard/core/db outside Playwright's source loader.
const loadDb = () => (new Function("specifier","return import(specifier)") as (specifier:string)=>Promise<typeof import("@jobguard/db")>)(pathToFileURL(join(process.cwd(),"../../packages/db/dist/index.js")).href);
test.setTimeout(240_000);
test("a human promotes a staged work order and materials issue at phone and desktop widths",async({page,context})=>{
 const {ContractorRepository,prepareWorkOrderDemo}=await loadDb();
 const runtime=new Pool({connectionString:process.env.DATABASE_URL ?? "postgresql://jobguard_runtime:sbox-e2e-runtime@127.0.0.1:55432/jobguard_synthetic_demo",max:1});
 const admin=new Pool({connectionString:process.env.E2E_ADMIN_DATABASE_URL,max:1});
 try {
  const session=randomUUID(),member=await new ContractorRepository(runtime).startPractice(session);
  await seedActiveContractorAgreement(admin,member.tenantId);
  await prepareWorkOrderDemo(runtime,member);
  const binding=randomUUID(),token="fictional-browser-promotion-token-0001";
  await admin.query(`INSERT INTO connector.binding(tenant_id,id,namespace,environment,endpoint_kind,token_sha256,expires_at)
   VALUES($1,$2,'fixture:browser','synthetic_demo','fake',$3,clock_timestamp()+interval '1 hour')`,[member.tenantId,binding,createHash("sha256").update(token).digest("hex")]);
  for(const event of [{eventId:"fixture:orders",kind:"work_order",subject:"fixture:demo-orders",document:"fixture:starter_orders"},
   {eventId:"fixture:materials",kind:"materials_issue",subject:"fixture:demo-order-1",document:"fixture:door-materials"}]) {
   await admin.query("SELECT connector.intake($1,$2,$3::jsonb)",[binding,token,JSON.stringify({version:"connector-input.v1",revision:1,...event})]);
  }
  await context.addCookies([{name:"jg_session",value:session,url:"http://127.0.0.1:3000",httpOnly:true,sameSite:"Strict"}]);
  await page.goto("/contractor/connector-promotions");
  await page.getByRole("button",{name:"Promote work order",exact:true}).click();
  await expect(page.getByRole("status")).toHaveText("Promotion recorded");
  await page.getByRole("button",{name:"Promote materials issue",exact:true}).click();
  await expect(page.getByText("Promoted",{exact:true})).toHaveCount(2);
  await page.reload();await expect(page.getByText("Promoted",{exact:true})).toHaveCount(2);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
  expect((await admin.query("SELECT count(*)::int n FROM app.connector_promotion WHERE tenant_id=$1",[member.tenantId])).rows[0].n).toBe(2);
  expect((await admin.query("SELECT count(*)::int n FROM app.materials_issue_fact WHERE tenant_id=$1",[member.tenantId])).rows[0].n).toBe(1);
  expect((await admin.query("SELECT receipt->>'state' state,receipt->>'domainEffects' effects FROM connector.input_event WHERE tenant_id=$1",[member.tenantId])).rows).toEqual([{state:"staged",effects:"0"},{state:"staged",effects:"0"}]);
 } finally {await runtime.end();await admin.end();}
});
