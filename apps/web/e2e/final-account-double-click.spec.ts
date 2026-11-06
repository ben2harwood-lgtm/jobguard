import { expect, test } from "@playwright/test";
import { openLiveWatchdogJob } from "./helpers/capture-journey";

test.setTimeout(180_000);

// Both the mobile-360 and desktop projects run these against fictional jobs.
test("double-click builds one final account without a false sources-changed notice", async ({ page }) => {
  await openLiveWatchdogJob(page);
  const jobId = (await page.locator(".quote-editor").getAttribute("data-job-id"))!;
  const path = `/api/jobs/${jobId}/final-account`;
  const build = page.getByRole("button", { name: "Build final account", exact: true });
  await expect(build).toBeEnabled();

  let builds = 0;
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**${path}`, async route => {
    if (route.request().method() !== "POST") return route.continue();
    builds++;
    const response = await route.fetch();
    await pending;
    await route.fulfill({ response });
  });

  try {
    await build.dblclick();
    await expect(build).toBeDisabled();
    await expect(build).toHaveAttribute("aria-busy", "true");
    await expect.poll(() => builds).toBe(1);
  } finally {
    release();
  }

  const rebuilt = page.getByRole("button", { name: "Rebuild from approved sources", exact: true });
  await expect(rebuilt).toBeEnabled();
  await expect(rebuilt).toHaveAttribute("aria-busy", "false");
  await expect(page.getByText("Final account rebuilt from accepted history and approved changes.", { exact: true })).toBeVisible();
  await expect(page.getByText(/The approved sources changed/)).toHaveCount(0);
  expect(builds).toBe(1);
  const saved = await page.request.get(path);
  expect(saved.ok()).toBe(true);
  expect((await saved.json()).account.revision).toBe(1);
});

for (const code of ["STALE_FINAL_ACCOUNT_REVISION", "STALE_APPROVED_SOURCES"]) {
  test(`handles ${code} and allows a later build`, async ({ page }) => {
    await openLiveWatchdogJob(page);
    const jobId = (await page.locator(".quote-editor").getAttribute("data-job-id"))!;
    const path = `/api/jobs/${jobId}/final-account`;
    const build = page.getByRole("button", { name: "Build final account", exact: true });
    await expect(build).toBeEnabled();
    let builds = 0;
    await page.route(`**${path}`, async route => {
      if (route.request().method() !== "POST") return route.continue();
      builds++;
      if (builds === 1) return route.fulfill({ status: 409, json: { code } });
      return route.continue();
    });
    await build.click();
    const notice = code === "STALE_FINAL_ACCOUNT_REVISION"
      ? "A final account build is already in progress or has completed. Reload before building again."
      : "The approved sources changed. Reload and rebuild the final account.";
    await expect(page.getByText(notice, { exact: true })).toBeVisible();
    if (code === "STALE_FINAL_ACCOUNT_REVISION") await expect(page.getByText(/The approved sources changed/)).toHaveCount(0);
    await expect(build).toBeEnabled();
    await expect(build).toHaveAttribute("aria-busy", "false");
    await page.reload();
    const price = page.getByRole("button", { name: "Price the work", exact: true });
    if (await price.isVisible()) await price.click();
    await build.click();
    await expect(page.getByRole("button", { name: "Rebuild from approved sources", exact: true })).toBeEnabled();
    expect(builds).toBe(2);
  });
}

test("releases the build guard after a network failure", async ({ page }) => {
  await openLiveWatchdogJob(page);
  const jobId = (await page.locator(".quote-editor").getAttribute("data-job-id"))!;
  const build = page.getByRole("button", { name: "Build final account", exact: true });
  await expect(build).toBeEnabled();
  let builds = 0;
  await page.route(`**/api/jobs/${jobId}/final-account`, route => {
    if (route.request().method() !== "POST") return route.continue();
    builds++;
    return builds === 1 ? route.abort("failed") : route.continue();
  });
  await build.click();
  await expect(page.getByText("The final account could not be built. Try loading it again before rebuilding.", { exact: true })).toBeVisible();
  await expect(build).toBeEnabled();
  await expect(build).toHaveAttribute("aria-busy", "false");
  await build.click();
  await expect(page.getByRole("button", { name: "Rebuild from approved sources", exact: true })).toBeEnabled();
  expect(builds).toBe(2);
});
