import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { E2E_ADMIN_DATABASE_URL, E2E_RUNTIME_URL } from "./global-setup";
import { signInForChooser, releaseChooserSignIns } from "./helpers/chooser-sign-in";
import { ch4Company } from "./helpers/ch4-company-fixture";

// Both configured projects (desktop and mobile-360) exercise real identity,
// practice routes and PostgreSQL. Only fictional membership setup uses admin.
// No successful bank/session responses are mocked and no provider is contacted.
test.afterAll(releaseChooserSignIns);
test("explicit company selection binds fictional consent and pull to the selected company", async ({ page }) => {
  test.setTimeout(180_000);
  const admin = new Pool({ connectionString: E2E_ADMIN_DATABASE_URL, max: 1 });
  const runtime = new Pool({ connectionString: E2E_RUNTIME_URL, max: 1 });
  try {
    await signInForChooser(page);
    const session = () => page.evaluate(async () => (await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" })).json());
    const original = await session();
    const companyA = original.memberships[0].tenantId as string;
    const second = await ch4Company(runtime), tenantB = second.tenantId;
    expect(companyA).not.toBe(tenantB);
    // Reuse the real fictional-company fixture. Membership-only setup follows
    // linkIssuer's app.membership + identity.membership_locator contract, using
    // a fresh company so another journey's bank observations cannot collide.
    const membershipId = crypto.randomUUID();
    const db = await admin.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT set_config('app.tenant_id',$1,true)", [tenantB]);
      await db.query(`INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role)
        SELECT $1,tenant_id,account_id,$2,'owner' FROM app.membership WHERE tenant_id=$3 AND id=$4`,
      [membershipId, original.principal.id, tenantB, second.actorId]);
      await db.query("INSERT INTO identity.membership_locator(user_id,tenant_id,membership_id) VALUES($1,$2,$3)",
        [original.principal.id, tenantB, membershipId]);
      await db.query("COMMIT");
    } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
    const authorized = await session();
    expect(authorized.memberships).toHaveLength(2);
    expect(authorized.memberships[0].tenantId).toBe(companyA);
    const companyB = authorized.memberships.find((m: { tenantId: string }) => m.tenantId === tenantB);
    expect(companyB).toBeDefined();
    const requests: { tenant: string | undefined; method: string; body: any }[] = [];
    page.on("request", request => {
      if (new URL(request.url()).pathname === "/api/practice-bank") requests.push({
        tenant: request.headers()["x-tenant-id"], method: request.method(),
        body: request.method() === "POST" ? request.postDataJSON() : null,
      });
    });
    await page.goto("/practice-bank");
    const main = page.getByRole("main");
    await expect(main.getByRole("combobox", { name: "Company" })).toHaveValue("");
    await expect(main.getByText("Choose a company to practise.", { exact: true })).toBeVisible();
    expect(requests).toEqual([]);
    await main.getByRole("combobox", { name: "Company" }).selectOption(tenantB);
    await expect(main.getByText(`Practice bank for ${companyB.name ?? tenantB}`, { exact: true })).toBeVisible();
    await main.getByRole("button", { name: /^(Connect|Reconnect) fictional account$/ }).click();
    await expect(main.getByRole("region", { name: "Practice consent" })).toBeVisible();
    await main.getByRole("button", { name: "Approve practice consent" }).click();
    await expect(main.getByText("Fictional account linked for practice", { exact: true })).toBeVisible();
    await main.getByRole("button", { name: "Pull fictional movements" }).click();
    for (const status of ["pending", "settled", "reversed"]) {
      await expect(main.getByRole("region", { name: `${status} movements` }).getByRole("listitem")).toHaveCount(1);
    }
    expect(requests.every(request => request.tenant === tenantB)).toBe(true);
    expect(requests.filter(request => request.method === "POST").map(request => request.body.operation))
      .toEqual(["start", "approve-fake-consent", "pull"]);
    const connection = requests.find(request => request.body?.operation === "pull")!.body.connectionId;
    const saved = await admin.query("SELECT DISTINCT status FROM app.ais_observation WHERE tenant_id=$1 AND connection_id=$2 ORDER BY status", [tenantB, connection]);
    expect(saved.rows.map(row => row.status)).toEqual(["pending", "reversed", "settled"]);
    expect((await admin.query("SELECT id FROM app.ais_connection WHERE tenant_id=$1 AND id=$2", [companyA, connection])).rowCount).toBe(0);
    await main.getByRole("button", { name: "Revoke practice consent" }).click();
    await expect(main.getByText("Practice consent revoked. Connect again for fresh consent.", { exact: true })).toBeVisible();
    await main.getByRole("button", { name: "Unlink fictional account" }).click();
    await expect(main.getByText("Fictional account unlinked. Connect again for fresh consent.", { exact: true })).toBeVisible();
    await page.reload();
    await expect(main.getByText("Choose a company to practise.", { exact: true })).toBeVisible();
    await expect(main.getByRole("region", { name: "settled movements" })).toHaveCount(0);
    await main.getByRole("combobox", { name: "Company" }).selectOption(companyA);
    await expect(main.getByText("No fictional account linked", { exact: true })).toBeVisible();
    expect(requests.at(-1)).toMatchObject({ tenant: companyA, method: "GET" });
    await expect(main).toContainText("Fictional account only. No real bank is connected.");
    await expect(main).toContainText("A bank line does not mark a case landed and does not start a fee.");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await runtime.end(); await admin.end(); }
});
