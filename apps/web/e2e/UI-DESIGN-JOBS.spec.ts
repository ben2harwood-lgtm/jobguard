import { expect, test, type Page } from "@playwright/test";

// The screens rebuilt from the approved design: every main screen and job tab opens on the
// existing synthetic routes, and a job started from the design lands in its designed Work tab.
async function signIn(page: Page) {
  expect((await page.request.post("/api/session")).ok()).toBe(true);
  const session = await (await page.request.get("/api/session")).json() as { tenants: { id: string }[] };
  const jobs = await (await page.request.get(`/api/jobs?tenantId=${session.tenants[0]!.id}`)).json() as { jobs: { id: string; status: string }[] };
  return jobs.jobs.find(job => job.status === "live") ?? jobs.jobs[0]!;
}

test("UI-DESIGN-JOBS main screens and job tabs open in the design", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(String(error)));
  const job = await signIn(page);
  for (const [path, testId] of [["/", "designed-today"], ["/today", "designed-today"], ["/jobs", "designed-jobs-list"], ["/check", "designed-check"], ["/money", "designed-money"], ["/more", "designed-more"],
    [`/jobs/${job.id}/overview`, "designed-job-overview"], [`/jobs/${job.id}/work`, "designed-job-work"], [`/jobs/${job.id}/money`, "designed-job-money"], [`/jobs/${job.id}/records`, "designed-job-records"]] as const) {
    await page.goto(path);
    await expect(page.getByTestId(testId)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("navigation", { name: /Main navigation|Mobile navigation/u }).first()).toBeAttached();
    await expect(page.getByRole("note", { name: "Practice sandbox notice" })).toBeVisible();
  }
  await expect(page.getByTestId("job-diary")).toBeVisible();
  await page.goto(`/jobs/${job.id}/work`);
  await expect(page.getByRole("region", { name: "Job workspace" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("UI-DESIGN-JOBS a job started from the design opens in its designed Work tab", async ({ page }) => {
  await signIn(page);
  await page.goto("/jobs/new");
  await page.getByRole("button", { name: "Make my draft", exact: true }).click();
  await page.getByRole("button", { name: "Check and edit my draft", exact: true }).click();
  await expect(page).toHaveURL(/\/jobs\/[0-9a-f-]{36}\/work$/u, { timeout: 30_000 });
  await expect(page.getByTestId("designed-job-work")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("navigation", { name: "Job sections" }).getByRole("button", { name: "Overview", exact: true }).click();
  await expect(page.getByTestId("designed-job-overview")).toBeVisible({ timeout: 30_000 });
});
