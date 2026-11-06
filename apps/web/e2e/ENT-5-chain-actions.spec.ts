import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { installContractorAgreementFixture } from "./contractor-agreement-fixture.js";
test.setTimeout(600_000);
test.use({ headless: true });
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const origin = "http://127.0.0.1:3000";
type Extra = { extraId: string; jobId: string; requestId: string; revisionHash: string; netPence: number; nextStepIndex: number; state: string };
const command = () => crypto.randomUUID();
async function post(page: Page, extra: Extra, action: string, body: object) {
  return page.request.post(`/api/northside/extras/${extra.extraId}/${action}`, { headers: { origin }, data: { version: "northside-command.v1", commandId: command(), jobId: extra.jobId, ...body } });
}
const bound = (x: Extra) => ({ requestId: x.requestId, revisionHash: x.revisionHash, netPence: x.netPence, stepIndex: x.nextStepIndex });
async function switchTo(page: Page, role: string) {
  await page.goto("/northside");
  await button(page, role === "owner" ? "Return to owner" : `Act as ${role}`).click();
  await expect(page.getByTestId("actual-actor")).toContainText(`Acting as ${role}`);
}
async function controls(page: Page) {
  const main = page.locator("main");
  // Focused accessibility regression: every displayed control has a name, native labels,
  // no duplicate IDs, and 44px targets. This is not a whole-site WCAG certification.
  const violations = await main.evaluate(root => {
    const errors: string[] = [], ids = new Set<string>();
    for (const node of root.querySelectorAll<HTMLElement>("[id]")) { if (ids.has(node.id)) errors.push(`duplicate:${node.id}`); ids.add(node.id); }
    for (const node of root.querySelectorAll<HTMLElement>("button,input,select")) {
      if (!node.getClientRects().length) continue;
      const box = node.getBoundingClientRect(); if (box.width < 44 || box.height < 44) errors.push(`target:${node.id || node.textContent}`);
      const named = node.getAttribute("aria-label") || node.textContent?.trim() || (node.id && root.querySelector(`label[for="${node.id}"]`)?.textContent);
      if (!named) errors.push(`unnamed:${node.tagName}`);
      if (node.matches("input,select") && !node.getAttribute("aria-label") && !(node.id && root.querySelector(`label[for="${node.id}"]`))) errors.push(`unlabelled:${node.id}`);
    }
    return errors;
  });
  expect(violations, "serious control accessibility regressions").toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

test("ENT-5 reject, revise, stale on screen, withdraw, replays and route race", async ({ page, browser }) => {
  await installContractorAgreementFixture(page);
  await page.goto("/northside"); await button(page, "Start Northside practice").click();
  await expect(page.getByTestId("fact-orders")).toHaveText("2000", { timeout: 240_000 });
  await switchTo(page, "operative"); await page.goto("/site/extra");
  await expect(page.locator("main[data-site-extra-state]")).toHaveAttribute("data-site-extra-state", "ready", { timeout: 60_000 });
  await page.getByLabel("What is the extra work?").fill("Fictional ENT-5 correction");
  await page.getByLabel("Note for the office").fill("Made-up extra for approval testing");
  await button(page, "Finished").click();
  await button(page, "Attach practice photo").click(); await expect(page.getByTestId("photo-attached")).toBeVisible();
  await page.getByLabel(/The resident has seen this/).check(); await button(page, "Log extra").click();
  await expect(page.getByTestId("extra-logged")).toBeVisible();
  await switchTo(page, "surveyor"); await page.goto("/approvals/extras");
  await expect(page.getByLabel("Rate card item", { exact: true })).toBeVisible({ timeout: 60_000 });
  await page.getByLabel("Rate card item", { exact: true }).selectOption("CLEAR-VOID");
  await button(page, "Price this extra").click(); await expect(page.getByTestId("extra-state")).toHaveText("Priced - ready to submit");
  // Q16: real price and query routes leave the extra logged until a human submits it.
  const priced = (await (await page.request.get("/api/northside/extras")).json()).extras[0];
  expect(priced.state).toBe("logged"); expect(priced.requestId).toBeNull();
  await switchTo(page, "supervisor"); await page.goto("/approvals/extras"); await button(page, "Submit for approval").click();
  await expect(button(page, "Approve as supervisor")).toBeVisible();
  const extras = async () => (await (await page.request.get("/api/northside/extras")).json()).extras as Extra[];
  const old = (await extras())[0]!;
  expect((await (await page.request.get("/api/northside/extras")).json()).queue.find((q: { request_id: string }) => q.request_id === old.requestId).overdue).toBe(false);
  // Owner-only fictional clock fixture; the real read route and screen must expose the mandatory notice.
  const timerDb = new Pool({ host: "127.0.0.1", port: 55432, user: "postgres", password: "sbox-e2e-owner", database: "jobguard_synthetic_demo", max: 1 });
  try {
    await timerDb.query("BEGIN");
    await timerDb.query("ALTER TABLE app.extra_approval_request DISABLE TRIGGER immutable");
    await timerDb.query("UPDATE app.extra_approval_request SET server_recorded_at=clock_timestamp()-interval '7 days' WHERE id=$1", [old.requestId]);
    await timerDb.query("ALTER TABLE app.extra_approval_request ENABLE TRIGGER immutable");
    await timerDb.query("COMMIT");
  } catch (error) { await timerDb.query("ROLLBACK"); throw error; } finally { await timerDb.end(); }
  await page.reload();
  // Duplicate candidates load independently and may expose another status at the same time.
  await expect(page.locator("main").getByRole("status").filter({ hasText: "Mandatory approval overdue" })).toContainText("Mandatory approval overdue");

  const stalePage = await page.context().newPage(); await stalePage.goto("/approvals/extras"); await expect(button(stalePage, "Approve as supervisor")).toBeVisible();
  expect(await button(page, "Reject this extra").isDisabled()).toBe(true);
  await page.getByLabel("Reason for rejection").selectOption("not_agreed"); await controls(page);
  // Capture the UI's command ID so the replay exercises the actual route and DB receipt.
  const rejectedRequest = page.waitForRequest(r => r.url().endsWith("/reject") && r.method() === "POST");
  await button(page, "Reject this extra").click();
  const rejectedBody = (await rejectedRequest).postDataJSON();
  await expect(page.getByTestId("extra-state")).toHaveText("Not approved");
  await expect(page.locator("main").getByRole("status").filter({ hasText: "Extra rejected." })).toHaveText("Extra rejected.");
  const retry = await post(page, old, "reject", rejectedBody); expect(retry.status()).toBe(200);
  const conflict = await post(page, old, "reject", { ...rejectedBody, reasonCode: "other_reason" }); expect((await conflict.json()).code).toBe("COMMAND_CONFLICT");
  expect((await post(page, old, "approve", bound(old))).ok()).toBe(false);
  await switchTo(page, "surveyor"); await page.goto("/approvals/extras");
  expect((await post(page, old, "withdraw", { reasonCode: "not_done" })).ok()).toBe(false); // rejected is already final, even for a covered surveyor
  await expect(page.getByLabel("Revised quantity measured")).toBeVisible({ timeout: 60_000 });
  await page.getByLabel("Revised quantity measured").fill("2"); await controls(page);
  const revisedRequest = page.waitForRequest(r => r.url().endsWith("/revise") && r.method() === "POST");
  await button(page, "Revise this extra").click();
  const revisedBody = (await revisedRequest).postDataJSON();
  await expect(page.locator("main").getByRole("status").filter({ hasText: "Price revised. A new approval request was created." })).toHaveText("Price revised. A new approval request was created.");
  let revised = (await extras())[0]!; expect(revised.requestId).not.toBe(old.requestId);
  const revisionReplay = await post(page, old, "revise", revisedBody); expect(revisionReplay.status()).toBe(200);
  expect((await revisionReplay.json()).result.requestId).toBe(revised.requestId);
  expect((await (await post(page, old, "revise", { ...revisedBody, quantity: 4 })).json()).code).toBe("COMMAND_CONFLICT");
  await switchTo(page, "supervisor");
  await button(stalePage, "Approve as supervisor").click();
  await expect(stalePage.locator("main").getByRole("alert")).toContainText("STALE_REVISION"); await stalePage.close();
  // Q04: a fresh command ID for the same person/step returns the first answer.
  const firstApproval = await post(page, revised, "approve", bound(revised)); expect(firstApproval.ok()).toBe(true);
  const firstAnswer = await firstApproval.json();
  expect(await (await post(page, revised, "approve", bound(revised))).json()).toEqual(firstAnswer);
  expect((await post(page, revised, "approve", { ...bound(revised), netPence: revised.netPence + 1 })).ok()).toBe(false);
  for (const field of ["actorMembershipId", "tenantId", "serverTime"]) {
    expect((await post(page, revised, "approve", { ...bound(revised), [field]: command() })).status()).toBe(422);
  }
  await switchTo(page, "surveyor");
  const next = await post(page, revised, "revise", { sorCode: "CLEAR-VOID", quantity: 2 }); expect(next.ok()).toBe(true);
  revised = (await extras())[0]!;
  await switchTo(page, "supervisor"); // same person may fill the same slot across request revisions
  // Both commands use the real action route. The small price has one company step and no client step.
  let withdrawalBody = { commandId: command(), reasonCode: "not_done" };
  const racing = await Promise.all([post(page, revised, "approve", bound(revised)), post(page, revised, "withdraw", withdrawalBody)]);
  expect(racing.filter(r => r.ok())).toHaveLength(1);
  const final = (await extras())[0]!; expect(["approved", "withdrawn"]).toContain(final.state);
  const db = new Pool({ host: "127.0.0.1", port: 55432, user: "postgres", password: "sbox-e2e-owner", database: "jobguard_synthetic_demo", max: 1 });
  try {
    const outcomes = (await db.query("SELECT kind FROM app.extra_approval_outcome WHERE request_id=$1", [revised.requestId])).rows;
    expect(outcomes).toEqual([{ kind: final.state }]);
    const facts = (await db.query("SELECT step_index FROM app.extra_approval_step_fact WHERE request_id=$1", [revised.requestId])).rows;
    expect(facts).toHaveLength(final.state === "approved" ? 1 : 0);
  } finally { await db.end(); }
  if (final.state === "approved") {
    await switchTo(page, "surveyor"); await page.goto("/approvals/extras");
    await page.getByLabel("Revised quantity measured").fill("3"); await button(page, "Revise this extra").click();
    await expect(page.locator("main").getByRole("status").filter({ hasText: "Price revised" })).toContainText("Price revised"); await switchTo(page, "supervisor");
  }
  await page.goto("/approvals/extras");
  if ((await extras())[0]!.state !== "withdrawn") {
    expect(await button(page, "Withdraw this extra").isDisabled()).toBe(true);
    await page.getByLabel("Reason for withdrawal").selectOption("not_done"); await controls(page);
    const withdrawalRequest = page.waitForRequest(r => r.url().endsWith("/withdraw") && r.method() === "POST");
    await button(page, "Withdraw this extra").click();
    withdrawalBody = (await withdrawalRequest).postDataJSON();
    await expect(page.getByTestId("extra-state")).toHaveText("Withdrawn");
  }
  expect((await post(page, old, "withdraw", withdrawalBody)).status()).toBe(200);
  expect((await (await post(page, old, "withdraw", { ...withdrawalBody, reasonCode: "raised_in_error" })).json()).code).toBe("COMMAND_CONFLICT");
  expect((await post(page, old, "approve", bound(old))).ok()).toBe(false);
  const otherContext = await browser.newContext({ baseURL: origin });
  try {
    const otherPage = await otherContext.newPage();
    await installContractorAgreementFixture(otherPage);
    await otherPage.goto("/admin/contractor");
    await button(otherPage, "Start generated contractor practice").click();
    await expect(otherPage.getByTestId("contractor-revision")).toHaveText("0");
    const mine = await (await page.request.get("/api/contractor")).json();
    const theirs = await (await otherPage.request.get("/api/contractor")).json();
    expect(theirs.tenantId).not.toBe(mine.tenantId);
    for (const action of ["reject", "withdraw", "revise"]) {
      const body = action === "reject" ? { ...bound(old), reasonCode: "not_agreed" } : action === "withdraw" ? { reasonCode: "not_done" } : { sorCode: "CLEAR-VOID", quantity: 2 };
      expect((await post(otherPage, old, action, body)).ok()).toBe(false);
    }
    expect((await (await otherPage.request.get("/api/northside/extras")).json()).extras).toEqual([]);
  } finally { await otherContext.close(); }
  // Unknown job/extra identities cannot reach another tenant or an uncovered job.
  expect((await post(page, { ...old, jobId: command() }, "withdraw", { reasonCode: "not_done" })).ok()).toBe(false);
  expect((await post(page, { ...old, extraId: command() }, "withdraw", { reasonCode: "not_done" })).ok()).toBe(false);
  // Revoking the member refuses a terminal receipt replay through the real route.
  const actorCookies = (await page.context().cookies()).filter(cookie => cookie.name === "jg_session");
  const ownerDb = new Pool({ host: "127.0.0.1", port: 55432, user: "postgres", password: "sbox-e2e-owner", database: "jobguard_synthetic_demo", max: 1 });
  let membershipId: string;
  try {
    membershipId = (await ownerDb.query("SELECT actor_membership_id FROM app.command_receipt WHERE command_id=$1", [withdrawalBody.commandId])).rows[0].actor_membership_id;
  } finally { await ownerDb.end(); }
  await switchTo(page, "owner");
  const principal = await (await page.request.get("/api/contractor")).json();
  const revoke = await page.request.post("/api/contractor", { headers: { origin }, data: {
    version: "contractor-command.v1", environment: "synthetic_demo", commandId: command(), id: command(),
    expectedRevision: principal.revision, kind: "membership.revoke", membershipId,
  } });
  expect(revoke.ok()).toBe(true);
  await page.context().addCookies(actorCookies);
  expect((await post(page, old, "withdraw", withdrawalBody)).ok()).toBe(false);

});

// Rendering/transport fixture complements the real-PostgreSQL journey above, and always
// exercises the withdrawal button regardless of which action wins that journey's race.
test("withdrawal requires a reason and displays the server refusal and outcome", async ({ page }) => {
  const extra = { extraId: "00000000-0000-4000-8000-000000000003", jobId: "00000000-0000-4000-8000-000000000004", orderReference: "FICTIONAL-1", description: "Made-up correction", note: "Synthetic fixture", state: "logged", hasPhoto: false, residentConfirmed: false, quotedPence: null, netPence: null, requestId: null, revisionHash: null, steps: [], nextStepIndex: null, nextStepRole: null, clientRequired: false, linkIssued: false, linkClosed: null, outcome: null };
  let withdrawn = false, refuse = true;
  await page.route("**/api/northside", route => route.fulfill({ status: 503, json: { code: "FIXTURE_NO_PRACTICE" } }));
  await page.route("**/api/contractor/practice/acting-as", route => route.fulfill({ status: 503, json: {} }));
  await page.route("**/api/contractor/jobs/*/duplicate-candidates", route => route.fulfill({ json: { version: "extra-duplicate-candidates.v1", jobId: extra.jobId, revision: 0, groups: [], activeLinks: [] } }));
  await page.route("**/api/northside/extras", route => route.fulfill({ json: { role: "supervisor", extras: [{ ...extra, state: withdrawn ? "withdrawn" : "logged" }], rates: {}, queue: [] } }));
  await page.route(`**/api/northside/extras/${extra.extraId}/withdraw`, route => {
    const body = route.request().postDataJSON();
    expect(Object.keys(body).sort()).toEqual(["commandId", "jobId", "reasonCode", "version"]);
    expect(body.reasonCode).toBe("raised_in_error");
    if (refuse) return route.fulfill({ status: 403, json: { code: "PERMISSION_DENIED" } });
    withdrawn = true; return route.fulfill({ json: { result: { state: "withdrawn" } } });
  });
  await page.goto("/approvals/extras");
  await expect(button(page, "Withdraw this extra")).toBeDisabled();
  await page.getByLabel("Reason for withdrawal").selectOption("raised_in_error"); await controls(page);
  await button(page, "Withdraw this extra").click();
  await expect(page.locator("main").getByRole("alert")).toContainText("PERMISSION_DENIED");
  refuse = false; await button(page, "Withdraw this extra").click();
  await expect(page.locator("main").getByRole("status").filter({ hasText: "Extra withdrawn." })).toHaveText("Extra withdrawn.");
  await expect(page.getByTestId("extra-state")).toHaveText("Withdrawn");
  await expect(button(page, "Withdraw this extra")).toHaveCount(0);
});
