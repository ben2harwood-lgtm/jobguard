// Run against the checked V2 server, after seed.integration.test.mjs.
// Authenticate once and reuse the stored browser session at both viewport sizes.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium, expect } from "../../apps/web/node_modules/@playwright/test/index.mjs";
const origin=process.env.AUTH_ALLOWED_ORIGIN??"http://127.0.0.1:3400";
let browser,storageState;
before(async()=>{
 browser=await chromium.launch();
 const context=await browser.newContext({ignoreHTTPSErrors:true});
 const page=await context.newPage();
 await page.goto(origin+"/sign-in");
 await page.getByLabel("Fictional email address").fill("builder@jobguard-v2.invalid");
 await page.getByLabel("What do you want to do?").selectOption("signin");
 await page.getByRole("button",{name:"Request code"}).click();
 await expect(page.getByTestId("fixture-code")).toHaveText(/^[0-9]{8}$/u);
 await page.getByLabel("Eight-digit code").fill(await page.getByTestId("fixture-code").textContent());
 await Promise.all([page.waitForResponse(origin+"/api/auth/verify"),page.getByRole("button",{name:"Verify code"}).click()]);
 const entered=await context.request.post(origin+"/api/auth/practice",{
  headers:{origin,"x-csrf-token":(await (await context.request.get(origin+"/api/auth/session")).json()).csrfToken},
  data:{version:"linked-practice-company.v1",action:"enter"},
 });
 assert.equal(entered.status(),200);
 storageState=await context.storageState();await context.close();
});
after(async()=>{await browser?.close();});
for(const width of [360,1280])test(`K6A tray and manual dismissal at ${width}px`,async()=>{
 const context=await browser.newContext({viewport:{width,height:800},ignoreHTTPSErrors:true,storageState});
 try{
  const page=await context.newPage();await page.goto(origin+"/inbound-mail");
  await expect(page.getByRole("heading",{name:"Forwarded merchant mail"})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Mail tray"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Catch practice invoice"})).toBeEnabled();
  const subject=`Unknown sender ${width} ${Date.now()}`;
  await page.getByLabel("Sender",{exact:true}).fill("unknown@jobguard-v2.invalid");
  await page.getByLabel("Subject",{exact:true}).fill(subject);
  await page.getByRole("button",{name:"Catch practice invoice"}).click();
  const card=page.getByRole("article").filter({has:page.getByRole("heading",{name:subject})});
  await expect(card.getByText("Needs a job",{exact:true})).toBeVisible();
  await card.getByLabel("Choose a job").selectOption({index:1});
  await card.getByRole("button",{name:"File to job",exact:true}).click();
  await expect(card.getByText("Filed",{exact:true})).toBeVisible();
  await expect(card.getByRole("link",{name:"Open supplier documents and three-way check"})).toBeVisible();
  await page.reload();await expect(page.getByRole("article").filter({has:page.getByRole("heading",{name:subject})}).getByText("Filed",{exact:true})).toBeVisible();
  const attachmentSubject=subject+" attachment";
  await page.getByLabel("Subject",{exact:true}).fill(attachmentSubject);
  await page.getByLabel("Simulate a real attachment (held for K6B)").check();
  await page.getByRole("button",{name:"Catch practice invoice"}).click();
  const held=page.getByRole("article").filter({has:page.getByRole("heading",{name:attachmentSubject,exact:true})});
  await expect(held.getByText("Needs K6B — real files are not supported yet",{exact:true})).toBeVisible();
  await expect(held.getByRole("button",{name:"File to job",exact:true})).toHaveCount(0);
  await held.getByRole("button",{name:"Dismiss",exact:true}).click();
  await expect(held.getByText("Dismissed",{exact:true})).toBeVisible();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 }finally{await context.close();}
});
