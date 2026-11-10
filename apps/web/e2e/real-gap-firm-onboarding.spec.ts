import { expect, test, type Page } from "@playwright/test";

async function enterCode(page: Page, email: string) {
  await page.getByLabel("Fictional email address").fill(email);
  await page.getByRole("button", { name: "Request code", exact: true }).click();
  const code = await page.getByTestId("fixture-code").textContent();
  expect(code).toMatch(/^\d{8}$/);
  await page.getByLabel("Eight-digit code").fill(code!);
  await page.getByRole("button", { name: "Verify code", exact: true }).click();
  await expect(page.getByRole("heading", { name: "You're signed in.", exact: true })).toBeVisible();
}

// Same-origin fetch carries the real Secure identity cookie on 127.0.0.1.
async function api(page: Page, path: string, data?: unknown, csrfToken?: string) {
  return page.evaluate(async ({ path, data, csrfToken }) => {
    const response = await fetch(path, {
      method: data === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", ...(csrfToken ? { "x-csrf-token": csrfToken } : {}) },
      body: data === undefined ? null : JSON.stringify(data),
    });
    return { status: response.status, body: await response.json() };
  }, { path, data, csrfToken });
}

test("verified owner names the fictional firm before opening jobs", async ({ page }) => {
  await page.goto("/sign-in");
  await enterCode(page, `onboarding-${crypto.randomUUID()}@practice.invalid`);
  const step = page.getByRole("region", { name: "Name your practice business", exact: true });
  // Before the fix, verification succeeds but this trading-name field never appears.
  await expect(step.getByLabel("Trading name", { exact: true })).toBeVisible();
  await expect(step).toContainText("Use made-up business details only.");
  await expect(step.getByRole("button", { name: "Save firm details", exact: true })).toBeEnabled();
  const identity = await api(page, "/api/auth/session");
  expect(identity.status).toBe(200);
  const details = page.locator("details").filter({ has: page.getByText("Technical details", { exact: true }) });
  await expect(details).not.toHaveAttribute("open");
  await expect(page.getByTestId("identity-id")).toBeHidden();
  await expect(page.getByTestId("identity-tenant")).toBeHidden();

  // Explicitly cover the hand-walk's 390 px phone as well as both configured projects.
  const originalViewport = page.viewportSize()!;
  await page.setViewportSize({ width: 390, height: 844 });
  for (const control of await step.locator("input, button, a").all()) {
    await control.focus();
    await expect(control).toBeFocused();
    const box = await control.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= 390)).toBe(true);
  await step.getByLabel("Trading name", { exact: true }).fill("Fictional Oak Works");
  await step.getByRole("button", { name: "Save firm details", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(step.getByRole("status")).toContainText("Firm details saved.");
  await page.reload();
  await expect(step.getByLabel("Trading name", { exact: true })).toHaveValue("Fictional Oak Works");
  const after = await api(page, "/api/auth/session");
  expect(after.body.memberships).toEqual(identity.body.memberships);
  expect(after.body.principal).toEqual(identity.body.principal);
  await page.goto("/firm-details");
  await expect(page.getByLabel("Trading name", { exact: true })).toHaveValue("Fictional Oak Works");
  await page.goto("/sign-in");
  await expect(step.getByLabel("Trading name", { exact: true })).toHaveValue("Fictional Oak Works");
  await page.getByRole("link", { name: "Open my jobs", exact: true }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
  await page.setViewportSize(originalViewport);
  await page.goto("/sign-in");
  await expect(step.getByRole("button", { name: "Save firm details", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(step).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Request code", exact: true })).toBeVisible();
  expect((await api(page, "/api/auth/session")).status).toBe(401);
  await page.reload();
  await expect(page.getByLabel("Trading name", { exact: true })).toHaveCount(0);
});

test("unsigned, non-owner, ambiguous and lost sessions never retain an actionable owner form", async ({ page, browser }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("button", { name: "Request code", exact: true })).toBeVisible();
  await expect(page.getByLabel("Trading name", { exact: true })).toHaveCount(0);
  expect((await api(page, "/api/firm-profile")).status).toBe(401);
  const otherContext = await browser.newContext();
  const memberContext = await browser.newContext();
  try {
    const other = await otherContext.newPage(), member = await memberContext.newPage();
    const otherEmail = `other-${crypto.randomUUID()}@practice.invalid`;
    const memberEmail = `member-${crypto.randomUUID()}@practice.invalid`;
    await enterCode(page, `owner-${crypto.randomUUID()}@practice.invalid`);
    await other.goto("/sign-in");
    await enterCode(other, otherEmail);
    const owner = await api(page, "/api/auth/session");
    const tenant = owner.body.memberships[0].tenantId;
    const profile = { version: "firm-profile.v1", tradingName: "Fictional Refused Works", addressLines: [], contactEmail: "", contactPhone: "" };
    async function invite(email: string) {
      const response = await api(page, "/api/auth/invitations", {
        version: "identity-invitation.v1", requested_tenant_id: tenant, email, role: "foreman",
      }, owner.body.csrfToken);
      expect(response.status).toBe(200);
      return response.body.id as string;
    }
    await member.goto(`/sign-in?invitationId=${await invite(memberEmail)}`);
    await enterCode(member, memberEmail);
    await expect(member.getByText("Invitation accepted. Your memberships above are current.", { exact: true })).toBeVisible();
    await expect(member.getByLabel("Trading name", { exact: true })).toHaveCount(0);
    expect((await api(member, "/api/firm-profile")).body.canSave).toBe(false);
    expect((await api(member, "/api/firm-profile", profile)).status).toBe(403);

    await other.goto(`/sign-in?invitationId=${await invite(otherEmail)}`);
    await enterCode(other, otherEmail);
    await expect(other.getByText("Invitation accepted. The invited business is now one of this account's memberships above.", { exact: true })).toBeVisible();
    expect((await api(other, "/api/auth/session")).body.memberships).toHaveLength(2);
    await expect(other.getByLabel("Trading name", { exact: true })).toHaveCount(0);
    expect((await api(other, "/api/firm-profile")).status).toBe(403);
    expect((await api(other, "/api/firm-profile", profile)).status).toBe(403);

    // Lose the actual cookie while a loaded, editable owner profile is on screen.
    await page.bringToFront();
    await expect(page.getByRole("button", { name: "Save firm details", exact: true })).toBeEnabled();
    await page.context().clearCookies();
    const refresh = page.waitForResponse(response => response.url().endsWith("/api/auth/session"));
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    expect((await refresh).status()).toBe(401);
    await expect(page.getByLabel("Trading name", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Request code", exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Trading name", { exact: true })).toHaveCount(0);
  } finally {
    await memberContext.close();
    await otherContext.close();
  }
});
