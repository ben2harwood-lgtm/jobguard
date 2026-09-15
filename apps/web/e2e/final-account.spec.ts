import { expect, test } from "@playwright/test";

test("shows an unissued draft final account with exact totals and a synthetic issue action", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Continue with demo code" }).click();
  await page.getByRole("button", { name: "Draft final account" }).click();

  await expect(page.getByRole("heading", { name: "Final account" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Exact totals" })).toBeVisible();
  await expect(page.getByText("Net£1,250.00", { exact: true })).toBeVisible();
  await expect(page.getByText("VAT · 20%£250.00", { exact: true })).toBeVisible();
  await expect(page.getByText("Total£1,500.00", { exact: true })).toBeVisible();
  await expect(page.getByText("SYNTHETIC — NOT A REAL INVOICE.", { exact: true })).toBeVisible();
  await expect(page.getByText(/no message, charge or spend leaves JobGuard/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve synthetic issue + fake send" })).toBeVisible();
  await expect(page.getByText(/Invoice SYN-/)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /Payment:/ })).toHaveCount(0);

  await page.screenshot({ path: "/tmp/jobguard-final-account.png", fullPage: true });
});
