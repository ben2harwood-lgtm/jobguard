// SV-7A diary and customer-message pages over the checked intake writer. Synthetic; CI only.
import { Pool } from "pg";
import { expect, test } from "@playwright/test";
import { openLiveWatchdogJob } from "./helpers/capture-journey";
import { seedManySignals } from "./helpers/final-account-lock-journey";
import { E2E_ADMIN_DATABASE_URL } from "./global-setup";

const NOTICE = "Notes are for your records. To bill for extra work, use Log an extra. JobGuard checks your records against your final bill after you complete it.";
const tenantId = "11111111-1111-4111-8111-111111111111";

test("a diary note and a fictional customer message persist; the diary shows only the standing notice", async ({ page }) => {
  await openLiveWatchdogJob(page);
  const jobId = (await page.locator(".quote-editor").getAttribute("data-job-id"))!;
  await page.goto(`/jobs/${jobId}#job-diary`);
  const diary = page.getByTestId("job-diary");
  await expect(diary.getByTestId("diary-notice")).toHaveText(NOTICE);
  await expect(diary.getByLabel("Written on site")).toBeEnabled();
  await expect(diary.getByLabel("Written on site")).not.toBeChecked();
  await diary.getByLabel("Note").fill("Fitted outside tap.");
  await diary.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(diary.getByTestId("diary-entry")).toHaveCount(1);
  await expect(diary.getByTestId("diary-entry")).toContainText("Fitted outside tap.");

  const messages = page.getByTestId("customer-messages");
  await messages.getByLabel("Made-up customer name").fill("Fictional Alex");
  await messages.getByLabel("Message").fill("Please fit an outside tap.");
  await messages.getByRole("button", { name: "Save message", exact: true }).click();
  await expect(messages.getByTestId("customer-message")).toContainText("Fictional Alex");

  await page.reload();
  await expect(page.getByTestId("diary-entry")).toContainText("Fitted outside tap.");
  await expect(page.getByTestId("customer-message")).toContainText("Please fit an outside tap.");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  // Diary responses are identical with and without hidden signals derived from the notes.
  const before = await (await page.request.get(`/api/jobs/${jobId}/diary`)).text();
  const evidenceId = JSON.parse(before).entries[0].evidence.id as string;
  await seedManySignals(tenantId, jobId, evidenceId);
  expect(await (await page.request.get(`/api/jobs/${jobId}/diary`)).text()).toBe(before);
  await page.reload();
  await expect(page.getByTestId("diary-notice")).toHaveText(NOTICE);
  await expect(page.getByTestId("diary-entry")).toHaveCount(1);
});

test("unknown saves retry the exact command; refused saves preserve the draft", async ({ page }) => {
  await openLiveWatchdogJob(page);
  const jobId = (await page.locator(".quote-editor").getAttribute("data-job-id"))!;
  await page.goto(`/jobs/${jobId}#job-diary`);
  const diary = page.getByTestId("job-diary");
  await expect(diary.getByTestId("diary-notice")).toHaveText(NOTICE);
  await diary.getByLabel("Note", { exact: true }).fill("Fitted outside tap.");
  await diary.getByLabel("Written on site").check();
  const commands: unknown[] = [];
  let attempts = 0;
  await page.route(`**/api/jobs/${jobId}/diary`, async route => {
    if (route.request().method() !== "POST") return route.continue();
    commands.push(route.request().postDataJSON());
    if (++attempts === 1) {
      // The server committed; the client lost the response.
      expect((await route.fetch()).status()).toBe(201);
      return route.abort("failed");
    }
    return route.continue();
  });
  await diary.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(diary.getByRole("button", { name: "Retry the same save" })).toBeVisible();
  await expect(diary.getByRole("button", { name: "Save note", exact: true })).toBeDisabled();
  await diary.getByLabel("Written on site").uncheck();
  await diary.getByRole("button", { name: "Retry the same save" }).click();
  await expect(diary.getByLabel("Note", { exact: true })).toHaveValue("");
  expect(commands).toHaveLength(2);
  expect(commands[1]).toEqual(commands[0]);
  expect(commands[1]).toMatchObject({ onSite: true });
  await expect(diary.getByLabel("Written on site")).not.toBeChecked();
  await expect(diary.getByTestId("diary-entry")).toHaveCount(1);
  await page.unroute(`**/api/jobs/${jobId}/diary`);
  await page.route(`**/api/jobs/${jobId}/diary`, route => route.request().method() === "POST"
    ? route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ code: "POST_LOCK_WORK_REQUIRES_LINKED_JOB" }) })
    : route.continue());
  await diary.getByLabel("Note", { exact: true }).fill("Keep this unsaved draft.");
  await diary.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(diary.getByRole("alert")).toContainText("final account is locked");
  await expect(diary.getByLabel("Note", { exact: true })).toHaveValue("Keep this unsaved draft.");
  await expect(diary.getByTestId("diary-entry")).toHaveCount(1);
});

// Runs in both mobile-360 and desktop projects against the real synthetic database.
test("on-site diary work records one site event, exact replay adds none, and off-site work adds none", async ({ page }) => {
  await openLiveWatchdogJob(page);
  const jobId = (await page.locator(".quote-editor").getAttribute("data-job-id"))!;
  const path = `/api/jobs/${jobId}/diary`;
  await page.goto(`/jobs/${jobId}#job-diary`);
  const diary = page.getByTestId("job-diary");
  await expect(diary.getByLabel("Written on site")).toBeEnabled();
  const admin = new Pool({ connectionString: E2E_ADMIN_DATABASE_URL, max: 1 });
  const events = async () => (await admin.query("SELECT id FROM app.job_work_state_event WHERE tenant_id=$1 AND job_id=$2 AND kind='first_site_evidence' ORDER BY sequence", [tenantId, jobId])).rows;
  try {
    expect(await events()).toEqual([]);
    await diary.getByLabel("Note", { exact: true }).fill("Checked the fictional plans from the office.");
    await diary.getByRole("button", { name: "Save note", exact: true }).click();
    await expect(diary.getByTestId("diary-entry")).toHaveCount(1);
    expect(await events()).toEqual([]);

    await diary.getByLabel("Note", { exact: true }).fill("Fitted the fictional outside tap on site.");
    await diary.getByLabel("Written on site").check();
    const posted = page.waitForRequest(request => request.url().endsWith(path) && request.method() === "POST");
    await diary.getByRole("button", { name: "Save note", exact: true }).click();
    const command = (await posted).postDataJSON();
    expect(command.onSite).toBe(true);
    await expect(diary.getByTestId("diary-entry")).toHaveCount(2);
    await expect(diary.getByLabel("Written on site")).not.toBeChecked();
    const first = await events();
    expect(first).toHaveLength(1);
    const replay = await page.request.post(path, { data: command });
    expect(replay.status()).toBe(201);
    expect(await events()).toEqual(first);
    await page.reload();
    await expect(diary.getByTestId("diary-entry")).toHaveCount(2);
    const response = await page.request.get(path);
    expect(response.ok()).toBe(true);
    const saved = await response.json();
    expect(saved.entries.find((entry: { commandId: string }) => entry.commandId === command.commandId)).toMatchObject({ onSite: true, text: command.text });
    expect(saved.entries.find((entry: { onSite: boolean }) => !entry.onSite).text).toBe("Checked the fictional plans from the office.");
    await expect(diary.getByTestId("diary-notice")).toHaveText(NOTICE);
  } finally { await admin.end(); }
});
