import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";
import { Pool } from "pg";
import { E2E_ADMIN_DATABASE_URL, E2E_AUTH_CODE_SECRET } from "./global-setup";
// Keep the built API/core/db graph outside Playwright's TypeScript loader.
const nativeImport = new Function("specifier", "return import(specifier)") as <T>(specifier: string) => Promise<T>;
const built = (relative: string) => pathToFileURL(join(process.cwd(), relative)).href;
const database = () => nativeImport<typeof import("@jobguard/db")>(built("../../packages/db/dist/index.js"));
test.setTimeout(120000);
let admin: Pool;
test.beforeAll(() => { admin = new Pool({ connectionString: E2E_ADMIN_DATABASE_URL, max: 1 }); });
test.afterAll(() => admin.end());
async function company() {
 const { createIdentityApplication } = await nativeImport<typeof import("../../api/src/auth/identity.application.js")>(built("../api/dist/auth/identity.application.js"));
 const identity = createIdentityApplication({ JOBGUARD_ENV: "synthetic_demo", AUTH_ALLOWED_ORIGIN: "http://127.0.0.1:3000",
  AUTH_CODE_SECRET: E2E_AUTH_CODE_SECRET, IDENTITY_DATABASE_URL: "postgresql://jobguard_identity:sbox-e2e-identity@127.0.0.1:55432/jobguard_synthetic_demo" });
 try {
  const email = `${randomUUID()}@merchant.invalid`;
  const challenge = await identity.provider.requestCode({ email, purpose: "signup", ip: randomUUID() });
  const session = await identity.provider.verifyCode(email, "signup", challenge.fixtureCode!);
  const view = await identity.session(session.sessionToken), member = view.memberships[0]!;
  const context = await identity.context({ ...session, tenantHeader: member.tenantId, origin: identity.allowedOrigin });
  const jobId = randomUUID(), tenantId = member.tenantId;
  const { withTenant } = await database();
  const { seedSyntheticPartyFixture } = await nativeImport<typeof import("../../../packages/db/src/synthetic-party-fixture.js")>(built("../../packages/db/dist/synthetic-party-fixture.js"));
  await withTenant(admin, context, async db => {
   await db.$client.query("INSERT INTO app.job(id,tenant_id,title,status) VALUES($1,$2,'Fictional merchant site','draft')", [jobId,tenantId]);
   await seedSyntheticPartyFixture(db.$client,tenantId,jobId);
   await db.$client.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES($1,$2,'small_builder','synthetic_demo','backfilled_synthetic_fixture')", [tenantId,jobId]);
   await db.$client.query("UPDATE app.job SET status='live' WHERE tenant_id=$1 AND id=$2", [tenantId,jobId]);
  });
  return { tenantId, jobId, context, token: session.sessionToken };
 } finally { await identity.provider.repository.pool.end(); }
}
test("own fictional delivery counts, sparse uncertainty, reload and no writes",async({page,context,baseURL})=>{
 const a=await company(),b=await company(),token=a.token;
 const { withTenant } = await database();
 await context.addCookies([{name:"jobguard_session",value:token,url:baseURL!}]);
 const seed=async()=>withTenant(admin,a.context,async transaction=>{
  const db = transaction.$client;
  // Administrative historical fixture only; no merchant feed or commercial action.
  await db.query("SET LOCAL session_replication_role='replica'");
  const doc=randomUUID();
  await db.query("INSERT INTO app.supplier_document(id,tenant_id,job_id,supplier_context,document_type,content_hash,status) VALUES($1,$2,$3,'Fictional merchant','delivery',$4,'ready')",[doc,a.tenantId,a.jobId,randomUUID().replaceAll('-','').repeat(2)]);
  await db.query("INSERT INTO app.goods_receipt(id,tenant_id,job_id,order_draft_id,document_id,revision,ordered_quantity,delivered_quantity,accepted_quantity,rejected_quantity,missing_quantity,unit) VALUES($1,$2,$3,$4,$5,1,10,8,8,0,2,'each')",[randomUUID(),a.tenantId,a.jobId,randomUUID(),doc]);
 });
 await seed();await seed();
 await page.goto(`/jobs/${a.jobId}/merchant-reliability`);
 await expect(page.getByText("not enough to say — fewer than 3 orders",{exact:true})).toBeVisible();
 await seed();
 const counts=()=>admin.query("SELECT (SELECT count(*) FROM app.goods_receipt) receipts,(SELECT count(*) FROM app.purchase_order_draft) orders,(SELECT count(*) FROM app.material_rate_revision) rates,(SELECT count(*) FROM app.journal) journals,(SELECT count(*) FROM app.supplier_document) documents,(SELECT count(*) FROM app.account) accounts");
 const before=(await counts()).rows;
 await page.reload();
 await expect(page.getByText("Orders received: 3",{exact:true})).toBeVisible();
 await expect(page.getByText("Orders with anything missing: 3",{exact:true})).toBeVisible();
 await expect(page.getByText(/own record on fictional data/)).toBeVisible();
 await expect(page.getByRole("button")).toHaveCount(0);
 expect((await counts()).rows).toEqual(before);
 expect((await page.request.get(`/api/jobs/${b.jobId}/merchant-reliability`)).ok()).toBe(false);
 expect((await page.request.get(`/api/jobs/${a.jobId}/merchant-reliability?tenantId=${b.tenantId}`)).status()).toBe(400);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await context.clearCookies();await page.reload();
 await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
});
