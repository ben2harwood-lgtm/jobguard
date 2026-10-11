import { expect, test } from "@playwright/test";
import { Pool } from "pg";
const endpoint = "/api/contractor/audit-exports";
const assurance = () => new Pool({ host: "127.0.0.1", port: 55432, user: "neondb_owner", password: "sbox-e2e-owner", database: "jobguard_synthetic_demo", options: "-c role=jobguard_migration" });
test("signed one-tenant exports persist, download, survive two browsers and refuse untrusted input and downgraded authority", async ({ page, browser }) => {
  await page.goto("/admin/contractor"); await page.getByRole("button", { name: "Start generated contractor practice", exact: true }).click();
  await expect(page.getByTestId("contractor-revision")).toHaveText("0");
  const member = await (await page.request.get("/api/contractor")).json();
  await page.goto("/admin/contractor/audit-exports"); await expect(page.getByRole("status")).toHaveText("Persisted exports loaded");
  await expect(page.getByRole("main").getByText("The signature proves export integrity only", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Create signed audit export", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("AUDIT_EXPORT_CHECKPOINT_REQUIRED"); await expect(page.getByRole("alert")).toBeFocused();
  // Test-only restricted assurance credentials produce and hand off ONE tenant's checkpoint.
  // There is no browser/runtime endpoint that produces or imports trusted checkpoints.
  const admin = assurance();
  try {
    await admin.query(`INSERT INTO audit_control.checkpoint(tenant_id,sequence,event_hash)
      SELECT tenant_id,sequence,event_hash FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence DESC LIMIT 1`, [member.tenantId]);
    await admin.query(`INSERT INTO app.audit_export_checkpoint SELECT tenant_id,sequence,event_hash,recorded_at FROM audit_control.checkpoint WHERE tenant_id=$1`, [member.tenantId]);
    await page.getByRole("button", { name: "Create signed audit export", exact: true }).click();
    await expect(page.getByTestId("audit-export-row")).toHaveCount(1);
    const persisted = await (await page.request.get(endpoint)).json(), first = persisted.exports[0];
    expect(persisted.environment).toBe("synthetic_demo");
    const payload = JSON.parse(Buffer.from(first.file.payloadBase64, "base64").toString("utf8"));
    expect(payload.tenantId).toBe(member.tenantId); expect(payload.entries.at(-1).id).toBe(first.id);
    expect(payload.entries.every((entry: { tenantId: string }) => entry.tenantId === member.tenantId)).toBe(true);
    const download = page.waitForEvent("download"); await page.getByRole("button", { name: `Download export ${first.id}`, exact: true }).click();
    expect((await download).suggestedFilename()).toBe(`audit-export-${first.id}.json`);
    await page.reload(); await expect(page.getByTestId("audit-export-row")).toHaveCount(1); await expect(page.getByText(`Export ${first.id}`, { exact: true })).toBeVisible();
    const shared = await browser.newContext(); await shared.addCookies(await page.context().cookies());
    const second = await shared.newPage(); await second.goto("/admin/contractor/audit-exports"); await expect(second.getByTestId("audit-export-row")).toHaveCount(1);
    expect((await (await second.request.get(endpoint)).json()).exports).toEqual(persisted.exports); await shared.close();
    const otherContext = await browser.newContext(), other = await otherContext.newPage();
    await other.goto("/admin/contractor"); await other.getByRole("button", { name: "Start generated contractor practice", exact: true }).click(); await expect(other.getByTestId("contractor-revision")).toHaveText("0");
    const otherMember = await (await other.request.get("/api/contractor")).json();
    expect(otherMember.tenantId).not.toBe(member.tenantId);
    await other.goto("/admin/contractor/audit-exports"); await expect(other.getByRole("status")).toHaveText("Persisted exports loaded"); await expect(other.getByTestId("audit-export-row")).toHaveCount(0);
    expect((await page.request.get(`${endpoint}?tenantId=${otherMember.tenantId}`)).status()).toBe(400);
    expect((await page.request.post(endpoint, { data: { version: "audit-export-request.v1", commandId: crypto.randomUUID() } })).status()).toBe(403);
    const forged = await page.request.post(endpoint, { headers: { origin: "http://127.0.0.1:3000" }, data: { version: "audit-export-request.v1", commandId: crypto.randomUUID(), tenantId: otherMember.tenantId } }); expect(forged.status()).toBe(400);
    await otherContext.close();
    await expect(page.getByText("Practice sandbox — synthetic data; nothing is sent or charged", { exact: true })).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const button = page.getByRole("button", { name: "Create signed audit export", exact: true }); await page.keyboard.press("Tab"); await button.focus(); await expect(button).toBeFocused();
    expect(await button.evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe("none"); const box = await button.boundingBox(); expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44);
    await page.getByRole("link", { name: "Back to Jobs", exact: true }).click(); await page.goto("/admin/contractor/audit-exports"); await expect(page.getByText(`Export ${first.id}`, { exact: true })).toBeVisible();
    // Append a revocation, never rewrite the grant or audit history. A formerly authorized session cannot list or create.
    const revocation = await admin.connect();
    try {
      await revocation.query("BEGIN"); await revocation.query("SELECT set_config('app.tenant_id',$1,true)", [member.tenantId]);
      await revocation.query(`INSERT INTO app.role_grant_revocation(tenant_id,id,grant_id) SELECT tenant_id,gen_random_uuid(),id FROM app.role_grant WHERE tenant_id=$1 AND membership_id=$2 AND role='owner'`, [member.tenantId, member.membershipId]);
      await revocation.query("COMMIT");
    } catch (error) { await revocation.query("ROLLBACK"); throw error; }
    finally { revocation.release(); }
    await page.reload(); await expect(page.getByRole("alert")).toHaveText("AUDIT_EXPORT_FORBIDDEN"); await expect(page.getByRole("alert")).toBeFocused(); await expect(button).toBeDisabled();
    expect((await page.request.post(endpoint, { headers: { origin: "http://127.0.0.1:3000" }, data: { version: "audit-export-request.v1", commandId: crypto.randomUUID() } })).status()).toBe(403);
    const refusals = (await admin.query("SELECT payload->'references'->>'action' action FROM app.audit_event WHERE tenant_id=$1 AND event_type='audit.export.refused'", [member.tenantId])).rows;
    expect(refusals.some(r => r.action === "list")).toBe(true); expect(refusals.some(r => r.action === "create")).toBe(true);
    await page.screenshot({ path: `test-results/ENT-10b-${test.info().project.name}.png`, fullPage: true });
  } finally { await admin.end(); }
});
