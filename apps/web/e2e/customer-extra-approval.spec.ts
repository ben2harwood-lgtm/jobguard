import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, test } from "@playwright/test";
async function seedJob(admin: Pool, tenant: string) {
 const job = randomUUID(), customer = randomUUID(), cr = randomUUID(), site = randomUUID(), sr = randomUUID(), binding = randomUUID();
 const db = await admin.connect();
 try {
  await db.query("BEGIN"); await db.query("SELECT set_config('app.tenant_id',$1,true)", [tenant]);
  await db.query("INSERT INTO app.job(tenant_id,id,title) VALUES($1,$2,'Fictional customer job')", [tenant, job]);
  await db.query("INSERT INTO app.customer(tenant_id,id) VALUES($1,$2)", [tenant, customer]);
  await db.query("INSERT INTO app.customer_revision(tenant_id,id,customer_id,revision,payload) VALUES($1,$2,$3,1,$4)", [tenant, cr, customer, { version: "customer.v1", name: "Fictional customer", type: "person", email: "portal@example.invalid" }]);
  await db.query("INSERT INTO app.site(tenant_id,id) VALUES($1,$2)", [tenant, site]);
  await db.query("INSERT INTO app.site_revision(tenant_id,id,site_id,revision,payload,match_key) VALUES($1,$2,$3,1,$4,'[]')", [tenant, sr, site, { version: "site.v1", addressLines: ["1 Fictional Road"], town: "London", postcode: "SW1A 1AA" }]);
  await db.query("INSERT INTO app.job_party_binding(tenant_id,id,job_id,revision,customer_id,customer_revision_id,paying_party_id,paying_party_revision_id,site_id,site_revision_id,provenance) VALUES($1,$2,$3,0,$4,$5,$4,$5,$6,$7,'backfilled_synthetic_fixture')", [tenant, binding, job, customer, cr, site, sr]);
  await db.query("INSERT INTO app.job_party_current(tenant_id,job_id,binding_id) VALUES($1,$2,$3)", [tenant, job, binding]);
  await db.query("UPDATE app.job SET status='live' WHERE tenant_id=$1 AND id=$2", [tenant, job]);
  await db.query("COMMIT"); return { job, customer };
 } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
}
test("customer reviews and approves one exact signed extra; builder history records customer method",async({page,browser,baseURL})=>{
 const admin=new Pool({connectionString:process.env.E2E_ADMIN_DATABASE_URL});const context=await browser.newContext();
 try {
  await page.goto("/sign-in");await page.getByLabel("Fictional email address").fill(`extras-builder-${randomUUID()}@practice.invalid`);
  await page.getByRole("button",{name:"Request code",exact:true}).click();const code=await page.getByTestId("fixture-code").textContent();
  await page.getByLabel("Eight-digit code").fill(code!);await page.getByRole("button",{name:"Verify code",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Signed in",exact:true})).toBeVisible();
  const session=await page.evaluate(async()=>(await fetch("/api/auth/session")).json());
  const tenant=session.memberships[0].tenantId as string,fixture=await seedJob(admin,tenant),variation=randomUUID(),revision=randomUUID(),scope=randomUUID(),contentHash="c".repeat(64);
  const actor=(await admin.query("SELECT id FROM app.membership WHERE tenant_id=$1 AND role='owner' AND revoked_at IS NULL",[tenant])).rows[0].id;
  const db=await admin.connect();
  try {
   await db.query("BEGIN");await db.query("SELECT set_config('app.tenant_id',$1,true)",[tenant]);
   await db.query("INSERT INTO app.scope_identity(tenant_id,job_id,id,state) VALUES($1,$2,$3,'reserved')",[tenant,fixture.job,scope]);
   await db.query("INSERT INTO app.variation(tenant_id,job_id,id,scope_item_id,capture_kind,capture_text,description) VALUES($1,$2,$3,$4,'text','Fictional extra socket','Fictional extra socket')",[tenant,fixture.job,variation,scope]);
   await db.query("INSERT INTO app.variation_revision(tenant_id,job_id,id,variation_id,scope_item_id,revision,description,quantity_decimal,unit,unit_rate_pence,signed_delta_pence,content_hash,confirmed_by_membership_id,rate_provenance_kind,rate_source_ref,rate_source_hash,rate_version) VALUES($1,$2,$3,$4,$5,1,'Fictional extra socket','1','item',5000,5000,$6,$7,'human_entered','synthetic://fixture',$6,'fixture-v1')",[tenant,fixture.job,revision,variation,scope,contentHash,actor]);
   await db.query("UPDATE app.variation SET current_revision_id=$3,state='priced' WHERE tenant_id=$1 AND id=$2",[tenant,variation,revision]);await db.query("COMMIT");
  }catch(error){await db.query("ROLLBACK");throw error;}finally{db.release();}
  const issue=await page.evaluate(async({tenant,fixture,csrf})=>{const r=await fetch("/api/customer-portal/issue",{method:"POST",headers:{"Content-Type":"application/json","x-csrf-token":csrf},body:JSON.stringify({version:"customer-link-issue.v1",tenantId:tenant,jobId:fixture.job,customerId:fixture.customer})});return {status:r.status,body:await r.json()};},{tenant,fixture,csrf:session.csrfToken});
  expect(issue.status).toBe(200);
  const path=(await admin.query("SELECT o.immutable_content FROM app.customer_portal_grant g JOIN app.action_outbox o ON(o.tenant_id,o.id)=(g.tenant_id,g.outbox_id) WHERE g.tenant_id=$1 AND g.id=$2",[tenant,issue.body.grantId])).rows[0].immutable_content;
  const customer=await context.newPage();await customer.goto(`${baseURL}${path}`);await customer.getByRole("button",{name:"Sign in",exact:true}).click();
  await customer.getByRole("link",{name:"Review extras",exact:true}).click();
  await expect(customer.getByRole("heading",{name:"Fictional extra socket"})).toBeVisible();
  await expect(customer.getByText(`Content hash: ${contentHash}`)).toBeVisible();
  await customer.getByRole("button",{name:"Approve revision 1 for +£50.00",exact:true}).click();
  await expect(customer.getByText("Approved · authenticated customer",{exact:true})).toBeVisible();
  await customer.reload();await expect(customer.getByText("Approved · authenticated customer",{exact:true})).toBeVisible();
  expect((await admin.query("SELECT method,actor_membership_id,signed_delta_pence FROM app.variation_approval WHERE tenant_id=$1 AND variation_id=$2",[tenant,variation])).rows).toEqual([{method:"customer_authenticated",actor_membership_id:null,signed_delta_pence:"5000"}]);
  await customer.goto(`${baseURL}/customer/extras?jobId=${randomUUID()}`);
  await expect(customer.getByText("Extras are unavailable. Sign in using your builder’s latest email link.")).toBeVisible();
  await expect(customer.getByRole("heading",{name:"Fictional extra socket"})).toHaveCount(0);
 }finally{await context.close();await admin.end();}
});
