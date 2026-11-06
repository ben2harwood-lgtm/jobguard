import { expect, test } from "@playwright/test";
test.setTimeout(120_000);

test("blank practice is private, survives reload and resets to empty", async ({ page, browser }) => {
  await page.goto("/practice-company?name=Tommy");
  await expect(page.getByRole("heading", { name: "Tommy's practice firm", exact: true })).toBeVisible();
  await expect(page.getByLabel("Select workspace").locator("option")).toHaveText("Tommy's practice firm");
  await expect(page.getByRole("heading", { name: "Ready for your first job" })).toBeVisible();
  await expect(page.getByLabel("Select workspace")).toHaveValue("11111111-1111-4111-8111-111111111111");
  await expect(page.getByLabel("Select workspace").locator("option")).toHaveCount(1);
  await expect(page.getByText("Kitchen extension", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Earlier proposed pricing (v1)", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Do not enter real customer names/u)).toBeVisible();
  const firstToken = (await page.context().cookies()).find(cookie => cookie.name === "jg_session")!.value;
  const session = await (await page.request.get("/api/session")).json();
  const capture = await page.request.post("/api/jobs/capture", { data: {
    contractVersion: "job_capture_v1", requested_tenant_id: session.tenants[0].id,
    captureId: crypto.randomUUID(), source: { kind: "text", text: "JOB: Fictional blue room\nITEM: Paint walls | £200.00" }, fixtureId: "deterministic-local-v1",
  } });
  expect(capture.status()).toBe(201);
  const { jobId } = await capture.json();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Fictional blue room", exact: true })).toBeVisible();
  const other = await browser.newContext();
  try {
    const visitor = await other.newPage();
    await visitor.goto("http://127.0.0.1:3000/practice-company");
    await expect(visitor.getByRole("heading", { name: "Ready for your first job" })).toBeVisible();
    expect((await visitor.request.get(`/api/jobs/${jobId}`)).status()).toBe(404);
    const otherToken = (await other.cookies()).find(cookie => cookie.name === "jg_session")!.value;
    expect(otherToken).not.toBe(firstToken);
    await page.getByRole("button", { name: "Reset practice firm", exact: true }).click();
    await page.getByRole("button", { name: "Keep practising" }).click();
    await expect(page.getByRole("heading", { name: "Fictional blue room", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Reset practice firm", exact: true }).click();
    await page.getByRole("button", { name: "Yes, reset practice firm" }).click();
    await expect(page.getByRole("heading", { name: "Ready for your first job" })).toBeVisible();
    expect((await page.request.get(`/api/jobs/${jobId}`)).status()).toBe(404);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Tommy's practice firm", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ready for your first job" })).toBeVisible();
    expect((await other.cookies()).find(cookie => cookie.name === "jg_session")!.value).toBe(otherToken);
    await page.getByRole("button", { name: "＋ Start a new job" }).click();
    await expect(page.getByLabel("Work details")).toHaveValue("");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  } finally { await other.close(); }
});

test("practice commands refuse foreign origins and malformed reset requests", async ({ request }) => {
  const url = "http://127.0.0.1:3000/api/practice-company";
  const command = { version: "blank-practice-company.v1", action: "reset" };
  expect((await request.post(url, { headers: { origin: "https://other.invalid" }, data: command })).status()).toBe(403);
  expect((await request.post(url, { headers: { origin: "http://127.0.0.1:3000" }, data: { ...command, tenantId: "caller-selected" } })).status()).toBe(400);
  expect((await request.post(url, { headers: { origin: "http://127.0.0.1:3000" }, data: command })).status()).toBe(401);
});
