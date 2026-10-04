import { expect, test, type Page } from "@playwright/test";
const origin="http://127.0.0.1:3000";
// The session cookie is Secure. Chromium sends it to http://127.0.0.1, but Playwright's APIRequestContext (the `request`
// fixture and `page.request`) only treats "localhost" as secure and never attaches a Secure cookie to 127.0.0.1.
// Calls that need the signed-in session therefore run as real same-origin fetches inside the browser, which carries the
// actual cookie jar; cookie-less negative calls keep using the API client.
type Api={status:number;body:any};
const api=(page:Page,path:string,init:{method?:string;headers?:Record<string,string>;data?:unknown}={}):Promise<Api>=>page.evaluate(async({path,init})=>{
 const headers:Record<string,string>={...init.headers};if(init.data!==undefined)headers["content-type"]="application/json";
 const response=await fetch(path,{method:init.method??"GET",credentials:"same-origin",headers,body:init.data===undefined?null:JSON.stringify(init.data)});
 return {status:response.status,body:await response.json().catch(()=>null)};
},{path,init});
test("entered code persists a server-owned tenant, rejects replay and real email, and resumes in another context",async({page,browser})=>{
 const email=`builder-${crypto.randomUUID()}@practice.invalid`;
 await page.goto("/sign-in");
 await expect(page.getByRole("note",{name:"Practice sandbox notice"})).toContainText("Practice sandbox — synthetic data; nothing is sent or charged");
 await page.getByLabel("Fictional email address").fill(email);
 const request=page.getByRole("button",{name:"Request code",exact:true});await request.focus();await expect(request).toBeFocused();
 const bounds=await request.boundingBox();expect(bounds!.height).toBeGreaterThanOrEqual(44);expect(bounds!.width).toBeGreaterThanOrEqual(44);
 expect(await request.evaluate(e=>getComputedStyle(e).outlineStyle!=="none"||getComputedStyle(e).boxShadow!=="none")).toBe(true);
 await request.press("Enter");
 const code=await page.getByTestId("fixture-code").textContent();expect(code).toMatch(/^\d{8}$/u);
 const wrong=code==="00000000"?"11111111":"00000000";
 await page.getByLabel("Eight-digit code").fill(wrong);await page.getByRole("button",{name:"Verify code"}).click();
 const alert=page.getByRole("alert").filter({hasText:"invalid or expired"});await expect(alert).toHaveCount(1);await expect(alert).toBeFocused();
 await page.getByLabel("Eight-digit code").fill(code!);await page.getByRole("button",{name:"Verify code"}).click();
 await expect(page.getByRole("heading",{name:"Signed in",exact:true})).toBeVisible();await expect(page.getByText("Role: owner",{exact:true})).toBeVisible();
 const identity=await page.getByTestId("identity-id").textContent(),tenant=await page.getByTestId("identity-tenant").textContent();
 const cookies=await page.context().cookies();const cookie=cookies.find(c=>c.name==="jobguard_session")!;
 expect(cookie).toMatchObject({httpOnly:true,secure:true,sameSite:"Strict"});
 await page.reload();await expect(page.getByTestId("identity-id")).toHaveText(identity!);await expect(page.getByTestId("identity-tenant")).toHaveText(tenant!);
 const second=await browser.newContext({storageState:await page.context().storageState()});
 try {const tab=await second.newPage();await tab.goto("/sign-in");await expect(tab.getByTestId("identity-tenant")).toHaveText(tenant!);}finally{await second.close();}
 const replay=await page.request.post("/api/auth/verify",{headers:{origin},data:{version:"identity-verify.v1",email,purpose:"signup",code}});expect(replay.status()).toBe(400);expect(await replay.json()).toEqual({code:"INVALID_CODE"});
 const real=await page.request.post("/api/auth/request",{headers:{origin},data:{version:"identity-request.v1",email:"person@example.com",purpose:"signup"}});expect(real.status()).toBe(403);expect(await real.json()).toEqual({code:"IDENTITY_ROUTE_BLOCKED"});
 const elevation=await page.request.post("/api/auth/request",{headers:{origin},data:{version:"identity-request.v1",email,purpose:"signup",role:"admin"}});expect(elevation.status()).toBe(400);
 const session=await api(page,"/api/auth/session");expect(session.status).toBe(200);
 const wrongTenant=await api(page,"/api/auth/invitations",{method:"POST",headers:{"x-csrf-token":session.body.csrfToken,"x-tenant-id":crypto.randomUUID()},data:{version:"identity-invitation.v1",email:"invitee@practice.invalid",requested_tenant_id:tenant,role:"foreman"}});expect(wrongTenant.status).toBe(403);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
 // Jobs still uses its separately scoped demo session; returning to identity preserves its own tenant.
 await page.getByRole("link",{name:"Open practice Jobs"}).click();await page.goto("/sign-in");await expect(page.getByTestId("identity-tenant")).toHaveText(tenant!);
});
test("invitation joins only its stored tenant and role after email verification",async({browser})=>{
 const email=`owner-${crypto.randomUUID()}@practice.invalid`,recipient=`invite-${crypto.randomUUID()}@practice.invalid`;
 const ok=(r:Api)=>r.status>=200&&r.status<300;
 let tenant="",id="";
 const ownerContext=await browser.newContext();
 try {
  const owner=await ownerContext.newPage();await owner.goto("/sign-in");
  const response=await api(owner,"/api/auth/request",{method:"POST",data:{version:"identity-request.v1",email,purpose:"signup"}});expect(ok(response)).toBe(true);const code=response.body.fixtureCode;
  const verified=await api(owner,"/api/auth/verify",{method:"POST",data:{version:"identity-verify.v1",email,purpose:"signup",code}});expect(ok(verified)).toBe(true);
  const session=await api(owner,"/api/auth/session");expect(ok(session)).toBe(true);tenant=session.body.memberships[0].tenantId;
  const invite=await api(owner,"/api/auth/invitations",{method:"POST",headers:{"x-csrf-token":session.body.csrfToken},data:{version:"identity-invitation.v1",requested_tenant_id:tenant,email:recipient,role:"foreman"}});expect(ok(invite)).toBe(true);id=invite.body.id;
 } finally {await ownerContext.close();}
 const context=await browser.newContext();try {const page=await context.newPage();await page.goto(`/sign-in?invitationId=${id}`);await page.getByLabel("Fictional email address").fill(recipient);await page.getByRole("button",{name:"Request code",exact:true}).click();const code=await page.getByTestId("fixture-code").textContent();await page.getByLabel("Eight-digit code").fill(code!);await page.getByRole("button",{name:"Verify code"}).click();await expect(page.getByText("Role: foreman",{exact:true})).toBeVisible();await expect(page.getByTestId("identity-tenant")).toHaveText(tenant);await page.reload();await expect(page.getByTestId("identity-tenant")).toHaveText(tenant);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);}finally{await context.close();}
});
