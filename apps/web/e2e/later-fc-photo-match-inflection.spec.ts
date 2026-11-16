import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { finishDispositionsAndTerms, withSyntheticShadow } from "./helpers/final-account-lock-journey";
import { get, post } from "./helpers/recovery-sources";
import { finalCheckReadV1 } from "../app/ui/final-check-reveal-view";

const painting = "Paint the hall, stairs and landing";
// Each configured project starts a fresh blank company/job; no injected capture,
// signal, classification, worker result or certificate. The real worker completes.
for (const extra of [false, true]) test(`quoted painting photo with ${extra ? "a genuinely missing tap" : "nothing missing"}`, async ({ page }) => {
  test.setTimeout(360_000);
  const click = async (name: string) => {
    const button = page.getByRole("button", { name, exact: true });
    await expect(button).toBeEnabled(); await button.click();
  };
  await page.goto("/practice-company");
  await expect(page.getByRole("heading", { name: "Ready for your first job", exact: true })).toBeVisible();
  await click("＋ Start a new job");
  await page.getByLabel("Work details").fill(`JOB: Fictional hall decorating\nITEM: ${painting} | £600.00`);
  await click("Make my draft"); await click("Check and edit my draft");
  await expect(page.getByRole("heading", { name: "Check the work items", exact: true })).toBeVisible();
  const jobId = new URL(page.url()).pathname.split("/").at(-1)!;
  const path = (suffix: string) => `/api/jobs/${jobId}/${suffix}`;
  const read = (suffix: string) => get(page, path(suffix));
  const save = (suffix: string, data: unknown) => post(page, path(suffix), data);
  await click("Save customer and site");
  await expect(page.getByTestId("party-customer")).toHaveText("Practice Customer");
  await click(`Accept ${painting}`);
  await page.getByLabel(/Answer Confirm disposal/u).fill("Builder removes fictional waste");
  await click("Confirm scope"); await click("Price the work");
  await expect(page.locator(".quote-editor")).toHaveAttribute("data-quote-ready", "true");
  await click("Save draft revision"); await expect(page.getByTestId("quote-revision")).toHaveText("1");
  await click("Preview immutable quote"); await click("Simulate sending this quote");
  await expect(page.getByTestId("quote-delivery")).toHaveText("Simulated delivery — nothing sent");
  await click("Record practice acceptance"); await click("Start this practice job");
  await expect(page.getByRole("heading", { name: "Live · baseline frozen", exact: true })).toBeVisible();
  await page.goto(`/jobs/${jobId}#work-proof`);
  // Purpose is explicit: use a completion photo, never the shared certificate PNG.
  await page.locator("#work-proof").getByRole("button", { name: "No", exact: true }).click();
  await expect(page.getByTestId("proof-statement")).toContainText("No");
  await click("Attach generated practice image"); await click("Check file integrity"); await click("Complete this stage");
  await expect(page.getByTestId("stage-status")).toHaveText("Complete");
  const proof = await read("proof");
  expect(proof.upload.state).toBe("verified");
  const photo = proof.upload.evidenceId;
  if (extra) await save("diary", { version: "job-diary-input.v1", commandId: randomUUID(), entryMode: "typed", onSite: false, text: "Fitted outside tap." });
  await click("Finished on site"); await expect(page.getByTestId("work-state")).toHaveText("Finished on site");
  await click("Build final account");
  await finishDispositionsAndTerms(page);
  await click("Complete final account");
  await expect(page.getByTestId("lock-state")).toHaveText("Final account completed");
  await expect.poll(async () => (await read("final-check")).state, { timeout: 180_000 }).toBe("completed");
  const check = finalCheckReadV1.parse(await read("final-check"));
  expect(check.items).toHaveLength(extra ? 1 : 0);
  expect(check.lockedLines).toEqual([expect.objectContaining({ description: painting, kind: "baseline" })]);
  const lock = (await read("final-account")).lock;
  await page.reload();
  const panel = page.getByTestId("final-check-reveal");
  await expect(panel).toHaveAttribute("aria-busy", "false");
  await expect(panel.getByTestId("final-check-item")).toHaveCount(extra ? 1 : 0);
  if (extra) {
    const item = check.items[0]!;
    expect(item.description).toMatch(/outside tap/iu);
    expect(item.evidence?.map(e => e.id)).not.toContain(photo);
    const command = { version: "final-check.disposition.v1", commandId: randomUUID(), lockId: check.lockId,
      runId: check.runId, signalId: item.signalId, expectedSignalRevision: item.signalRevision, answer: "already_included" };
    // An invented line is refused; it cannot silently dismiss the genuine catch.
    const refusal = await page.request.post(path("final-check/dispositions"), { data: { ...command, referenceId: randomUUID() } });
    expect(refusal.status()).toBe(403);
    expect(finalCheckReadV1.parse(await read("final-check"))).toEqual(check);
    const article = panel.getByTestId("final-check-item");
    await article.getByLabel("Or answer", { exact: true }).selectOption("already_included");
    await expect(article.getByRole("button", { name: "Save answer", exact: true })).toBeDisabled();
    await article.getByLabel("Which locked line?", { exact: true }).selectOption(check.lockedLines![0]!.id);
    const response = page.waitForResponse(r => r.request().method() === "POST" && r.url().endsWith("/final-check/dispositions"));
    await article.getByRole("button", { name: "Save answer", exact: true }).click();
    expect((await response).ok()).toBe(true);
    await expect(article.getByTestId("final-check-disposition")).toHaveText("Your answer: Already included in a locked line");
  } else await expect(panel.getByTestId("final-check-status")).toHaveText("JobGuard's final check found nothing missing from your bill.");
  const saved = await read("final-check");
  await page.reload();
  expect(await read("final-check")).toEqual(saved);
  if (extra) await expect(panel.getByTestId("final-check-disposition")).toHaveText("Your answer: Already included in a locked line");
  expect((await read("final-account")).lock).toEqual(lock);
  expect((await read("variations")).variations).toEqual([]);
  expect((await read("recovery-cases")).cases).toEqual([]);
  expect((await read("payment-fees")).statements).toEqual([]);
  await withSyntheticShadow("11111111-1111-4111-8111-111111111111", async (_shadow, admin) => {
    expect((await admin.query("SELECT evidence_type FROM app.evidence_object WHERE job_id=$1 AND id=$2", [jobId, photo])).rows).toEqual([{ evidence_type: "completion_photo" }]);
    const source = await admin.query("SELECT a.status FROM app.final_check_processing_source s JOIN app.final_check_source_attempt a ON (a.tenant_id,a.job_id,a.manifest_id,a.source_id)=(s.tenant_id,s.job_id,s.manifest_id,s.id) WHERE s.job_id=$1 AND s.evidence_id=$2 ORDER BY a.sequence DESC LIMIT 1", [jobId, photo]);
    expect(source.rows).toEqual([{ status: "detected" }]);
    // Detection can persist the observation; reconciliation must exclude quoted
    // painting from the reveal without altering the locked commercial snapshot.
    const classifications = await admin.query("SELECT c.outcome FROM app.shadow_signal_classification c JOIN app.shadow_commercial_signal s ON (s.tenant_id,s.job_id,s.id)=(c.tenant_id,c.job_id,c.signal_id) WHERE s.job_id=$1 AND s.description='painted walls'", [jobId]);
    expect(classifications.rows).toEqual([{ outcome: "already_in_original_scope" }]);
    expect((await admin.query("SELECT count(*)::int n FROM app.recovery_fee_journal WHERE job_id=$1", [jobId])).rows[0].n).toBe(0);
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
