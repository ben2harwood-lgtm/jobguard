import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { Pool } from "pg";
import { appendAuditBatch } from "../../../packages/db/src/audit";
import { withTenant } from "../../../packages/db/src/tenant-context";
import { testTenantContext } from "../../../packages/db/test/tenant-context-test-utils";
import { generateTestIdentityProvider } from "../../api/src/auth/sso/test-identity-provider";

// Written before the screen. NOT RUN in the builder sandbox (PostgreSQL/browser unavailable).
// Fixtures only create fictional persisted owner sessions; all SSO successes use real routes and PostgreSQL.
type Api = { status: number; body: any };
async function api(page: Page, path: string, data?: unknown, csrfToken?: string): Promise<Api> {
  return page.evaluate(async input => {
    const response = await fetch(input.path, {
      method: input.data === undefined ? "GET" : "POST", credentials: "same-origin", cache: "no-store",
      headers: { ...(input.data === undefined ? {} : { "content-type": "application/json" }), ...(input.csrfToken ? { "x-csrf-token": input.csrfToken } : {}) },
      ...(input.data === undefined ? {} : { body: JSON.stringify(input.data) }),
    });
    return { status: response.status, body: await response.json() };
  }, { path, data, csrfToken });
}
async function owner(context: BrowserContext) {
  const tenantId = randomUUID(), userId = randomUUID(), membershipId = randomUUID(), accountId = randomUUID(), assignmentId = randomUUID();
  const email = `admin-${randomUUID()}@${randomUUID()}.fixture.invalid`, token = randomBytes(32).toString("base64url"), csrfToken = randomBytes(24).toString("base64url");
  const pool = new Pool({ host: "127.0.0.1", port: 55432, user: "postgres", password: "sbox-e2e-owner", database: "jobguard_synthetic_demo", max: 1 });
  try {
    await withTenant(pool, testTenantContext(tenantId), async db => {
      await db.$client.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenantId]);
      await db.$client.query("INSERT INTO identity.identity_user(id) VALUES($1)", [userId]);
      await db.$client.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2)", [email, userId]);
      await db.$client.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional SAML contractor')", [accountId, tenantId]);
      await db.$client.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [membershipId, tenantId, accountId, userId]);
      await db.$client.query("INSERT INTO identity.membership_locator(user_id,tenant_id,membership_id) VALUES($1,$2,$3)", [userId, tenantId, membershipId]);
      await db.$client.query("SELECT app.assign_commercial_track($1,$2,'contractor',$3,0,'ENT-10d:e2e-fixture')", [tenantId, assignmentId, `synthetic-agreement:${randomUUID()}`]);
      await db.$client.query("INSERT INTO app.org_unit(tenant_id,id,kind,name) VALUES($1,$1,'tenant','Fictional SAML contractor')", [tenantId]);
      await db.$client.query("INSERT INTO app.contractor_member(tenant_id,membership_id,email) VALUES($1,$2,$3)", [tenantId, membershipId, email]);
      await db.$client.query("INSERT INTO app.role_grant(tenant_id,id,membership_id,role,scope_kind,scope_id) VALUES($1,$2,$3,'owner','tenant',$1)", [tenantId, randomUUID(), membershipId]);
      const digest = createHmac("sha256", "sbox-only-identity-hmac-secret-32-bytes").update(`session:${token}`).digest("hex");
      await db.$client.query("INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at) VALUES($1,$2,'synthetic_demo',$3,$4,clock_timestamp()+interval '1 day')", [randomUUID(), userId, digest, csrfToken]);
      await appendAuditBatch(db,[{id:assignmentId,version:"audit.v1",actorRef:"ENT-10d:e2e-fixture",eventType:"commercial_track.assigned",subjectType:"tenant",subjectRef:tenantId,payload:{references:{assignment:assignmentId,environment:"synthetic_demo"},classifications:{action:"security"}}}]);
    });
  } finally { await pool.end(); }
  await context.addCookies([{ name: "jobguard_session", value: token, url: "http://127.0.0.1:3000", httpOnly: true, secure: true, sameSite: "Strict" }]);
  return { tenantId, csrfToken, email, token };
}

// Only this test's disposable challenge-window fixtures are removed after assertions. The request limits
// remain active during every flow; the merged M0-6L fixtures and their windows are never cleared.
const challengeEmails:string[]=[];
test.afterEach(async()=>{
 if(!challengeEmails.length)return;
 const pool=new Pool({host:"127.0.0.1",port:55432,user:"postgres",password:"sbox-e2e-owner",database:"jobguard_synthetic_demo",max:1});
 try {await pool.query("DELETE FROM identity.request_window w USING identity.challenge c WHERE c.email=ANY($1::text[]) AND w.requested_at=c.requested_at AND w.ip_digest=$2",[challengeEmails,createHmac("sha256","sbox-only-identity-hmac-secret-32-bytes").update("ip:web-bootstrap").digest("hex")]);}
 finally{await pool.end();challengeEmails.length=0;}
});
test("[B] [S1] [S3] SSO requirement persists, emailed-code session is refused and SAML still works",async({page,browser})=>{
 const account=await owner(page.context()),idp=generateTestIdentityProvider();
 await page.goto("/admin/contractor/identity");
 await expect(page.getByRole("note",{name:"SAML sandbox notice"})).toContainText("Practice sandbox");
 await expect(page.getByTestId("sso-required-state")).toHaveText("Off");
 const reason=page.getByLabel("Reason for changing single sign-on requirement");await reason.fill("Synthetic owner verifies the new sign-in boundary");
 await page.getByRole("button",{name:"Turn single sign-on requirement on",exact:true}).click();
 const error=page.getByRole("alert").filter({hasText:"single sign-on session"});
 // No connection is configured yet; configure it first, then ordinary-session refusal is explicit.
 const connectionId=crypto.randomUUID(),domain=account.email.split("@")[1]!;
 expect((await api(page,"/api/auth/sso/new/start",{version:"sso-admin.v1",requested_tenant_id:account.tenantId,action:"connection.create",id:connectionId,idpCert:idp.idpCert},account.csrfToken)).status).toBe(200);
 for(const command of [{action:"domain.verify",domain,proof:`synthetic-domain:${connectionId}:${domain}`},{action:"mapping.set",group:"admins",role:"admin",scope:{kind:"tenant",id:account.tenantId},enabled:true,expectedRevision:0}])expect((await api(page,`/api/auth/sso/${connectionId}/start`,{version:"sso-admin.v1",requested_tenant_id:account.tenantId,connectionId,...command},account.csrfToken)).status).toBe(200);
 await page.getByRole("button",{name:"Reload single sign-on requirement",exact:true}).click();await reason.fill("Synthetic owner verifies the new sign-in boundary");
 await page.getByRole("button",{name:"Turn single sign-on requirement on",exact:true}).click();await expect(error).toBeFocused();
 const connection={id:connectionId,tenantId:account.tenantId,idpEntityId:`urn:jobguard:test-idp:${connectionId}`,spEntityId:`urn:jobguard:sp:${connectionId}`,callbackUrl:`http://127.0.0.1:3000/api/auth/sso/${connectionId}/callback`,entryPoint:`http://127.0.0.1:3000/api/auth/sso/${connectionId}/start`,idpCert:idp.idpCert};
 async function signin(linkExisting=false,email=account.email,subject=account.email) {
  const start=await api(page,`/api/auth/sso/${connectionId}/start`,{version:"sso-start.v1",action:"signin",...(linkExisting?{linkExisting:true}:{})},account.csrfToken);
  const result=await api(page,`/api/auth/sso/${connectionId}/callback`,{version:"sso-callback.v1",SAMLResponse:idp.response({connection,requestId:start.body.requestId,subject,email,groups:["admins"]}),relayState:start.body.relayState});expect(result.status).toBe(200);return result.body;
 }
 await signin(true);await page.reload();await expect(page.getByTestId("sso-required-state")).toHaveText("Off");await reason.fill("Synthetic owner verifies the new sign-in boundary");
 const on=page.getByRole("button",{name:"Turn single sign-on requirement on",exact:true});await on.focus();await expect(on).toBeFocused();
 expect(await on.evaluate(e=>getComputedStyle(e).outlineStyle!=="none"||getComputedStyle(e).boxShadow!=="none")).toBe(true);
 const box=await on.boundingBox();expect(box!.height).toBeGreaterThanOrEqual(44);expect(box!.width).toBeGreaterThanOrEqual(44);await on.press("Enter");
 await expect(page.getByTestId("sso-required-state")).toHaveText("On");await expect(page.getByTestId("sso-required-revision")).toHaveText("1");
 await expect(page.getByText("Emergency access: not available — no approver has been set",{exact:true})).toBeVisible();
 await page.reload();await expect(page.getByTestId("sso-required-state")).toHaveText("On");
 const second=await browser.newContext({storageState:await page.context().storageState()});try {const tab=await second.newPage();await tab.goto("/admin/contractor/identity");await expect(tab.getByTestId("sso-required-state")).toHaveText("On");}finally{await second.close();}
 // Fresh browser and direct verification show the same code, body, status and absence of cookies for both addresses.
 const fresh=await browser.newContext();try {
  const tab=await fresh.newPage();let message:string|null=null;
  for(const email of [account.email,`unknown-${crypto.randomUUID()}@fictional.invalid`]) {
   challengeEmails.push(email);await tab.goto("/sign-in");
   await tab.getByLabel("Sign-in purpose").selectOption("signin");
   await tab.getByLabel("Fictional email address").fill(email);
   const requested=tab.waitForResponse(r=>r.url().endsWith("/api/auth/request")&&r.request().method()==="POST");
   await tab.getByRole("button",{name:"Request code",exact:true}).click();
   const response=await requested;expect(response.status()).toBe(200);expect(await response.json()).toMatchObject({version:"identity-request-response.v1",environment:"synthetic_demo",accepted:true});
   const code=await tab.getByTestId("fixture-code").textContent();expect(code).toMatch(/^\d{8}$/u);
   await tab.getByLabel("Eight-digit code").fill(code!);
   const verification=tab.waitForResponse(r=>r.url().endsWith("/api/auth/verify")&&r.request().method()==="POST");
   await tab.getByRole("button",{name:"Verify code",exact:true}).click();
   const verify=await verification;expect(verify.status()).toBe(400);expect(await verify.json()).toEqual({code:"INVALID_CODE"});
   const alert=tab.getByRole("alert").filter({hasText:"invalid or expired"});await expect(alert).toBeFocused();
   const current=await alert.textContent();if(message===null)message=current;else expect(current).toBe(message);
   expect((await fresh.cookies()).some(c=>c.name==="jobguard_session")).toBe(false);
  }
 }finally{await fresh.close();}
 await signin();await page.reload();await expect(page.getByTestId("sso-required-state")).toHaveText("On");
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
 // A new SAML JIT member gains B through an owner fixture and requests their first emailed signin code.
 const dualEmail=`site-${crypto.randomUUID()}@${domain}`;await signin(false,dualEmail,dualEmail);
 challengeEmails.push(dualEmail);
 const ordinary=await browser.newContext();try {
  const tab=await ordinary.newPage(),other=await owner(ordinary),pool=new Pool({host:"127.0.0.1",port:55432,user:"postgres",password:"sbox-e2e-owner",database:"jobguard_synthetic_demo",max:1});
  try {const u=(await pool.query("SELECT user_id FROM identity.user_email WHERE email=$1",[dualEmail])).rows[0].user_id,a=(await pool.query("SELECT id FROM app.account WHERE tenant_id=$1 LIMIT 1",[other.tenantId])).rows[0].id,m=crypto.randomUUID();await pool.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')",[m,other.tenantId,a,u]);await pool.query("INSERT INTO identity.membership_locator VALUES($1,$2,$3)",[u,other.tenantId,m]);}finally{await pool.end();}
  await tab.goto("/sign-in");const request=await api(tab,"/api/auth/request",{version:"identity-request.v1",email:dualEmail,purpose:"signin"});
  expect((await api(tab,"/api/auth/verify",{version:"identity-verify.v1",email:dualEmail,purpose:"signin",code:request.body.fixtureCode})).status).toBe(200);
  const session=await api(tab,"/api/auth/session");expect(session.body.memberships.map((m:any)=>m.tenantId)).toEqual([other.tenantId]);
 }finally{await ordinary.close();}
});
