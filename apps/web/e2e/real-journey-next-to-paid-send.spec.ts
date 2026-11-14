import { expect, test } from "@playwright/test";
import { Pool } from "pg";
import { E2E_ADMIN_DATABASE_URL } from "./global-setup";

// Both configured projects run; use the requested phone dimensions and retain desktop.
test("blank firm sends its exact practice quote without a worker click", async ({ page }, info) => {
  test.setTimeout(180_000);
  if (info.project.name === "mobile-360") await page.setViewportSize({ width: 390, height: 844 });
  const click = async (name: string) => {
    const button = page.getByRole("button", { name, exact: true });
    await expect(button).toBeEnabled(); await button.click();
  };
  await page.goto("/jobs");
  await page.getByRole("link", { name: "Start my own practice firm", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ready for your first job" })).toBeVisible();
  await click("＋ Start a new job");
  await page.getByLabel("Work details").fill("JOB: Fictional blue room\nITEM: Paint walls | £200.00");
  await click("Make my draft"); await click("Check and edit my draft");
  await click("Save customer and site");
  await expect(page.getByTestId("party-customer")).toHaveText("Practice Customer");
  await click("Accept Paint walls");
  await page.getByLabel(/Answer Confirm disposal/u).fill("Builder removes fictional waste");
  await click("Confirm scope"); await click("Price the work");
  await expect(page.locator(".quote-editor")).toHaveAttribute("data-quote-ready", "true");
  const jobId = (await page.locator(".quote-editor").getAttribute("data-job-id"))!;
  await click("Save draft revision");
  await expect(page.getByTestId("quote-revision")).toHaveText("1");
  await click("Preview immutable quote");
  const acceptance = page.getByRole("button", { name: "Record practice acceptance", exact: true });
  await expect(acceptance).toHaveCount(0);
  const response = page.waitForResponse(r => r.url().endsWith(`/api/jobs/${jobId}/quotes/delivery`) && r.request().method() === "POST");
  await click("Simulate sending this quote");
  const issued = await response;
  expect(issued.status(), await issued.text()).toBe(200);
  const input = issued.request().postDataJSON();
  const saved = await issued.json();
  expect(saved).toMatchObject({ documentId: input.documentId, contentHash: input.contentHash, recipient: input.recipient,
    status: "simulated_delivery", attempts: 1, receiptCount: 1, effects: { platformDebt: 0, chargeAttempts: 0, realExternalActions: 0 } });
  await expect(page.getByTestId("quote-delivery")).toHaveText("Simulated delivery — nothing sent");
  await expect(acceptance).toBeEnabled();
  await expect(page.getByRole("button", { name: "Continue fake worker", exact: true })).toHaveCount(0);
  const read = async (suffix: string) => {
    const result = await page.request.get(`/api/jobs/${jobId}/quotes/${suffix}`);
    expect(result.ok(), await result.text()).toBe(true); return result.json();
  };
  expect((await read("acceptance")).activeAcceptance).toBeNull();
  expect((await read("activation")).activation).toBeNull();
  const replay = await page.request.post(`/api/jobs/${jobId}/quotes/delivery`, { data: input });
  expect(replay.ok()).toBe(true); expect(await replay.json()).toEqual(saved);
  const manual = await page.request.post(`/api/jobs/${jobId}/quotes/delivery/execute`, { data: {
    version: "quote-execute-command.v1", documentId: input.documentId, mode: "success",
  } });
  expect(manual.ok(), await manual.text()).toBe(true); expect(await manual.json()).toEqual(saved);
  expect(await read("delivery")).toEqual(saved);
  const admin = new Pool({ connectionString: E2E_ADMIN_DATABASE_URL, max: 1 });
  try {
    const rows = await admin.query(`SELECT o.status,(SELECT count(*)::int FROM app.action_attempt a WHERE a.action_id=o.id) attempts,
      (SELECT count(*)::int FROM app.quote_send s WHERE s.document_id=$1) sends
      FROM app.action_outbox o JOIN app.quote_send s ON s.outbox_action_id=o.id WHERE s.document_id=$1`, [input.documentId]);
    expect(rows.rows).toEqual([{ status: "succeeded", attempts: 1, sends: 1 }]);
  } finally { await admin.end(); }
  // Delivery authorizes neither acceptance nor start: each still takes its own click.
  await click("Record practice acceptance");
  await expect(page.getByRole("button", { name: "Start this practice job", exact: true })).toBeEnabled();
  expect((await read("acceptance")).activeAcceptance).not.toBeNull();
  expect((await read("activation")).activation).toBeNull();
  await click("Start this practice job");
  await expect(page.getByRole("heading", { name: "Live · baseline frozen", exact: true })).toBeVisible();
  expect((await read("activation")).activation).not.toBeNull();
});
