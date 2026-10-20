import{expect,test}from"@playwright/test";
import{openQuote}from"./helpers/capture-journey";
async function issue(page:import("@playwright/test").Page){await openQuote(page);for(const input of await page.getByLabel(/Unit rate/u).all())if(await input.inputValue()==="")await input.fill("100.00");await page.getByRole("button",{name:"Save draft revision"}).click();await page.getByRole("button",{name:"Preview immutable quote"}).click();await page.getByRole("button",{name:"Simulate sending this quote"}).click();await expect(page.getByTestId("quote-delivery")).toHaveText("Queued — not sent");await page.getByRole("button",{name:"Continue fake worker"}).click();await expect(page.getByTestId("quote-delivery")).toHaveText("Simulated delivery — nothing sent");}
test("builder attests exact terms honestly, then cancellation and decline preserve history",async({page})=>{await issue(page);const form=page.getByLabel("Record customer acceptance");await expect(form).toContainText("not an e-signature or independently authenticated customer action");await expect(form).toContainText("A Builder Ltd");await form.getByLabel("Approval method").selectOption("verbal");await form.getByRole("button",{name:"Record practice acceptance"}).click();const terms=page.getByLabel("Accepted terms");await expect(terms).toContainText("Actor: A Builder Ltd (builder)");await expect(terms).toContainText("Method claimed: verbal");await expect(terms).toContainText("Document v1");await expect(page.getByText(/No plan was activated/u)).toBeVisible();await terms.getByRole("button",{name:"Cancel pre-live acceptance"}).click();await expect(page.getByLabel("Acceptance audit history")).toContainText("Acceptance cancelled");await page.getByRole("button",{name:"Record customer decline"}).click();await expect(page.getByLabel("Acceptance audit history")).toContainText("Declined document v1");});


test("[MIGFIX-4.2] superseded document cannot be accepted with a fresh revision through the persisted browser journey", async ({ page }) => {
  await issue(page);
  const supersession = page.waitForResponse(response => response.url().endsWith("/quotes/acceptance/disposition") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Supersede quote", exact: true }).click();
  const response = await supersession; expect(response.ok()).toBe(true);
  const view = await response.json();
  expect(view.activeAcceptance).toBeNull(); expect(view.events.filter((event: any) => event.kind === "superseded")).toHaveLength(1);
  const refusal = page.waitForResponse(r => r.url().endsWith("/quotes/acceptance") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Record practice acceptance", exact: true }).click();
  expect((await refusal).ok()).toBe(false);
  await expect(page.getByLabel("Accepted terms")).toHaveCount(0);
  const persisted = await page.request.get(new URL(`/api/jobs/${view.jobId}/quotes/acceptance`, page.url()).href);
  expect(persisted.ok()).toBe(true);
  const after = await persisted.json();
  expect(after.jobStatus).toBe("quoting"); expect(after.jobRevision).toBe(view.jobRevision);
  expect(after.activeAcceptance).toBeNull(); expect(after.events.filter((event: any) => event.kind === "accepted")).toHaveLength(0);
  expect(after.effects).toEqual({ platformObligations: 0, settlements: 0, recoveryFees: 0 });
});
