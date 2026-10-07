import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { contractorRoles, customerTypes, referenceApprovalRulesV1, jobPartiesCommandResultV1, type ContractorPartyImport } from "@jobguard/core";
import { ContractorRepository, ContractorPartyRepository, assertContractorPartiesRequired, JobRepository, JobPartiesRepository, migrate, MIGRATION_URLS, verifiedTenantContextFromMembership, withTenant, type AuthenticatedMembership, type TenantTransaction } from "../src/index.js";
import { closeTestPools } from "./pool-test-utils.js";
let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, dir: string, contractors: ContractorRepository, parties: ContractorPartyRepository;
const tables = ["contractor_client_customer", "contractor_party_binding", "contractor_resident_contact"];
const document = { version: "client-contract.v1", reference: "FICTIONAL", startsOn: "2026-10-01", endsOn: null, sorVersionIds: [], tenderedAdjustment: { numerator: "0", denominator: "1" }, photoRule: "required", vatCode: "synthetic-unreviewed", exportedNotBilledAlertDays: 30 };
const resident = { kind: "contact" as const, contact: { version: "resident-contact.v1" as const, name: "Fictional Resident Canary", phone: "00000123456", email: "resident-canary@example.invalid" } };
const linkInput = (customerRevisionId: string) => ({ version: "contractor-customer-link.v1", environment: "synthetic_demo", commandId: randomUUID(), customerRevisionId });
const ctx = (p: AuthenticatedMembership) => verifiedTenantContextFromMembership(p);
const query = (p: AuthenticatedMembership) => contractors.query(p, { version: "contractor-query.v1", tenantId: p.tenantId, resource: "organisation" });
const command = async (p: AuthenticatedMembership, fields: Record<string, unknown>) => contractors.command(p, { version: "contractor-command.v1", environment: "synthetic_demo", commandId: randomUUID(), id: randomUUID(), expectedRevision: (await query(p)).revision, ...fields });
async function setup(type = "insurer") {
  const session = randomUUID(), p = await contractors.startPractice(session), v = await query(p);
  const job = (await new JobRepository(runtime).create(ctx(p), ["job:update"], { title: "Fictional contractor job" })).id as string;
  const jp = new JobPartiesRepository(runtime);
  const customer = jobPartiesCommandResultV1.parse(await jp.command(ctx(p), p.membershipId, job, { version: "job-parties-command.v1", commandId: randomUUID(), action: "create_customer", customer: { version: "customer.v1", name: "Fictional Client", type, email: "client@example.invalid" } }));
  const site = jobPartiesCommandResultV1.parse(await jp.command(ctx(p), p.membershipId, job, { version: "job-parties-command.v1", commandId: randomUUID(), action: "create_site", site: { version: "site.v1", addressLines: ["1 Fictional Street"], town: "London", postcode: "SW1A1AA" } }));
  const client = (await command(p, { kind: "client.create", branchId: v.teams[0]!.branch_id, name: "Fictional Client", clientType: type })).id;
  const contract = randomUUID(); await command(p, { kind: "contract.revise", clientId: client, contractId: contract, document, rules: referenceApprovalRulesV1 });
  const input: ContractorPartyImport = { version: "contractor-party-import.v1", environment: "synthetic_demo", commandId: randomUUID(), jobId: job, workOrderId: randomUUID(), expectedJobRevision: 0, clientId: client, contractId: contract, siteRevisionId: site.revisionId!, resident };
  return { session, p, v, job, jp, customer, site, client, contract, input };
}
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "jg-ch3b-")); const port = 58500 + Math.floor(Math.random() * 300);
  postgres = new EmbeddedPostgres({ databaseDir: dir, port, user: "postgres", password: "synthetic", persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start();
  const control = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic", database: "postgres" }); await control.query("CREATE DATABASE jobguard_synthetic_demo"); await control.end();
  admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic", database: "jobguard_synthetic_demo" });
  await admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  for (const url of MIGRATION_URLS.slice(0, -1)) { await admin.query(await readFile(url, "utf8")); await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [url.pathname.split("/").at(-1)]); }
  await migrate(admin); await migrate(admin);
  await admin.query("CREATE ROLE ch3b_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT jobguard_runtime TO ch3b_login");
  runtime = new Pool({ host: "127.0.0.1", port, user: "ch3b_login", password: "synthetic", database: "jobguard_synthetic_demo", max: 6 });
  contractors = new ContractorRepository(runtime); parties = new ContractorPartyRepository(runtime);
}, 120000);
afterAll(async () => { await closeTestPools(runtime, admin); await postgres?.stop(); if (dir) await rm(dir, { recursive: true, force: true }); });
const rawBind = (db: TenantTransaction, p: AuthenticatedMembership, input: unknown) => db.$client.query("SELECT app.bind_contractor_parties($1,$2::jsonb) result", [p.membershipId, JSON.stringify(input)]);
describe("CH-3b PostgreSQL guarantees", () => {
  it("DW1 refuses each absent party atomically in the controlled routine", async () => {
    const f = await setup(); await parties.linkCustomer(f.p, f.client, linkInput(f.customer.revisionId!));
    for (const key of ["clientId", "contractId", "siteRevisionId", "resident"]) {
      const input = { ...f.input, [key]: null };
      await assertContractorPartiesRequired(() => withTenant(runtime, ctx(f.p), db => rawBind(db, f.p, input)));
      const counts = await withTenant(runtime, ctx(f.p), db => db.$client.query("SELECT (SELECT count(*) FROM app.contractor_party_binding WHERE job_id=$1)::int bindings,(SELECT count(*) FROM app.command_receipt WHERE command_id=$2)::int receipts,(SELECT count(*) FROM app.audit_event WHERE subject_ref=$1::text)::int audit,(SELECT count(*) FROM app.action_outbox)::int outbox", [f.job, f.input.commandId]));
      // create_customer/site have their own audit; refusal must leave the exact prior projection unchanged.
      expect(counts.rows[0]).toMatchObject({ bindings: 0, receipts: 0, outbox: 0, audit: 2 });
    }
    await expect(parties.bind(f.p, f.input)).resolves.toMatchObject({ realExternalActions: 0 });
  });
  it("DW2 enforces every identical customer type and refuses every other type", async () => {
    for (const clientType of customerTypes.filter(t => t !== "business")) {
      const f = await setup(clientType);
      for (const type of customerTypes.filter(t => t !== clientType)) {
        const c = jobPartiesCommandResultV1.parse(await f.jp.command(ctx(f.p), f.p.membershipId, f.job, { version: "job-parties-command.v1", commandId: randomUUID(), action: "create_customer", customer: { version: "customer.v1", name: "Fictional mismatch", type } }));
        await expect(parties.linkCustomer(f.p, f.client, linkInput(c.revisionId!))).rejects.toMatchObject({ code: "CUSTOMER_TYPE_MISMATCH" });
      }
      await parties.linkCustomer(f.p, f.client, linkInput(f.customer.revisionId!));
      expect((await withTenant(runtime, ctx(f.p), db => db.$client.query("SELECT customer_id FROM app.contractor_client_customer WHERE client_id=$1", [f.client]))).rows).toEqual([{ customer_id: f.customer.id }]);
    }
  }, 60000);
  it("DW2 refuses another client's or tenant's contract through the composite FK", async () => {
    const a = await setup(), b = await setup(); await parties.linkCustomer(a.p, a.client, linkInput(a.customer.revisionId!));
    const otherClient = (await command(a.p, { kind: "client.create", branchId: a.v.teams[0]!.branch_id, name: "Fictional Other Client", clientType: "insurer" })).id;
    for (const input of [{ ...a.input, clientId: otherClient }, { ...a.input, contractId: b.contract }]) {
      // Existing link is required for the other client too; no direct fixture writes.
      if (input.clientId === otherClient) await parties.linkCustomer(a.p, otherClient, linkInput(a.customer.revisionId!));
      await expect(withTenant(runtime, ctx(a.p), db => rawBind(db, a.p, input))).rejects.toMatchObject({ code: "23503" });
    }
    expect((await withTenant(runtime, ctx(a.p), db => db.$client.query("SELECT * FROM app.contractor_party_binding"))).rows).toEqual([]);
    await expect(parties.linkCustomer(a.p, a.client, linkInput(b.customer.revisionId!))).rejects.toMatchObject({ code: "PARTY_NOT_FOUND" });
  });
  it("DW3 denies unresolved job scopes, all excluded roles and unknown IDs identically", async () => {
    const f = await setup(); await parties.linkCustomer(f.p, f.client, linkInput(f.customer.revisionId!)); await parties.bind(f.p, f.input);
    for (const role of contractorRoles) {
      const id = randomUUID(), scope = role === "client_approver" ? { kind: "client", id: f.client } : role === "operative" ? { kind: "team", id: f.v.teams[0]!.id } : { kind: "tenant", id: f.p.tenantId };
      await command(f.p, { kind: "member.invite", id, role, email: `${id}@fictional.invalid`, scope, clientId: role === "client_approver" ? f.client : null, contractId: null });
      const row = (await withTenant(runtime, ctx(f.p), db => db.$client.query("SELECT identity_user_id FROM app.membership WHERE id=$1", [id]))).rows[0];
      const actor = { ...f.p, membershipId: id, identityUserId: row.identity_user_id };
      for (const jobId of [f.job, randomUUID()]) await expect(parties.readResident(actor, jobId)).rejects.toMatchObject({ code: "NOT_FOUND", message: "NOT_FOUND" });
    }
    for (const projection of [await f.jp.list(ctx(f.p), f.p.membershipId), await f.jp.view(ctx(f.p), f.p.membershipId, f.job), await query(f.p), await new JobRepository(runtime).get(ctx(f.p), ["job:view"], f.job)]) {
      const serialized = JSON.stringify(projection); for (const value of Object.values(resident.contact)) expect(serialized).not.toContain(value);
      for (const key of ["resident", "residentContact", "resident_name", "resident_email", "resident_phone"]) expect(serialized).not.toContain(`"${key}"`);
    }
  }, 60000);
  it("DW4 keeps all contact data out of audit, receipts and captured application logs", async () => {
    const spies = [vi.spyOn(console, "log"), vi.spyOn(console, "warn"), vi.spyOn(console, "error")];
    try {
      const f = await setup(); await parties.linkCustomer(f.p, f.client, linkInput(f.customer.revisionId!)); await parties.bind(f.p, f.input);
      await expect(parties.readResident(f.p, f.job)).rejects.toMatchObject({ code: "NOT_FOUND" });
      const records = (await withTenant(runtime, ctx(f.p), db => db.$client.query("SELECT payload FROM app.audit_event WHERE event_type LIKE 'contractor.parties.%' UNION ALL SELECT result FROM app.command_receipt WHERE command_type LIKE 'contractor_parties.%'"))).rows;
      for (const value of Object.values(resident.contact)) expect(JSON.stringify([records, spies.map(s => s.mock.calls)])).not.toContain(value);
    } finally { spies.forEach(s => s.mockRestore()); }
  });
  it("DW5 replays/concurrently binds once and conflicts on changed payload", async () => {
    const f = await setup(); const link = linkInput(f.customer.revisionId!);
    const [a, b] = await Promise.all([parties.linkCustomer(f.p, f.client, link), parties.linkCustomer(f.p, f.client, link)]); expect(a).toEqual(b);
    const [first, replay] = await Promise.all([parties.bind(f.p, f.input), parties.bind(f.p, f.input)]); expect(first).toEqual(replay);
    await expect(parties.bind(f.p, { ...f.input, resident: { kind: "none", reason: "void_property" } })).rejects.toMatchObject({ code: "COMMAND_CONFLICT" });
    await expect(parties.bind(f.p, { ...f.input, commandId: randomUUID() })).rejects.toMatchObject({ code: "STALE_REVISION" });
    const wrongJob = (await new JobRepository(runtime).create(ctx(f.p), ["job:update"], { title: "Fictional wrong-job replay" })).id;
    await expect(parties.bind(f.p, { ...f.input, jobId: wrongJob, commandId: randomUUID() })).rejects.toMatchObject({ code: "STALE_REVISION" });
    expect((await f.jp.view(ctx(f.p), f.p.membershipId, wrongJob)).current).toBeNull();
    expect((await withTenant(runtime, ctx(f.p), db => db.$client.query("SELECT count(*)::int n FROM app.contractor_party_binding"))).rows[0].n).toBe(1);
  });
  it("requires the audit in the caller transaction and rolls back missing audit", async () => {
    const f = await setup(); await parties.linkCustomer(f.p, f.client, linkInput(f.customer.revisionId!));
    await expect(withTenant(runtime, ctx(f.p), db => rawBind(db, f.p, f.input))).rejects.toMatchObject({ code: "23514" });
    expect((await withTenant(runtime, ctx(f.p), db => db.$client.query("SELECT * FROM app.job_party_current WHERE job_id=$1", [f.job]))).rows).toEqual([]);
  });
  it("catalogs ownership, FORCE RLS, exact routine grants and denies raw runtime mutation/PII reads", async () => {
    const f = await setup();
    const rows = (await admin.query("SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relname=ANY($1::text[])", [tables])).rows;
    expect(rows).toHaveLength(3); expect(rows.every(r => r.relrowsecurity && r.relforcerowsecurity && r.owner === "jobguard_migration")).toBe(true);
    for (const table of tables) for (const sql of [`INSERT INTO app.${table} DEFAULT VALUES`, `UPDATE app.${table} SET tenant_id=tenant_id`, `DELETE FROM app.${table}`, `TRUNCATE app.${table}`]) await expect(withTenant(runtime, ctx(f.p), db => db.$client.query(sql))).rejects.toMatchObject({ code: "42501" });
    await expect(withTenant(runtime, ctx(f.p), db => db.$client.query("SELECT contact FROM app.contractor_resident_contact"))).rejects.toMatchObject({ code: "42501" });
    for (const signature of ["app.link_contractor_customer(uuid,uuid,jsonb)", "app.bind_contractor_parties(uuid,jsonb)", "app.read_contractor_resident(uuid,uuid)"]) {
      const grants = (await admin.query("SELECT pg_get_userbyid(p.proowner) owner,has_function_privilege('jobguard_runtime',p.oid,'EXECUTE') runtime,has_function_privilege('jobguard_infrastructure',p.oid,'EXECUTE') infrastructure FROM pg_proc p WHERE p.oid=$1::regprocedure", [signature])).rows[0];
      expect(grants).toEqual({ owner: "jobguard_migration", runtime: true, infrastructure: false });
    }
    await expect(runtime.query("SELECT app.bind_contractor_parties($1,$2::jsonb)", [f.p.membershipId, JSON.stringify(f.input)])).rejects.toMatchObject({ message: "NOT_FOUND" });
  });
  it("denies foreign tenant/job, revoked membership, unlinked client and wrong payer without effects", async () => {
    const a = await setup(), b = await setup(); await parties.linkCustomer(a.p, a.client, linkInput(a.customer.revisionId!));
    for (const input of [{ ...a.input, jobId: b.job }, { ...a.input, payingPartyRevisionId: b.customer.revisionId }]) await expect(parties.bind(a.p, input)).rejects.toMatchObject({ code: input.jobId === b.job ? "NOT_FOUND" : "PARTY_NOT_FOUND" });
    await expect(parties.bind(b.p, b.input)).rejects.toMatchObject({ code: "CONTRACTOR_PARTIES_REQUIRED" });
    await command(a.p, { kind: "membership.revoke", membershipId: a.p.membershipId });
    await expect(parties.bind(a.p, a.input)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

it("DW6 contractor tenants keep CH-3a recognition and switch-live guarantees through existing commands", async () => {
  const { QuoteRepository, QuoteDeliveryRepository, RecordBuilderAcceptanceMutation, SwitchJobLiveMutation, UserCommandDispatcher, IssueQuoteMutation } = await import("../src/index.js");
  const f = await setup(), context = ctx(f.p), jobs = new JobRepository(runtime), dispatcher = new UserCommandDispatcher(runtime);
  await parties.linkCustomer(f.p, f.client, linkInput(f.customer.revisionId!)); await parties.bind(f.p, f.input);
  const second = (await jobs.create(context, ["job:update"], { title: "Fictional same site job" })).id;
  await f.jp.command(context, f.p.membershipId, second, { version: "job-parties-command.v1", commandId: randomUUID(), action: "bind", expectedJobRevision: 0, parties: { version: "job-parties.v1", customerRevisionId: f.customer.revisionId, siteRevisionId: f.site.revisionId } });
  expect((await f.jp.view(context, f.p.membershipId, f.job)).recognition.map(r => r.jobId).sort()).toEqual([f.job, second].sort());
  await jobs.transition(context, ["job:update"], { jobId: f.job, expectedRevision: 1, to: "quoting", reason: "start_quote" });
  const proposal = await jobs.reserveProposal(context, ["quote:edit"], { jobId: f.job, sourceHash: "a".repeat(64), sourceReference: "synthetic:ch3b" });
  const scope = await jobs.confirmProposal(context, ["quote:edit"], { jobId: f.job, proposalId: proposal.id, description: "Fictional repair", quantityDecimal: "1", unit: "item", unitPricePence: 10000, totalPence: 10000 });
  await new QuoteRepository(runtime).saveDraft(context, { jobId: f.job, draftId: randomUUID(), expectedRevision: 0, currency: "GBP", taxPolicyVersion: "candidate_m1_standard_v1", effectiveAt: new Date(), actorRef: `membership:${f.p.membershipId}`, lines: [{ id: randomUUID(), scopeItemId: scope.scope_item_id, scopeRevisionId: scope.id, description: "Fictional repair", origin: "captured", included: true, exclusionReason: null, quantity: "1", unit: "item", unitRatePence: 10000, discountPercent: "0", taxTreatment: "standard_rate_20", rateProvenance: "entered", category: "repair", region: "London" }] });
  const artifact = await new QuoteDeliveryRepository(runtime).preview(context, f.job, "client@example.invalid");
  const expiresAt = new Date(Date.now() + 60000), recipients = ["client@example.invalid"];
  await dispatcher.dispatch(context, { version: "command.v1", commandId: randomUUID(), commandType: "quote.send", semanticKey: `quote-send:${artifact.documentId}`, actorMembershipId: f.p.membershipId, subjectType: "quote_document", subjectRef: artifact.documentId, authorizationId: randomUUID(), action: { actionType: "quote.send", recipient: JSON.stringify(recipients), contentHash: artifact.hash, aggregateRevision: artifact.document.documentVersion, amountPence: null, currency: null, policyVersion: "free-quote-send.v1", expiresAt } }, new IssueQuoteMutation({ tenantId: f.p.tenantId, jobId: f.job, documentId: artifact.documentId, outboxActionId: randomUUID(), recipients, immutableContent: new TextDecoder().decode(artifact.pdf) }));
  const revision = (await jobs.get(context, ["job:view"], f.job)).revision;
  await dispatcher.dispatch(context, { version: "command.v1", commandId: randomUUID(), commandType: "quote.acceptance.attest", semanticKey: `accept:${f.job}`, actorMembershipId: f.p.membershipId, subjectType: "quote_document", subjectRef: artifact.documentId, action: { actionType: "quote.acceptance.attest", recipient: null, contentHash: artifact.hash, aggregateRevision: artifact.document.documentVersion, amountPence: 12000, currency: "GBP", policyVersion: "builder-attestation.v1", expiresAt } }, new RecordBuilderAcceptanceMutation(f.p.tenantId, { version: "quote-acceptance.v1", acceptanceId: randomUUID(), jobId: f.job, documentId: artifact.documentId, documentVersion: artifact.document.documentVersion, documentHash: artifact.hash, acceptedTotalPence: 12000, expectedJobRevision: revision, statedCustomerName: "Fictional Client", statedMethod: "email", acceptedAt: new Date(), evidenceId: null }));
  const acceptedRevision = (await jobs.get(context, ["job:view"], f.job)).revision;
  const input = { version: "switch-live.v1", activationId: randomUUID(), capSnapshotId: randomUUID(), syntheticObligationId: randomUUID(), jobId: f.job, acceptedDocumentId: artifact.documentId, acceptedDocumentVersion: artifact.document.documentVersion, acceptedDocumentHash: artifact.hash, expectedJobRevision: acceptedRevision, acceptedNetValuePence: 10000, recoveryCapPence: 150, mode: "synthetic_demo", activationTermsVersion: "synthetic_demo_illustrative.v1", feePolicyVersion: "reference_fee_policy_v1", activatedAt: new Date() };
  const command = { version: "command.v1" as const, commandId: randomUUID(), commandType: "job.switch_live", semanticKey: `switch:${f.job}`, actorMembershipId: f.p.membershipId, subjectType: "job", subjectRef: f.job, action: { actionType: "job.switch_live", recipient: null, contentHash: artifact.hash, aggregateRevision: artifact.document.documentVersion, amountPence: 7900, currency: "GBP" as const, policyVersion: "synthetic_demo_illustrative.v1", expiresAt } };
  const [first, replay] = await Promise.all([dispatcher.dispatch(context, command, new SwitchJobLiveMutation(f.p.tenantId, "synthetic_demo", input)), dispatcher.dispatch(context, command, new SwitchJobLiveMutation(f.p.tenantId, "synthetic_demo", input))]);
  expect(first).toEqual(replay); expect((await jobs.get(context, ["job:view"], f.job)).status).toBe("live");
  expect((await f.jp.view(context, f.p.membershipId, f.job)).recognition.find(r => r.jobId === f.job)?.startedAt).not.toBeNull();
  expect((await withTenant(runtime, context, db => db.$client.query("SELECT count(*)::int n FROM app.job_activation WHERE job_id=$1", [f.job]))).rows[0].n).toBe(1);
}, 60000);


it('uses the actual application/session boundary with PostgreSQL for identical hidden/absent 404s',async()=>{
 const {ContractorPartiesApplication,contractorPartiesHttpFailure}=await import('../../../apps/api/src/contractor/contractor-parties.application.js');
 const previous=process.env.JOBGUARD_ENV;process.env.JOBGUARD_ENV='synthetic_demo';
 try{
  const f=await setup(),app=new ContractorPartiesApplication(runtime),principal={version:'contractor-principal.v1',sessionId:f.session};
  await app.linkCustomer(principal,f.client,linkInput(f.customer.revisionId!));await parties.bind(f.p,f.input);
  const responses=[];
  for(const jobId of [f.job,randomUUID()]){try{await app.readResident(principal,jobId);throw new Error('unexpected resident disclosure');}catch(error){responses.push(contractorPartiesHttpFailure(error));}}
  expect(responses[0]).toEqual(responses[1]);expect(responses[0]).toEqual({status:404,body:{version:'contractor-parties-error.v1',code:'NOT_FOUND',recoverable:false}});
  await expect(app.readResident({version:'contractor-principal.v1',sessionId:randomUUID()},f.job)).rejects.toMatchObject({code:'UNAUTHENTICATED'});
 }finally{if(previous===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=previous;}
});


it('binds the exact customer/payer/site revisions, contract version, provenance and independent retention class',async()=>{
 const f=await setup();await parties.linkCustomer(f.p,f.client,linkInput(f.customer.revisionId!));
 const payer=jobPartiesCommandResultV1.parse(await f.jp.command(ctx(f.p),f.p.membershipId,f.job,{version:'job-parties-command.v1',commandId:randomUUID(),action:'create_customer',customer:{version:'customer.v1',name:'Fictional separate payer',type:'business'}}));
 await parties.bind(f.p,{...f.input,payingPartyRevisionId:payer.revisionId,resident:{kind:'none',reason:'communal_area'}});
 const current=(await f.jp.view(ctx(f.p),f.p.membershipId,f.job)).current!;
 expect(current.customerRevisionId).toBe(f.customer.revisionId);expect(current.payingPartyRevisionId).toBe(payer.revisionId);expect(current.siteRevisionId).toBe(f.site.revisionId);
 const rows=(await withTenant(runtime,ctx(f.p),db=>db.$client.query("SELECT b.provenance,c.contract_version_id,r.retention_class FROM app.contractor_party_binding c JOIN app.job_party_binding b ON(b.tenant_id,b.job_id,b.id)=(c.tenant_id,c.job_id,c.party_binding_id) JOIN app.contractor_resident_contact r ON(r.tenant_id,r.job_id,r.binding_id)=(c.tenant_id,c.job_id,c.id) WHERE c.job_id=$1",[f.job]))).rows;
 expect(rows[0]).toMatchObject({provenance:'work_order_import',retention_class:'contractor_resident_contact_d07_d12_pending'});
 const contractBefore=(await query(f.p)).contracts.find(c=>c.contract_id===f.contract)!;expect(rows[0].contract_version_id).toBe(contractBefore.id);
 await command(f.p,{kind:'contract.revise',clientId:f.client,contractId:f.contract,document:{...document,reference:'FICTIONAL V2'},rules:referenceApprovalRulesV1});
 expect((await withTenant(runtime,ctx(f.p),db=>db.$client.query('SELECT contract_version_id FROM app.contractor_party_binding WHERE job_id=$1',[f.job]))).rows[0].contract_version_id).toBe(contractBefore.id);
});
it('denies a job UUID colliding with an ENT-1 team; team membership is not a job assignment',async()=>{
 const f=await setup();await parties.linkCustomer(f.p,f.client,linkInput(f.customer.revisionId!));
 const job=(await new JobRepository(runtime).create(ctx(f.p),['job:update'],{id:f.v.teams[0]!.id,title:'Fictional colliding ID'})).id;
 await parties.bind(f.p,{...f.input,jobId:job,commandId:randomUUID(),workOrderId:randomUUID()});
 const member=randomUUID();await command(f.p,{kind:'member.invite',id:member,role:'supervisor',email:'supervisor@example.invalid',scope:{kind:'team',id:job},clientId:null,contractId:null});
 const identity=(await withTenant(runtime,ctx(f.p),db=>db.$client.query('SELECT identity_user_id FROM app.membership WHERE id=$1',[member]))).rows[0].identity_user_id;
 const actor={...f.p,membershipId:member,identityUserId:identity};
 expect((await withTenant(runtime,ctx(actor),db=>db.$client.query("SELECT app.contractor_allowed($1,'resident.read',$2) allowed",[member,job]))).rows[0].allowed).toBe(true);
 await expect(parties.readResident(actor,job)).rejects.toMatchObject({code:'NOT_FOUND'});
});
it('refuses a runtime-forged succeeded receipt with no authoritative binding or audit',async()=>{
 const f=await setup();await parties.linkCustomer(f.p,f.client,linkInput(f.customer.revisionId!));
 await expect(withTenant(runtime,ctx(f.p),async db=>{
  const hash=(await db.$client.query("SELECT encode(sha256(convert_to($1::jsonb::text,'UTF8')),'hex') h",[JSON.stringify(f.input)])).rows[0].h;
  await db.$client.query("INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,result,actor_membership_id) VALUES($1,$2,'contractor_parties.bind',$1::text,$3,'succeeded',$4::jsonb,$5)",[f.input.commandId,f.p.tenantId,hash,JSON.stringify({version:'contractor-party-result.v1',environment:'synthetic_demo',commandId:f.input.commandId,id:randomUUID(),realExternalActions:0}),f.p.membershipId]);
 })).rejects.toMatchObject({code:'23514'});
 await expect(parties.bind(f.p,f.input)).resolves.toMatchObject({realExternalActions:0});
});
