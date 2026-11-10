import { test, expect } from "@playwright/test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Pool } from "pg";
import { E2E_ADMIN_DATABASE_URL, E2E_RUNTIME_URL, E2E_AUTH_CODE_SECRET } from "./global-setup";
const nativeImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<typeof import("@jobguard/db")>;
const loadDb = () => nativeImport(pathToFileURL(join(process.cwd(), "../../packages/db/dist/index.js")).href);

// Existing source-fixture helpers run in Node's ESM graph, outside Playwright's
// source loader. Invoices are issued by the repository, never by a seed route.
async function seed() {
  const apiRequire = createRequire(join(process.cwd(), "../api/package.json"));
  const root = join(process.cwd(), "../..");
  const script = `
    import { Pool } from 'pg';
    import { randomUUID, createHmac } from 'node:crypto';
    const { meterCompany } = await import(${JSON.stringify(pathToFileURL(join(root, "packages/db/test/meter-persistence-fixtures.ts")).href)});
    const { prepareWorkAccount, workTenant } = await import(${JSON.stringify(pathToFileURL(join(root, "packages/db/test/job-work-state-fixtures.ts")).href)});
    const { prepareInvoicePrerequisites } = await import(${JSON.stringify(pathToFileURL(join(root, "packages/db/test/sv5pre-fixtures.ts")).href)});
    const { PracticeInvoiceRepository } = await import(${JSON.stringify(pathToFileURL(join(root, "packages/db/src/practice-invoice-repository.ts")).href)});
    const f = { admin: new Pool({connectionString:process.env.E2E_ADMIN_DATABASE_URL,max:1}), runtime:new Pool({connectionString:process.env.E2E_RUNTIME_URL,max:1}) };
    try {
      const a = await meterCompany(f), token=randomUUID();
      const digest=createHmac('sha256',process.env.AUTH_CODE_SECRET).update('session:'+token).digest('hex');
      await f.admin.query('UPDATE identity.session SET token_digest=$1 WHERE id=$2',[digest,a.sessionId]);
      const output=[];
      for(const includesApprovedVariation of [false,true]) {
        const b=includesApprovedVariation ? await (await import(${JSON.stringify(pathToFileURL(join(root, "packages/db/test/job-work-state-fixtures.ts")).href)})).seedWorkJob(f,a.tenantId) : a;
        const account=await prepareWorkAccount(f,b);
        // Explicit synthetic approved variation line in the stored final account.
        // Start a new immutable revision; never edit an earlier commercial row.
        let revision=account.revisionId;
        if(includesApprovedVariation) {
          // Keep the priced revision and approval parents with all guards enabled.
          const variation=randomUUID(), scope=randomUUID(), priced=randomUUID(), approval=randomUUID(), hash='c'.repeat(64);
          await workTenant(f.admin,a.tenantId,async db=>{
            await db.query("INSERT INTO app.scope_identity(tenant_id,job_id,id,state) VALUES($1,$2,$3,'reserved')",[a.tenantId,b.jobId,scope]);
            await db.query("INSERT INTO app.variation(tenant_id,job_id,id,scope_item_id,capture_kind,capture_text,description,job_track,origin) VALUES($1,$2,$3,$4,'text','Fictional approved variation','Fictional approved variation','small_builder','builder_logged')",[a.tenantId,b.jobId,variation,scope]);
            await db.query("INSERT INTO app.variation_revision(tenant_id,job_id,id,variation_id,scope_item_id,revision,description,quantity_decimal,unit,unit_rate_pence,signed_delta_pence,content_hash,confirmed_by_membership_id,rate_provenance_kind,rate_source_ref,rate_source_hash,rate_version) VALUES($1,$2,$3,$4,$5,1,'Fictional approved variation','1','item',500,500,$6,$7,'human_entered','synthetic://fixture',$6,'fixture-v1')",[a.tenantId,b.jobId,priced,variation,scope,hash,b.actorId]);
            await db.query("UPDATE app.variation SET current_revision_id=$3,state='priced' WHERE tenant_id=$1 AND id=$2",[a.tenantId,variation,priced]);
          });
          const { VariationRepository, approvePricedVariation } = await import(${JSON.stringify(pathToFileURL(join(root, "packages/db/src/variation-repository.ts")).href)});
          await new VariationRepository(f.runtime).transact(b.context,db=>approvePricedVariation(db,a.tenantId,variation,{id:approval,revisionId:priced,revision:1,contentHash:hash,signedDeltaPence:500,method:'builder_attestation',actorMembershipId:b.actorId,evidenceId:null,approvedAt:new Date().toISOString()}));
          revision=randomUUID();
          // Match product assembly: link the predecessor and advance through the guarded routine.
          await workTenant(f.admin,a.tenantId,async db=>{
            await db.query("INSERT INTO app.final_account_revision(id,tenant_id,job_id,final_account_draft_id,revision,previous_revision_id,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings) VALUES($1,$2,$3,$4,2,$7,$5,$6,'GBP','candidate_m1_standard_v1',1000,200,1200,false,'[]')",[revision,a.tenantId,b.jobId,account.draftId,'b'.repeat(64),account.baselineId,account.revisionId]);
            for(const [kind,net,ordinal] of [['baseline',500,1],['variation',500,2]]) await db.query("INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,approval_id,description,net_pence,ordinal) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",[randomUUID(),a.tenantId,b.jobId,revision,kind,kind==='baseline'?account.baselineId:priced,kind==='baseline'?b.scopeId:scope,kind==='baseline'?account.baselineId:priced,kind==='baseline'?null:approval,kind==='baseline'?'Fictional baseline':'Fictional approved variation',net,ordinal]);
            await db.query('SELECT app.advance_final_account_draft($1,$2,$3,$4)',[a.tenantId,account.draftId,revision,2]);
          });
        }
        await prepareInvoicePrerequisites(f.admin,f.runtime,a.tenantId,b.jobId,b.actorId,revision);
        const invoice=await new PracticeInvoiceRepository(f.runtime).issue(b.context,{jobId:b.jobId,finalAccountRevisionId:revision,actorMembershipId:b.actorId,commandId:randomUUID(),recipient:'fictional@example.invalid',issuedOn:'2026-11-04'});
        output.push({jobId:b.jobId,invoiceId:invoice.id,includesApprovedVariation});
      }
      process.stdout.write(JSON.stringify({token,tenantId:a.tenantId,actorId:a.actorId,digest,rows:output}));
    } finally {await Promise.all([f.admin.end(),f.runtime.end()]);}
  `;
  const result = await promisify(execFile)(process.execPath, ["--import", pathToFileURL(apiRequire.resolve("tsx")).href, "--input-type=module", "--eval", script], {
    cwd: join(process.cwd(), "../api"), timeout: 180000,
    env: { ...process.env, JOBGUARD_ENV: "synthetic_demo", E2E_ADMIN_DATABASE_URL, E2E_RUNTIME_URL, AUTH_CODE_SECRET: E2E_AUTH_CODE_SECRET },
  });
  return JSON.parse(result.stdout) as { token: string; tenantId: string; actorId: string; digest: string; rows: { jobId: string; invoiceId: string; includesApprovedVariation: boolean }[] };
}

test("stored approved variation and ordinary invoice screens agree; retries persist and receipt reload changes balance", async ({ page, context, baseURL }) => {
  test.setTimeout(240000);
  const a = await seed(), db = await loadDb();
  const runtime = new Pool({ connectionString: E2E_RUNTIME_URL, max: 1 });
  try {
    await context.addCookies([{ name: "jobguard_session", value: a.token, url: baseURL! }]);
    let withoutApprovedVariation = "";
    for (const row of a.rows) {
      await page.goto(`/jobs/${row.jobId}/invoices/${row.invoiceId}/pay-now-preview`);
      const options = page.getByRole("region", { name: "Synthetic invoice payment options" });
      await expect(options).toContainText("GBP 12.00");
      const text = await options.innerText();
      if (!row.includesApprovedVariation) withoutApprovedVariation = text; else expect(text).toBe(withoutApprovedVariation);
      await expect(page.getByText("Practice preview only. The customer does not see this page. No money moves.")).toBeVisible();
      for (const button of await page.getByRole("button").all()) {
        const box = await button.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44); expect(box!.width).toBeGreaterThanOrEqual(44);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    const row = a.rows[1]!, url = `/api/jobs/${row.jobId}/invoices/${row.invoiceId}/pay-now-preview`;
    let first: unknown;
    await page.route(`**${url}`, async route => {
      if (route.request().method() !== "POST") return route.continue();
      first = route.request().postDataJSON();
      await route.fetch(); // Server commits, browser loses the answer.
      await route.abort();
    });
    await page.getByRole("button", { name: "Simulate card payment", exact: true }).click();
    await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
    await page.unroute(`**${url}`);
    await page.reload();
    const retried = page.waitForRequest(request => request.method() === "POST" && request.url().endsWith(url));
    await page.getByRole("button", { name: "Retry same practice attempt" }).click();
    expect((await retried).postDataJSON()).toEqual(first);
    await expect(page.getByRole("status").filter({ hasText: "Fake settlement" })).toContainText(`fake-builder-${a.tenantId}`);
    const verified = db.verifiedTenantContextFromMembership({ tenantId: a.tenantId, membershipId: a.actorId, identityUserId: a.actorId } as Parameters<typeof db.verifiedTenantContextFromMembership>[0]);
    expect((await new db.PayNowAttemptRepository(runtime).read(verified, row.jobId, row.invoiceId)).attempts).toHaveLength(1);
    await new db.PracticeInvoiceRepository(runtime).recordReceipt(verified, { jobId: row.jobId, invoiceId: row.invoiceId, actorMembershipId: a.actorId, commandId: crypto.randomUUID(), paidOn: "2026-11-04", amountPence: 200, method: "bank_transfer", reference: "Fictional receipt" });
    await page.getByRole("button", { name: "Reload stored invoice" }).click();
    await expect(page.getByRole("region", { name: "Synthetic invoice payment options" })).toContainText("Amount due GBP 10.00");
  } finally { await runtime.end(); }
});
