import { expect, test } from "@playwright/test";
import { openQuote } from "./helpers/capture-journey";

test("preview binds exact recipient and version before free fake delivery", async ({ page }) => {
  await openQuote(page);
  for (const input of await page.getByLabel(/Unit rate/u).all()) {
    if (await input.inputValue() === "") await input.fill("100.00");
  }
  await page.getByRole("button", { name: "Save draft revision", exact: true }).click();
  await page.getByRole("button", { name: "Preview immutable quote", exact: true }).click();
  await expect(page.getByLabel("Quote preview")).toContainText("Document version 1");
  await page.getByLabel("Confirmed recipient").fill("changed@example.invalid");
  await page.getByRole("button", { name: "Simulate sending this quote", exact: true }).click();
  await expect(page.getByText(/Stale approval blocked/u)).toBeVisible();

  // Delay a real request; do not fabricate its business response. The old
  // preview cannot be sent while the new immutable preview is being prepared.
  let releasePreview!: () => void;
  const previewGate = new Promise<void>(resolve => { releasePreview = resolve; });
  const previewRoute = "**/api/jobs/*/quotes/preview";
  await page.route(previewRoute, async route => { await previewGate; await route.continue(); });
  try {
    const started = page.waitForRequest(request => request.url().endsWith("/quotes/preview") && request.method() === "POST");
    await page.getByRole("button", { name: "Preview immutable quote", exact: true }).click();
    await started;
    await expect(page.getByRole("button", { name: "Simulate sending this quote", exact: true })).toBeDisabled();
    await expect(page.getByLabel("Confirmed recipient")).toBeDisabled();
    releasePreview();
    await expect(page.getByRole("button", { name: "Simulate sending this quote", exact: true })).toBeEnabled();
  } finally {
    releasePreview();
    await page.unroute(previewRoute);
  }
  await page.getByRole("button", { name: "Simulate sending this quote", exact: true }).click();
  await expect(page.getByTestId("quote-delivery")).toHaveText("Queued — not sent");
  await page.getByRole("button", { name: "Continue fake worker", exact: true }).click();
  await expect(page.getByTestId("quote-delivery")).toHaveText("Simulated delivery — nothing sent");
  await expect(page.getByLabel("Delivery facts")).toContainText("Issued: yes");
  await expect(page.getByLabel("Delivery facts")).toContainText("Provider accepted: no");
  await page.getByRole("button", { name: "Show retryable failure", exact: true }).click();
  await expect(page.getByText(/Outbox state:/u)).toContainText("retryable");
  await page.getByRole("button", { name: "Show unknown outcome", exact: true }).click();
  await expect(page.getByText(/Outbox state:/u)).toContainText("outcome_unknown");
  await expect(page.getByText(/No quote operation creates/u)).toBeVisible();
});
