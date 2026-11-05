import { test, expect } from "@playwright/test";
// Browser transport fixture only. PostgreSQL authority, persistence and replay are
// proved separately by ais-practice.integration.test.ts; no live provider calls.
test("fictional consent, distinct movement groups, reload, unlink and reconnect", async ({ page }) => {
  const connectionId = "00000000-0000-4000-8000-000000000002";
  let status: string | null = null, pulled = false;
  await page.route("**/api/auth/session", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({
    csrfToken: "c".repeat(24), memberships: [{ tenantId: "00000000-0000-4000-8000-000000000001" }],
  }) }));
  await page.route("**/api/practice-bank", async route => {
    if (route.request().method() === "POST") {
      const input = route.request().postDataJSON() as { operation: string };
      if (input.operation === "start") status = "awaiting_consent";
      if (input.operation === "approve-fake-consent") status = "linked";
      if (input.operation === "unlink") status = "unlinked";
      if (input.operation === "revoke") status = "revoked";
      if (input.operation === "pull") {
        if (status !== "linked") { await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ code: "AIS_INACTIVE" }) }); return; }
        pulled = true;
      }
    }
    await route.fulfill({ contentType: "application/json", headers: { "Cache-Control": "no-store" }, body: JSON.stringify({
      version: "ais-practice-view.v1", connection: status ? { connectionId, status } : null,
      movements: pulled ? (["pending", "settled", "reversed"] as const).map(state => ({ movementRef: `fake_${state}`, status: state, pence: 32000, currency: "GBP", bookedOn: "2026-10-02" })) : [],
    }) });
  });
  await page.goto("/practice-bank");
  const main = page.getByRole("main");
  await main.getByRole("button", { name: "Connect fictional account", exact: true }).click();
  await expect(main.getByRole("region", { name: "Practice consent" })).toBeVisible();
  await main.getByRole("button", { name: "Approve practice consent" }).click();
  await main.getByRole("button", { name: "Pull fictional movements" }).click();
  for (const group of ["pending", "settled", "reversed"]) await expect(main.getByRole("region", { name: `${group} movements` }).getByRole("listitem")).toHaveCount(1);
  await page.reload();
  await main.getByRole("button", { name: "Pull fictional movements" }).click();
  await expect(main.getByRole("region", { name: "settled movements" }).getByRole("listitem")).toHaveCount(1);
  await main.getByRole("button", { name: "Unlink fictional account" }).click();
  await main.getByRole("button", { name: "Pull fictional movements" }).click();
  await expect(main.getByRole("alert")).toContainText("Consent is inactive or expired");
  await main.getByRole("button", { name: "Reconnect fictional account" }).click();
  await main.getByRole("button", { name: "Approve practice consent" }).click();
  await expect(main.getByText("Fictional account linked for practice", { exact: true })).toBeVisible();
  await main.getByRole("button", { name: "Revoke practice consent" }).click();
  await main.getByRole("button", { name: "Pull fictional movements" }).click();
  await expect(main.getByRole("alert")).toContainText("Consent is inactive or expired");
  await expect(main).toContainText("A bank line does not mark a case landed and does not start a fee.");
  expect(await main.innerText()).not.toMatch(/fake_token_|stateHash|fake_code/u);
});

// Complete journey through real identity, Next routes and PostgreSQL. The first
// test isolates rendering; this one establishes the screen's actual persistence.
test("real company session persists a fictional pull and rejects replay and cross-company consent", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const signIn = async (tab: typeof page) => {
    await tab.goto("/sign-in");
    await tab.getByLabel("Fictional email address").fill(`bank-${crypto.randomUUID()}@practice.invalid`);
    await tab.getByRole("button", { name: "Request code", exact: true }).click();
    await tab.getByLabel("Eight-digit code").fill((await tab.getByTestId("fixture-code").innerText()).trim());
    await tab.getByRole("button", { name: "Verify code", exact: true }).click();
    await expect(tab.getByRole("heading", { name: "Signed in", exact: true })).toBeVisible();
  };
  const bankCall = (tab: typeof page, operation?: string, connectionId?: string) => tab.evaluate(async ({ operation, connectionId }) => {
    const auth = await (await fetch("/api/auth/session", { cache: "no-store" })).json();
    const response = await fetch("/api/practice-bank", { method: operation ? "POST" : "GET", cache: "no-store",
      headers: { "content-type": "application/json", "x-csrf-token": auth.csrfToken, "x-tenant-id": auth.memberships[0].tenantId },
      ...(operation ? { body: JSON.stringify({ version: "ais-practice-command.v1", operation, connectionId }) } : {}),
    });
    return { status: response.status, cache: response.headers.get("cache-control"), body: await response.json() };
  }, { operation, connectionId });
  await signIn(page);
  const responses: string[] = [];
  page.on("response", response => { if (new URL(response.url()).pathname === "/api/practice-bank") void response.text().then(body => responses.push(body)).catch(() => {}); });
  await page.goto("/practice-bank");
  const main = page.getByRole("main");
  await main.getByRole("button", { name: "Connect fictional account", exact: true }).click();
  await main.getByRole("button", { name: "Approve practice consent" }).click();
  await expect(main.getByText("Fictional account linked for practice", { exact: true })).toBeVisible();
  const view = await bankCall(page);
  expect(view.status).toBe(200); expect(view.cache).toBe("no-store");
  const connectionId = view.body.connection.connectionId as string;
  expect((await bankCall(page, "approve-fake-consent", connectionId)).status).toBe(409);
  await main.getByRole("button", { name: "Pull fictional movements" }).click();
  for (const group of ["pending", "settled", "reversed"]) await expect(main.getByRole("region", { name: `${group} movements` }).getByRole("listitem")).toHaveCount(1);
  await page.reload();
  await main.getByRole("button", { name: "Pull fictional movements" }).click();
  await expect(main.getByRole("region", { name: "settled movements" }).getByRole("listitem")).toHaveCount(1);
  const other = await browser.newContext({ baseURL: new URL(page.url()).origin });
  try {
    const tab = await other.newPage(); await signIn(tab);
    expect((await bankCall(tab, "approve-fake-consent", connectionId)).status).toBe(404);
    const foreign = await bankCall(tab); expect(foreign.body.connection).toBeNull(); expect(foreign.body.movements).toEqual([]);
  } finally { await other.close(); }
  await main.getByRole("button", { name: "Unlink fictional account" }).click();
  await main.getByRole("button", { name: "Pull fictional movements" }).click();
  await expect(main.getByRole("alert")).toContainText("Consent is inactive or expired");
  await main.getByRole("button", { name: "Reconnect fictional account" }).click();
  await main.getByRole("button", { name: "Approve practice consent" }).click();
  await main.getByRole("button", { name: "Pull fictional movements" }).click();
  await expect(main.getByRole("region", { name: "settled movements" }).getByRole("listitem")).toHaveCount(1);
  await main.getByRole("button", { name: "Revoke practice consent" }).click();
  await main.getByRole("button", { name: "Pull fictional movements" }).click();
  await expect(main.getByRole("alert")).toContainText("Consent is inactive or expired");
  expect(responses.join("\n")).not.toMatch(/fake_token_|stateHash|"state"\s*:|"code"\s*:\s*"fake_/u);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
