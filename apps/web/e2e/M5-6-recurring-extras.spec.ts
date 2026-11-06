import { createHmac, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, test } from "@playwright/test";
test("owner practice page is read only, traced and refuses request authority", async ({ page, context, baseURL }) => {
  const admin = new Pool({ connectionString: "postgresql://postgres:sbox-e2e-owner@127.0.0.1:55432/jobguard_synthetic_demo", max: 1 });
  const tenant = randomUUID(), member = randomUUID(), jobs = [randomUUID(),randomUUID(),randomUUID()];
  try {
    const {user, sources} = await seed(admin,tenant,member,jobs);
    const token = randomUUID();
    const digest = createHmac("sha256",process.env.AUTH_CODE_SECRET ?? "sbox-only-identity-hmac-secret-32-bytes").update(`session:${token}`).digest("hex");
    await admin.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2)",[`${user}@extras.invalid`,user]);
    await admin.query("INSERT INTO identity.membership_locator(user_id,tenant_id,membership_id) VALUES($1,$2,$3)",[user,tenant,member]);
    await admin.query("INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at) VALUES($1,$2,'synthetic_demo',$3,$4,clock_timestamp()+interval '1 hour')",[randomUUID(),user,digest,randomUUID()]);
    await context.addCookies([{ name: "jobguard_session", value: token, url: baseURL! }]);
    const before = await counts(admin,tenant);
    await page.goto(`/jobs/${jobs[0]}/recurring-extras`);
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", {name:"Recurring extras",exact:true})).toBeVisible();
    await expect(main).toContainText("3 distinct jobs");
    await expect(main).toContainText("£1.01");
    for (const source of sources) await expect(main).toContainText(source);
    await expect(main.locator("button,form,input,select")).toHaveCount(0);
    await page.reload(); await expect(main).toContainText("3 distinct jobs");
    const url = `/api/jobs/${jobs[0]}/recurring-extras`;
    const response = await page.request.get(url);
    expect(response.headers()["cache-control"]).toBe("no-store");
    expect(response.status()).toBe(200);
    for (const query of ["?tenant=x","?actor=x","?cutoff=x"]) expect((await page.request.get(url+query)).status()).toBe(400);
    expect((await page.request.post(url,{data:{}})).status()).toBe(405);
    expect(await counts(admin,tenant)).toEqual(before);
    await context.clearCookies(); expect((await page.request.get(url)).status()).toBe(401);
  } finally { await admin.end(); }
});

// Administrative fictional-source fixture only; runtime reads retain all grants, RLS and guards.
async function seed(admin: Pool, tenant: string, member: string, jobIds: string[]) {
  const client = await admin.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role=replica");
    await client.query("INSERT INTO control_plane.tenant(id) VALUES($1) ON CONFLICT DO NOTHING", [tenant]);
    const user = randomUUID(), account = randomUUID();
    await client.query("INSERT INTO identity.identity_user(id) VALUES($1)", [user]);
    await client.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional extras')", [account,tenant]);
    await client.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [member,tenant,account,user]);
    const sources: string[] = [];
    for (const [i, job] of jobIds.entries()) {
      await client.query("INSERT INTO app.job(id,tenant_id,title) VALUES($1,$2,'Fictional extras job')", [job,tenant]);
      await client.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES($1,$2,'small_builder','synthetic_demo','backfilled_synthetic_fixture')", [tenant,job]);
      const variation = randomUUID(), revision = randomUUID(), scope = randomUUID(), hash = "a".repeat(64);
      sources.push(variation);
      await client.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [scope,tenant,job]);
      await client.query(`INSERT INTO app.variation(id,tenant_id,job_id,scope_item_id,capture_kind,capture_text,description,state,current_revision_id,job_track,origin)
        VALUES($1,$2,$3,$4,'text','Fictional capture','Add sockets','approved',$5,'small_builder','builder_logged')`, [variation,tenant,job,scope,revision]);
      await client.query(`INSERT INTO app.variation_revision(id,tenant_id,job_id,variation_id,scope_item_id,revision,description,quantity_decimal,unit,unit_rate_pence,signed_delta_pence,content_hash,confirmed_by_membership_id,rate_provenance_kind,rate_source_ref,rate_source_hash,rate_version)
        VALUES($1,$2,$3,$4,$5,1,'Add sockets','1','each',$6,$6,$7,$8,'human_entered','fixture://extras',$7,'fixture.v1')`, [revision,tenant,job,variation,scope,100+i,hash,member]);
      await client.query(`INSERT INTO app.variation_approval(id,tenant_id,job_id,variation_id,revision_id,revision,content_hash,signed_delta_pence,method,actor_membership_id,approved_at)
        VALUES($1,$2,$3,$4,$5,1,$6,$7,'builder_attestation',$8,clock_timestamp())`, [randomUUID(),tenant,job,variation,revision,hash,100+i,member]);
      await client.query(`INSERT INTO app.variation_rate_observation(id,tenant_id,job_id,variation_id,revision_id,unit,unit_rate_pence,provenance_kind,source_ref,source_hash,rate_version)
        VALUES($1,$2,$3,$4,$5,'each',$6,'human_entered','fixture://extras',$7,'fixture.v1')`, [randomUUID(),tenant,job,variation,revision,100+i,hash]);
    }
    await client.query("COMMIT"); return { user, sources };
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
const protectedTables = ["job", "quote_version", "quote_line", "rate_book_observation", "scope_revision", "customer_invoice", "variation", "variation_revision", "variation_rate_observation"];
async function counts(admin: Pool, tenant: string) {
  return Promise.all(protectedTables.map(async table => [table, (await admin.query(`SELECT count(*)::text n, md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY tenant_id,id)::text,'[]')) digest FROM app.${table} t WHERE tenant_id=$1`,[tenant])).rows[0]]));
}
