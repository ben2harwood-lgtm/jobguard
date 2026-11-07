import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
// Keep the built ESM context identity intact, as in CH-9-mapped.spec.ts.
const nativeImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<unknown>;
const loadDb = async () => await nativeImport(pathToFileURL(join(process.cwd(), "../../packages/db/dist/index.js")).href) as typeof import("@jobguard/db");
const loadIdentity = async () => await nativeImport(pathToFileURL(join(process.cwd(), "../api/dist/auth/index.js")).href) as typeof import("@jobguard/api/identity");
test.use({ headless: true });
test.setTimeout(240000);
test("stored kinds survive reload, uncertain retry is unique, duplicate billing and forged fields refuse", async ({ page, context, baseURL }) => {
  const db = await loadDb(), { IdentityApplication, PersistedAuthProvider } = await loadIdentity();
  const runtime = new Pool({ connectionString: "postgresql://jobguard_runtime:sbox-e2e-runtime@127.0.0.1:55432/jobguard_synthetic_demo", max: 1 });
  const identityPool = new Pool({ connectionString: "postgresql://jobguard_identity:sbox-e2e-identity@127.0.0.1:55432/jobguard_synthetic_demo", max: 1 });
  const admin = new Pool({ connectionString: "postgresql://postgres:sbox-e2e-owner@127.0.0.1:55432/jobguard_synthetic_demo", max: 1 });
  try {
    const provider = new PersistedAuthProvider(new db.IdentityRepository(identityPool), process.env.AUTH_CODE_SECRET ?? "sbox-only-identity-hmac-secret-32-bytes");
    const identity = new IdentityApplication(provider, baseURL!);
    const email = `${randomUUID()}@interim.invalid`;
    const challenge = await provider.requestCode({ email, purpose: "signup", ip: randomUUID() });
    const session = await provider.verifyCode(email, "signup", challenge.fixtureCode!);
    const member = (await identity.session(session.sessionToken)).memberships[0]!;
    const verified = await identity.context({ ...session, requestedTenantId: member.tenantId, origin: baseURL });
    const captureId = randomUUID(), text = "Fictional interim work";
    const provenance = { kind: "extracted" as const, span: { sourceId: captureId, sourceVersion: 1 as const, start: 0, end: text.length } };
    // Seed the job through the repository, never through a route.
    const capture = await new db.CaptureRepository(runtime).persist(verified, { captureId, text,
      promptVersion: "interim.fixture.v1", schemaVersion: "interim.fixture.v1", model: "fixture-only",
      proposal: { title: { value: text, provenance }, lines: [{ description: { value: text, provenance },
        quantity: { value: "1", provenance }, unit: { value: "item", provenance },
        unitPricePence: { value: null, provenance: { kind: "defaulted", note: "Fictional draft" } } }], materials: [], questions: [] } });
    const jobId = capture.job_id as string;
    const scopeId = (await new db.CaptureRepository(runtime).readByJob(verified, jobId))!.lines[0]!.scope_item_id as string;
    const baseline = randomUUID(), revision = randomUUID();
    // Source lineage fixtures, never issue authority or a commercial document.
    await admin.query("INSERT INTO app.quote_version(tenant_id,job_id,id,version,content_hash,net_value_pence,status) VALUES($1,$2,$3,1,$4,10000,'accepted')", [member.tenantId,jobId,baseline,"a".repeat(64)]);
    await admin.query("INSERT INTO app.scope_revision(tenant_id,job_id,id,scope_item_id,revision,description,quantity_decimal,unit,unit_price_pence,total_pence) VALUES($1,$2,$3,$4,1,'Fictional work','1','item',10000,10000)", [member.tenantId,jobId,revision,scopeId]);
    const repository = new db.InterimDraftRepository(runtime), digest = provider.digest(`session:${session.sessionToken}`);
    const schedule = { id: randomUUID(), version: "interim.schedule.v1", revision: 1, previousScheduleId: null,
      baselineSnapshotId: baseline, approvalDecisionId: randomUUID(), valuationDates: ["2026-11-01"],
      jurisdiction: "unsupported", arrangement: "unsupported", d06TemplateVersion: null, d02TaxPolicyVersion: null,
      lines: [{ id: randomUUID(), scopeItemId: scopeId, commercialRevisionId: revision, sourceDocumentId: baseline, kind: "baseline", approvalDecisionId: null, netPence: 10000 }] };
    const values = [{ scopeItemId: scopeId, netPence: 6000 }];
    const application = { id: randomUUID(), version: "interim.application.v1", applicationId: randomUUID(), revision: 1,
      previousRevisionId: null, scheduleId: schedule.id, valuationDate: "2026-11-01", kind: "interim", cumulativeValues: [{ scopeItemId: scopeId, netPence: 8000 }] };
    const certificate = { id: randomUUID(), version: "interim.certification.v1", applicationRevisionId: application.id, certificateReference: randomUUID(), cumulativeValues: values };
    const invoice = { id: randomUUID(), version: "interim.invoice-draft.v1", certificationId: certificate.id, lines: [{ scopeItemId: scopeId, netPence: 4000 }], taxPence: 0 };
    for (const record of [schedule, application, certificate, invoice]) await repository.command(verified, digest, {
      version: "interim.persist-command.v1", commandId: randomUUID(), jobId, record });
    await context.addCookies([{ name: "jobguard_session", value: session.sessionToken, url: baseURL!, httpOnly: true, sameSite: "Strict" }]);
    const endpoint = `/api/jobs/${jobId}/interim-drafts`;
    await page.goto(`/jobs/${jobId}/interim-drafts`);
    const main = page.getByRole("main"), alert = main.getByRole("alert");
    await expect(alert).toHaveText("Stored draft book loaded.");
    for (const [kind,id] of [["Application",application.id],["Certified sum",certificate.id],["Invoice draft",invoice.id]] as const) {
      await expect(main.getByRole("region",{name:kind,exact:true})).toContainText(id!);
    }
    await expect(main.getByRole("button",{name:"Issue — unavailable"})).toBeDisabled();
    await expect(main).toContainText("D06/D02"); await expect(main).toContainText("UNSUPPORTED_ARRANGEMENT");
    await expect(main).toContainText("This contract arrangement or jurisdiction is unsupported. Records remain drafts.");
    const receipt = { id: randomUUID(), version: "interim.synthetic-receipt.v1", invoiceId: invoice.id, amountPence: 2000 };
    await main.getByLabel("Record JSON",{exact:false}).fill(JSON.stringify(receipt));
    let lost = false;
    await page.route(`**${endpoint}`, async route => {
      if (route.request().method() === "POST" && !lost) { lost = true; await route.fetch(); await route.abort("failed"); }
      else await route.continue();
    });
    await main.getByRole("button",{name:"Add record",exact:true}).click();
    await expect(main.getByRole("button",{name:"Retry same record"})).toBeEnabled();
    await page.reload();
    await expect(main.getByRole("button",{name:"Retry same record"})).toBeEnabled();
    await main.getByRole("button",{name:"Retry same record"}).click();
    await expect(alert).toContainText("Record stored");
    await page.reload(); await expect(alert).toHaveText("Stored draft book loaded.");
    await expect(main.getByRole("region",{name:"Synthetic receipt",exact:true}).locator("pre")).toHaveCount(1);
    await expect(main.getByRole("region",{name:"Synthetic receipt",exact:true})).toContainText(receipt.id);
    const saved = await repository.read(verified,jobId,digest); expect(saved.book.records).toHaveLength(5);
    expect(saved.reconciliation.lines[0]).toMatchObject({applied:{pence:8000},certified:{pence:6000},invoiced:{pence:4000}});
    expect(saved.reconciliation.grossReceived.pence).toBe(2000);
    await expect(main.getByRole("region",{name:"Application",exact:true})).toContainText("8000");
    await expect(main.getByRole("region",{name:"Certified sum",exact:true})).toContainText("6000");
    await expect(main.getByRole("region",{name:"Invoice draft",exact:true})).toContainText("4000");
    await expect(main.getByRole("region",{name:"Synthetic receipt",exact:true})).toContainText("2000");
    await main.getByLabel("Record JSON",{exact:false}).fill(JSON.stringify({...invoice,id:randomUUID()}));
    await main.getByRole("button",{name:"Add record",exact:true}).click();
    await expect(alert).toHaveText("The same completed value cannot be invoiced twice");
    expect((await repository.read(verified,jobId,digest)).book.records).toHaveLength(5);
    await main.getByRole("button",{name:"Reload stored book"}).click();
    await expect(alert).toHaveText("Stored draft book loaded.");
    const post = (body: unknown) => page.request.post(endpoint, { headers: { Origin: baseURL!, "x-csrf-token": session.csrfToken }, data: body });
    const replay = { version: "interim.persist-command.v1", commandId: saved.rows.at(-1)!.commandId, jobId, record: receipt };
    expect((await post(replay)).status()).toBe(201);
    const conflict = await post({...replay,record:{...receipt,amountPence:2001}});
    expect(conflict.status()).toBe(409); expect(await conflict.json()).toMatchObject({code:"INTERIM_DRAFT_CONFLICT"});
    for (const forged of [{tenantId:randomUUID()},{actor:digest},{enabled:true}]) expect((await post({...replay,...forged})).status()).toBe(400);
    expect((await repository.read(verified,jobId,digest)).book.records).toHaveLength(5);
    for (const target of await main.locator("button, textarea").all()) {
      const box = await target.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  } finally { await Promise.all([runtime.end(),identityPool.end(),admin.end()]); }
});
