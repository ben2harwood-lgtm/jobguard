import { expect, test } from "@playwright/test";

// Browser transport fixture only. Real grant, revocation, tenant, stale-request and
// escalation authority remain covered by extra-approval-chain.integration.test.ts.
// Both mobile-360 and desktop run this case through the existing project config.
test("waiting extras stay separate, link to their cards and disappear on the next authorized read", async ({ page }) => {
  const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
  let visible = [...ids];
  let authorized = true;
  await page.route("**/api/northside", route => route.fulfill({ contentType: "application/json", body: "{}" }));
  await page.route("**/api/contractor/practice/acting-as", route => route.fulfill({ contentType: "application/json", body: '{"state":"owner"}' }));
  await page.route("**/api/northside/extras", route => route.fulfill({ status: authorized ? 200 : 401, contentType: "application/json", body: JSON.stringify({
    role: "supervisor", rates: {}, localLinks: [],
    queue: visible.map((id, index) => ({ job_id: "same-job", variation_id: id, request_id: `request-${id}`, step_index: 0, net_pence: "987654", escalated: index === 1, overdue: true })),
    extras: ids.map(id => ({ extraId: id, jobId: "same-job", orderReference: "Fictional order", description: `Fictional extra ${id}`, note: "Practice only", state: "awaiting_approval", hasPhoto: false, residentConfirmed: false, quotedPence: 987654, netPence: 987654, requestId: `request-${id}`, revisionHash: "a".repeat(64), steps: [], nextStepIndex: 0, nextStepRole: "supervisor", clientRequired: false, linkIssued: false, linkClosed: null, outcome: null })),
  }) }));
  await page.route("**/api/northside/extras/*/approve", async route => {
    const id = new URL(route.request().url()).pathname.split("/").at(-2)!;
    visible = visible.filter(item => item !== id);
    await route.fulfill({ contentType: "application/json", body: "{}" });
  });
  await page.goto("/approvals/extras");
  const lane = page.getByRole("region", { name: "Must decide", exact: true });
  const links = lane.getByRole("link");
  await expect(links).toHaveCount(2);
  await expect(lane).not.toContainText(/£|987654|GBP/);
  await expect(page.locator("main section").filter({ has: page.getByRole("heading", { name: "Must decide", exact: true }) })).toHaveCount(1);
  expect(await lane.evaluate(element => {
    const card = document.querySelector('[data-testid="extra-card"]');
    return Boolean(card && element.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING);
  })).toBe(true);

  // Focused accessibility audit: named region/heading/links, keyboard access,
  // 44px targets, no horizontal overflow and Chromium's text-contrast audit.
  const cdp = await page.context().newCDPSession(page);
  const contrastIssues: unknown[] = [];
  cdp.on("Audits.issueAdded", event => { if (event.issue.code === "LowTextContrastIssue") contrastIssues.push(event.issue); });
  await cdp.send("Audits.enable");
  await cdp.send("Audits.checkContrast", { reportAAA: false });
  await cdp.send("Runtime.evaluate", { expression: "document.readyState" });
  expect(contrastIssues).toEqual([]);
  await cdp.detach();
  for (const [index, id] of ids.entries()) {
    const link = lane.getByRole("link", { name: `Review extra ${index + 1}`, exact: true });
    await expect(link).toHaveAttribute("href", `#extra-${id}`);
    const box = await link.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(box?.width).toBeGreaterThanOrEqual(44);
    await link.focus();
    await expect(link).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`#extra-${id}$`));
    await expect(page.locator(`#extra-${id}`)).toBeFocused();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.locator(`#extra-${ids[0]}`).getByRole("button", { name: "Approve as supervisor", exact: true }).click();
  await expect(links).toHaveCount(1);
  await expect(lane.locator(`a[href="#extra-${ids[0]}"]`)).toHaveCount(0);
  // Empty queue simulates the next server read for loss of grant or membership;
  // the browser must not reconstruct authority from the still-visible extras.
  visible = [];
  await page.reload();
  await expect(lane.getByText("No extras waiting for your decision.")).toBeVisible();
  await expect(links).toHaveCount(0);
  await expect(page.getByTestId("extra-card")).toHaveCount(2);
  visible = [ids[1]!];
  await page.reload();
  await expect(links).toHaveCount(1);
  authorized = false;
  await page.locator(`#extra-${ids[1]}`).getByRole("button", { name: "Approve as supervisor", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("Sign in to the practice first");
  await expect(links).toHaveCount(0);
});
