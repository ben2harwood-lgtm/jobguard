import { expect, test } from "@playwright/test";

test("real company saves and reloads its firm details", async ({ page }) => {
 await page.goto("/sign-in");
 await page.getByLabel("Fictional email address").fill(`firm-${crypto.randomUUID()}@practice.invalid`);
 await page.getByRole("button", { name: "Request code", exact: true }).click();
 const code = await page.getByTestId("fixture-code").textContent();
 await page.getByLabel("Eight-digit code").fill(code!);
 await page.getByRole("button", { name: "Verify code" }).click();
 await expect(page.getByRole("heading", { name: "Signed in", exact: true })).toBeVisible();
 await page.goto("/firm-details");
 await expect(page.getByRole("button", { name: "Save firm details", exact: true })).toBeEnabled();
 await page.getByLabel("Trading name").fill("Fictional Oak Works");
 await page.getByLabel("Address line 1").fill("12 Example Lane");
 await page.getByLabel("Contact email").fill("oak@fictional.invalid");
 await page.getByRole("button", { name: "Save firm details", exact: true }).click();
 await expect(page.getByRole("status")).toContainText("Firm details saved.");
 await page.reload();
 await expect(page.getByLabel("Trading name")).toHaveValue("Fictional Oak Works");
 await expect(page.getByLabel("Address line 1")).toHaveValue("12 Example Lane");
 await expect(page.getByLabel("Contact email")).toHaveValue("oak@fictional.invalid");
});

test("blank practice uses the sample name and refuses a forged save", async ({ page }) => {
 await page.goto("/practice-company");
 await expect(page.getByRole("heading", { name: "Ready for your first job" })).toBeVisible();
 await page.goto("/firm-details");
 await expect(page.getByLabel("Trading name")).toHaveValue("A Builder Ltd");
 await expect(page.getByRole("button", { name: "Practice firms use the sample name" })).toBeDisabled();
 const status = await page.evaluate(async () => (await fetch("/api/firm-profile", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ version: "firm-profile.v1", tradingName: "Refused", addressLines: [], contactEmail: "", contactPhone: "" }),
 })).status);
 expect(status).toBe(403);
 await page.reload();
 await expect(page.getByLabel("Trading name")).toHaveValue("A Builder Ltd");
});
