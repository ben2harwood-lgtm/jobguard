import { expect, test } from "@playwright/test";

test("seeded demo sign-in reaches the first M1 journey step", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start the demo" }).click();
  await page.getByRole("button", { name: "Skip tour" }).click();
  await expect(page.getByRole("heading", { name: "Jobs", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start a new job" }).click();
  await expect(page.getByRole("heading", { name: "Tell us about the work" })).toBeVisible();
  await expect(page.getByText("New job · safe demo")).toBeVisible();
});
