import { createHash } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { openCapture } from "./helpers/capture-journey";
const B=(page:Page,name:string)=>page.getByRole("button",{name,exact:true});
async function quotingJob(page:Page){
  await openCapture(page);await B(page,"Make my draft").click();await B(page,"Check and edit my draft").click();
  for(const name of ["Protect room","Prepare walls","Paint walls","Finish trim","Clean site"])await B(page,`Accept ${name}`).click();
  await B(page,"Dismiss Replace shelves").click();await page.getByLabel("Dismissal reason Replace shelves").fill("Not included in fictional work");
  await page.getByLabel(/Answer Confirm disposal/u).fill("Fictional builder removes waste");await B(page,"Confirm scope").click();await B(page,"Price the work").click();
  await expect(page.locator(".quote-editor")).toHaveAttribute("data-quote-ready","true");
  await B(page,"Save draft revision").click();await expect(page.getByText("Rate confirmations are recorded once; nothing was sent or billed.",{exact:false})).toBeVisible();
  await page.getByLabel("Unit rate Clean site").fill("200.00");await B(page,"Save draft revision").click();
  return (await page.locator(".quote-editor").getAttribute("data-job-id"))!;
}
test("CH-3a captures structured parties, gates live, and preserves authoritative identity across browsers",async({page,browser})=>{
  test.setTimeout(180000);const jobId=await quotingJob(page);
  await expect(page.getByText("Customer and site are required before this job can switch live.",{exact:true})).toBeVisible();
  await expect(B(page,"Start this practice job")).toBeDisabled();await expect(B(page,"Preview immutable quote")).toBeDisabled();
  const missing=await page.request.post(`/api/jobs/${jobId}/quotes/activation`,{data:{version:"practice-activation-command.v1",commandId:crypto.randomUUID(),scenario:"no_charge"}});
  expect(missing.status()).toBe(409);expect((await missing.json()).code).toBe("JOB_PARTIES_REQUIRED");
  await expect(B(page,"Import the fictional underway job")).toBeDisabled();
  const missingImport=await page.request.post(`/api/jobs/${jobId}/parties/import`,{data:{version:"job-parties-import.v1",commandId:crypto.randomUUID(),expectedBindingId:crypto.randomUUID()}});expect(missingImport.status()).toBe(409);expect((await missingImport.json()).code).toBe("JOB_PARTIES_REQUIRED");
  const invalid=await page.request.post(`/api/jobs/${jobId}/parties`,{data:{version:"job-parties-command.v1",commandId:crypto.randomUUID(),action:"create_site",site:{version:"site.v1",addressLines:["Fictional road"],town:"London",postcode:"not a postcode",uprn:"12x"}}});expect(invalid.status()).toBe(400);
  await expect(page.getByLabel("Who pays?")).toHaveValue("");
  await page.getByLabel("Customer type").selectOption("landlord_or_agent");await page.getByLabel("Customer name",{exact:true}).fill("Fictional Lettings");await page.getByLabel("UK postcode").fill("sw1a1aa");
  await B(page,"Save customer and site").focus();await expect(B(page,"Save customer and site")).toBeFocused();
  // Script focus after mouse use does not match :focus-visible in Chromium; reach the button by keyboard, as a keyboard user does.
  await page.keyboard.press("Shift+Tab");await page.keyboard.press("Tab");await expect(B(page,"Save customer and site")).toBeFocused();
  const size=await B(page,"Save customer and site").boundingBox();expect(size!.height).toBeGreaterThanOrEqual(44);expect(size!.width).toBeGreaterThanOrEqual(44);
  const outline=await B(page,"Save customer and site").evaluate(el=>getComputedStyle(el).outlineStyle);expect(outline).not.toBe("none");
  await B(page,"Save customer and site").click();await expect(page.getByTestId("party-customer")).toHaveText("Fictional Lettings");await expect(page.getByTestId("party-site")).toContainText("SW1A 1AA");
  const view=(await (await page.request.get(`/api/jobs/${jobId}/parties`)).json());const binding=view.current.bindingId;
  expect(view.current.customer.type).toBe("landlord_or_agent");expect(view.current.payingPartyRevisionId).toBe(view.current.customerRevisionId);expect(view.realExternalActions).toBe(0);
  await B(page,"Preview immutable quote").click();await B(page,"Simulate sending this quote").click();await B(page,"Continue fake worker").click();await B(page,"Record practice acceptance").click();await B(page,"Start this practice job").click();
  await expect(page.getByRole("heading",{name:"Live · baseline frozen",exact:true})).toBeVisible();
  await page.reload();await expect(page.getByTestId("party-binding-id")).toHaveText(binding);
  await page.goto("/");await page.getByLabel("Search jobs").fill("Fictional Lettings");const card=page.locator(".job-card").filter({has:page.locator(`a[href="/jobs/${jobId}"]`)});await expect(card).toContainText("SW1A 1AA");await card.getByRole("link").click();await expect(page.getByTestId("party-binding-id")).toHaveText(binding);
  const other=await browser.newContext();await other.addCookies(await page.context().cookies());const second=await other.newPage();await second.goto(`/jobs/${jobId}`);await expect(second.getByTestId("party-binding-id")).toHaveText(binding);await expect(second.getByTestId("party-customer")).toHaveText("Fictional Lettings");await other.close();
  const importCommand={version:"job-parties-import.v1",commandId:crypto.randomUUID(),expectedBindingId:binding};
  const imports=await Promise.all([page.request.post(`/api/jobs/${jobId}/parties/import`,{data:importCommand}),page.request.post(`/api/jobs/${jobId}/parties/import`,{data:importCommand})]);
  for(const response of imports)expect(response.ok()).toBe(true);const importedJob=await imports[0]!.json();expect(await imports[1]!.json()).toEqual(importedJob);
  const replay=await page.request.post(`/api/jobs/${jobId}/parties/import`,{data:importCommand});expect(await replay.json()).toEqual(importedJob);
  const importedParties=await (await page.request.get(`/api/jobs/${importedJob.jobId}/parties`)).json();expect(importedParties.current.customerRevisionId).toBe(view.current.customerRevisionId);expect(importedParties.current.siteRevisionId).toBe(view.current.siteRevisionId);expect(importedParties.recognition.map((r:{jobId:string})=>r.jobId)).toEqual(expect.arrayContaining([jobId,importedJob.jobId]));
  const denied=await page.request.get(`/api/jobs/${jobId}/parties?requested_tenant_id=33333333-3333-4333-8333-333333333333`);expect(denied.status()).toBe(403);
  await expect(page.locator(".sandbox-banner")).toHaveText("Practice sandbox — synthetic data; nothing is sent or charged");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});

test("CH-3a makes reuse explicit, leaves different flats separate, and rejects stale bindings",async({page,browser})=>{
  test.setTimeout(180000);const jobId=await quotingJob(page);
  await page.getByLabel("UK postcode").fill("invalid");await B(page,"Save customer and site").click();const error=page.getByRole("alert").filter({hasText:"INVALID_PARTIES"});await expect(error).toBeVisible();await expect(error).toBeFocused();
  await page.getByLabel("UK postcode").fill("SW1A 1AA");await B(page,"Save customer and site").click();await expect(page.getByTestId("party-customer")).toHaveText("Practice Customer");
  const before=await (await page.request.get(`/api/jobs/${jobId}/parties`)).json();
  await page.getByLabel("Choose a customer").selectOption(before.customers.find((c:{revisionId:string})=>c.revisionId===before.current.customerRevisionId).id);
  await page.getByLabel("Possible existing places").selectOption(before.sites.find((s:{revisionId:string})=>s.revisionId===before.current.siteRevisionId).id);
  await expect(B(page,"Save customer and site")).toBeDisabled();await page.getByLabel("I confirm this is the same place").check();await expect(B(page,"Save customer and site")).toBeEnabled();
  await B(page,"Save customer and site").click();await expect(page.getByTestId("party-binding-id")).not.toHaveText(before.current.bindingId);
  const reused=await (await page.request.get(`/api/jobs/${jobId}/parties`)).json();expect(reused.current.siteRevisionId).toBe(before.current.siteRevisionId);expect(reused.current.customerRevisionId).toBe(before.current.customerRevisionId);
  await page.getByLabel("Flat or unit (optional)").fill("Flat 2");await expect(page.getByLabel("Possible existing places")).toHaveValue("");
  await B(page,"Save customer and site").click();await expect(page.getByTestId("party-site")).toContainText("Flat 2");
  const after=await (await page.request.get(`/api/jobs/${jobId}/parties`)).json();expect(after.current.siteRevisionId).not.toBe(before.current.siteRevisionId);
  const payload={version:"job-parties-command.v1",commandId:crypto.randomUUID(),action:"bind",expectedJobRevision:before.jobRevision,parties:{version:"job-parties.v1",customerRevisionId:before.current.customerRevisionId,siteRevisionId:before.current.siteRevisionId}};
  const stale=await page.request.post(`/api/jobs/${jobId}/parties`,{data:payload});expect(stale.status()).toBe(409);expect((await stale.json()).code).toBe("REVISION_CONFLICT");
  const other=await browser.newContext();await other.addCookies(await page.context().cookies());
  const race={...payload,expectedJobRevision:after.jobRevision,parties:{version:"job-parties.v1",customerRevisionId:after.current.customerRevisionId,siteRevisionId:after.current.siteRevisionId}};
  const outcomes=await Promise.all([page.request.post(`/api/jobs/${jobId}/parties`,{data:{...race,commandId:crypto.randomUUID()}}),other.request.post(`/api/jobs/${jobId}/parties`,{data:{...race,commandId:crypto.randomUUID()}})]);
  expect(outcomes.map(r=>r.status()).sort()).toEqual([200,409]);expect((await outcomes.find(r=>r.status()===409)!.json()).code).toBe("REVISION_CONFLICT");await other.close();
  await page.reload();await expect(page.getByTestId("party-site")).toContainText("Flat 2");
  await page.goto("/");await page.locator(".job-card").filter({has:page.locator(`a[href="/jobs/${jobId}"]`)}).getByRole("link").click();await expect(page.getByTestId("party-site")).toContainText("Flat 2");
  await expect(page.locator(".sandbox-banner")).toHaveText("Practice sandbox — synthetic data; nothing is sent or charged");expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});

// Round 2 (checker findings on b0f88fb): stale editing must be refused, never silently overwritten.
const CONFLICT = "This job changed. Reload the details before saving again.";
const partiesView = async (page: Page, jobId: string) => (await page.request.get(`/api/jobs/${jobId}/parties`)).json();
const conflictAlert = (page: Page) => page.getByRole("alert").filter({ hasText: CONFLICT });
async function secondWriter(page: Page, browser: Browser, jobId: string) {
  const context = await browser.newContext({ viewport: page.viewportSize()! });
  await context.addCookies(await page.context().cookies());
  const other = await context.newPage();
  await other.goto(`/jobs/${jobId}`);
  await expect(B(other, "Save customer and site")).toBeVisible();
  return { context, other };
}
const saveAs = async (page: Page, name: string) => { await page.getByLabel("Customer name", { exact: true }).fill(name); await B(page, "Save customer and site").click(); };

test("CH-3a refuses a save from a panel another writer has already superseded, and writes nothing", async ({ page, browser }) => {
  const tag = crypto.randomUUID().slice(0, 8), nameA = `Writer A ${tag}`, nameB = `Writer B ${tag}`; test.setTimeout(180000); const jobId = await quotingJob(page);
  await expect(B(page, "Save customer and site")).toBeVisible();
  const { context, other } = await secondWriter(page, browser, jobId);
  await saveAs(other, nameB); await expect(other.getByTestId("party-customer")).toHaveText(nameB);
  const winner = await partiesView(page, jobId);
  // The first panel was loaded before B saved and has not been reloaded: its save starts after B's commit.
  await saveAs(page, nameA);
  await expect(conflictAlert(page)).toBeVisible();
  const after = await partiesView(page, jobId);
  expect(after.current.bindingId).toBe(winner.current.bindingId); expect(after.jobRevision).toBe(winner.jobRevision);
  expect(after.customers.map((c: { customer: { name: string } }) => c.customer.name)).not.toContain(nameA);
  expect(after.customers).toHaveLength(winner.customers.length); expect(after.sites).toHaveLength(winner.sites.length);
  // The panel reloads to the winner's details instead of keeping a stale draft.
  await expect(page.getByTestId("party-customer")).toHaveText(nameB);
  await expect(page.getByLabel("Customer name", { exact: true })).toHaveValue(nameB);
  await saveAs(page, nameA); await expect(page.getByTestId("party-customer")).toHaveText(nameA);
  await context.close();
});

test("CH-3a refuses a save against customer details another writer revised", async ({ page, browser }) => {
  test.setTimeout(180000); const jobId = await quotingJob(page);
  await B(page, "Save customer and site").click(); await expect(page.getByTestId("party-customer")).toHaveText("Practice Customer");
  const base = await partiesView(page, jobId); const customerId = base.currentIds.customerId as string;
  await page.getByLabel("Choose a customer").selectOption(customerId);
  await page.getByLabel("Customer phone (fictional, optional)").fill("07000000001");
  // Another writer revises the same customer; the job's binding is unchanged.
  const revised = await page.request.post(`/api/jobs/${jobId}/parties`, { data: { version: "job-parties-command.v1", commandId: crypto.randomUUID(), action: "revise_customer", customerId, expectedRevision: 1, customer: { version: "customer.v1", name: "Renamed elsewhere", type: "person", email: "practice-customer@example.invalid" } } });
  expect(revised.status()).toBe(200);
  await B(page, "Save customer and site").click(); await expect(conflictAlert(page)).toBeVisible();
  const after = await partiesView(page, jobId);
  const customer = after.customers.find((c: { id: string }) => c.id === customerId);
  expect(customer.revision).toBe(2); expect(customer.customer.name).toBe("Renamed elsewhere"); expect(customer.customer.phone).toBeUndefined();
  expect(after.current.bindingId).toBe(base.current.bindingId); expect(after.jobRevision).toBe(base.jobRevision);
  await expect(page.getByLabel("Customer name", { exact: true })).toHaveValue("Renamed elsewhere");
});

test("CH-3a gives two writers on one revision one success and one typed conflict through the UI", async ({ page, browser }) => {
  const tag = crypto.randomUUID().slice(0, 8), nameA = `Writer A ${tag}`, nameB = `Writer B ${tag}`; test.setTimeout(180000); const jobId = await quotingJob(page);
  await expect(B(page, "Save customer and site")).toBeVisible();
  const { context, other } = await secondWriter(page, browser, jobId);
  const conflictCodes: string[] = [];
  for (const p of [page, other]) p.on("response", async response => { if (response.url().includes(`/api/jobs/${jobId}/parties`) && response.request().method() === "POST" && response.status() === 409) conflictCodes.push((await response.json()).code); });
  const before = await partiesView(page, jobId);
  await page.getByLabel("Customer name", { exact: true }).fill(nameA); await other.getByLabel("Customer name", { exact: true }).fill(nameB);
  await Promise.all([B(page, "Save customer and site").click(), B(other, "Save customer and site").click()]);
  await expect.poll(async () => (await conflictAlert(page).count()) + (await conflictAlert(other).count())).toBe(1);
  const after = await partiesView(page, jobId);
  expect(after.jobRevision).toBe(before.jobRevision + 1);
  expect([nameA, nameB]).toContain(after.current.customer.name);
  const [winnerPage, loserPage] = after.current.customer.name === nameA ? [page, other] : [other, page];
  await expect(conflictAlert(winnerPage)).toHaveCount(0); await expect(conflictAlert(loserPage)).toBeVisible();
  await expect(loserPage.getByTestId("party-customer")).toHaveText(after.current.customer.name);
  for (const code of conflictCodes) expect(code).toBe("REVISION_CONFLICT");
  await context.close();
});

test("CH-3a tells a stale panel the job went live instead of showing a raw code", async ({ page, browser }) => {
  test.setTimeout(240000); const jobId = await quotingJob(page);
  await B(page, "Save customer and site").click(); await expect(page.getByTestId("party-customer")).toHaveText("Practice Customer");
  const before = await partiesView(page, jobId);
  // The second panel loads while the job is still quoting; the first window then takes the job live.
  const { context, other } = await secondWriter(page, browser, jobId);
  await B(page, "Preview immutable quote").click(); await B(page, "Simulate sending this quote").click(); await B(page, "Continue fake worker").click();
  await B(page, "Record practice acceptance").click(); await B(page, "Start this practice job").click();
  await expect(page.getByRole("heading", { name: "Live · baseline frozen", exact: true })).toBeVisible();
  // The second panel still believes the job is quoting.
  await saveAs(other, "Late edit");
  await expect(other.getByRole("alert").filter({ hasText: "went live" })).toBeVisible();
  await expect(other.getByRole("alert").filter({ hasText: "CORRECTION_REASON_REQUIRED" })).toHaveCount(0);
  const after = await partiesView(other, jobId);
  expect(after.current.bindingId).toBe(before.current.bindingId); expect(after.customers).toHaveLength(before.customers.length);
  await expect(other.getByLabel("Reason for correction")).toBeVisible();
  await other.getByLabel("Reason for correction").fill("Correct the fictional customer after going live"); await saveAs(other, "Late edit");
  await expect(other.getByTestId("party-customer")).toHaveText("Late edit");
  await context.close();
});

test("CH-3a quote preview shows its frozen customer and a changed binding needs a new preview", async ({ page }) => {
  test.setTimeout(180000); const jobId = await quotingJob(page);
  await saveAs(page, "Original fictional customer"); await expect(page.getByTestId("party-customer")).toHaveText("Original fictional customer");
  const previewed = page.waitForResponse(r => r.url().endsWith(`/api/jobs/${jobId}/quotes/preview`) && r.request().method() === "POST");
  await B(page, "Preview immutable quote").click(); const first = (await (await previewed).json()).view as { documentId: string; contentHash: string; documentVersion: number };
  const section = page.getByRole("region", { name: "Quote preview" }); await expect(section).toContainText("Original fictional customer");
  await expect(page.getByTestId("quote-artifact-hash")).toHaveText(first.contentHash);
  const bytes = async (id: string) => createHash("sha256").update(Buffer.from(await (await page.request.get(`/api/jobs/${jobId}/quotes/artifacts/${id}`)).body())).digest("hex");
  expect(await bytes(first.documentId)).toBe(first.contentHash);
  // The binding is corrected between preview and send.
  await saveAs(page, "Corrected fictional customer"); await expect(page.getByTestId("party-customer")).toHaveText("Corrected fictional customer");
  await expect(section).toContainText("Original fictional customer"); await expect(section).not.toContainText("Corrected fictional customer");
  await expect(page.getByTestId("quote-artifact-hash")).toHaveText(first.contentHash);
  await expect(section).toContainText("customer or site changed");
  await B(page, "Simulate sending this quote").click();
  await expect(page.getByText("The customer or site changed. Preview and approve it again.", { exact: false }).first()).toBeVisible();
  const send = await page.request.post(`/api/jobs/${jobId}/quotes/delivery`, { data: { version: "quote-send-command.v1", commandId: crypto.randomUUID(), documentId: first.documentId, contentHash: first.contentHash, recipient: "practice-customer@example.invalid" } });
  expect(send.status()).toBe(409); expect((await send.json()).code).toBe("QUOTE_CHANGED");
  expect(await bytes(first.documentId)).toBe(first.contentHash);
  const again = page.waitForResponse(r => r.url().endsWith(`/api/jobs/${jobId}/quotes/preview`) && r.request().method() === "POST");
  await B(page, "Preview immutable quote").click(); const second = (await (await again).json()).view as { documentId: string; contentHash: string; documentVersion: number };
  expect(second.documentId).not.toBe(first.documentId); expect(second.contentHash).not.toBe(first.contentHash); expect(second.documentVersion).toBe(first.documentVersion + 1);
  await expect(section).toContainText("Corrected fictional customer"); await expect(section).not.toContainText("customer or site changed");
  await B(page, "Simulate sending this quote").click();
  await expect(page.getByText("queued only for the deterministic fake worker", { exact: false })).toBeVisible();
  expect(await bytes(first.documentId)).toBe(first.contentHash);
});

// Round 3 (checker finding on 3576f9f): a background refresh must not advance what the draft was edited against.
test("CH-3a a lifecycle refresh cannot carry a stale draft over another writer's customer revision", async ({ page }) => {
  test.setTimeout(180000); const jobId = await quotingJob(page);
  await B(page, "Save customer and site").click(); await expect(page.getByTestId("party-customer")).toHaveText("Practice Customer");
  const base = await partiesView(page, jobId); const customerId = base.currentIds.customerId as string;
  await page.getByLabel("Choose a customer").selectOption(customerId);
  await page.getByLabel("Customer name", { exact: true }).fill("Stale draft name"); await page.getByLabel("Customer phone (fictional, optional)").fill("07000000002");
  // Another writer revises the customer (revision 2); the binding is unchanged.
  const revised = await page.request.post(`/api/jobs/${jobId}/parties`, { data: { version: "job-parties-command.v1", commandId: crypto.randomUUID(), action: "revise_customer", customerId, expectedRevision: 1, customer: { version: "customer.v1", name: "Renamed elsewhere", type: "person", email: "practice-customer@example.invalid" } } });
  expect(revised.status()).toBe(200);
  // The app's own lifecycle event makes the panel re-read the job in the background.
  const refreshed = page.waitForResponse(r => r.url().includes(`/api/jobs/${jobId}/parties`) && r.request().method() === "GET");
  await page.evaluate(id => window.dispatchEvent(new CustomEvent("job-lifecycle-changed", { detail: id })), jobId); await refreshed;
  // The stale draft is refused and reloaded from what is saved, not kept beside a refreshed baseline.
  await expect(conflictAlert(page)).toBeVisible();
  await expect(page.getByLabel("Customer name", { exact: true })).toHaveValue("Renamed elsewhere");
  await expect(page.getByLabel("Customer phone (fictional, optional)")).toHaveValue("");
  await B(page, "Save customer and site").click();
  await expect(page.getByTestId("party-customer")).toHaveText("Renamed elsewhere");
  const after = await partiesView(page, jobId); const customer = after.customers.find((c: { id: string }) => c.id === customerId);
  expect(customer.revision).toBe(2); expect(customer.customer.name).toBe("Renamed elsewhere"); expect(customer.customer.phone).toBeUndefined();
});
