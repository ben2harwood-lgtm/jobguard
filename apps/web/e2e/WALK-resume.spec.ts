import { expect, test } from "@playwright/test";

test.setTimeout(360_000);
// Both configured projects (mobile-360 and desktop), real local synthetic routes.
test("WALK refresh resumes steps 2, 5 and 8 on the same saved jobs", async ({ page, baseURL }) => {
  expect(new URL(baseURL!).hostname).toBe("127.0.0.1");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/practice-company/walkthrough");
  const tour = page.getByRole("region", { name: "Guided walkthrough" });
  await expect(tour).toContainText("Step 1 of 9");
  let captures = 0;
  page.on("request", request => {
    if (request.method() === "POST" && request.url().endsWith("/api/jobs/capture")) captures++;
  });
  let ownJob: string | null = null, exampleJob: string | null = null;
  for (let step = 1; step <= 8; step++) {
    await expect(tour).toContainText(`Step ${step} of 9`, { timeout: 300_000 });
    if ([2, 5, 8].includes(step)) {
      const url = new URL(page.url());
      ownJob ??= url.searchParams.get("walkJob");
      exampleJob ??= url.searchParams.get("walkExample");
      expect(ownJob).toBeTruthy();
      if (step >= 5) expect(exampleJob).toBeTruthy();
      const beforeRefresh = captures;
      // No browser storage or claimed step may establish completion.
      await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
      url.searchParams.set("step", "9");
      await page.goto(url.toString());
      await page.reload();
      await expect(tour).toContainText(`Step ${step} of 9`, { timeout: 30_000 });
      expect(new URL(page.url()).searchParams.get("walkJob")).toBe(ownJob);
      await expect(page.getByRole("link", { name: "Open your saved job", exact: true })).toHaveAttribute("href", `/jobs/${ownJob}`);
      if (step >= 5) {
        expect(new URL(page.url()).searchParams.get("walkExample")).toBe(exampleJob);
        await expect(page.getByTestId("workspace-job-id")).toHaveAttribute("data-job-id", exampleJob!);
      }
      if (step === 8) await expect(page.getByTestId("final-gross")).toBeVisible();
      expect(captures).toBe(beforeRefresh);
    }
    await tour.getByRole("button", { name: "Show me", exact: true }).click();
  }
  await expect(tour).toContainText("Step 9 of 9");
  expect(captures).toBe(2);
});
