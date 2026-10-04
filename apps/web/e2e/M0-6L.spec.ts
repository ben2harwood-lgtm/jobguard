import { expect, test, type Browser, type Page } from "@playwright/test";
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
// The web adapter shares ONE identity request bucket ("web-bootstrap": 10 requests per 10 minutes) across the whole run, and
// a code can be re-requested for the same email and purpose only after 60 s. This file therefore spends its requests
// deliberately: 1 (first test) + 4 (below) = 5 per project, 10 for both projects, and never repeats an email/purpose.
const ok=(r:Api)=>r.status>=200&&r.status<300;
/** A new owner (own context, own tenant) invites each address; returns that tenant and the invitation references in order. */
async function ownerInvites(browser:Browser,invitees:{email:string;role:string}[]){
 const email=`owner-${crypto.randomUUID()}@practice.invalid`;
 const context=await browser.newContext();
 try {
  const owner=await context.newPage();await owner.goto("/sign-in");
  const response=await api(owner,"/api/auth/request",{method:"POST",data:{version:"identity-request.v1",email,purpose:"signup"}});expect(ok(response)).toBe(true);const code=response.body.fixtureCode;
  const verified=await api(owner,"/api/auth/verify",{method:"POST",data:{version:"identity-verify.v1",email,purpose:"signup",code}});expect(ok(verified)).toBe(true);
  const session=await api(owner,"/api/auth/session");expect(ok(session)).toBe(true);const tenant:string=session.body.memberships[0].tenantId;
  const ids:string[]=[];
  for(const invitee of invitees){
   const invite=await api(owner,"/api/auth/invitations",{method:"POST",headers:{"x-csrf-token":session.body.csrfToken},data:{version:"identity-invitation.v1",requested_tenant_id:tenant,email:invitee.email,role:invitee.role}});expect(ok(invite)).toBe(true);ids.push(invite.body.id);
  }
  return {tenant,ids};
 } finally {await context.close();}
}
async function enterCode(page:Page,email:string){
 await page.getByLabel("Fictional email address").fill(email);await page.getByRole("button",{name:"Request code",exact:true}).click();
 const code=await page.getByTestId("fixture-code").textContent();await page.getByLabel("Eight-digit code").fill(code!);await page.getByRole("button",{name:"Verify code"}).click();
}
test("invitation joins only its stored tenant and role, and the page says plainly whose account it signs you in as",async({browser})=>{
 const recipient=`invite-${crypto.randomUUID()}@practice.invalid`,member=`member-${crypto.randomUUID()}@practice.invalid`;
 // Request budget (see above): member sign-up, owner sign-up, member accepts, recipient accepts = 4 per project. The
 // recipient's verification therefore happens in the member's already signed-in browser, which is exactly the case where
 // the invited address differs from the signed-in one.
 const memberContext=await browser.newContext(),recipientContext=await browser.newContext();
 try {
  // The existing user signs up first (own business, own tenant) and stays signed in with a valid session cookie.
  const memberPage=await memberContext.newPage();await memberPage.goto("/sign-in");await enterCode(memberPage,member);
  await expect(memberPage.getByRole("heading",{name:"Signed in",exact:true})).toBeVisible();await expect(memberPage.getByText("Role: owner",{exact:true})).toBeVisible();
  const ownTenant=(await memberPage.getByTestId("identity-tenant").textContent())!,memberIdentity=(await memberPage.getByTestId("identity-id").textContent())!;
  const invited=await ownerInvites(browser,[{email:member,role:"finance"},{email:recipient,role:"foreman"}]);
  expect(invited.tenant).not.toBe(ownTenant);

  // Someone who is not signed in opens the other invitation link: the form is prefilled and no account-switch warning applies.
  // (Nothing is requested or verified here, so this spends no identity requests.)
  const preview=await recipientContext.newPage();await preview.goto(`/sign-in?invitationId=${invited.ids[1]}`);
  await expect(preview.getByRole("note",{name:"Practice sandbox notice"})).toContainText("Practice sandbox — synthetic data; nothing is sent or charged");
  await expect(preview.getByLabel("Sign-in purpose")).toHaveValue("invitation");await expect(preview.getByLabel("Invitation reference")).toHaveValue(invited.ids[1]!);
  await expect(preview.getByText("switches to that other account")).toHaveCount(0);await expect(preview.getByRole("heading",{name:"Signed in",exact:true})).toHaveCount(0);

  // SAME address: the signed-in user follows an invitation from another tenant that was sent to their own address. The page
  // says what verification does, and afterwards the business is one of THIS account's memberships (identity unchanged).
  await memberPage.goto(`/sign-in?invitationId=${invited.ids[0]}`);
  await expect(memberPage.getByRole("heading",{name:"Signed in",exact:true})).toBeVisible();
  await expect(memberPage.getByTestId("identity-tenant")).toHaveText(ownTenant);
  await expect(memberPage.getByLabel("Invitation reference")).toHaveValue(invited.ids[0]!);
  await expect(memberPage.getByRole("note",{name:"Practice sandbox notice"})).toContainText("Practice sandbox — synthetic data; nothing is sent or charged");
  const guidance=memberPage.getByRole("region",{name:"Accept an invitation"});
  await expect(guidance).toContainText("signs this browser in as the address the invitation was sent to");
  await expect(guidance).toContainText("If that is the address you are signed in with, the invited business is added to this account");
  await expect(guidance).toContainText("If it is a different address, this browser switches to that other account and signs this one out here");
  await expect(guidance).not.toContainText("to your account");
  await enterCode(memberPage,member);
  await expect(memberPage.getByTestId("identity-tenant")).toHaveCount(2);
  await expect(memberPage.getByTestId("identity-id")).toHaveText(memberIdentity);
  await expect(memberPage.getByText("Role: owner",{exact:true})).toBeVisible();await expect(memberPage.getByText("Role: finance",{exact:true})).toBeVisible();
  expect(await memberPage.getByTestId("identity-tenant").allTextContents()).toEqual(expect.arrayContaining([ownTenant,invited.tenant]));
  await expect(memberPage.getByText("is now one of this account's memberships")).toBeVisible();await expect(memberPage.getByText("which is a different account")).toHaveCount(0);
  await expect(memberPage.getByRole("button",{name:"Verify code"})).toHaveCount(0);
  await memberPage.goto("/sign-in");await expect(memberPage.getByTestId("identity-tenant")).toHaveCount(2);
  expect(await memberPage.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);

  // DIFFERENT address: the same signed-in browser follows an invitation sent to someone else (a brand-new user). Verification
  // signs the browser in as that invited address, so the identity changes, only the stored tenant and role appear, and the
  // page says plainly that this is a different account.
  await memberPage.goto(`/sign-in?invitationId=${invited.ids[1]}`);
  await expect(memberPage.getByTestId("identity-tenant")).toHaveCount(2);
  await expect(memberPage.getByLabel("Invitation reference")).toHaveValue(invited.ids[1]!);
  await expect(memberPage.getByRole("region",{name:"Accept an invitation"})).toContainText("If it is a different address, this browser switches to that other account and signs this one out here");
  await enterCode(memberPage,recipient);
  await expect(memberPage.getByText("Role: foreman",{exact:true})).toBeVisible();
  await expect(memberPage.getByTestId("identity-tenant")).toHaveCount(1);await expect(memberPage.getByTestId("identity-tenant")).toHaveText(invited.tenant);
  await expect(memberPage.getByTestId("identity-id")).not.toHaveText(memberIdentity);
  await expect(memberPage.getByText(ownTenant,{exact:true})).toHaveCount(0);
  await expect(memberPage.getByText("now signed in as the invited address, which is a different account from the one you were using")).toBeVisible();
  await expect(memberPage.getByText("is now one of this account's memberships")).toHaveCount(0);
  const recipientIdentity=(await memberPage.getByTestId("identity-id").textContent())!;
  await memberPage.reload();await expect(memberPage.getByTestId("identity-tenant")).toHaveText(invited.tenant);await expect(memberPage.getByTestId("identity-id")).toHaveText(recipientIdentity);
  expect(await memberPage.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
  // A second browser context carrying the same cookies reads the same persisted result.
  const second=await browser.newContext({storageState:await memberContext.storageState()});
  try {const tab=await second.newPage();await tab.goto("/sign-in");await expect(tab.getByTestId("identity-tenant")).toHaveText(invited.tenant);await expect(tab.getByText("Role: foreman",{exact:true})).toBeVisible();await expect(tab.getByTestId("identity-id")).toHaveText(recipientIdentity);}finally{await second.close();}
 } finally {await memberContext.close();await recipientContext.close();}
});
