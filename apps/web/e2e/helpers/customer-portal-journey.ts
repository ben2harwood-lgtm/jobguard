import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, type Page } from "@playwright/test";
export const portal = (page: Page, action: string, body: unknown, csrf?: string) => page.evaluate(async ({ action, body, csrf }) => {
 const response = await fetch(`/api/customer-portal/${action}`, { method: "POST", headers: { "Content-Type": "application/json", ...(csrf ? { "x-csrf-token": csrf } : {}) }, body: JSON.stringify(body) });
 return { status: response.status, body: await response.json() };
}, { action, body, csrf });
/** Owner-connected, fictional CI fixture. No product endpoint can create these rows directly. */
export async function seedJob(admin: Pool, tenant: string, practiceDigest: string) {
 const job = randomUUID(), customer = randomUUID(), cr = randomUUID(), site = randomUUID(), sr = randomUUID(), binding = randomUUID();
 const db = await admin.connect();
 try {
  await db.query("BEGIN"); await db.query("SET LOCAL session_replication_role='replica'"); await db.query("SELECT set_config('app.tenant_id',$1,true)", [tenant]);
  await db.query("INSERT INTO app.job(tenant_id,id,title,status,practice_session_digest,practice_scenario) VALUES($1,$2,'Fictional customer job','quoting',$3,'home')", [tenant, job, practiceDigest]);
  await db.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES($1,$2,'small_builder','synthetic_demo','backfilled_synthetic_fixture')",[tenant,job]);
  await db.query("INSERT INTO app.customer(tenant_id,id) VALUES($1,$2)", [tenant, customer]);
  await db.query("INSERT INTO app.customer_revision(tenant_id,id,customer_id,revision,payload) VALUES($1,$2,$3,1,$4)", [tenant, cr, customer, { version: "customer.v1", name: "Fictional customer", type: "person", email: "portal@example.invalid" }]);
  await db.query("INSERT INTO app.site(tenant_id,id) VALUES($1,$2)", [tenant, site]);
  await db.query("INSERT INTO app.site_revision(tenant_id,id,site_id,revision,payload,match_key) VALUES($1,$2,$3,1,$4,'[]')", [tenant, sr, site, { version: "site.v1", addressLines: ["1 Fictional Road"], town: "London", postcode: "SW1A 1AA" }]);
  await db.query("INSERT INTO app.job_party_binding(tenant_id,id,job_id,revision,customer_id,customer_revision_id,paying_party_id,paying_party_revision_id,site_id,site_revision_id,provenance) VALUES($1,$2,$3,0,$4,$5,$4,$5,$6,$7,'backfilled_synthetic_fixture')", [tenant, binding, job, customer, cr, site, sr]);
  await db.query("INSERT INTO app.job_party_current(tenant_id,job_id,binding_id) VALUES($1,$2,$3)", [tenant, job, binding]);
  await db.query("COMMIT"); return { job, customer };
 } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
}
/** Owner-only CI fixtures adapted from customer-signin and customer-extra-approval.
 * No customer session, acceptance or approval is seeded. No live provider is used. */
export async function seedStage(admin: Pool, tenant: string, job: string) {
  const scope = randomUUID(), evidence = randomUUID(), evidenceLink = randomUUID(), completion = randomUUID(), objectVersion = randomUUID();
  const stageDb = await admin.connect();
  try {
   await stageDb.query("BEGIN"); await stageDb.query("SELECT set_config('app.tenant_id',$1,true)",[tenant]);
  await stageDb.query("INSERT INTO app.scope_identity(tenant_id,id,job_id,state) VALUES($1,$2,$3,'confirmed')", [tenant,scope,job]);
  await stageDb.query(`INSERT INTO app.evidence_upload(tenant_id,id,job_id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at,state,object_version_id,server_verified_at)
    VALUES($1,$2,$3,$4,$2::text,$5,'image/png',100,'standard_evidence',clock_timestamp()+interval '1 day','verified',$6,clock_timestamp())`, [tenant,evidence,job,scope,"a".repeat(64),objectVersion]);
  await stageDb.query(`INSERT INTO app.evidence_object(tenant_id,id,upload_id,job_id,scope_item_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_verified_at)
    VALUES($1,$2,$2,$3,$4,'original','pre_cover_photo',$2::text,$5,$6,80,'image/png','standard_evidence',clock_timestamp())`, [tenant,evidence,job,scope,objectVersion,"a".repeat(64)]);
  await stageDb.query("INSERT INTO app.evidence_link(tenant_id,id,evidence_id,job_id,scope_item_id,required_evidence_type) VALUES($1,$2,$3,$4,$5,'pre_cover_photo')", [tenant,evidenceLink,evidence,job,scope]);
  await stageDb.query("INSERT INTO app.stage_completion(tenant_id,id,job_id,scope_item_id,stage,evidence_link_id,command_id) VALUES($1,$2,$3,$4,'Fictional pre-cover stage',$5,$6)", [tenant,completion,job,scope,evidenceLink,randomUUID()]);
   await stageDb.query("COMMIT");
  } catch(error) { await stageDb.query("ROLLBACK"); throw error; } finally { stageDb.release(); }
  return { completion, evidence, objectVersion };
}

export const portalTenant = "11111111-1111-4111-8111-111111111111";
export async function linkIssuer(admin: Pool, page: Page) {
  const session = await page.evaluate(async () => (await fetch("/api/auth/session")).json());
  const member = randomUUID();
  await admin.query(`INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role)
    SELECT $1,tenant_id,account_id,$2,'owner' FROM app.membership WHERE tenant_id=$3 AND id='d1500000-0000-4000-8000-000000000003'`, [member, session.principal.id, portalTenant]);
  await admin.query("INSERT INTO identity.membership_locator(user_id,tenant_id,membership_id) VALUES($1,$2,$3)", [session.principal.id, portalTenant, member]);
  return { member, user: session.principal.id as string, csrf: session.csrfToken as string };
}

/** Priced historical inputs only. Catch provenance is explicit; customer approval
 * must still traverse the same session/command boundary as a builder-logged extra. */
export async function seedExtras(admin: Pool, tenant: string, job: string, actor: string) {
  const db = await admin.connect();
  const extras = ["builder_logged", "jobguard_catch"].map((origin, index) => ({
    origin, id: randomUUID(), scope: randomUUID(), revision: randomUUID(), signal: randomUUID(),
    description: `Fictional ${origin} socket`, hash: createHash("sha256").update(`portal-extra-${index}`).digest("hex"),
  }));
  try {
    await db.query("BEGIN");
    await db.query("SELECT set_config('app.tenant_id',$1,true)", [tenant]);
    for (const x of extras) {
      if (x.origin === "jobguard_catch") {
        await db.query(`INSERT INTO app.shadow_commercial_signal(tenant_id,job_id,id,work_id,signal_type,detector_kind,detector_version,evidence_cutoff_at,description,confidence_band,state)
          VALUES($1,$2,$3,$4,'possible_extra','deterministic','synthetic.v1',clock_timestamp(),'Historical confirmed fictional catch','low','confirmed_extra')`, [tenant,job,x.signal,randomUUID()]);
        await db.query(`INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id)
          VALUES($1,$2,'ConfirmJobGuardCatch',$3,$4,'processing',$5)`, [tenant,x.id,`extra-origin:${job}:${x.id}`,x.hash,actor]);
      }
      await db.query("INSERT INTO app.scope_identity(tenant_id,job_id,id,state) VALUES($1,$2,$3,'reserved')", [tenant,job,x.scope]);
      await db.query(`INSERT INTO app.variation(tenant_id,job_id,id,scope_item_id,capture_kind,capture_text,description,job_track,origin)
        VALUES($1,$2,$3,$4,'text',$5,$5,'small_builder',$6)`, [tenant,job,x.id,x.scope,x.description,x.origin]);
      if (x.origin === "jobguard_catch") {
        await db.query(`INSERT INTO app.extra_origin(tenant_id,job_id,variation_id,job_track,kind,command_id,raising_membership_id,raising_role,provenance,source_signal_id)
          VALUES($1,$2,$3,'small_builder','jobguard_catch',$3,$4,'owner','command',$5)`, [tenant,job,x.id,actor,x.signal]);
        await db.query("UPDATE app.command_receipt SET status='succeeded',result='{}',completed_at=clock_timestamp() WHERE tenant_id=$1 AND command_id=$2", [tenant,x.id]);
      }
      await db.query(`INSERT INTO app.variation_revision(tenant_id,job_id,id,variation_id,scope_item_id,revision,description,quantity_decimal,unit,unit_rate_pence,signed_delta_pence,content_hash,confirmed_by_membership_id,rate_provenance_kind,rate_source_ref,rate_source_hash,rate_version)
        VALUES($1,$2,$3,$4,$5,1,$6,'1','item',5000,5000,$7,$8,'human_entered','synthetic://fixture',$7,'fixture-v1')`, [tenant,job,x.revision,x.id,x.scope,x.description,x.hash,actor]);
      await db.query("UPDATE app.variation SET current_revision_id=$3,state='priced' WHERE tenant_id=$1 AND id=$2", [tenant,x.id,x.revision]);
    }
    await db.query("COMMIT");
    return extras;
  } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
}

export async function issueLink(admin: Pool, page: Page, job: string, customer: string, csrf: string) {
  const issued = await portal(page,"issue",{version:"customer-link-issue.v1",tenantId:portalTenant,jobId:job,customerId:customer},csrf);
  expect(issued.status).toBe(200);
  const outbox = (await admin.query(`SELECT o.immutable_content,o.adapter,o.recipient FROM app.customer_portal_grant g
    JOIN app.action_outbox o ON(o.tenant_id,o.id)=(g.tenant_id,g.outbox_id) WHERE g.tenant_id=$1 AND g.id=$2`, [portalTenant,issued.body.grantId])).rows[0];
  expect(outbox.adapter).toBe("fake_email");
  expect(outbox.recipient).toMatch(/@[^@]+\.invalid$/u);
  const [tenantId,jobId,customerId,token] = (outbox.immutable_content as string).split("#")[1]!.split("/");
  return { path: outbox.immutable_content as string, grant: issued.body.grantId as string,
    credential: {version:"customer-signin.v1",tenantId,jobId,customerId,token} };
}

export async function openCustomer(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByRole("button",{name:"Sign in",exact:true})).toBeVisible();
  expect(page.url()).not.toContain("#");
  await page.getByRole("button",{name:"Sign in",exact:true}).click();
  await expect(page.getByText("You are signed in to this job.",{exact:true})).toBeVisible();
  return {
    quote: (await page.getByRole("link",{name:"Review your quote",exact:true}).getAttribute("href"))!,
    extras: (await page.getByRole("link",{name:"Review extras",exact:true}).getAttribute("href"))!,
    stages: (await page.getByRole("link",{name:"Review recorded stages",exact:true}).getAttribute("href"))!,
  };
}

/** Run the existing deterministic detector/sink over stored originals, as the
 * shadow worker does. No model/provider call or customer-supplied rule flags. */
export async function detectMessages(admin: Pool, job: string, member: string, user: string) {
  const nativeImport = new Function("specifier","return import(specifier)") as (specifier:string)=>Promise<any>;
  const db = await nativeImport("@jobguard/db") as typeof import("@jobguard/db");
  const core = await nativeImport("@jobguard/core") as typeof import("@jobguard/core");
  const context = db.verifiedTenantContextFromMembership({identityUserId:user,tenantId:portalTenant,membershipId:member} as Parameters<typeof db.verifiedTenantContextFromMembership>[0]);
  await db.withTenant(admin,context, tx => tx.$client.query("SELECT app.accept_final_check_terms($1,$2,$3,$4)",[portalTenant,member,randomUUID(),"synthetic_final_check_terms.v1"]));
  const reader = new db.ShadowObservationReader(admin,new db.FixtureObservationSources([]));
  expect(await reader.hasAcceptedTerms(context)).toBe(true);
  const observations = await reader.read(context,{version:"shadow-observation-read.v1",jobId:job});
  await new db.ShadowDetectionRepository(admin).persist(context,{version:"shadow-detection-batch.v1",jobId:job,...observations,
    proposals:core.detectShadowObservations(observations.observations,observations.captures,new Date().toISOString())});
}
