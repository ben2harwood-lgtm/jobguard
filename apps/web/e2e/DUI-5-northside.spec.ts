import { expect, test, type Locator, type Page } from "@playwright/test";
import { Pool } from "pg";
import { installContractorAgreementFixture } from "./contractor-agreement-fixture.js";
import { E2E_ADMIN_DATABASE_URL } from "./global-setup";

test.setTimeout(600_000);
const hub = "/northside?designed=1";
const register = "/contractor/work-orders?designed=1";
const capture = "/site/extra?designed=1";
const approvals = "/approvals/extras?designed=1";
const registerApi = "/api/contractor/work-order-imports";
const extraApi = "/api/northside/extras";
const button = (page: Page | Locator, name: string) => page.getByRole("button", { name, exact: true });
const navigation = (page: Page) => page.getByRole("navigation", { name: "Contractor workspace" });
const ready = (page: Page) => expect(page.getByTestId("register-status")).toHaveText("Persisted register loaded");
const table = (page: Page) => page.getByTestId("orders-table");
const search = (page: Page) => page.getByRole("searchbox", { name: "Search work orders" });

async function showRole(page: Page, role: string) {
  await page.goto(hub);
  await button(page, `Act as ${role}`).click();
  await expect(page.getByTestId("actual-actor")).toContainText(`Acting as ${role}`);
}

async function evidence(page: Page, state: string, target?: Locator) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  await expect(page.getByRole("note", { name: "Practice sandbox notice" })).toBeVisible();
  const path = `e2e/artifacts/dui-5/${test.info().project.name}-${state}.png`;
  if (target) await target.screenshot({ path, animations: "disabled" });
  else {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path, animations: "disabled" });
  }
}

async function checkControl(control: Locator) {
  await control.page().keyboard.press("Tab");
  await control.focus();
  await expect(control).toBeFocused();
  expect(await control.evaluate(element => getComputedStyle(element).outlineStyle)).toBe("solid");
  const box = await control.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  expect(box?.width).toBeGreaterThanOrEqual(44);
}

async function searchFor(page: Page, text: string) {
  await search(page).fill(text);
  await button(page, "Search").click();
  await ready(page);
}

async function logExtra(page: Page, description: string, screenshot = false) {
  await page.goto(capture);
  const job = page.getByLabel("Job", { exact: true });
  await expect(job).toBeVisible({ timeout: 60_000 });
  await job.selectOption({ label: "NS-1-0001" });
  await page.getByLabel("What is the extra work?").fill(description);
  await page.getByLabel("Note for the office").fill("Fictional note for the Northside approval exercise");
  await button(page, "Finished").click();
  const attach = button(page, "Attach practice photo");
  await checkControl(attach);
  await attach.click();
  await expect(page.getByTestId("photo-attached")).toBeVisible();
  await page.getByLabel(/The resident has seen this/).check();
  const submit = button(page, "Log extra");
  if (screenshot) await evidence(page, "site-capture", page.locator("main > section").filter({ has: submit }));
  await submit.click();
  await expect(page.getByTestId("extra-logged")).toBeVisible();
}

test("the designed Northside finds saved work across 2,000 orders and preserves site origin and role-bound decisions", async ({ page, browser }) => {
  await installContractorAgreementFixture(page);
  await page.goto(hub);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Northside Property Services");
  await button(page, "Start Northside practice").click();
  await expect(page.getByTestId("fact-orders")).toHaveText("2000", { timeout: 240_000 });
  const { tenantId } = await (await page.request.get("/api/contractor")).json();
  const { facts } = await (await page.request.get("/api/northside")).json();
  expect(facts).toMatchObject({ ordersThisMonth: 2_000, clients: 3, operatives: 40 });
  await evidence(page, "northside");

  await page.goto("/northside");
  await expect(navigation(page)).toHaveCount(0);
  await expect(page.getByTestId("fact-orders")).toHaveText("2000");
  await page.goto(hub);
  await navigation(page).getByRole("link", { name: "Work orders" }).click();
  await expect(page).toHaveURL(/\/contractor\/work-orders\?designed=1$/u);
  await ready(page);
  await expect(table(page).locator("tbody tr")).toHaveCount(50);
  const first = await table(page).locator("tbody tr").first().getAttribute("data-testid");
  await button(page, "Next page").click();
  await ready(page);
  await expect(page.getByText("Page 2", { exact: true })).toBeVisible();
  await expect(table(page).locator("tbody tr").first()).not.toHaveAttribute("data-testid", first!);
  await button(page, "Previous page").click();
  await ready(page);
  await expect(table(page).locator("tbody tr").first()).toHaveAttribute("data-testid", first!);
  await searchFor(page, "no-matching-northside-reference");
  await expect(page.getByText("No work orders match that search.")).toBeVisible();
  const classic = await (await page.request.get(registerApi)).json();
  expect(classic.orders).toHaveLength(200);
  expect(classic.orders.some((order: { reference: string }) => order.reference === "NS-1-0001")).toBe(false);
  await searchFor(page, "ns-1-0001");
  await expect(table(page).locator("tbody tr")).toHaveCount(1);
  const order = page.getByTestId("order-NS-1-0001");
  await expect(order).toContainText("Live");
  await checkControl(search(page));
  await evidence(page, "work-orders");
  await order.getByRole("link", { name: "NS-1-0001", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Order NS-1-0001", level: 1 })).toBeVisible();
  await expect(page.getByTestId("current-revision")).toHaveText("1");
  const jobId = await page.getByTestId("job-id").innerText();
  const detailUrl = new URL(page.url());
  expect(detailUrl.searchParams.get("designed")).toBe("1");
  const detail = await (await page.request.get(`/api${detailUrl.pathname}/revisions`)).json();
  expect(detail).toMatchObject({ jobId, reference: "NS-1-0001", currentRevision: 1, jobStatus: "live", realExternalActions: 0 });
  expect(detail.revisions[0].lines[0].origin).toBe("client_instruction");
  await expect(page.getByRole("link", { name: "Billing and reconciliation" })).toHaveAttribute("href", `/contractor/jobs/${jobId}/billing`);
  await page.reload();
  await expect(page.getByTestId("job-id")).toHaveText(jobId);
  await evidence(page, "order-detail");
  const other = await browser.newContext();
  try {
    await other.addCookies(await page.context().cookies());
    const classicDetail = await other.newPage();
    await classicDetail.goto(detailUrl.pathname);
    await expect(navigation(classicDetail)).toHaveCount(0);
    await expect(classicDetail.getByTestId("job-id")).toHaveText(jobId);
    await expect(classicDetail.getByTestId("diff-1")).toHaveText(await page.getByTestId("diff-1").innerText());
  } finally { await other.close(); }
  expect((await page.request.get(`${registerApi}?page=0`)).status()).toBe(422);

  await showRole(page, "operative");
  const { membershipId } = await (await page.request.get("/api/northside")).json();
  await page.goto(register);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Your role cannot import work orders.");
  expect((await page.request.get(`${registerApi}?q=NS-1-0001&page=1`)).status()).toBe((await page.request.get(registerApi)).status());
  const approveDescription = "DUI-5 fictional extra for approval";
  const rejectDescription = "DUI-5 fictional extra to decline";
  await logExtra(page, approveDescription, true);
  await logExtra(page, rejectDescription);
  await page.reload();
  await expect(page.getByTestId("my-extra").filter({ hasText: approveDescription })).toContainText("resident confirmed");
  const extraRead = await (await page.request.get(extraApi)).json();
  const extraIds = extraRead.extras.filter((extra: { description: string }) => [approveDescription, rejectDescription].includes(extra.description)).map((extra: { extraId: string }) => extra.extraId);
  expect(extraIds).toHaveLength(2);

  const db = new Pool({ connectionString: E2E_ADMIN_DATABASE_URL, max: 1 });
  try {
    const origins = async () => (await db.query(`
      SELECT variation_id, kind, raising_membership_id, evidence_id, resident_confirmation_evidence_id
      FROM app.extra_origin
      WHERE tenant_id=$1 AND job_id=$2 AND variation_id=ANY($3::uuid[]) ORDER BY variation_id
    `, [tenantId, jobId, extraIds])).rows;
    const firstOrigins = await origins();
    expect(firstOrigins).toHaveLength(2);
    for (const item of firstOrigins) {
      expect(item).toMatchObject({ kind: "site_user", raising_membership_id: membershipId });
      expect(item.evidence_id).toBeTruthy();
      expect(item.resident_confirmation_evidence_id).toBeTruthy();
    }

    await page.goto(approvals);
    await expect(page.getByTestId("approvals-role")).toHaveText("operative");
    await expect(button(page, "Approve as supervisor")).toHaveCount(0);
    await expect(button(page, "Reject this extra")).toHaveCount(0);
    await expect(button(page, "Price this extra")).toHaveCount(0);

    await showRole(page, "surveyor");
    await page.goto(approvals);
    await expect(page.getByTestId("approvals-role")).toHaveText("surveyor");
    const card = (description: string) => page.getByTestId("extra-card").filter({ hasText: description });
    const accepted = card(approveDescription);
    const declined = card(rejectDescription);
    for (const extra of [accepted, declined]) {
      await extra.getByLabel("Rate card item", { exact: true }).selectOption("CLEAR-VOID");
      const shownPrice = await extra.getByTestId("price-preview").innerText();
      await button(extra, "Price this extra").click();
      await expect(extra.getByTestId("extra-state")).toHaveText("Priced - ready to submit");
      await expect(extra.getByTestId("extra-amount")).toHaveText(shownPrice);
      await expect(button(extra, "Submit for approval")).toHaveCount(0);
    }

    await showRole(page, "supervisor");
    await page.goto(approvals);
    await expect(page.getByTestId("approvals-role")).toHaveText("supervisor");
    for (const extra of [accepted, declined]) {
      await button(extra, "Submit for approval").click();
      await expect(extra.getByTestId("extra-steps")).toContainText("supervisor: waiting");
    }
    await checkControl(button(accepted, "Approve as supervisor"));
    await evidence(page, "supervisor-review", accepted);
    await button(accepted, "Approve as supervisor").click();
    await expect(accepted.getByTestId("extra-state")).toHaveText("Approved");
    await expect(accepted.getByTestId("extra-steps")).toContainText("supervisor: done");
    await expect(button(declined, "Reject this extra")).toBeDisabled();
    await declined.getByLabel("Reason for rejection").selectOption("not_agreed");
    await button(declined, "Reject this extra").click();
    await expect(declined.getByTestId("extra-state")).toHaveText("Not approved");
    await evidence(page, "declined-extra", declined);
    const saved = await (await page.request.get(extraApi)).json();
    expect(saved.realExternalActions).toBe(0);
    for (const [description, outcome] of [[approveDescription, "approved"], [rejectDescription, "rejected"]]) {
      expect(saved.extras.find((extra: { description: string }) => extra.description === description)).toMatchObject({ jobId, outcome, hasPhoto: true, residentConfirmed: true });
    }
    expect(await origins()).toEqual(firstOrigins);
    await page.goto("/approvals/extras");
    await expect(navigation(page)).toHaveCount(0);
    await expect(accepted.getByTestId("extra-state")).toHaveText("Approved");
    await expect(declined.getByTestId("extra-state")).toHaveText("Not approved");
  } finally { await db.end(); }
});
