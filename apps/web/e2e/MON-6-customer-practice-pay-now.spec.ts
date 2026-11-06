import { test, expect } from "@playwright/test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Pool } from "pg";
import { E2E_ADMIN_DATABASE_URL, E2E_RUNTIME_URL, E2E_AUTH_CODE_SECRET } from "./global-setup";

// Existing source-fixture helpers run in Node's ESM graph, outside Playwright's
// source loader. Invoices are issued by the repository, never by a seed route.
async function seed() {
  const apiRequire = createRequire(join(process.cwd(), "../api/package.json"));
  const root = join(process.cwd(), "../..");
  const script = `
    import { Pool } from 'pg';
    import { randomBytes, randomUUID, createHmac } from 'node:crypto';
    const { meterCompany } = await import(${JSON.stringify(pathToFileURL(join(root, "packages/db/test/meter-persistence-fixtures.ts")).href)});
    const { prepareWorkAccount } = await import(${JSON.stringify(pathToFileURL(join(root, "packages/db/test/job-work-state-fixtures.ts")).href)});
    const { prepareInvoicePrerequisites } = await import(${JSON.stringify(pathToFileURL(join(root, "packages/db/test/sv5pre-fixtures.ts")).href)});
    const { issueApprovedCatchInvoice } = await import(${JSON.stringify(pathToFileURL(join(root, "packages/db/test/customer-practice-pay-now-fixtures.ts")).href)});
    const { PracticeInvoiceRepository } = await import(${JSON.stringify(pathToFileURL(join(root, "packages/db/src/practice-invoice-repository.ts")).href)});
    const f = { admin: new Pool({connectionString:process.env.E2E_ADMIN_DATABASE_URL,max:1}), runtime:new Pool({connectionString:process.env.E2E_RUNTIME_URL,max:1}) };
    try {
      const a = await meterCompany(f), token=randomUUID();
      const digest=createHmac('sha256',process.env.AUTH_CODE_SECRET).update('session:'+token).digest('hex');
      await f.admin.query('UPDATE identity.session SET token_digest=$1 WHERE id=$2',[digest,a.sessionId]);
      const output=[];
      for(const includesCatch of [false,true]) {
        const catchFixture=includesCatch ? await issueApprovedCatchInvoice(f,1000) : null;
        const b=catchFixture?.a ?? a;
        let invoice=catchFixture?.invoice;
        if(!invoice){
          const account=await prepareWorkAccount(f,b);
          await prepareInvoicePrerequisites(f.admin,f.runtime,b.tenantId,b.jobId,b.actorId,account.revisionId);
          invoice=await new PracticeInvoiceRepository(f.runtime).issue(b.context,{jobId:b.jobId,finalAccountRevisionId:account.revisionId,actorMembershipId:b.actorId,commandId:randomUUID(),recipient:'fictional@example.invalid',issuedOn:'2026-11-04'});
        }
        const customer=String((await f.admin.query("SELECT b.customer_id FROM app.job_party_current p JOIN app.job_party_binding b ON(b.tenant_id,b.id)=(p.tenant_id,p.binding_id) WHERE p.tenant_id=$1 AND p.job_id=$2",[b.tenantId,b.jobId])).rows[0].customer_id);
        const customerToken=b.tenantId+'.'+b.jobId+'.'+customer+'.'+'x'.repeat(43);
        const customerDigest=createHmac('sha256',process.env.AUTH_CODE_SECRET).update('customer-session:'+customerToken).digest('hex');
        const builderDigest=includesCatch ? b.digest : digest;
        const link=randomBytes(32).toString('hex');
        await f.admin.query('SELECT identity.customer_portal_issue($1,$2,$3,$4,$5,$6)',[b.tenantId,builderDigest,b.jobId,customer,link,'customer-signin-reference.v1:'+b.tenantId+'/'+b.jobId+'/'+customer+'/'+'a'.repeat(43)]);
        await f.admin.query("SELECT identity.customer_portal_use($1,$2,$3,$4,$5,'redeem')",[b.tenantId,b.jobId,customer,link,customerDigest]);
        output.push({tenantId:b.tenantId,jobId:b.jobId,invoiceId:invoice.id,includesCatch,customerToken});
      }
      process.stdout.write(JSON.stringify({token,tenantId:a.tenantId,actorId:a.actorId,digest,rows:output}));
    } finally {await Promise.all([f.admin.end(),f.runtime.end()]);}
  `;
  const result = await promisify(execFile)(process.execPath, ["--import", pathToFileURL(apiRequire.resolve("tsx")).href, "--input-type=module", "--eval", script], {
    cwd: join(process.cwd(), "../api"), timeout: 180000,
    env: { ...process.env, JOBGUARD_ENV: "synthetic_demo", E2E_ADMIN_DATABASE_URL, E2E_RUNTIME_URL, AUTH_CODE_SECRET: E2E_AUTH_CODE_SECRET },
  });
  return JSON.parse(result.stdout) as { token: string; tenantId: string; actorId: string; digest: string; rows: { tenantId:string; jobId: string; invoiceId: string; includesCatch: boolean; customerToken: string }[] };
}

test("customer practice has equal display-only options, no surcharge and no catch disclosure", async ({ page, context, baseURL }) => {
  test.setTimeout(240000);
  const a=await seed();
  await page.goto("/customer/practice-pay-now");
  await expect(page.getByRole("main").getByRole("status")).toContainText("unavailable");
  const signedOut=await page.request.get("/api/customer-portal/practice-pay-now");
  expect(signedOut.status()).toBe(401);expect(await signedOut.json()).toEqual({code:"CUSTOMER_REFUSED"});
  const admin=new Pool({connectionString:E2E_ADMIN_DATABASE_URL,max:1});
  try {
    const before=(await admin.query("SELECT count(*)::int n FROM app.pay_now_fake_attempt WHERE tenant_id=ANY($1::uuid[])",[a.rows.map(row=>row.tenantId)])).rows[0].n;
    let body="",markup="";
    for(const row of a.rows){
      await context.addCookies([{name:"jobguard_customer",value:row.customerToken,url:baseURL!}]);
      await page.goto("/customer/practice-pay-now");
      const main=page.getByRole("main"),options=main.getByRole("list",{name:"Practice payment options"});
      await expect(main).toContainText("no money moves");
      await expect(main).toContainText("Amount due £12.00");
      await expect(options.getByRole("listitem")).toHaveText(["Bank transfer · £12.00","Card · £12.00","Pay by bank · £12.00"]);
      const items=options.getByRole("listitem");
      const tags=await items.evaluateAll(nodes=>nodes.map(n=>n.outerHTML.replace(/Bank transfer|Card|Pay by bank/g,"OPTION")));
      expect(new Set(tags).size).toBe(1);
      const sizes=await items.evaluateAll(nodes=>nodes.map(n=>({height:n.getBoundingClientRect().height,font:getComputedStyle(n).fontWeight})));
      expect(sizes.every(size=>size.height===sizes[0]!.height&&size.font===sizes[0]!.font)).toBe(true);
      await expect(main.getByRole("button")).toHaveCount(0);await expect(main.getByRole("link")).toHaveCount(0);
      expect(await main.innerText()).not.toMatch(/fee|catch|surcharge/iu);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      const response=await page.request.get("/api/customer-portal/practice-pay-now");
      expect(response.headers()["cache-control"]).toBe("no-store");
      const data=await response.json();data.invoiceNumber="REDACTED";
      if(!row.includesCatch){body=JSON.stringify(data);markup=await options.innerHTML();}
      else {expect(JSON.stringify(data)).toBe(body);expect(await options.innerHTML()).toBe(markup);}
      // A foreign invoice selector never reaches the data reader.
      const refused=await page.request.get(`/api/customer-portal/practice-pay-now?invoiceId=${a.rows.find(x=>x!==row)!.invoiceId}`);
      expect(refused.status()).toBe(401);expect(await refused.json()).toEqual({code:"CUSTOMER_REFUSED"});
    }
    expect((await admin.query("SELECT count(*)::int n FROM app.pay_now_fake_attempt WHERE tenant_id=ANY($1::uuid[])",[a.rows.map(row=>row.tenantId)])).rows[0].n).toBe(before);
    const last=a.rows[1]!;
    await admin.query("UPDATE app.customer_portal_session SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND job_id=$2",[last.tenantId,last.jobId]);
    const revoked=await page.request.get("/api/customer-portal/practice-pay-now");
    expect(revoked.status()).toBe(401);expect(await revoked.json()).toEqual({code:"CUSTOMER_REFUSED"});
    await page.reload();await expect(page.getByRole("main").getByRole("status")).toContainText("unavailable");
  } finally {await admin.end();}
});
