import { test, expect } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import { installContractorAgreementFixture } from "./contractor-agreement-fixture.js";
// Native import keeps the built core/database graph out of Playwright's source loader.
const loadDb = () => (new Function("specifier", "return import(specifier)") as (s: string) => Promise<typeof import("@jobguard/db")>)(pathToFileURL(join(process.cwd(), "../../packages/db/dist/index.js")).href);
const origin = "http://127.0.0.1:3000";
test.setTimeout(240000);
test("stores movement, replay and server evaluation persist one prompt, with accessible phone and desktop controls", async ({ page, context }) => {
  await installContractorAgreementFixture(page);
  await page.goto("/admin/contractor");
  await page.getByRole("button", { name: "Start generated contractor practice", exact: true }).click();
  await expect(page.getByTestId("contractor-revision")).toHaveText("0");
  await page.goto("/contractor/work-orders");
  await page.getByLabel(/Starter orders/).check();
  await page.getByRole("button", { name: "Import selected file", exact: true }).click();
  await expect(page.getByTestId("import-counts")).toContainText("5 created");
  const org = await (await page.request.get("/api/contractor")).json();
  const admin = new Pool({ connectionString: "postgresql://postgres:sbox-e2e-owner@127.0.0.1:55432/jobguard_synthetic_demo", max: 1 });
  const runtime = new Pool({ connectionString: "postgresql://jobguard_runtime:sbox-e2e-runtime@127.0.0.1:55432/jobguard_synthetic_demo", max: 1 });
  try {
    const { EnterpriseLivePromptRepository } = await loadDb();
    const line = (await admin.query("SELECT l.job_id,l.sor_code,l.unit FROM app.work_order_line l JOIN app.work_order_current c ON(c.tenant_id,c.revision_id)=(l.tenant_id,l.revision_id) JOIN app.job j ON(j.tenant_id,j.id)=(l.tenant_id,l.job_id) WHERE l.tenant_id=$1 AND j.status='live' ORDER BY l.job_id,l.position LIMIT 1", [org.tenantId])).rows[0]!;
    const sessions: Record<string, string> = {};
    for (const role of ["finance", "supervisor"]) {
      const current = await (await page.request.get("/api/contractor")).json();
      const invite = await page.request.post("/api/contractor", { headers: { origin }, data: { version: "contractor-command.v1", environment: "synthetic_demo", commandId: randomUUID(), id: randomUUID(), expectedRevision: current.revision, kind: "member.invite", role, email: `fictional.${randomUUID()}@fictional.invalid`, scope: { kind: "tenant", id: org.tenantId }, clientId: null, contractId: null } });
      expect(invite.status()).toBe(200);
      const memberId = (await invite.json()).id;
      const member = (await admin.query("SELECT identity_user_id FROM app.membership WHERE tenant_id=$1 AND id=$2", [org.tenantId, memberId])).rows[0]!;
      const token = randomUUID(); sessions[role] = token;
      await admin.query("INSERT INTO control_plane.contractor_practice_session(session_id,tenant_id,membership_id,identity_user_id,session_digest,created_at,expires_at) VALUES($1,$2,$3,$4,$5,clock_timestamp(),clock_timestamp()+interval '1 day')", [randomUUID(), org.tenantId, memberId, member.identity_user_id, createHash("sha256").update(token).digest("hex")]);
    }
    await context.addCookies([{ name: "jg_session", value: sessions.finance!, url: origin }]);
    await page.goto(`/contractor/jobs/${line.job_id}/materials-issues`);
    for (const [label, value] of [["Stores reference", "Fictional stores"], ["Event reference", "Fictional movement"], ["Work code", line.sor_code], ["Unit", line.unit], ["Quantity", "999999"], ["Date (UTC)", "2026-10-17"]]) await page.getByLabel(label, { exact: true }).fill(value);
    const submitted = page.waitForResponse(r => r.url().endsWith("/possible-extras/materials") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Save materials movement" }).click();
    const saved = await submitted; expect(saved.status()).toBe(201);
    await expect(page.getByRole("status")).toContainText("saved");
    const replay = await page.request.post(saved.url(), { headers: { origin }, data: saved.request().postDataJSON() });
    expect(await replay.json()).toEqual(await saved.json());
    const repo = new EnterpriseLivePromptRepository(runtime);
    const lane = await repo.list(sessions.supervisor!, { version: "live-prompt-list.v1", jobId: line.job_id });
    expect(lane.items).toHaveLength(1); expect(lane.items[0]!.rule).toBe("b");
    await context.addCookies([{ name: "jg_session", value: sessions.supervisor!, url: origin }]);
    await page.getByRole("button", { name: "Check for possible extras" }).click();
    await expect(page.getByRole("status")).toContainText("was raised");
    expect((await repo.list(sessions.supervisor!, { version: "live-prompt-list.v1", jobId: line.job_id })).items).toHaveLength(1);
    // Route-level authority remains decisive even when controls are rendered.
    await page.getByRole("button", { name: "Save materials movement" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("NOT_FOUND");
    await expect(page.getByRole("heading", { name: "Materials movements", level: 1 })).toBeVisible();
    for (const control of await page.locator("main input, main select, main button").all()) {
      const box = await control.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44); expect(box!.width).toBeGreaterThanOrEqual(44);
    }
    // Focused serious accessibility checks for this form: names, native controls, headings and overflow.
    // No downloaded audit script or network-dependent accessibility service.
    const unnamed = await page.locator("main input, main select").evaluateAll(nodes => nodes.filter(node => !(node as HTMLInputElement).labels?.length).map(node => node.id));
    expect(unnamed).toEqual([]);
    const cdp = await context.newCDPSession(page);
    const tree = await cdp.send("Accessibility.getFullAXTree");
    expect(tree.nodes.filter(n => !n.ignored && ["textbox", "combobox", "button"].includes(String(n.role?.value)) && !n.name?.value)).toEqual([]);
    await cdp.detach();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.getByLabel("Stores reference", { exact: true }).focus();
    await page.keyboard.press("Tab"); await expect(page.getByLabel("Event reference", { exact: true })).toBeFocused();
  } finally { await runtime.end(); await admin.end(); }
});
