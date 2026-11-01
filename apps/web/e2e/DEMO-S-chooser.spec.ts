import { expect, test, type Page } from "@playwright/test";
import { z } from "zod";
import { createHmac } from "node:crypto";
import { Pool } from "pg";
import { E2E_ADMIN_DATABASE_URL, E2E_AUTH_CODE_SECRET } from "./global-setup";
const recoveredCaptureV1 = z.object({ version: z.literal(1), environment: z.literal("synthetic_demo"),
  captureId: z.string().uuid(), jobId: z.string().uuid() });
// Like ENT-10d, release only this spec's disposable request-window fixtures.
// Unique addresses isolate the 60-second resend key, but the web adapter also
// shares the web-bootstrap 10-per-ten-minute bucket with M0-6L. Limits stay
// active throughout each journey; challenges, sessions and memberships remain.
const challengeEmails: string[] = [];
test.afterEach(async () => {
  if (!challengeEmails.length) return;
  const pool = new Pool({ connectionString: E2E_ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(`DELETE FROM identity.request_window w USING identity.challenge c
      WHERE c.email=ANY($1::text[]) AND w.requested_at=c.requested_at AND w.ip_digest=$2`,
    [challengeEmails, createHmac("sha256", E2E_AUTH_CODE_SECRET).update("ip:web-bootstrap").digest("hex")]);
  } finally { await pool.end(); challengeEmails.length = 0; }
});
// Launch only available journeys; retain honest blockers for unmerged guides.
async function signIn(page: Page) {
  await page.goto("/sign-in");
  const email = `demo-s-${crypto.randomUUID()}@practice.invalid`;
  challengeEmails.push(email);
  await page.getByLabel("Fictional email address").fill(email);
  await page.getByRole("button", { name: "Request code", exact: true }).click();
  const code = await page.getByTestId("fixture-code").textContent();
  await page.getByLabel("Eight-digit code").fill(code!);
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page.getByRole("heading", { name: "Signed in", exact: true })).toBeVisible();
}
async function api(page: Page, operation: string, command?: unknown, runId?: string) {
  return page.evaluate(async ({ operation, command, runId }) => {
    const session = await (await fetch("/api/auth/session", { cache: "no-store" })).json();
    const response = await fetch(`/api/small-builder-demo/${operation}${runId ? `?runId=${runId}` : ""}`, {
      method: command ? "POST" : "GET", headers: { "content-type": "application/json", "x-csrf-token": session.csrfToken, "x-tenant-id": session.memberships[0].tenantId },
      ...(command ? { body: JSON.stringify(command) } : {}),
    });
    return { status: response.status, body: await response.json() };
  }, { operation, command, runId });
}
for (const [scenario, screens] of [["core-1000", []], ["meter", [["Jobs on the go and account review", "/meter"], ["Plan and saved periods", "/plans"]]], ["trial", [["Accepted terms and saved periods", "/plans"]]]] as [string, [string, string][]][]) {
  test(`DEMO-S ${scenario}: resume by reference, saved report with its screens, and reset`, async ({ page }) => {
    test.setTimeout(90_000);
    await signIn(page); await page.goto("/demo-s");
    await page.getByRole("button", { name: `Choose ${scenario} selection`, exact: true }).click();
    const saved = page.getByRole("region", { name: `Saved ${scenario} selection` });
    await expect(saved).toBeVisible();
    const runId = new URL(page.url()).searchParams.get("runId")!;
    await page.goto("/demo-s");
    await expect(saved).toHaveCount(0);
    await page.getByLabel("Saved selection reference").fill(runId);
    await page.getByRole("button", { name: "Resume", exact: true }).click();
    await expect(saved).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`runId=${runId}`));
    await page.getByRole("button", { name: "Save selection report", exact: true }).click();
    const report = page.getByRole("region", { name: "Saved selection report" });
    await expect(report).toContainText("Saved screens");
    await expect(report).toContainText("Independent verdict: missing");
    for (const [name, href] of screens) await expect(report.getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
    if (scenario === "trial") await expect(report.getByRole("link", { name: "trial source report", exact: true })).toHaveAttribute("href", new RegExp(`/demo-s/trial\\?.*runId=${runId}`));
    await page.reload();
    await expect(report).toContainText("Saved screens");
    await page.getByRole("button", { name: "Reset selection", exact: true }).click();
    await expect(page.getByRole("link", { name: "Open archived selection", exact: true })).toBeVisible();
    await expect(saved).toBeVisible();
    expect(new URL(page.url()).searchParams.get("runId")).not.toBe(runId);
  });
}
test("DEMO-S chooser saves honest blockers for all families on both browser projects", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page); await page.goto("/demo-s");
  await expect(page.getByRole("heading", { name: "Choose a journey" })).toBeVisible();
  await page.getByRole("button", { name: "Choose meter selection", exact: true }).click();
  await expect(page.getByRole("region", { name: "Saved meter selection" })).toContainText("Previews and your saved meter available");
  await page.getByRole("button", { name: "Choose recovery-18800 selection", exact: true }).click();
  const recovery = page.getByRole("region", { name: "Saved recovery-18800 selection" });
  await expect(recovery).toContainText("Journey available"); await expect(recovery).toContainText("Selection metadata does not record journey completion");
  await page.reload(); await expect(recovery).toBeVisible();
  await page.getByText("Meter profiles — reference previews available", { exact: true }).click();
  await expect(page.getByText("DM-10 · Builder 13–17 places and track review")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("DEMO-S lost-response replay, reset, immutable report and cross-company denial", async ({ page, browser }) => {
  test.setTimeout(90_000);
  await signIn(page); await page.goto("/demo-s");
  const sent: unknown[] = [];
  await page.route("**/api/small-builder-demo/create", async route => {
    sent.push(route.request().postDataJSON());
    const response = await route.fetch();
    if (sent.length === 1) { expect(response.status()).toBe(201); await route.abort("failed"); }
    else await route.fulfill({ response });
  });
  await page.getByRole("button", { name: "Choose shadow-30000 selection", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry saved request" })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Retry saved request" }).click();
  await expect(page.getByRole("region", { name: "Saved shadow-30000 selection" })).toBeVisible();
  expect(sent).toHaveLength(2); expect(sent[1]).toEqual(sent[0]);
  const runId = new URL(page.url()).searchParams.get("runId")!;
  await page.getByRole("button", { name: "Save selection report", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Saved selection report" })).toBeVisible();
  const snapshotUrl = page.url();
  await page.getByRole("button", { name: "Reset selection", exact: true }).click();
  await expect(page.getByRole("link", { name: "Open archived selection", exact: true })).toBeVisible();
  const successor = new URL(page.url()).searchParams.get("runId")!;
  expect(successor).not.toBe(runId);
  await page.goto(snapshotUrl);
  const report = page.getByRole("region", { name: "Saved selection report" });
  await expect(report).toContainText("Not archived at snapshot time");
  await expect(page.getByRole("button", { name: "Reset selection", exact: true })).toBeDisabled();
  await expect(report).toContainText("Demo acceptance is not recorded here");
  await expect(report).not.toContainText("£80");
  const reset = { operation: "reset", runId: successor, input: { contractVersion: "small-builder-demo.reset.v1", commandId: crypto.randomUUID(), expectedRunRevision: 1 } };
  const first = await api(page, "reset", reset), replay = await api(page, "reset", reset);
  expect(first.status).toBe(201); expect(replay).toEqual(first);
  expect((await api(page, "reset", { ...reset, input: { ...reset.input, commandId: crypto.randomUUID() } })).status).toBe(409);
  for (const key of ["allocation", "reversal", "lockedBillId", "hiddenSignals"]) {
    expect((await api(page, "reset", { ...reset, input: { ...reset.input, [key]: true } })).status).toBe(400);
  }
  const other = await browser.newContext();
  try {
    const foreign = await other.newPage(); await signIn(foreign);
    expect((await api(foreign, "read", undefined, runId)).status).toBe(404);
    expect((await api(foreign, "reset", reset)).status).toBe(404);
  } finally { await other.close(); }
});

test("DEMO-S launches a fresh shadow job, resumes it and resets without inventing results", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page); await page.goto("/demo-s");
  await page.getByRole("button", { name: "Choose shadow-30000 selection", exact: true }).click();
  await expect(page.getByRole("region", { name: "Saved shadow-30000 selection" })).toBeVisible();
  const selectionUrl = page.url();
  const runId = new URL(selectionUrl).searchParams.get("runId");
  const requests: { captureId: string }[] = [];
  await page.route("**/api/jobs/capture", async route => {
    requests.push(route.request().postDataJSON());
    const response = await route.fetch();
    if (requests.length === 1) { expect(response.ok()).toBe(true); await route.abort("failed"); }
    else await route.fulfill({ response });
  });
  await page.getByRole("button", { name: "Launch or resume shadow-30000", exact: true }).click();
  // Next's route announcer also has role=alert. Require this journey's actual
  // lost-response outcome before reload, so we cannot cancel the first attempt.
  await expect(page.getByRole("region", { name: "Journey results", exact: true }).getByRole("alert"))
    .toHaveText("Capture outcome unconfirmed. Retry this selection to recover the same request.");
  expect(requests).toHaveLength(1); expect(requests[0]!.captureId).toBe(runId);
  await page.reload();
  await expect(page.getByRole("region", { name: "Saved shadow-30000 selection", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Launch or resume shadow-30000", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Journey results", exact: true }).getByRole("alert")).toHaveCount(0);
  const replayResponse = page.waitForResponse(response => response.url().endsWith("/api/jobs/capture") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Launch or resume shadow-30000", exact: true }).click();
  const replay = await replayResponse;
  const replayBody: unknown = await replay.json();
  expect(replay.status(), JSON.stringify(replayBody)).toBe(201);
  const recovered = recoveredCaptureV1.parse(replayBody);
  expect(recovered.captureId).toBe(runId);
  await expect(page.getByRole("heading", { name: "Final Check £30,000 journey" })).toBeVisible();
  const jobId = new URL(page.url()).searchParams.get("jobId");
  expect(jobId).toBeTruthy(); expect(requests).toHaveLength(2);
  await expect(page.getByRole("link", { name: "← Practice chooser", exact: true })).toHaveAttribute("href", new URL(selectionUrl).pathname + new URL(selectionUrl).search);
  await page.getByRole("button", { name: "Create or recover the J3 capture", exact: true }).click();
  await expect(page.getByLabel("Saved job reference")).toHaveValue(jobId!);
  expect(requests[0]).toEqual(requests[1]); expect(requests[0]!.captureId).toBe(runId);
  await page.getByRole("link", { name: "Continue this job through its real controls", exact: true }).click();
  await page.getByRole("button", { name: "Save customer and site", exact: true }).click();
  await expect(page.getByTestId("party-customer")).toHaveText("Practice Customer");
  for (const name of ["Protect room", "Prepare walls", "Paint walls", "Finish trim", "Clean site"]) {
    await page.getByRole("button", { name: `Accept ${name}`, exact: true }).click();
  }
  await page.getByLabel(/Answer Confirm disposal/u).fill("Builder removes fictional waste");
  await page.getByRole("button", { name: "Confirm scope", exact: true }).click();
  await expect(page.getByTestId("job-status")).toHaveText("Quote being prepared");
  await page.goto(selectionUrl);
  const savedResponse = page.waitForResponse(response => response.url().endsWith(`/api/jobs/${jobId}/shadow-demo`) && response.request().method() === "GET");
  await page.getByRole("button", { name: "Create or resume and read saved results", exact: true }).click();
  const response = await savedResponse;
  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({ version: "shadow-demo-report.v2", jobId,
    customerApproval: { state: "not_ready_yet", approvals: [] } });
  const results = page.getByRole("region", { name: "Saved shadow journey report" });
  await expect(results).toContainText("Not built yet"); await expect(results).toContainText("Not locked");
  await expect(results).toContainText("No invoice issued"); await expect(results).toContainText("Customer approval: Not ready yet (MON-5)");
  await expect(results.getByRole("link", { name: "Open the same saved job" })).toHaveAttribute("href", `/jobs/${jobId}`);
  await expect(results).not.toContainText("£80.00");
  await page.getByRole("button", { name: "Launch or resume shadow-30000", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`jobId=${jobId}`));
  await page.goto(selectionUrl);
  await page.getByRole("button", { name: "Reset selection", exact: true }).click();
  await expect(page.getByRole("link", { name: "Open archived selection", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Saved shadow journey report" })).toHaveCount(0);
  await page.getByRole("button", { name: "Launch or resume shadow-30000", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Final Check £30,000 journey" })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("jobId")).not.toBe(jobId);
  expect(requests.at(-1)!.captureId).not.toBe(runId);
});
