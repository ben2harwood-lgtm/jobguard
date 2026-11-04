import { createHmac, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, test } from "@playwright/test";
// Synthetic owner setup only. No product API or browser response is mocked.
test("stored practice acceptance survives reload with actor and sources", async ({ page, context, baseURL }) => {
  const admin = new Pool({ connectionString: "postgresql://postgres:sbox-e2e-owner@127.0.0.1:55432/jobguard_synthetic_demo", max: 1 });
  const tenant = randomUUID(), user = randomUUID(), member = randomUUID(), account = randomUUID(), job = randomUUID();
  const session = randomUUID(), token = randomUUID(), scope = randomUUID(), revision = randomUUID();
  const digest = createHmac("sha256", process.env.AUTH_CODE_SECRET ?? "sbox-only-identity-hmac-secret-32-bytes").update(`session:${token}`).digest("hex");
  const client = await admin.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenant]);
    await client.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenant]);
    await client.query("INSERT INTO identity.identity_user(id) VALUES($1)", [user]);
    await client.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional rates')", [account,tenant]);
    await client.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [member,tenant,account,user]);
    await client.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2)", [`${user}@rates.invalid`,user]);
    await client.query("INSERT INTO identity.membership_locator(user_id,tenant_id,membership_id) VALUES($1,$2,$3)", [user,tenant,member]);
    await client.query("INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at) VALUES($1,$2,'synthetic_demo',$3,$4,clock_timestamp()+interval '1 hour')", [session,user,digest,randomUUID()]);
    await client.query("INSERT INTO app.job(id,tenant_id,title,status) VALUES($1,$2,'Fictional practice rates','draft')", [job,tenant]);
    await client.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES($1,$2,'small_builder','synthetic_demo','backfilled_synthetic_fixture')", [tenant,job]);
    for (let i = 0; i < 3; i++) {
      const item = i === 0 ? scope : randomUUID(), rev = i === 0 ? revision : randomUUID();
      await client.query("INSERT INTO app.scope_identity(tenant_id,job_id,id,state) VALUES($1,$2,$3,'confirmed')", [tenant,job,item]);
      await client.query(`INSERT INTO app.scope_revision(tenant_id,job_id,scope_item_id,id,revision,description,quantity_decimal,unit,unit_price_pence,total_pence)
        VALUES($1,$2,$3,$4,1,'Fictional paint','1','each',100,100)`, [tenant,job,item,rev]);
      await client.query(`INSERT INTO app.rate_book_observation(tenant_id,job_id,scope_item_id,id,source_scope_revision_id,unit,rate_principal_pence,currency,tax_basis,category,region,effective_at,provenance)
        VALUES($1,$2,$3,$4,$5,'each',100,'GBP','standard_rate_20','paint','london','2026-10-30','entered')`, [tenant,job,item,randomUUID(),rev]);
    }
    await client.query("COMMIT");
    await context.addCookies([{ name: "jobguard_session", value: token, url: baseURL! }]);
    const query = new URLSearchParams({ version: "rate-query.v1", asOf: "2026-11-01T00:00:00.000Z", unit: "each", taxBasis: "standard_rate_20", category: "paint", region: "london" });
    await page.goto(`/jobs/${job}/rate-suggestions?${query}`);
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { name: "Suggested rate: 100 GBP pence" })).toBeVisible();
    await main.getByLabel("Target scope item ID").fill(scope);
    await main.getByLabel("Current target revision ID").fill(revision);
    // Lose the response after the real server commits: retry must reuse exact intent.
    await page.route(`**/api/jobs/${job}/rate-suggestions`, async route => {
      if (route.request().method() !== "POST") return route.continue();
      await route.fetch(); await route.abort("failed");
    }, { times: 1 });
    await main.getByRole("button", { name: "Accept practice suggestion", exact: true }).click();
    await expect(main.getByRole("alert")).toContainText("uncertain");
    const pending = await page.evaluate(job => sessionStorage.getItem(`practice-rate-acceptance:${job}`), job);
    await page.reload();
    expect(await page.evaluate(job => sessionStorage.getItem(`practice-rate-acceptance:${job}`), job)).toBe(pending);
    await main.getByRole("button", { name: "Retry same practice acceptance", exact: true }).click();
    const stored = main.getByRole("region", { name: "Stored practice acceptances" });
    await expect(stored).toContainText(member); await expect(stored).toContainText(revision);
    await page.reload(); await expect(stored).toContainText(member); await expect(stored).toContainText("Record hash:");
    expect((await admin.query("SELECT count(*)::int n FROM app.rate_suggestion_acceptance WHERE tenant_id=$1", [tenant])).rows[0].n).toBe(1);
    await main.getByLabel("Target scope item ID").fill(scope);
    await main.getByLabel("Current target revision ID").fill(revision);
    await main.getByRole("button", { name: "Accept practice suggestion", exact: true }).click();
    await expect(main.getByRole("alert")).toContainText("already accepted");
    expect((await page.request.get(`/api/jobs/${randomUUID()}/rate-suggestions`)).status()).toBe(404);
  } finally { await client.query("ROLLBACK"); client.release(); await admin.end(); }
});
