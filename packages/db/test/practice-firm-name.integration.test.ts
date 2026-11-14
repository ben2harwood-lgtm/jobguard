import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { startBeforeMigration, type Cluster } from "./contractor-practice-session-fixtures.js";
import { startBlankPracticeCompany } from "../src/blank-practice-company.js";
import { authenticatePracticeSession, issuePracticeSession, practiceMaterialPool } from "../src/practice-session.js";
import { FirmProfileRepository } from "../src/firm-profile-repository.js";
import { QuoteDeliveryRepository } from "../src/quote-delivery-repository.js";
import { QuoteRepository } from "../src/quote-repository.js";
import { QuoteAcceptanceRepository } from "../src/acceptance-repository.js";
import { withTenant, verifiedTenantContextForQueuedJob, verifiedTenantContextFromMembership, type AuthenticatedMembership } from "../src/tenant-context.js";
import { seedSyntheticPartyFixture } from "../src/synthetic-party-fixture.js";

const own = "0949_practice_firm_name.sql";
const start = { version: "blank-practice-company.v1", action: "start" };
const profile = { version: "firm-profile.v1", tradingName: "Fictional Moonbrick Works", addressLines: [], contactEmail: "", contactPhone: "" };
const recipient = "customer@fictional.invalid";
let c: Cluster;
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); c = await startBeforeMigration(own); }, 300_000);
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });
async function firm() {
 const token = await startBlankPracticeCompany(c.runtime, start);
 const auth = await authenticatePracticeSession(c.runtime, token);
 const job = randomUUID(), scope = randomUUID(), revision = randomUUID();
 const tenant = auth.context.tenantId;
 await withTenant(c.runtime, auth.context, db => db.$client.query("SELECT app.create_practice_sandbox_job($1,$2,$3,$4)", [tenant, job, auth.membershipId, auth.digest]));
 const db = await c.admin.connect();
 try {
  await db.query("BEGIN"); await db.query("SELECT set_config('app.tenant_id',$1,true)", [tenant]);
  await db.query("INSERT INTO app.scope_identity(tenant_id,id,job_id,state) VALUES($1,$2,$3,'confirmed')", [tenant, scope, job]);
  await db.query("INSERT INTO app.scope_revision(tenant_id,id,job_id,scope_item_id,revision,description,quantity_decimal,unit,unit_price_pence,total_pence) VALUES($1,$2,$3,$4,1,'Fit cabinet','1','item',20000,20000)", [tenant, revision, job, scope]);
  await seedSyntheticPartyFixture(db, tenant, job); await db.query("COMMIT");
 } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
 await new QuoteRepository(c.runtime).saveDraft(auth.context, { jobId: job, draftId: randomUUID(), expectedRevision: 0, currency: "GBP", taxPolicyVersion: "candidate_m1_standard_v1",
  lines: [{ id: randomUUID(), scopeItemId: scope, scopeRevisionId: revision, description: "Fit cabinet", origin: "captured", included: true, exclusionReason: null, quantity: "1", unit: "item", unitRatePence: 20000, discountPercent: "0", taxTreatment: "standard_rate_20", rateProvenance: "entered", category: null, region: null }], effectiveAt: new Date(), actorRef: auth.membershipId });
 return { token, auth, job, tenant };
}
const key = (f: Awaited<ReturnType<typeof firm>>) => `practice:${f.auth.digest}`;
async function preserved() {
 return (await c.admin.query(`SELECT 'profile' kind,row_to_json(p)::text bytes FROM app.firm_profile p
 UNION ALL SELECT 'document',row_to_json(d)::text FROM app.quote_document_version d
 UNION ALL SELECT 'send',row_to_json(s)::text FROM app.quote_send s
 UNION ALL SELECT 'acceptance',row_to_json(a)::text FROM app.quote_acceptance a ORDER BY kind,bytes`)).rows;
}
it("blank practice owner saves a name for only its own quote and acceptance", async () => {
 const a = await firm(), b = await firm();
 const repo = new FirmProfileRepository(c.runtime), delivery = new QuoteDeliveryRepository(c.runtime), acceptance = new QuoteAcceptanceRepository(c.runtime);
 const preview = (f = a) => delivery.preview(f.auth.context, f.job, recipient);
 const issue = (p: Awaited<ReturnType<typeof preview>>, commandId = randomUUID()) => delivery.issue(a.auth.context, a.job, { documentId: p.documentId, contentHash: p.hash, recipient, commandId });
 // Optional separate pre-fix run fails at the actual missing behavior, before DDL.
 if (process.env.JOBGUARD_PRACTICE_FIRM_NAME_BASE === "1") expect((await repo.read(a.auth.context)).canSave).toBe(true);
 expect((await repo.read(a.auth.context)).canSave).toBe(false);
 const historical = await preview();
 await issue(historical);
 await acceptance.accept(a.auth.context,a.job,{commandId:randomUUID(),documentId:historical.documentId,documentHash:historical.hash,documentVersion:historical.document.documentVersion,statedCustomerName:"Fictional Customer",statedMethod:"verbal",acceptedAt:new Date().toISOString()});
 // Include a populated pre-existing company profile in upgrade preservation.
 const otherTenant = randomUUID();
 await c.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)",[otherTenant]);
 await c.admin.query("INSERT INTO app.firm_profile(tenant_id,company_key,trading_name) VALUES($1::uuid,$1::text,'Fictional Existing Firm')",[otherTenant]);
 const before = await preserved(), sql = await readFile(new URL(`../migrations/${own}`, import.meta.url), "utf8");
 await c.admin.query(sql); expect(await preserved()).toEqual(before);
 expect(await repo.read(a.auth.context)).toMatchObject({ isPractice: true, canSave: true, profile: null });
 expect((await repo.save(a.auth.context,profile)).profile?.tradingName).toBe(profile.tradingName);
 expect((await repo.read(a.auth.context)).profile?.tradingName).toBe(profile.tradingName);
 const audit = (await c.admin.query("SELECT payload::text payload FROM app.audit_event WHERE tenant_id=$1 AND event_type='firm_profile.saved' AND subject_ref=$2",[a.tenant,key(a)])).rows;
 expect(audit).toHaveLength(1); expect(audit[0].payload).not.toContain(profile.tradingName);
 expect((await repo.read(b.auth.context)).profile).toBeNull();
 // Ordinary withTenant has no practice_material_digest installed.
 expect(await withTenant(c.runtime,a.auth.context,async db => (await db.$client.query("SELECT app.current_firm_profile_key() key,practice_session_digest FROM app.job WHERE id=$1",[a.job])).rows[0])).toEqual({key:key(a),practice_session_digest:a.auth.digest});
 expect(await withTenant(practiceMaterialPool(c.runtime,b.auth.digest),a.auth.context,async db => (await db.$client.query("SELECT app.current_firm_profile_key() key")).rows[0].key)).toBe(key(a));
 await withTenant(practiceMaterialPool(c.runtime,a.auth.digest),a.auth.context,db => db.$client.query("SELECT app.accept_final_check_terms($1,$2,$3,'synthetic_final_check_terms.v1')",[a.tenant,a.auth.membershipId,randomUUID()]));
 await acceptance.disposition(a.auth.context,a.job,{commandId:randomUUID(),documentId:historical.documentId,documentHash:historical.hash,documentVersion:historical.document.documentVersion,kind:"acceptance_cancelled",occurredAt:new Date().toISOString()});
 expect((await c.admin.query("SELECT practice_session_digest FROM app.final_check_terms_acceptance WHERE tenant_id=$1 AND practice_session_digest=$2",[a.tenant,a.auth.digest])).rows).toHaveLength(1);
 const stale = await preview();
 expect(stale.document.issuer.name).toBe(profile.tradingName);
 expect(new TextDecoder().decode(stale.pdf)).toContain(profile.tradingName);
 expect(createHash("sha256").update(stale.pdf).digest("hex")).toBe(stale.hash);
 await repo.save(a.auth.context,{...profile,tradingName:"Fictional Moonbrick Renamed"});
 await expect(issue(stale)).rejects.toThrow(/QUOTE_CHANGED/);
 const fresh = await preview(), command = randomUUID();
 expect(fresh.documentId).not.toBe(stale.documentId);
 expect(fresh.document.issuer.name).toBe("Fictional Moonbrick Renamed");
 await issue(fresh,command);
 await acceptance.accept(a.auth.context,a.job,{commandId:randomUUID(),documentId:fresh.documentId,documentHash:fresh.hash,documentVersion:fresh.document.documentVersion,statedCustomerName:"Fictional Customer",statedMethod:"verbal",acceptedAt:new Date().toISOString()});
 const immutable = async () => (await c.admin.query("SELECT d.snapshot,d.content_hash,o.immutable_content FROM app.quote_document_version d JOIN app.quote_send s ON(s.tenant_id,s.job_id,s.document_id)=(d.tenant_id,d.job_id,d.id) JOIN app.action_outbox o ON(o.tenant_id,o.id)=(s.tenant_id,s.outbox_action_id) WHERE d.tenant_id=$1 AND d.id=$2",[a.tenant,fresh.documentId])).rows;
 const issuedBeforeRename = await immutable();
 const bytes = await delivery.pdf(a.auth.context,a.job,fresh.documentId);
 await repo.save(a.auth.context,{...profile,tradingName:"Fictional Moonbrick Later"});
 expect((await issue(fresh,command))?.documentId).toBe(fresh.documentId);
 expect(await delivery.pdf(a.auth.context,a.job,fresh.documentId)).toEqual(bytes);
 expect(await immutable()).toEqual(issuedBeforeRename);
 expect((await preview()).document.issuer.name).toBe("Fictional Moonbrick Later");
 // Active acceptance uses its named snapshot; older history keeps its sample issuer.
 const view = await acceptance.view(a.auth.context,a.job);
 expect(view.activeAcceptance?.actor).toBe("Fictional Moonbrick Renamed (builder)");
 expect(view.events.at(-1)?.actor).toBe("Fictional Moonbrick Renamed (builder)");
 expect(view.events[0]?.actor).toBe("A Builder Ltd (builder)");
 expect((await preview(b)).document.issuer.name).toBe("A Builder Ltd");
 await expect(delivery.preview(b.auth.context,a.job,recipient)).rejects.toThrow(/FORBIDDEN/);
 await expect(withTenant(c.runtime,b.auth.context,db => db.$client.query("SELECT app.job_saved_firm_name($1)",[a.job]))).rejects.toThrow(/FORBIDDEN/);
 for (const [tenant,companyKey] of [[a.tenant,key(a)],[otherTenant,otherTenant]]) {
  expect(await withTenant(c.runtime,b.auth.context,async db => (await db.$client.query("SELECT * FROM app.firm_profile WHERE tenant_id=$1 AND company_key=$2",[tenant,companyKey])).rows)).toEqual([]);
  expect(await withTenant(c.runtime,b.auth.context,async db => (await db.$client.query("UPDATE app.firm_profile SET trading_name='Stolen' WHERE tenant_id=$1 AND company_key=$2",[tenant,companyKey])).rowCount)).toBe(0);
  await expect(withTenant(c.runtime,b.auth.context,db => db.$client.query("INSERT INTO app.firm_profile(tenant_id,company_key,trading_name) VALUES($1,$2,'Stolen')",[tenant,companyKey]))).rejects.toThrow(/row-level security/);
 }
 await expect(withTenant(c.runtime,b.auth.context,async db => { await db.$client.query("SELECT set_config('app.tenant_id',$1,true)",[otherTenant]); return db.$client.query("SELECT app.current_firm_profile_key()"); })).rejects.toThrow(/FORBIDDEN/);
 const queued = verifiedTenantContextForQueuedJob(a.tenant);
 expect(await withTenant(c.runtime,queued,async db => (await db.$client.query("SELECT * FROM app.firm_profile")).rows)).toEqual([]);
 await expect(repo.save(queued,profile)).rejects.toThrow();
 await expect(withTenant(c.runtime,queued,db => db.$client.query("INSERT INTO app.firm_profile(tenant_id,company_key,trading_name) VALUES($1,$2,'Stolen')",[a.tenant,key(a)]))).rejects.toThrow();
 expect(await withTenant(c.runtime,queued,async db => (await db.$client.query("UPDATE app.firm_profile SET trading_name='Stolen' WHERE tenant_id=$1",[a.tenant])).rowCount)).toBe(0);
 await expect(c.runtime.query("SELECT * FROM control_plane.blank_practice_session")).rejects.toThrow(/permission denied/);
 // An ambiguous match must not pick an arbitrary row, even if both are live.
 const bindingDefinition = (await c.admin.query("SELECT pg_get_functiondef('app.final_check_bound_practice(uuid,text)'::regprocedure) body")).rows[0].body as string;
 try {
  await c.admin.query(`CREATE OR REPLACE FUNCTION app.final_check_bound_practice(t uuid,d text) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$ BEGIN RETURN d IN ('${a.auth.digest}','${b.auth.digest}'); END $$`);
  await expect(repo.read(a.auth.context)).rejects.toThrow(/FORBIDDEN/);
  await expect(repo.save(a.auth.context,profile)).rejects.toThrow(/FORBIDDEN/);
 } finally { await c.admin.query(bindingDefinition); }
 const keyDefinition = (await c.admin.query("SELECT pg_get_functiondef('app.current_firm_profile_key()'::regprocedure) body")).rows[0].body as string;
 expect(keyDefinition).toContain("app.final_check_bound_practice");
 expect(keyDefinition).toContain("app.authenticate_practice_session(d,");
 expect(keyDefinition).not.toContain("practice_material_digest");
 expect((await c.admin.query("SELECT has_table_privilege('jobguard_runtime','control_plane.blank_practice_session','SELECT') blank,has_table_privilege('jobguard_runtime','control_plane.request_binding','SELECT') binding,has_function_privilege('jobguard_runtime','app.final_check_job_scope(uuid,uuid)','EXECUTE') scope")).rows).toEqual([{blank:false,binding:false,scope:false}]);
 const user=randomUUID(),member=randomUUID(),account=randomUUID(),credential=createHash("sha256").update(randomUUID()).digest("hex");
 await c.admin.query("INSERT INTO identity.identity_user(id) VALUES($1)",[user]);
 await c.admin.query("INSERT INTO app.account(tenant_id,id,name) VALUES($1,$2,'Fictional other tenant')",[otherTenant,account]);
 await c.admin.query("INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')",[otherTenant,member,account,user]);
 await c.admin.query("INSERT INTO identity.membership_locator(user_id,tenant_id,membership_id) VALUES($1,$2,$3)",[user,otherTenant,member]);
 await c.admin.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2)",[`${user}@fictional.invalid`,user]);
 await c.admin.query("INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at) VALUES($1,$2,'synthetic_demo',$3,'fictional',clock_timestamp()+interval '1 hour')",[randomUUID(),user,credential]);
 const other=verifiedTenantContextFromMembership({identityUserId:user,tenantId:otherTenant,membershipId:member} as AuthenticatedMembership,{kind:"real",credential});
 expect((await repo.read(other)).profile?.tradingName).toBe("Fictional Existing Firm");
 expect(await withTenant(c.runtime,other,async db => (await db.$client.query("SELECT * FROM app.firm_profile WHERE tenant_id=$1",[a.tenant])).rows)).toEqual([]);
 await expect(withTenant(c.runtime,other,db => db.$client.query("SELECT app.job_saved_firm_name($1)",[a.job]))).rejects.toThrow(/FORBIDDEN/);
 const saved = await preserved(); await c.admin.query(sql); expect(await preserved()).toEqual(saved);
 for (const kind of ["expiry","revocation"] as const) {
  const f = await firm(); await repo.save(f.auth.context,profile);
  await c.admin.query(`UPDATE control_plane.practice_session SET ${kind === "expiry" ? "expires_at=clock_timestamp()-interval '1 second'" : "revoked_at=clock_timestamp()"} WHERE token_digest=$1`,[f.auth.digest]);
  await expect(repo.read(f.auth.context)).rejects.toThrow(); await expect(repo.save(f.auth.context,profile)).rejects.toThrow();
 }
 const next = await startBlankPracticeCompany(c.runtime,{...start,action:"reset"},a.token);
 await expect(repo.read(a.auth.context)).rejects.toThrow();
 const reset = await authenticatePracticeSession(c.runtime,next);
 expect(await repo.read(reset.context)).toMatchObject({profile:null,isPractice:true,canSave:true});
 await expect(withTenant(c.runtime,reset.context,db => db.$client.query("SELECT app.job_saved_firm_name($1)",[a.job]))).rejects.toThrow(/FORBIDDEN/);
 expect((await c.admin.query("SELECT trading_name FROM app.firm_profile WHERE tenant_id=$1 AND company_key=$2",[a.tenant,key(a)])).rows[0].trading_name).toBe("Fictional Moonbrick Later");
 expect((await c.admin.query("SELECT snapshot->'issuer'->>'name' name FROM app.quote_document_version WHERE tenant_id=$1 AND id=$2",[a.tenant,fresh.documentId])).rows[0].name).toBe("Fictional Moonbrick Renamed");
 // Unsupported sample sessions retain their fallback on their own jobs.
 {

 const token = await issuePracticeSession(c.runtime), auth = await authenticatePracticeSession(c.runtime,token);
 const repo = new FirmProfileRepository(c.runtime), job = randomUUID();
 expect(await repo.read(auth.context)).toMatchObject({profile:null,isPractice:true,canSave:false});
 await expect(repo.save(auth.context,profile)).rejects.toMatchObject({code:"FORBIDDEN"});
 await withTenant(c.runtime,auth.context,db => db.$client.query("SELECT app.create_practice_sandbox_job($1,$2,$3,$4)",[auth.context.tenantId,job,auth.membershipId,auth.digest]));
 expect(await withTenant(c.runtime,auth.context,async db => (await db.$client.query("SELECT app.job_saved_firm_name($1) name",[job])).rows[0].name)).toBeNull();
 }
},300_000);
