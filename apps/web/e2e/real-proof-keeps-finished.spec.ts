import { expect, test } from "@playwright/test";

test("REAL-PROOF-KEEPS-FINISHED: own practice job retains finished after proof, then diary restarts it", async ({ page }) => {
 test.setTimeout(360_000);
 if (test.info().project.name.includes("mobile")) await page.setViewportSize({ width: 390, height: 844 });
 let jobId = "";
 const click = async (name: string) => { const button = page.getByRole("button", { name, exact: true }); await expect(button).toBeEnabled(); await button.click(); };
    await page.goto("/practice-company");
    await expect(page.getByRole("heading", { name: "Ready for your first job" })).toBeVisible();
    await click("＋ Start a new job");
    await page.getByLabel("Work details").fill(`JOB: Practice decorating
ITEM: Protect room | £200.00
ITEM: Prepare walls | £200.00
ITEM: Paint walls | £200.00
ITEM: Finish trim | £200.00
ITEM: Clean site | £100.00
ITEM: Replace shelves`);
    await click("Make my draft"); await click("Check and edit my draft");
    await expect(page.getByRole("heading", { name: "Check the work items", exact: true })).toBeVisible();
    jobId = new URL(page.url()).pathname.split("/").at(-1)!;
    await click("Save customer and site");
    await expect(page.getByTestId("party-customer")).toHaveText("Practice Customer");
    for (const name of ["Protect room", "Prepare walls", "Paint walls", "Finish trim", "Clean site"]) await click(`Accept ${name}`);
    await click("Dismiss Replace shelves");
    await page.getByLabel("Dismissal reason Replace shelves").fill("Not in this fictional job");
    await page.getByLabel(/Answer Confirm disposal/u).fill("Builder removes fictional waste");
    await click("Confirm scope"); await click("Price the work");
    await expect(page.locator(".quote-editor")).toHaveAttribute("data-quote-ready", "true");
    await expect(page.getByTestId("quote-net")).toHaveText("GBP 900.00");
    await click("Save draft revision"); await expect(page.getByTestId("quote-revision")).toHaveText("1");
    await click("Preview immutable quote"); await click("Simulate sending this quote");
    await click("Continue fake worker");
    await expect(page.getByTestId("quote-delivery")).toHaveText("Simulated delivery — nothing sent");
    await click("Record practice acceptance"); await click("Start this practice job");
    await expect(page.getByRole("heading", { name: "Live · baseline frozen", exact: true })).toBeVisible();
    // Reopen the saved job to load the site-work and Final Check panels, rather
    // than borrowing the walkthrough's prepared example or injecting local state.
    await page.goto(`/jobs/${jobId}#quote`);
    await click("Finished on site");
    await expect(page.getByTestId("work-state")).toHaveText("Finished on site");

 const proof = page.locator("#work-proof");
 await proof.getByRole("button", { name: "No", exact: true }).click();
 await expect(page.getByTestId("proof-statement")).toContainText("No");
 await click("Attach generated practice image");
 await click("Check file integrity");
 await click("Complete this stage");
 await expect(page.getByTestId("stage-status")).toHaveText("Complete");
 await page.reload();
 await expect(page.getByTestId("work-state")).toHaveText("Finished on site");
 const facts = await (await page.request.get(`/api/jobs/${jobId}/work-state`)).json();
 expect(facts.events.filter((event: { kind: string }) => event.kind === "finished_cancelled")).toEqual([]);
 const diary = page.getByTestId("job-diary");
 await diary.getByLabel("Note", { exact: true }).fill("Fictional renewed work: fitted an outside tap after finishing.");
 await diary.getByLabel("Written on site").check();
 const saved = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith(`/api/jobs/${jobId}/diary`));
 await diary.getByRole("button", { name: "Save note", exact: true }).click();
 const response = await saved; expect(response.ok(), await response.text()).toBe(true);
 await page.reload();
 await expect(page.getByTestId("work-state")).toHaveText("Work under way");
 const restarted = await (await page.request.get(`/api/jobs/${jobId}/work-state`)).json();
 expect(restarted.events.filter((event: { kind: string }) => event.kind === "finished_cancelled")).toHaveLength(1);
});
