import { expect, test } from "@playwright/test";

test("real company saves and reloads its firm details", async ({ page }) => {
 await page.goto("/sign-in");
 await page.getByLabel("Fictional email address").fill(`firm-${crypto.randomUUID()}@practice.invalid`);
 await page.getByRole("button", { name: "Request code", exact: true }).click();
 const code = await page.getByTestId("fixture-code").textContent();
 await page.getByLabel("Eight-digit code").fill(code!);
 await page.getByRole("button", { name: "Verify code" }).click();
 await expect(page.getByRole("heading", { name: "You're signed in.", exact: true })).toBeVisible();
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

test("own practice firm starts from the sample name, can name itself, and a forged save without a session is refused", async ({ page, browser }) => {
 await page.goto("/practice-company");
 await expect(page.getByRole("heading", { name: "Ready for your first job" })).toBeVisible();
 await page.goto("/firm-details");
 await expect(page.getByLabel("Trading name")).toHaveValue("A Builder Ltd");
 await expect(page.getByRole("button", { name: "Save firm details", exact: true })).toBeEnabled();
 await expect(page.getByRole("button", { name: "Practice firms use the sample name" })).toHaveCount(0);
 await page.getByLabel("Trading name").fill("Fictional Practice Works");
 await page.getByRole("button", { name: "Save firm details", exact: true }).click();
 await expect(page.getByRole("status")).toContainText("Firm details saved.");
 await page.reload();
 await expect(page.getByLabel("Trading name")).toHaveValue("Fictional Practice Works");
 const separate = await browser.newContext();
 try {
  expect(await separate.cookies()).toHaveLength(0);
  const other = await separate.newPage();
  const origin = new URL(page.url()).origin;
  await other.goto(`${origin}/practice-company`);
  await expect(other.getByRole("heading", { name: "Ready for your first job" })).toBeVisible();
  await other.goto(`${origin}/firm-details`);
  await expect(other.getByLabel("Trading name")).toHaveValue("A Builder Ltd");
  await expect(other.getByLabel("Trading name")).not.toHaveValue("Fictional Practice Works");
 } finally { await separate.close(); }
 const anonymous = await browser.newContext();
 try {
  expect(await anonymous.cookies()).toHaveLength(0);
  const origin = new URL(page.url()).origin;
  const forged = await anonymous.request.post(`${origin}/api/firm-profile`, {
   headers: { origin },
   data: { version: "firm-profile.v1", tradingName: "Refused", addressLines: [], contactEmail: "", contactPhone: "" },
  });
  expect([401, 403]).toContain(forged.status());
 } finally { await anonymous.close(); }
 await page.reload();
 await expect(page.getByLabel("Trading name")).toHaveValue("Fictional Practice Works");
});
