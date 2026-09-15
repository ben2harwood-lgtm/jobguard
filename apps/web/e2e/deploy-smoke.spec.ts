import { expect, test } from "@playwright/test";

test("seeded demo sign-in reaches the first M1 journey step", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Continue with demo code" }).click();
  await expect(page.getByRole("heading", { name: "Jobs", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Walk a new job" }).click();
  await expect(page.getByRole("heading", { name: "Walk it" })).toBeVisible();
  await expect(page.getByText("Synthetic fixture · zero spend")).toBeVisible();
});
