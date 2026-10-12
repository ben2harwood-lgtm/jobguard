import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { finishDispositionsAndTerms, prepareLockJob, seedManySignals, withSyntheticShadow } from "./helpers/final-account-lock-journey";

test("DW2/DW4/DW9: persisted completion survives reload, Jobs and a second browser", async ({ page, browser }) => {
  const fixture = await prepareLockJob(page);
  const V = async (id: string, value: string) => expect(page.getByTestId(id)).toHaveText(value);
  const panel = page.getByTestId("final-account-lock");
  await expect(panel.getByText("Anything else to add before you finish this job?", { exact: true })).toBeVisible();
  await panel.getByLabel("Final-review extra description", { exact: true }).fill("Fictional unpriced draft");
  await panel.getByLabel("Final-review extra price (£, optional)", { exact: true }).fill("invalid");
  await panel.getByRole("button", { name: "Add final-review extra", exact: true }).click();
  await expect(panel.getByTestId("final-account-lock-error")).toHaveText("INVALID_FINAL_ACCOUNT_LOCK_INPUT");
  await expect(panel.getByTestId("final-account-lock-error")).toBeFocused();
  await panel.getByLabel("Final-review extra price (£, optional)", { exact: true }).fill("");
  const data = { version: "final-account.lock.v1", commandId: randomUUID(), finalAccountRevisionId: fixture.account.id, expectedRevision: fixture.account.revision, declarationVersion: "final_account_declaration.v1" };
  const path = `/api/jobs/${fixture.jobId}/final-account/lock`;
  await expect(panel.getByTestId("lock-bound-invoices").getByRole("alert")).toHaveText("FINAL_ACCOUNT_LOCK_REQUIRED");
  await expect(panel.getByRole("button", { name: "Issue final invoice", exact: true })).toBeDisabled();
  const missing = await page.request.post(path, { data });
  expect(missing.ok()).toBe(false);
  expect((await missing.json()).code).toBe("SCOPE_DISPOSITION_MISSING");
  await finishDispositionsAndTerms(page);
  const target = panel.getByRole("button", { name: "Complete final account", exact: true });
  await target.focus(); await expect(target).toBeFocused();
  const dimensions = await target.boundingBox();
  expect(dimensions!.width).toBeGreaterThanOrEqual(44); expect(dimensions!.height).toBeGreaterThanOrEqual(44);
  const first = await page.request.post(path, { data }); expect(first.ok()).toBe(true);
  const result = await first.json();
  const replay = await page.request.post(path, { data }); expect(replay.ok()).toBe(true); expect(await replay.json()).toEqual(result);
  const changedReplay = await page.request.post(path, { data: { ...data, expectedRevision: fixture.account.revision + 1 } });
  expect(changedReplay.status()).toBe(409); expect((await changedReplay.json()).code).toBe("IDEMPOTENCY_CONFLICT");
  const extraAfterLock = await page.request.post(`/api/jobs/${fixture.jobId}/final-account/review-extras`, { data: {
    version: "final-review-extra.v1", commandId: randomUUID(), scopeItemId: randomUUID(), description: "Too late", captureText: "Too late", price: null,
  } });
  expect(extraAfterLock.ok()).toBe(false); expect((await extraAfterLock.json()).code).toBe("FINAL_REVIEW_CLOSED");
  await page.reload();
  await V('lock-state','Final account completed');
  await expect(panel.getByTestId("final-check-state")).toHaveText("Running JobGuard's final check");
  await expect(panel.getByRole("button", { name: "Issue final invoice", exact: true })).toBeDisabled();
  const other = await browser.newContext({ storageState: await page.context().storageState() });
  try {
    const second = await other.newPage(); await second.goto(`/jobs/${fixture.jobId}#final-account-title`);
    await expect(second.getByTestId("lock-state")).toHaveText("Final account completed");
    const conflict = await second.request.post(path, { data: { ...data, commandId: randomUUID() } });
    expect(conflict.status()).toBe(409); expect((await conflict.json()).code).toBe("FINAL_ACCOUNT_ALREADY_LOCKED");
  } finally { await other.close(); }
  await page.goto("/");
  await page.locator(`a[href='/jobs/${fixture.jobId}']`).click();
  await page.getByRole("link", { name: "Final account and invoices", exact: true }).click();
  await V('lock-state','Final account completed');
  await expect(page.getByText("Practice sandbox — synthetic data; nothing is sent or charged", { exact: true }).first()).toBeVisible();
  await expect(page.getByTestId("final-net")).toHaveText(/^£\d[\d,]*\.\d{2}$/u);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

for (const signalCount of [0, 25]) test(`DW8: fixed completion view with ${signalCount} held signals`, async ({ page }) => {
  const fixture = await prepareLockJob(page);
  if (signalCount) await seedManySignals(fixture.tenantId, fixture.jobId, fixture.evidenceId);
  await page.reload();
  await finishDispositionsAndTerms(page);
  await page.getByRole("button", { name: "Complete final account", exact: true }).click();
  await expect(page.getByTestId("lock-state")).toHaveText("Final account completed");
  await expect(page.getByTestId("final-check-state")).toHaveText("Running JobGuard's final check");
  await expect(page.getByTestId("final-account-lock").getByText("Synthetic held extra", { exact: true })).toHaveCount(0);
});

test("DW7: pending and failed reconciliation refuse both invoice kinds in commands and UI", async ({ page }) => {
  const fixture = await prepareLockJob(page);
  await finishDispositionsAndTerms(page);
  await page.getByRole("button", { name: "Complete final account", exact: true }).click();
  await expect(page.getByTestId("lock-state")).toHaveText("Final account completed");
  const appendCheck = (status: "pending" | "failed") => withSyntheticShadow(fixture.tenantId, async (shadow, admin) => {
    const lock = (await admin.query("SELECT id,locked_at::text AS cutoff FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2", [fixture.tenantId, fixture.jobId])).rows[0];
    await shadow.query("INSERT INTO app.final_account_lock_check(tenant_id,job_id,id,lock_id,evidence_cutoff_at,run_id,status) VALUES($1,$2,$3,$4,$5,$6,$7)", [fixture.tenantId, fixture.jobId, randomUUID(), lock.id, lock.cutoff, randomUUID(), status]);
  });
  const assertBlocked = async (code: "FINAL_CHECK_NOT_COMPLETE" | "FINAL_CHECK_FAILED") => {
    await page.reload();
    const panel = page.getByTestId("lock-bound-invoices");
    await expect(panel.getByRole("alert")).toHaveText(code);
    await expect(panel.getByRole("button", { name: "Issue final invoice", exact: true })).toBeDisabled();
    await expect(panel.getByRole("button", { name: "Issue supplementary invoice", exact: true })).toBeDisabled();
    await expect(page.getByTestId("final-check-state")).toHaveText("Running JobGuard's final check");
    for (const invoiceKind of ["final", "supplementary"] as const) {
      const refusal = await page.request.post(`/api/jobs/${fixture.jobId}/final-account/lock`, { data: {
        version: "lock-bound-invoice.issue.v1", commandId: randomUUID(), finalAccountRevisionId: fixture.account.id,
        expectedSourceHash: fixture.account.sourceHash, invoiceKind, recipient: "practice-customer@example.invalid", issuedOn: "2026-10-12",
      } });
      expect(refusal.ok()).toBe(false); expect((await refusal.json()).code).toBe(code);
    }
  };
  await appendCheck("pending"); await assertBlocked("FINAL_CHECK_NOT_COMPLETE");
  await appendCheck("failed"); await assertBlocked("FINAL_CHECK_FAILED");
});
