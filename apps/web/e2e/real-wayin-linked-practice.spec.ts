import { createHmac } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { openCapture } from "./helpers/capture-journey";
import { E2E_ADMIN_DATABASE_URL, E2E_AUTH_CODE_SECRET } from "./global-setup";

const emails:string[]=[];
async function releaseSignIns() {
  if(!emails.length)return;
  const pool=new Pool({connectionString:E2E_ADMIN_DATABASE_URL,max:1});
  try {await pool.query(`DELETE FROM identity.request_window w USING identity.challenge c
    WHERE c.email=ANY($1::text[]) AND w.requested_at=c.requested_at AND w.ip_digest=$2`,
    [emails,createHmac("sha256",E2E_AUTH_CODE_SECRET).update("ip:web-bootstrap").digest("hex")]);
    // Advance only this test's consumed fictional challenges beyond resend cooldown.
    // Production throttling stays unchanged; fresh-device sign-ins need no minute-long sleeps.
    await pool.query("UPDATE identity.challenge SET requested_at=requested_at-interval '61 seconds' WHERE email=ANY($1::text[]) AND consumed_at IS NOT NULL AND verified",[emails]);}
  finally{await pool.end();emails.length=0;}
}
test.afterEach(releaseSignIns);
async function signin(page:Page,email:string,purpose="signup") {
  emails.push(email);await page.goto("/sign-in");
  await page.getByLabel("Fictional email address").fill(email);
  await page.getByLabel("What do you want to do?").selectOption(purpose);
  await page.getByRole("button",{name:"Request code",exact:true}).click();
  await page.getByLabel("Eight-digit code").fill((await page.getByTestId("fixture-code").textContent())!);
  await page.getByRole("button",{name:"Verify code",exact:true}).click();
  // Failing-first assertion on original main: it stays on /sign-in, with a /classic link.
  await expect(page).toHaveURL(/\/practice-company$/);
  await expect(page.getByRole("region",{name:"Verified account",exact:true})).toBeVisible();
  await releaseSignIns();
}
async function jobStatus(page:Page,id:string) {
  return page.evaluate(async id=>{const r=await fetch(`/api/jobs/${id}`,{cache:"no-store"});return r.status;},id);
}

test("fictional sign-in opens the same own practice firm without the classic detour",async({page,browser})=>{
  test.setTimeout(180_000);
  await page.setViewportSize({width:390,height:844});
  const email=`linked-${crypto.randomUUID()}@practice.invalid`;
  await signin(page,email);
  await expect(page.getByRole("heading",{name:"Ready for your first job",exact:true})).toBeVisible();
  const profile=page.getByRole("region",{name:"Name your practice business",exact:true});
  await expect(profile.getByLabel("Trading name",{exact:true})).toBeEditable();
  await profile.getByLabel("Trading name",{exact:true}).fill("Fictional Linked Oak");
  await profile.getByRole("button",{name:"Save firm details",exact:true}).focus();await page.keyboard.press("Enter");
  await expect(profile.getByRole("status")).toContainText("Firm details saved.");
  await page.reload();await expect(profile.getByLabel("Trading name",{exact:true})).toHaveValue("Fictional Linked Oak");
  await expect(page.getByRole("heading",{name:"Fictional Linked Oak",exact:true})).toBeVisible();
  for(const name of ["Open my jobs","Reset practice firm","Sign out"]) {
    const button=page.getByRole("button",{name,exact:true});await button.focus();await expect(button).toBeFocused();await button.scrollIntoViewIfNeeded();const box=await button.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);expect(box!.width).toBeGreaterThanOrEqual(44);expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(390);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=390)).toBe(true);
  await page.getByRole("button",{name:"＋ Start a new job",exact:true}).click();
  const source=page.getByLabel("Work details");await expect(source).toHaveValue("");await expect(source).toHaveAttribute("placeholder",/Practice decorating/);
  const words="Fictional porch. Paint door £120.00.";
  await source.pressSequentially(words); // No fill/clear: own-job starts empty.
  const saved=page.waitForResponse(r=>r.url().endsWith("/api/jobs/capture")&&r.request().method()==="POST");
  await page.getByRole("button",{name:"Make my draft",exact:true}).click();
  const response=await saved;expect(response.status()).toBe(201);const captured=await response.json();expect(captured.source.text).toBe(words);const id=captured.jobId as string;
  await page.getByText("See the original words saved with this draft",{exact:true}).click();
  await expect(page.locator(".proposal pre")).toHaveText(words);
  await page.getByRole("button",{name:"Check and edit my draft",exact:true}).click();await expect(page).toHaveURL(new RegExp(`/jobs/${id}$`));
  await page.reload();expect(await jobStatus(page,id)).toBe(200);
  await page.goto("/practice-company");await page.reload();
  await page.locator(`a[href="/jobs/${id}"]`).first().click();await expect(page).toHaveURL(new RegExp(`/jobs/${id}$`));
  await page.goto("/practice-company");await page.getByRole("button",{name:"Sign out",exact:true}).click();
  await expect(page).toHaveURL(/\/sign-in$/);await signin(page,email,"signin");expect(await jobStatus(page,id)).toBe(200);
  // Close the original browser context; the next sign-in has no saved browser state.
  await page.context().close();
  const fresh=await browser.newContext({viewport:{width:390,height:844}}),second=await browser.newContext({viewport:{width:390,height:844}}),stranger=await browser.newContext(),anonymous=await browser.newContext();
  try {
    const freshPage=await fresh.newPage(),device=await second.newPage(),other=await stranger.newPage(),anon=await anonymous.newPage();
    await signin(freshPage,email,"signin");expect(await jobStatus(freshPage,id)).toBe(200);
    await signin(device,email,"signin");expect(await jobStatus(device,id)).toBe(200);
    const credential=async(context:typeof fresh)=>(await context.cookies()).find(c=>c.name==="jg_session")!.value;
    expect(await credential(fresh)).not.toBe(await credential(second));
    await signin(other,`stranger-${crypto.randomUUID()}@practice.invalid`);expect(await jobStatus(other,id)).toBe(404);
    await anon.goto("/practice-company");await expect(anon.getByRole("heading",{name:"Ready for your first job",exact:true})).toBeVisible();expect(await jobStatus(anon,id)).toBe(404);
    // A switched parent with stale practice cookies must show recovery, not an empty firm.
    const otherIdentity=(await stranger.cookies()).find(c=>c.name==="jobguard_session")!;
    await fresh.addCookies([otherIdentity]);await freshPage.goto("/practice-company?name=Forged");
    await expect(freshPage.getByRole("alert")).toContainText("Your previous jobs have not been deleted");await expect(freshPage.getByRole("heading",{name:"Ready for your first job",exact:true})).toHaveCount(0);
  } finally{await fresh.close();await second.close();await stranger.close();await anonymous.close();}
});

test("own jobs at /jobs/new start empty while the classic example keeps six suggestions",async({page})=>{
  test.setTimeout(180_000);
  await page.setViewportSize({width:390,height:844});await signin(page,`capture-${crypto.randomUUID()}@practice.invalid`);
  await page.goto("/jobs/new");await expect(page.getByLabel("Work details")).toHaveValue("");await expect(page.getByLabel("Work details")).toHaveAttribute("placeholder",/Practice decorating/);
  await page.getByLabel("Work details").pressSequentially("Fictional fence repair");await expect(page.getByLabel("Work details")).toHaveValue("Fictional fence repair");
  await page.goto("/practice-company");await page.getByRole("button",{name:"Sign out",exact:true}).click();await expect(page).toHaveURL(/\/sign-in$/);
  await openCapture(page);await expect(page.getByLabel("Work details")).toHaveValue(/Practice decorating/);
  await page.getByRole("button",{name:"Make my draft",exact:true}).click();await expect(page.getByLabel("Cited proposal").locator("li")).toHaveCount(6);
});
