import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { startBeforeMigration, applyMigration, seedHomeOwner, startSession, type Cluster } from "./contractor-practice-session-fixtures.js";
import { startBlankPracticeCompany } from "../src/blank-practice-company.js";
import { authenticatePracticeSession } from "../src/practice-session.js";
import { FirmProfileRepository, firmProfileV1 } from "../src/firm-profile-repository.js";
import { withTenant } from "../src/tenant-context.js";
import { QuoteRepository } from "../src/quote-repository.js";
import { QuoteDeliveryRepository } from "../src/quote-delivery-repository.js";
import { UserCommandDispatcher } from "../src/commands.js";
import { IssueQuoteMutation } from "../src/quote-document-repository.js";
import { renderQuotePdf } from "@jobguard/core";
let c: Cluster;
const own = "1300_firm_profile.sql";
const profile = { version: "firm-profile.v1", tradingName: " Fictional Oak Works ", addressLines: ["12 Example Lane"], contactEmail: "oak@fictional.invalid", contactPhone: "01234 000000" };
beforeAll(async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 c = await startBeforeMigration(own); await applyMigration(c, own); await seedHomeOwner(c);
}, 240_000);
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });
it("upserts one profile per company, audits without contact data, and rejects non-owner writes at both boundaries", async () => {
 const company = await startSession(c);
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
it("isolates another company and two blank firms sharing the demo tenant; reset cannot inherit the old firm's profile", async () => {
 const repo = new FirmProfileRepository(c.runtime), company = await startSession(c), other = await startSession(c);
 await repo.save(company.context, profile);
 expect((await repo.read(other.context)).profile).toBeNull();
 const start = { version: "blank-practice-company.v1", action: "start" };
 const token = await startBlankPracticeCompany(c.runtime, start), secondToken = await startBlankPracticeCompany(c.runtime, start);
 const first = await authenticatePracticeSession(c.runtime, token), second = await authenticatePracticeSession(c.runtime, secondToken);
 expect(first.context.tenantId).toBe(second.context.tenantId);
 await repo.save(first.context, profile);
 expect((await repo.read(second.context)).profile).toBeNull();
 const key = await withTenant(c.runtime, first.context, async db => (await db.$client.query("SELECT app.current_firm_profile_key() key")).rows[0].key);
 for (const context of [second.context, other.context]) {
  expect(await withTenant(c.runtime, context, async db => (await db.$client.query("SELECT * FROM app.firm_profile WHERE tenant_id=$1 AND company_key=$2", [first.context.tenantId, key])).rows)).toEqual([]);
  expect(await withTenant(c.runtime, context, async db => (await db.$client.query("UPDATE app.firm_profile SET trading_name='Stolen' WHERE tenant_id=$1 AND company_key=$2", [first.context.tenantId, key])).rowCount)).toBe(0);
  await expect(withTenant(c.runtime, context, db => db.$client.query("INSERT INTO app.firm_profile(tenant_id,company_key,trading_name) VALUES($1,$2,'Stolen')", [first.context.tenantId, key]))).rejects.toThrow(/row-level security/);
 }
 await repo.save(second.context, { ...profile, tradingName: "Fictional Other Works" });
 expect((await repo.read(first.context)).profile?.tradingName).toBe("Fictional Oak Works");
 const next = await startBlankPracticeCompany(c.runtime, { ...start, action: "reset" }, token);
 expect((await repo.read((await authenticatePracticeSession(c.runtime, next)).context)).profile).toBeNull();
 expect((await c.admin.query("SELECT count(*)::int n FROM app.firm_profile WHERE tenant_id=$1 AND company_key=$2", [first.context.tenantId, key])).rows[0].n).toBe(1);
});
it("freezes the saved issuer in an issued document and uses a changed profile only in new document versions", async () => {
 const company = await startSession(c), context = company.context, tenant = company.p.tenantId;
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
 const company = await startSession(c), repo = new FirmProfileRepository(c.runtime);
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
