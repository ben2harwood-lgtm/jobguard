// Run against the checked V2 server, after seed.integration.test.mjs.
// Authenticate once and reuse the stored browser session at both viewport sizes.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium, expect } from "../../apps/web/node_modules/@playwright/test/index.mjs";
// Copied from V2-BH1 (3e9fad3b), pending its merge; only the DB import path changes.
function v2Origin() {
  const origin = process.env.V2_TEST_ORIGIN;
  assert.ok(origin, "V2_TEST_ORIGIN must name the launcher's HTTPS phone origin");
  const url = new URL(origin);
  assert.equal(url.protocol, "https:", "V2_TEST_ORIGIN must use HTTPS for Secure session cookies");
  return url.origin;
}

async function launchV2Browser() {
  return chromium.launch({ executablePath: process.env.V2_TEST_CHROMIUM });
}

// K5A #929 at 7560b597: one page sign-in, then enter practice with its CSRF token.
async function signInOnce(browser, { jobTitle = "Occupied-home kitchen splashback and hall decorating" } = {}) {
  const origin = v2Origin();
  let context;
  let step = "create context";
  try {
    context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    step = "open sign-in";
    await page.goto(`${origin}/sign-in`);
    step = "request code";
    await page.getByLabel("Fictional email address").fill("builder@jobguard-v2.invalid");
    await page.getByLabel("What do you want to do?").selectOption("signin");
    await page.getByRole("button", { name: "Request code" }).click();
    const code = page.getByTestId("fixture-code");
    await expect(code).toHaveText(/^[0-9]{8}$/u);
    await page.getByLabel("Eight-digit code").fill(await code.textContent());
    step = "verify code";
    const [verified] = await Promise.all([
      page.waitForResponse(`${origin}/api/auth/verify`),
      page.getByRole("button", { name: "Verify code" }).click(),
    ]);
    assert.equal(verified.status(), 200, "Code verification must succeed");
    const { csrfToken } = await verified.json();
    assert.ok(typeof csrfToken === "string" && csrfToken, "Verification must return a CSRF token");
    step = "finish sign-in navigation";
    await page.waitForURL(url => !url.pathname.startsWith("/sign-in"));
    await page.waitForLoadState("load");
    step = "enter practice";
    await page.evaluate(async token => {
      const response = await fetch("/api/auth/practice", {
        method: "POST", headers: { "content-type": "application/json", "x-csrf-token": token },
        body: JSON.stringify({ version: "linked-practice-company.v1", action: "enter" }),
      });
      if (!response.ok) throw new Error(`practice:${response.status}`);
    }, csrfToken);
    step = "find seeded job";
    const { DEMO_TENANT_ID } = await import("../../packages/db/dist/index.js");
    const jobs = await page.evaluate(async tenantId => {
      const response = await fetch(`/api/jobs?tenantId=${tenantId}`);
      if (!response.ok) throw new Error(`jobs:${response.status}`);
      return (await response.json()).jobs;
    }, DEMO_TENANT_ID);
    const jobId = jobs.find(job => job.title.includes(jobTitle))?.id;
    assert.ok(jobId, `The seeded job must appear in Jobs: ${jobTitle}`);
    step = "save session";
    return { origin, storageState: await context.storageState(), csrfToken, jobId };
  } catch (cause) {
    const error = new Error(`V2 browser session failed at ${step}`, { cause });
    error.name = "V2BrowserSessionError";
    throw error;
  } finally {
    await context?.close();
  }
}

async function v2Context(browser, storageState, width) {
  return browser.newContext({ viewport: { width, height: 900 }, ignoreHTTPSErrors: true, storageState });
}

let browser,origin,storageState;
before(async()=>{
 browser=await launchV2Browser();
 ({origin,storageState}=await signInOnce(browser));
});
after(async()=>{await browser?.close();});
for(const width of [360,1280])test(`K6A tray and manual dismissal at ${width}px`,async()=>{
 const context=await v2Context(browser,storageState,width);
 try{
  const page=await context.newPage();await page.goto(origin+"/inbound-mail");
  const main=page.getByRole("main");
  await expect(main.getByRole("heading",{name:"Forwarded merchant mail"})).toBeVisible();
  await expect(main.getByRole("heading",{name:"Mail tray"})).toBeVisible();
  const createAddress=main.getByRole("button",{name:"Create inbound address",exact:true});
  if(await createAddress.count())await createAddress.click();
  const catchInvoice=main.getByRole("button",{name:"Catch practice invoice",exact:true});
  await expect(catchInvoice).toBeEnabled({timeout:15000});
  const subject=`Unknown sender ${width} ${Date.now()}`;
  await main.getByLabel("Sender",{exact:true}).fill("unknown@jobguard-v2.invalid");
  await main.getByLabel("Subject",{exact:true}).fill(subject);
  await expect(catchInvoice).toBeEnabled({timeout:15000});
  await catchInvoice.click();
  const card=main.getByRole("article").filter({has:page.getByRole("heading",{name:subject})});
  await expect(card.getByText("Needs a job",{exact:true})).toBeVisible();
  await card.getByLabel("Choose a job").selectOption({index:1});
  await card.getByRole("button",{name:"File to job",exact:true}).click();
  await expect(card.getByText("Filed",{exact:true})).toBeVisible();
  await expect(card.getByRole("link",{name:"Open supplier documents and three-way check"})).toBeVisible();
  await page.reload();await expect(main.getByRole("article").filter({has:page.getByRole("heading",{name:subject})}).getByText("Filed",{exact:true})).toBeVisible();
  const attachmentSubject=subject+" attachment";
  await main.getByLabel("Subject",{exact:true}).fill(attachmentSubject);
  await main.getByLabel("Simulate a real attachment (held for K6B)").check();
  await expect(catchInvoice).toBeEnabled({timeout:15000});
  await catchInvoice.click();
  const held=main.getByRole("article").filter({has:page.getByRole("heading",{name:attachmentSubject,exact:true})});
  await expect(held.getByText("Needs K6B — real files are not supported yet",{exact:true})).toBeVisible();
  await expect(held.getByRole("button",{name:"File to job",exact:true})).toHaveCount(0);
  await held.getByRole("button",{name:"Dismiss",exact:true}).click();
  await expect(held.getByText("Dismissed",{exact:true})).toBeVisible();
  assert.equal(await main.evaluate(element=>element.scrollWidth<=element.clientWidth && element.getBoundingClientRect().right<=innerWidth),true);
 }finally{await context.close();}
});
