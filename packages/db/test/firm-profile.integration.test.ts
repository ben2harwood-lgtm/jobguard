import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { migrate } from "../src/migrate.js";
import { startBeforeMigration, applyMigration, seedHomeOwner, startSession, type Cluster } from "./contractor-practice-session-fixtures.js";
import { startBlankPracticeCompany } from "../src/blank-practice-company.js";
import { authenticatePracticeSession } from "../src/practice-session.js";
import { FirmProfileRepository, firmProfileV1 } from "../src/firm-profile-repository.js";
import { verifiedTenantContextFromMembership, type AuthenticatedMembership, withTenant } from "../src/tenant-context.js";
import { QuoteRepository } from "../src/quote-repository.js";
import { QuoteDeliveryRepository } from "../src/quote-delivery-repository.js";
import { UserCommandDispatcher } from "../src/commands.js";
import { IssueQuoteMutation } from "../src/quote-document-repository.js";
import { company as practiceCompany } from "./practice-worker-switch-fixtures.js";
import { ownerTx } from "./extra-fixtures.js";
import { renderQuotePdf } from "@jobguard/core";
let c: Cluster;
const own = "0726_firm_profile.sql";
const profile = { version: "firm-profile.v1", tradingName: " Fictional Oak Works ", addressLines: ["12 Example Lane"], contactEmail: "oak@fictional.invalid", contactPhone: "01234 000000" };
beforeAll(async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 c = await startBeforeMigration(own); await applyMigration(c, own); await migrate(c.admin); await seedHomeOwner(c);
}, 240_000);
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });
// Company tests use a persisted real identity session, never a contractor practice tenant.
async function realCompany() {
 const p = { tenantId: randomUUID(), membershipId: randomUUID(), identityUserId: randomUUID() };
 const account = randomUUID(), credential = randomBytes(32).toString("hex");
 await c.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [p.tenantId]);
 await c.admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [p.identityUserId]);
 await c.admin.query("INSERT INTO app.account(tenant_id,id,name) VALUES($1,$2,'Fictional company')", [p.tenantId, account]);
 await c.admin.query("INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [p.tenantId, p.membershipId, account, p.identityUserId]);
 await c.admin.query("INSERT INTO identity.membership_locator(user_id,tenant_id,membership_id) VALUES($1,$2,$3)", [p.identityUserId,p.tenantId,p.membershipId]);
 await c.admin.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2)", [`${p.identityUserId}@fictional.invalid`,p.identityUserId]);
 await c.admin.query("INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at) VALUES($1,$2,'synthetic_demo',$3,'fictional',clock_timestamp()+interval '1 hour')", [randomUUID(),p.identityUserId,credential]);
 return { p, context: verifiedTenantContextFromMembership(p as AuthenticatedMembership, { kind: "real", credential }) };
}
it("upserts one profile per company, audits without contact data, and rejects non-owner writes at both boundaries", async () => {
 const company = await realCompany();
 const repo = new FirmProfileRepository(c.runtime);
 expect(await repo.read(company.context)).toMatchObject({ profile: null, canSave: true });
 expect((await repo.save(company.context, profile)).profile).toEqual(firmProfileV1.parse(profile));
 const key = (await c.admin.query("SELECT company_key FROM app.firm_profile WHERE tenant_id=$1", [company.p.tenantId])).rows[0].company_key;
 const audit = (await c.admin.query("SELECT payload::text FROM app.audit_event WHERE tenant_id=$1 AND event_type='firm_profile.saved'", [company.p.tenantId])).rows;
 expect(audit).toHaveLength(1); expect(audit[0].payload).not.toContain("Example Lane"); expect(audit[0].payload).not.toContain("oak@");
 await c.admin.query("UPDATE app.membership SET role='supervisor' WHERE tenant_id=$1 AND id=$2", [company.p.tenantId, company.p.membershipId]);
 try {
  expect(await repo.read(company.context)).toMatchObject({ profile: { tradingName: "Fictional Oak Works" }, canSave: false });
  await expect(repo.save(company.context, { ...profile, tradingName: "Refused" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  const result = await withTenant(c.runtime, company.context, db => db.$client.query("UPDATE app.firm_profile SET trading_name='Refused' WHERE tenant_id=$1 AND company_key=$2", [company.p.tenantId, key]));
  expect(result.rowCount).toBe(0);
 } finally { await c.admin.query("UPDATE app.membership SET role='owner' WHERE tenant_id=$1 AND id=$2", [company.p.tenantId, company.p.membershipId]); }
 expect((await repo.read(company.context)).profile?.tradingName).toBe("Fictional Oak Works");
 await expect(repo.save(company.context, { ...profile, tradingName: " ", tenantId: company.p.tenantId })).rejects.toMatchObject({ code: "INVALID_PROFILE" });
});
it("isolates companies and refuses every shared practice firm, including after reset", async () => {
 const repo = new FirmProfileRepository(c.runtime), company = await realCompany(), other = await realCompany();
 await repo.save(company.context, profile);
 expect((await repo.read(other.context)).profile).toBeNull();
 const key = company.context.tenantId;
 const start = { version: "blank-practice-company.v1", action: "start" };
 const token = await startBlankPracticeCompany(c.runtime, start), secondToken = await startBlankPracticeCompany(c.runtime, start);
 const first = await authenticatePracticeSession(c.runtime, token), second = await authenticatePracticeSession(c.runtime, secondToken);
 expect(first.context.tenantId).toBe(second.context.tenantId);
 for (const context of [first.context, second.context, other.context]) {
  expect(await withTenant(c.runtime, context, async db => (await db.$client.query("SELECT * FROM app.firm_profile WHERE tenant_id=$1 AND company_key=$2", [company.context.tenantId, key])).rows)).toEqual([]);
  expect(await withTenant(c.runtime, context, async db => (await db.$client.query("UPDATE app.firm_profile SET trading_name='Stolen' WHERE tenant_id=$1 AND company_key=$2", [company.context.tenantId, key])).rowCount)).toBe(0);
  await expect(withTenant(c.runtime, context, db => db.$client.query("INSERT INTO app.firm_profile(tenant_id,company_key,trading_name) VALUES($1,$2,'Stolen')", [company.context.tenantId, key]))).rejects.toThrow(/row-level security/);
 }
 for (const context of [first.context, second.context]) {
  expect(await repo.read(context)).toMatchObject({ profile: null, canSave: false, isPractice: true });
  await expect(repo.save(context, profile)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(withTenant(c.runtime, context, db => db.$client.query("INSERT INTO app.firm_profile(tenant_id,company_key,trading_name) VALUES($1,$2,'Stolen')", [context.tenantId, context.tenantId]))).rejects.toThrow(/row-level security/);
 }
 const next = await startBlankPracticeCompany(c.runtime, { ...start, action: "reset" }, token);
 expect(await repo.read((await authenticatePracticeSession(c.runtime, next)).context)).toMatchObject({ profile: null, canSave: false, isPractice: true });
 expect((await c.admin.query("SELECT count(*)::int n FROM app.firm_profile WHERE tenant_id=$1", [first.context.tenantId])).rows[0].n).toBe(0);
 expect((await repo.read(company.context)).profile?.tradingName).toBe("Fictional Oak Works");
});
it("freezes the saved issuer in an issued document and uses a changed profile only in new document versions", async () => {
 const company = await realCompany(), context = company.context, tenant = company.p.tenantId;
 const repo = new FirmProfileRepository(c.runtime), delivery = new QuoteDeliveryRepository(c.runtime), quotes = new QuoteRepository(c.runtime);
 const job = randomUUID(), scope = randomUUID(), revision = randomUUID(), draft = randomUUID();
 await c.admin.query("INSERT INTO app.job(tenant_id,id,title,status) VALUES($1,$2,'Fictional firm quote','quoting')", [tenant, job]);
 await withTenant(c.runtime, context, async db => {
  await db.$client.query("INSERT INTO app.scope_identity(tenant_id,id,job_id,state) VALUES($1,$2,$3,'confirmed')", [tenant, scope, job]);
  await db.$client.query("INSERT INTO app.scope_revision(tenant_id,id,job_id,scope_item_id,revision,description,quantity_decimal,unit,unit_price_pence,total_pence) VALUES($1,$2,$3,$4,1,'Fit cabinet','1','item',10000,10000)", [tenant, revision, job, scope]);
 });
 const line = { id: randomUUID(), scopeItemId: scope, scopeRevisionId: revision, description: "Fit cabinet", origin: "captured", included: true, exclusionReason: null, quantity: "1", unit: "item", unitRatePence: 10000, discountPercent: "0", taxTreatment: "standard_rate_20", rateProvenance: "entered", category: null, region: null };
 const save = (expectedRevision: number) => quotes.saveDraft(context, { jobId: job, draftId: draft, expectedRevision, currency: "GBP", taxPolicyVersion: "candidate_m1_standard_v1", lines: [line], effectiveAt: new Date(), actorRef: company.p.membershipId });
 await save(0);
 expect((await delivery.preview(context, job, "customer@fictional.invalid")).document.issuer.name).toBe("A Builder Ltd");
 await repo.save(context, profile);
 const issued = await delivery.preview(context, job, "customer@fictional.invalid");
 expect(issued.document.issuer).toEqual({ name: "Fictional Oak Works", address: ["12 Example Lane"], email: "oak@fictional.invalid" });
 await new UserCommandDispatcher(c.runtime).dispatch(context, { version: "command.v1", commandId: randomUUID(), commandType: "quote.send", semanticKey: `quote-send:${issued.documentId}`, actorMembershipId: company.p.membershipId, subjectType: "quote_document", subjectRef: issued.documentId, authorizationId: randomUUID(), action: { actionType: "quote.send", recipient: JSON.stringify(["customer@fictional.invalid"]), contentHash: issued.hash, aggregateRevision: issued.document.documentVersion, amountPence: null, currency: null, policyVersion: "free-quote-send.v1", expiresAt: new Date(Date.now() + 3600000) } }, new IssueQuoteMutation({ tenantId: tenant, jobId: job, documentId: issued.documentId, outboxActionId: randomUUID(), recipients: ["customer@fictional.invalid"], immutableContent: new TextDecoder().decode(renderQuotePdf(issued.document)) }));
 const before = await delivery.pdf(context, job, issued.documentId);
 await repo.save(context, { ...profile, tradingName: "Fictional Oak Renamed" });
 expect(await delivery.pdf(context, job, issued.documentId)).toEqual(before);
 expect((await c.admin.query("SELECT issuer FROM app.quote_document_version WHERE tenant_id=$1 AND id=$2", [tenant, issued.documentId])).rows[0].issuer.name).toBe("Fictional Oak Works");
 expect((await delivery.preview(context, job, "customer@fictional.invalid")).document.issuer.name).toBe("Fictional Oak Renamed");
});
it("pins FORCE RLS and runtime grants, forbids deletes, and detects removal of the database owner check", async () => {
 const catalog = (await c.admin.query("SELECT relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) owner FROM pg_class WHERE oid='app.firm_profile'::regclass")).rows[0];
 expect(catalog).toEqual({ relrowsecurity: true, relforcerowsecurity: true, owner: "jobguard_migration" });
 expect((await c.admin.query("SELECT privilege_type FROM information_schema.role_table_grants WHERE table_schema='app' AND table_name='firm_profile' AND grantee='jobguard_runtime' ORDER BY privilege_type")).rows.map(x => x.privilege_type)).toEqual(["INSERT", "SELECT", "UPDATE"]);
 const company = await realCompany(), repo = new FirmProfileRepository(c.runtime);
 await repo.save(company.context, profile);
 await expect(withTenant(c.runtime, company.context, db => db.$client.query("DELETE FROM app.firm_profile"))).rejects.toThrow(/permission denied/);
 await c.admin.query("UPDATE app.membership SET role='supervisor' WHERE tenant_id=$1 AND id=$2", [company.p.tenantId, company.p.membershipId]);
 const original = (await c.admin.query("SELECT pg_get_functiondef('app.firm_profile_access(uuid,text,boolean)'::regprocedure) definition")).rows[0].definition as string;
 const ownerCheck = "AND (NOT w OR m.role='owner')";
 const refusedWrite = async () => expect(await withTenant(c.runtime, company.context, async db => (await db.$client.query("UPDATE app.firm_profile SET trading_name='Mutation' WHERE tenant_id=$1", [company.p.tenantId])).rowCount)).toBe(0);
 await refusedWrite(); expect(original).toContain(ownerCheck);
 try {
  await c.admin.query(original.replace(ownerCheck, ""));
  // The same refusal assertion must fail when the SQL owner guard is removed.
  await expect(refusedWrite()).rejects.toThrow();
 } finally { await c.admin.query(original); }
 await refusedWrite();
});

it("refuses Empty Workshop and contractor practice profiles at repository and SQL boundaries", async () => {
 const tenant = "33333333-3333-4333-8333-333333333333", account = "33333333-3333-4333-8333-333333333334", member = "33333333-3333-4333-8333-333333333335";
 await c.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1) ON CONFLICT DO NOTHING", [tenant]);
 await c.admin.query("INSERT INTO app.account(tenant_id,id,name) VALUES($1,$2,'Empty Workshop') ON CONFLICT DO NOTHING", [tenant,account]);
 const user = (await c.admin.query("SELECT identity_user_id FROM app.membership WHERE tenant_id='11111111-1111-4111-8111-111111111111' LIMIT 1")).rows[0].identity_user_id;
 await c.admin.query("INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner') ON CONFLICT DO NOTHING", [tenant,member,account,user]);
 const { issuePracticeSession } = await import("../src/practice-session.js");
 const token = await issuePracticeSession(c.runtime);
 const empty = await authenticatePracticeSession(c.runtime, token, tenant);
 const contractor = await startSession(c);
 const repo = new FirmProfileRepository(c.runtime);
 for (const context of [empty.context, contractor.context]) {
  expect(await repo.read(context)).toMatchObject({ profile: null, isPractice: true, canSave: false });
  await expect(repo.save(context, profile)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(withTenant(c.runtime, context, db => db.$client.query("INSERT INTO app.firm_profile(tenant_id,company_key,trading_name) VALUES($1::uuid,$1::text,'Refused')", [context.tenantId]))).rejects.toMatchObject({ code: "42501" });
 }
});
it("refuses a marked practice company's profile and saves", async () => {
 const f = await practiceCompany(c);
 await ownerTx(c, f.p.tenantId, db => db.$client.query("INSERT INTO control_plane.practice_company_marker(tenant_id,session_ref,owner_membership_id,owner_identity_user_id,marked_at) VALUES($1,$2,$3,$4,clock_timestamp())", [f.p.tenantId,f.sessionRef,f.p.membershipId,f.p.identityUserId]));
 const repo = new FirmProfileRepository(c.runtime);
 expect(await repo.read(f.context)).toMatchObject({ profile: null, isPractice: true, canSave: false });
 await expect(repo.save(f.context, profile)).rejects.toMatchObject({ code: "FORBIDDEN" });
 await expect(withTenant(c.runtime, f.context, db => db.$client.query("INSERT INTO app.firm_profile(tenant_id,company_key,trading_name) VALUES($1::uuid,$1::text,'Refused')", [f.p.tenantId]))).rejects.toMatchObject({ code: "42501" });
});
