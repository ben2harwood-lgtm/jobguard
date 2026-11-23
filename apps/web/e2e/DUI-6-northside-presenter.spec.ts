import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test.setTimeout(600_000);
const banner = "Practice sandbox — synthetic data; nothing is sent or charged";

test("DUI-6 Northside presenter path", async ({ page, browser }, info) => {
  const startedAt = Date.now();
  const { width, height } = page.viewportSize()!;
  await page.goto("/northside?designed=1");
  await expect(page.getByText(banner, { exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Start Northside practice" }).click();
  await expect(page.getByTestId("fact-orders")).toHaveText("2000", { timeout: 240_000 });

  const originalCookie = (await page.context().cookies()).find(c => c.name === "jg_session")!.value;
  const switchTo = async (role: string) => {
    await page.goto("/northside?designed=1");
    await page.getByRole("button", { name: role === "owner" ? "Return to owner" : `Act as ${role}`, exact: true }).click();
    await expect(page.getByTestId("actual-actor")).toContainText(`Acting as ${role}`);
    expect((await page.context().cookies()).find(c => c.name === "jg_session")!.value).toBe(originalCookie);
  };
  const button = (name: string) => page.getByRole("button", { name, exact: true });
  const link = (name: string | RegExp) => page.getByRole("link", { name, exact: true });
  const approvals = /Surveyor, supervisor and owner:/;
  const description = "Extra: six further void units cleared";

  await switchTo("operative");
  await link(/Operative: log an extra/).click();
  await expect(page.locator("main[data-site-extra-state]")).toHaveAttribute("data-site-extra-state", "ready", { timeout: 60_000 });
  await expect(page.getByLabel("Job")).toContainText("NS-1-0001");
  await page.getByLabel("What is the extra work?").fill(description);
  await page.getByLabel("Note for the office").fill("Six more voids than the order listed; resident shown the photo.");
  await button("Finished").click();
  await button("Attach practice photo").click();
  await expect(page.getByTestId("photo-attached")).toBeVisible();
  await page.getByLabel(/The resident has seen this/).check();
  await button("Log extra").click();
  await expect(page.getByTestId("extra-logged")).toBeVisible();

  await switchTo("surveyor");
  await link(approvals).click();
  await expect(page.getByTestId("approvals-role")).toHaveText("surveyor", { timeout: 60_000 });
  await page.getByLabel("Rate card item").selectOption("CLEAR-VOID");
  await page.getByLabel("Quantity measured").fill("6");
  await expect(page.getByTestId("price-preview")).toHaveText("£1,080.00");
  await button("Price this extra").click();
  await expect(page.getByTestId("extra-state")).toHaveText("Priced - ready to submit");

  await switchTo("supervisor");
  await link(approvals).click();
  await button("Submit for approval").click();
  await expect(page.getByTestId("extra-state")).toHaveText("Waiting for approval");
  await button("Approve as supervisor").click();
  await expect(page.getByTestId("extra-steps")).toContainText("supervisor: done");

  await switchTo("surveyor");
  await link(approvals).click();
  await button("Approve sending to the client (practice)").click();
  const clientLink = page.getByTestId("client-link");
  await expect(clientLink).toBeVisible();
  const href = (await clientLink.getAttribute("href"))!;
  const clientContext = await browser.newContext({ viewport: { width, height } });
  try {
    const customer = await clientContext.newPage();
    await customer.goto(new URL(href, page.url()).href);
    const main = customer.getByRole("main");
    await main.getByRole("button", { name: "Sign in", exact: true }).click();
    await main.getByRole("link", { name: "Review client approvals", exact: true }).click();
    await expect(main.getByRole("heading", { name: description, exact: true })).toBeVisible();
    await main.getByRole("button", { name: "Approve this exact revision and net", exact: true }).click();
    await expect(main.getByRole("status")).toHaveText("Your decision is recorded.");
  } finally {
    await clientContext.close();
  }

  await switchTo("finance");
  await link(/^Finance:/).and(page.locator('a[href^="/contractor/work-orders"]')).click();
  await expect(link("Billing and reconciliation"), "Finance hub link should open the journey order with billing").toBeVisible({ timeout: 30_000 });
  await link("Billing and reconciliation").click();
  await expect(page.locator("main.contractor-settlement")).toBeVisible();
  await expect(page).toHaveURL(/\?designed=1$/);
  await expect(page.getByTestId("approved-not-exported")).toContainText("£1,080.00");
  await button("Export approved extras").click();
  await expect(page.getByRole("status")).toHaveText("Exported 1 line.");
  await expect(page.getByText("1 line · net £1,080.00", { exact: false })).toBeVisible();
  await button("Approve delivery").click();
  const csvLink = link("Download CSV");
  await expect(csvLink).toHaveAttribute("download", "");
  const [csvFile] = await Promise.all([
    page.waitForEvent("download", { timeout: 15_000 }),
    csvLink.click(),
  ]);
  expect(csvFile.suggestedFilename()).toBe("jobguard-billing-export.csv");
  const csvBytes = await readFile(await csvFile.path());

  const csvResponse = await page.request.get(csvFile.url());
  expect(csvResponse.status()).toBe(200);
  const disposition = csvResponse.headers()["content-disposition"];
  expect(disposition).toBe('attachment; filename="jobguard-billing-export.csv"');
  const sha256 = createHash("sha256").update(csvBytes).digest("hex");
  expect(sha256).toBe(csvResponse.headers()["x-content-sha256"]);
  expect(csvBytes).toEqual(await csvResponse.body());

  const [header, row, end, ...remaining] = new TextDecoder("utf-8", { fatal: true }).decode(csvBytes).split("\r\n");
  expect([end, ...remaining]).toEqual([""]);
  const columns = header!.split(",");
  const cells = Array.from(row!.matchAll(/"((?:[^"]|"")*)"(?=,|$)/gu), match => match[1]!.replaceAll('""', '"'));
  expect(cells).toHaveLength(columns.length);
  const extra = Object.fromEntries(columns.map((column, index) => [column, cells[index]]));
  expect(extra).toMatchObject({ description, quantity: "1", approved_net_pence: "108000", currency: "GBP", batch_total_net_pence: "108000" });
  await info.attach("billing-csv-download", {
    body: JSON.stringify({ filename: csvFile.suggestedFilename(), bytes: csvBytes.length, sha256, disposition, description, netPence: extra.approved_net_pence }),
    contentType: "application/json",
  });

  const invoice = page.getByTestId("invoice-NS-INVOICE-1");
  const totals = invoice.locator("tbody tr").last().locator("th");
  for (const [fill, state, column, amount] of [
    ["Fill practice invoice", "Billed", 1, "£2,080.00"],
    ["Fill practice part payment", "Part-paid", 3, "£1,040.00"],
    ["Fill practice balance payment", "Paid", 3, "£2,080.00"],
  ] as const) {
    await button(fill).click();
    await button("Import status").click();
    await expect(page.getByRole("status")).toHaveText("Status imported.");
    await expect(invoice.getByRole("cell", { name: state, exact: true })).toHaveCount(2);
    await expect(totals.nth(column)).toHaveText(amount);
  }

  await link("Monthly statement").click();
  const now = new Date();
  const month = new Intl.DateTimeFormat("sv-SE", { year: "numeric", month: "2-digit", timeZone: "Europe/London" }).format(now);
  await page.getByLabel("Statement month").fill(month);
  await button("Derive and prepare statement").click();
  await expect(page.getByTestId("statement-total")).toHaveText("Statement delta: £108.00");
  await button("Approve exact statement (practice)").click();
  await button("Post approved statement (practice)").click();
  await expect(page.getByText("accrual: £108.00", { exact: true })).toBeVisible();
  await button("Simulate invoice for approved statement (practice)").click();
  await expect(page.getByRole("status")).toHaveText("Simulated invoice: £108.00. No payment due.");

  await expect(page.locator("main.contractor-settlement")).toBeVisible();
  expect(new URL(page.url()).searchParams.get("designed")).toBe("1");
  await link("Dashboard").click();
  await expect(page.locator("main.contractor-settlement")).toBeVisible();
  await expect(page).toHaveURL(/\?designed=1$/);
  await page.getByLabel("Captured from (UTC)").fill("2026-10-01");
  await page.getByLabel("Until, exclusive (UTC)").fill(new Date(now.getTime() + 86400000).toISOString().slice(0, 10));
  await button("Load dashboard").click();
  for (const stage of ["billed", "paid"]) {
    await expect(page.locator("summary").filter({ hasText: new RegExp(`^${stage}:`) })).toHaveText(`${stage}: 1 extras · net £1,080.00`);
  }
  await button("Load fictional Northside baseline sample").click();
  await button("Use two practice teams").click();
  await button("Import history").click();
  await expect(page.getByRole("status")).toContainText("History imported");
  await page.getByLabel("Pilot historical team IDs (comma separated)").fill("fictional-pilot");
  await page.getByLabel("Rest historical team IDs (comma separated)").fill("fictional-rest");
  await button("Compare baseline").click();
  await expect(page.getByRole("heading", { name: "Pilot baseline comparison", exact: true })).toBeVisible();
  const download = page.waitForEvent("download");
  await button("Download baseline with method (json)").click();
  expect((await download).suggestedFilename()).toBe("pilot-baseline.json");
  const elapsedMs = Date.now() - startedAt;
  await info.attach("presenter-path-timing", { body: String(elapsedMs), contentType: "text/plain" });
  expect(elapsedMs).toBeLessThan(600_000);
});
