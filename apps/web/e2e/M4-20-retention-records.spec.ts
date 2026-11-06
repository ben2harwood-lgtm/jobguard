import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { E2E_ADMIN_DATABASE_URL, E2E_RUNTIME_URL, E2E_AUTH_CODE_SECRET } from "./global-setup";
const nativeImport = <T>(path: string) => (new Function("specifier", "return import(specifier)") as (s: string) => Promise<T>)(pathToFileURL(join(process.cwd(), path)).href);
// No static import of core/db (including helpers that pull those packages in).
// Everything is fictional and seeded through repositories, never a seed route.
test("M4-20 timer review, session resolution, uncertain retry and reconciled final retention", async ({ page, context }) => {
  const db = await nativeImport<typeof import("@jobguard/db")>("../../packages/db/dist/index.js");
  const auth = await nativeImport<typeof import("@jobguard/api/identity")>("../api/dist/auth/index.js");
  const runtime = new Pool({ connectionString: E2E_RUNTIME_URL, max: 1 });
  const identityPool = new Pool({ connectionString: "postgresql://jobguard_identity:sbox-e2e-identity@127.0.0.1:55432/jobguard_synthetic_demo", max: 1 });
  const admin = new Pool({ connectionString: E2E_ADMIN_DATABASE_URL, max: 1 });
  try {
    const provider = new auth.PersistedAuthProvider(new db.IdentityRepository(identityPool), E2E_AUTH_CODE_SECRET);
    const identity = new auth.IdentityApplication(provider, "http://127.0.0.1:3000");
    const email = `${crypto.randomUUID()}@retention-fictional.invalid`;
    const challenge = await provider.requestCode({ email, purpose: "signup", ip: crypto.randomUUID() });
    const session = await provider.verifyCode(email, "signup", challenge.fixtureCode!);
    const membership = (await identity.session(session.sessionToken)).memberships[0]!;
    const verified = await identity.context({ ...session, tenantHeader: membership.tenantId, origin: identity.allowedOrigin });
    const timerContext = db.verifiedTenantContextForQueuedJob(membership.tenantId);
    const captureId = crypto.randomUUID(), text = "Fictional retention job";
    const provenance = { kind: "extracted" as const, span: { sourceId: captureId, sourceVersion: 1 as const, start: 0, end: text.length } };
    const capture = await new db.CaptureRepository(runtime).persist(verified, { captureId, text, promptVersion: "fictional.v1", schemaVersion: "fictional.v1", model: "fixture-only",
      proposal: { title: { value: text, provenance }, lines: [{ description: { value: text, provenance }, quantity: { value: "1", provenance }, unit: { value: "item", provenance }, unitPricePence: { value: null, provenance: { kind: "defaulted", note: "Unknown price in fictional fixture" } } }], materials: [], questions: [] } });
    const jobId = capture.job_id as string, repo = new db.RetentionRecordRepository(runtime), actor = { sessionDigest: provider.digest(`session:${session.sessionToken}`) };
    const baseline = crypto.randomUUID(), revision = crypto.randomUUID(), scopeId = crypto.randomUUID();
    // Source lineage fixtures, never issue authority or a commercial document.
    await admin.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [scopeId,membership.tenantId,jobId]);
    await admin.query("INSERT INTO app.quote_version(tenant_id,job_id,id,version,content_hash,net_value_pence,status) VALUES($1,$2,$3,1,$4,10000,'accepted')", [membership.tenantId,jobId,baseline,"a".repeat(64)]);
    await admin.query("INSERT INTO app.scope_revision(tenant_id,job_id,id,scope_item_id,revision,description,quantity_decimal,unit,unit_price_pence,total_pence) VALUES($1,$2,$3,$4,1,'Fictional work','1','item',10000,10000)", [membership.tenantId,jobId,revision,scopeId]);
    // Owner-only fictional lifecycle fixture, as in interim-drafts; never a route or issue authority.
    const fixture = await admin.connect();
    try {
      await fixture.query("BEGIN");
      await fixture.query("SET LOCAL session_replication_role=replica");
      await fixture.query("SELECT set_config('app.tenant_id',$1,true)", [membership.tenantId]);
      const lifecycle = (await fixture.query("SELECT revision FROM app.job WHERE tenant_id=$1 AND id=$2", [membership.tenantId,jobId])).rows[0] as { revision: number };
      const move = (expected: number, to: string, reason: string, live = false) => fixture.query(
        "SELECT app.transition_job($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [membership.tenantId,jobId,expected,to,reason,baseline,live?10000:null,live?"reference_fee_policy_v1":null,live?150:null]);
      await move(lifecycle.revision,"quoting","start_quote");
      await move(lifecycle.revision+1,"accepted","accept_quote");
      await move(lifecycle.revision+2,"live","switch_live",true);
      await fixture.query("SET LOCAL session_replication_role=origin");
      await fixture.query("COMMIT");
    } catch (error) { await fixture.query("ROLLBACK"); throw error; } finally { fixture.release(); }
    const append = (record: unknown, commandId = crypto.randomUUID()) => repo.command(verified, actor, { version: "retention-record-command.v1", commandId, jobId, record });
    const read = () => repo.read(verified, actor, jobId);
    const source = { kind: "contract_profile", profileVersion: "fictional.v1", clause: "retention" }, pid = crypto.randomUUID();
    const profile = { version: "retention.profile.v1", revision: 1, previousProfileId: null as string | null, contractProfileVersion: "fictional.v1", fixtureApprovalId: crypto.randomUUID(), taxTreatmentVersion: "fictional.v1",
      retained: { netPence: 10000, taxPence: 2000 }, alreadyBilled: { netPence: 0, taxPence: 0 }, conditions: [
        { id: crypto.randomUUID(), milestone: "completion", description: "Fictional completion", source, dateSource: source, dueDate: "2000-01-01", cumulativeLimit: { netPence: 5000, taxPence: 1000 } },
        { id: crypto.randomUUID(), milestone: "defects", description: "Fictional defects", source, dateSource: source, dueDate: "2001-01-01", cumulativeLimit: { netPence: 10000, taxPence: 2000 } },
      ] };
    await append(profile, pid); await new db.RetentionRecordRepository(runtime).raiseTimerReviews(timerContext);
    const firstReview = (await read()).book.records.find(r => r.version === "retention.review.v1")!;
    await context.addCookies([{ name: "jobguard_session", value: session.sessionToken, url: identity.allowedOrigin }]);
    const path = `/api/jobs/${jobId}/retention-records`;
    await page.goto(`/jobs/${jobId}/retention-records`);
    const main = page.getByRole("main"), review = main.getByRole("region", { name: `Review ${firstReview.id}`, exact: true });
    await expect(review.getByText(/Raised by the timer/)).toBeVisible();
    await expect(review.getByText("Open — awaiting human resolution.")).toBeVisible();
    await expect(review.getByLabel("I confirm the condition is satisfied")).not.toBeChecked();
    await page.reload(); await expect(review.getByText("Open — awaiting human resolution.")).toBeVisible();
    await review.getByLabel("I confirm the condition is satisfied").check();
    await review.getByLabel("Net pence").fill("4000"); await review.getByLabel("Tax pence").fill("800");
    // Let the real route commit, lose the response, then retry the exact envelope.
    const bodies: string[] = []; const transient = [408, 429]; let lose = true;
    await page.route(`**${path}`, async route => {
      if (route.request().method() !== "POST") return route.continue();
      bodies.push(route.request().postData()!);
      const status = transient.shift();
      if (status) return route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ message: "Retry this command." }) });
      if (lose) { lose = false; await route.fetch(); return route.abort("failed"); }
      return route.continue();
    });
    await review.getByRole("button", { name: "Record human resolution" }).click();
    await expect(main.getByRole("button", { name: "Retry same command" })).toBeVisible();
    for (let attempt = 0; attempt < 3; attempt++) {
      await main.getByRole("button", { name: "Retry same command" }).click();
      if (attempt < 2) await expect(main.getByRole("button", { name: "Retry same command" })).toBeEnabled();
    }
    await expect(main.getByText(`Resolution approved by person ${membership.id}; condition satisfied: yes.`)).toBeVisible();
    expect(bodies).toHaveLength(4); expect(new Set(bodies).size).toBe(1);
    expect((await read()).book.records.filter(r => r.version === "retention.resolution.v1")).toHaveLength(1);
    await main.getByRole("button", { name: "Record release approval for this resolution" }).click();
    await expect(main.getByText("Released: net £40.00; tax £8.00", { exact: true })).toBeVisible();
    await main.getByRole("button", { name: "Record release approval for this resolution" }).click();
    await expect(main.getByRole("alert")).toContainText("already used");
    const release = (await read()).book.records.find(r => r.version === "retention.release.v1")!, receiptId = crypto.randomUUID();
    await append({ version: "retention.receipt.v1", releaseId: release.id, grossPence: 4800 }, receiptId);
    await append({ version: "retention.reversal.v1", receiptId, grossPence: 1200 });
    const changedId = crypto.randomUUID();
    await append({ ...profile, revision: 2, previousProfileId: pid, conditions: profile.conditions.map(c => ({ ...c, dueDate: "2002-01-01" })) }, changedId);
    await new db.RetentionRecordRepository(runtime).raiseTimerReviews(timerContext);
    await main.getByRole("button", { name: "Refresh stored records" }).click();
    await expect(main.getByText("Received after reversals: £36.00", { exact: true })).toBeVisible();
    // The old approval now fails as stale and appends nothing.
    const beforeStale = await read();
    await main.getByRole("button", { name: "Record release approval for this resolution" }).click();
    await expect(main.getByRole("alert")).toContainText("profile changed"); expect(await read()).toEqual(beforeStale);
    const finalReview = beforeStale.book.records.findLast(r => r.version === "retention.review.v1")!;
    const finalPanel = main.getByRole("region", { name: `Review ${finalReview.id}`, exact: true });
    await finalPanel.getByLabel("I confirm the condition is satisfied").check();
    await finalPanel.getByLabel("Net pence").fill("6000"); await finalPanel.getByLabel("Tax pence").fill("1200");
    await finalPanel.getByRole("button", { name: "Record human resolution" }).click();
    await expect(finalPanel.getByRole("button", { name: "Record human resolution" })).toHaveCount(0);
    await main.getByRole("button", { name: "Record release approval for this resolution" }).last().click();
    await expect(main.getByText("Remaining retention: net £0.00; tax £0.00", { exact: true })).toBeVisible();
    await expect(main.getByText("Already billed: net £0.00; tax £0.00", { exact: true })).toBeVisible();
    await expect(main.getByText("Fee-eligible recovery: £0.00", { exact: true })).toBeVisible();
    await expect(main.getByText(/Simulation only. No notice or invoice is issued/)).toBeVisible();
    expect((await read()).book.records.filter(r => r.version === "retention.release.v1")).toHaveLength(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    for (const element of await main.locator("button,input,select").all()) {
      const box = await element.boundingBox(); if (box) { expect(box.height).toBeGreaterThanOrEqual(44); expect(box.width).toBeGreaterThanOrEqual(44); }
    }
  } finally { await runtime.end(); await identityPool.end(); await admin.end(); }
});
