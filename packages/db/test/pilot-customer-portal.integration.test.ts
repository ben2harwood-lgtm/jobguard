import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { evaluateMustSurface, renderQuotePdf } from "@jobguard/core";
import { startBeforeMigration, type Cluster } from "./contractor-practice-session-fixtures.js";
import { workerFixturePool } from "./worker-login-fixture.js";
import { testBoundTenantContext } from "./tenant-context-test-utils.js";
import { CUSTOMER_MESSAGE_SAFETY_TEXT } from "../src/customer-message-fixtures.js";
import { decodeJobSourceFixture } from "../src/job-source-fixtures.js";
import { migrate } from "../src/migrate.js";
import { WorkerActionExecutor } from "../src/worker-action-executor.js";
import { CommercialEmailOutbox } from "../src/commercial-email-outbox.js";
import { InvoiceEmailRepository } from "../src/invoice-email-repository.js";
import { customerSigninLink, type OutboundAdapter } from "../src/outbox.js";
import { FirmProfileRepository } from "../src/firm-profile-repository.js";
import { PilotJobRepository } from "../src/pilot-job-repository.js";
import { PilotQuoteDeliveryRepository } from "../src/pilot-quote-delivery-repository.js";
import { QuoteRepository } from "../src/quote-repository.js";
import { seedSyntheticPartyFixture } from "../src/synthetic-party-fixture.js";

const migration = "0775_pilot_customer_portal.sql";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const hmac = (value: string) => createHmac("sha256", "fictional-pilot-customer-fixture").update(value).digest("hex");
const recipient = "practice-customer@example.invalid";
const refused = { code: "42501", message: "CUSTOMER_REFUSED" };
let cluster: Cluster;

async function routineAuthority() {
  return (await cluster.admin.query(`
    SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args,
      p.proowner,p.proacl,p.prosecdef,p.proconfig
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE (n.nspname,p.proname) IN (
      ('app','job_source_insert_guard'),('app','lp11_customer_operation'),('app','lp11_open_customer_scope'),('app','customer_portal_current'),('app','customer_portal_issuer'),
      ('identity','customer_portal_issue'),('identity','customer_portal_use'),('identity','customer_portal_quote'))
    ORDER BY n.nspname,p.proname`)).rows;
}

beforeAll(async () => {
  cluster = await startBeforeMigration(migration, "jobguard_pilot_portal_fixture");
  const before = await routineAuthority();
  expect(before).toHaveLength(8);
  await migrate(cluster.admin);
  await migrate(cluster.admin);
  expect(await routineAuthority()).toEqual(before);
}, 180_000);

afterAll(async () => { await cluster?.close(); });

async function identity(sql: string, args: unknown[], prepare?: (client: PoolClient) => Promise<unknown>) {
  const client = await cluster.admin.connect();
  try {
    await client.query("BEGIN");
    await prepare?.(client);
    await client.query("SET LOCAL ROLE jobguard_identity");
    const { rows } = await client.query(sql, args);
    await client.query("COMMIT");
    return rows[0]?.result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

async function ready(checkedEmail = false) {
  const [tenant, account, member, user, jobId, scope, revision] = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const db = cluster.admin;
  const builder = hmac(randomUUID());
  await db.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenant]);
  await db.query("INSERT INTO identity.identity_user(id) VALUES($1)", [user]);
  await db.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2)", [`${user}@fixture.invalid`, user]);
  await db.query("INSERT INTO app.account(tenant_id,id,name) VALUES($1,$2,'Fictional builder')", [tenant, account]);
  await db.query("INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [tenant, member, account, user]);
  await db.query("INSERT INTO identity.membership_locator(user_id,tenant_id,membership_id) VALUES($1,$2,$3)", [user, tenant, member]);
  await db.query("INSERT INTO identity.session(id,user_id,token_digest,csrf_token,expires_at,environment) VALUES($1,$2,$3,'fixture',clock_timestamp()+interval '1 hour','pilot_no_charge')", [randomUUID(), user, builder]);
  await db.query("INSERT INTO app.job(tenant_id,id,title,status,revision) VALUES($1,$2,'Fictional pilot job','quoting',1)", [tenant, jobId]);
  const fixture = await db.connect();
  try { await seedSyntheticPartyFixture(fixture, tenant, jobId); }
  finally { fixture.release(); }
  const { customer_id: customer } = (await db.query(
    "SELECT b.customer_id FROM app.job_party_current p JOIN app.job_party_binding b ON (p.tenant_id,p.job_id,p.binding_id)=(b.tenant_id,b.job_id,b.id) WHERE p.tenant_id=$1 AND p.job_id=$2",
    [tenant, jobId],
  )).rows[0];
  await db.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES($1,$2,'small_builder','pilot_no_charge','pilot_capture')", [tenant, jobId]);
  await db.query("INSERT INTO app.scope_identity(tenant_id,id,job_id,state) VALUES($1,$2,$3,'confirmed')", [tenant, scope, jobId]);
  await db.query(`INSERT INTO app.scope_revision(tenant_id,id,job_id,scope_item_id,revision,description,quantity_decimal,unit,unit_price_pence,total_pence)
    VALUES($1,$2,$3,$4,1,'Fictional work','1','item',10000,10000)`, [tenant, revision, jobId, scope]);
  const context = await testBoundTenantContext(db, tenant, member, builder);
  await new FirmProfileRepository(cluster.runtime).save(context, {
    version: "firm-profile.v1", tradingName: "Fictional builder", addressLines: ["1 Fixture Lane"], contactEmail: "builder@fixture.invalid", contactPhone: "",
  });
  await new QuoteRepository(cluster.runtime).saveDraft(context, {
    jobId: jobId, draftId: randomUUID(), expectedRevision: 0, currency: "GBP", taxPolicyVersion: "candidate_m1_standard_v1",
    blockingQuestions: [], effectiveAt: new Date(), actorRef: member, lines: [{
      id: randomUUID(), scopeItemId: scope, scopeRevisionId: revision, description: "Fictional work", origin: "captured",
      included: true, exclusionReason: null, quantity: "1", unit: "item", unitRatePence: 10000, discountPercent: "0",
      taxTreatment: "standard_rate_20", rateProvenance: "entered", category: "Work", region: null,
    }],
  });
  const delivery = new PilotQuoteDeliveryRepository(cluster.runtime);
  const document = await delivery.preview(context, jobId, recipient, 1);
  const preview = { ...document, hash: createHash("sha256").update(renderQuotePdf(document.document)).digest("hex") };
  expect(preview.document.cancellationKit).toMatchObject({ reference: preview.document.reference, quoteRevisionId: preview.document.quoteRevisionId });
  await delivery.issue(context, jobId, { documentId: preview.documentId, contentHash: preview.hash, recipient, commandId: randomUUID() },
    { actorMembershipId: member, checkGate: () => {} });
  const reference = `customer-signin-reference.v1:${tenant}/${jobId}/${customer}/${randomBytes(32).toString("base64url")}`;
  const link = customerSigninLink(reference, hmac).split("/").at(-1)!;
  const digest = hmac(`customer-link:${link}`);
  const issue = (identityId: string, prepare?: (client: PoolClient) => Promise<unknown>) => identity(
    "SELECT identity.customer_portal_issue($1,$2,$3,$4,$5,$6) result", [tenant, builder, jobId, identityId, digest, reference], prepare,
  );
  await expect(issue(randomUUID())).rejects.toMatchObject(refused);
  await expect(issue(customer, client => client.query(
    "UPDATE app.membership SET role='finance' WHERE tenant_id=$1 AND id=$2", [tenant, member],
  ))).rejects.toMatchObject(refused);
  const grant = await issue(customer);
  const email = (await db.query(`SELECT o.id,o.adapter,o.recipient,o.immutable_content
    FROM app.customer_portal_grant g JOIN app.action_outbox o ON (o.tenant_id,o.id)=(g.tenant_id,g.outbox_id)
    WHERE g.tenant_id=$1 AND g.id=$2`, [tenant, grant])).rows[0];
  expect(email).toMatchObject({ adapter: "fake_email", recipient, immutable_content: reference });
  expect(email.immutable_content).not.toContain(link);
  const session = hmac(randomUUID());
  const redeem = (token: string, forJob = jobId, forCustomer = customer, prepare?: (client: PoolClient) => Promise<unknown>) =>
    identity("SELECT identity.customer_portal_use($1,$2,$3,$4,$5,'redeem') result", [tenant, forJob, forCustomer, token, session], prepare);
  const inbox = new Map<string, string>();
  const adapter: OutboundAdapter = {
    name: "fake_email", supportsProviderDeduplication: true,
    async deliver(action, signinLink) {
      expect(action.recipient).toBe(recipient);
      expect(signinLink).toBeDefined();
      expect(inbox.size).toBe(0);
      inbox.set(action.recipient!, signinLink!);
      return { kind: "succeeded", providerReference: "pilot-fixture-mailbox" };
    },
    async reconcile() { return "succeeded"; },
  };
  const worker = await workerFixturePool(db);
  const adapters = new Map([[adapter.name, adapter]]);
  if (checkedEmail) {
    const executor = new CommercialEmailOutbox(worker, adapters, { emit() {} }, hmac, () => true);
    const payload = { actionId: email.id, tenantId: tenant };
    expect(await executor.discover()).toContainEqual(payload);
    await executor.execute(payload);
    await executor.execute(payload);
  } else {
    const executor = new WorkerActionExecutor(worker, adapters, { emit() {} }, hmac);
    await executor.execute(email.id);
    await executor.execute(email.id);
  }
  expect(inbox.get("uninvited@fixture.invalid")).toBeUndefined();
  const delivered = inbox.get(recipient)!;
  expect(delivered).toBe(`/customer/sign-in#${tenant}/${jobId}/${customer}/${link}`);
  await expect(redeem(hmac("forged"))).rejects.toMatchObject(refused);
  await expect(redeem(digest, randomUUID())).rejects.toMatchObject(refused);
  await expect(redeem(digest, jobId, randomUUID())).rejects.toMatchObject(refused);
  await expect(redeem(digest, jobId, customer, client => client.query(
    "UPDATE app.customer_portal_grant SET issued_at=issued_at-interval '11 minutes',expires_at=expires_at-interval '11 minutes' WHERE tenant_id=$1 AND id=$2", [tenant, grant],
  ))).rejects.toMatchObject(refused);
  await expect(redeem(digest, jobId, customer, client => client.query(
    "UPDATE app.customer_portal_grant SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [tenant, grant],
  ))).rejects.toMatchObject(refused);
  await expect(redeem(digest, jobId, customer, client => client.query(
    `INSERT INTO app.customer_revision(tenant_id,id,customer_id,revision,payload)
     SELECT tenant_id,$3,customer_id,revision+1,payload FROM app.customer_revision WHERE tenant_id=$1 AND customer_id=$2`,
    [tenant, customer, randomUUID()],
  ))).rejects.toMatchObject(refused);
  await redeem(hmac(`customer-link:${delivered.split("/").at(-1)}`));
  await expect(redeem(digest)).rejects.toMatchObject(refused);
  return { tenant, member, jobId, customer, grant, builder, session, context, preview };
}

it("dispatches the exact queued quote and portal invite with the pilot commercial email outbox", async () => {
  const w = await ready(true);
  const { outbox_action_id: actionId } = (await cluster.admin.query(
    "SELECT outbox_action_id FROM app.quote_send WHERE (tenant_id,document_id)=($1,$2)", [w.tenant, w.preview.documentId],
  )).rows[0];
  let calls = 0;
  const adapter: OutboundAdapter = {
    name: "fake_quote_delivery", supportsProviderDeduplication: false,
    async deliver(action) {
      calls++;
      expect(action.recipient).toBe(JSON.stringify([recipient]));
      expect(Buffer.from(action.immutableContent)).toEqual(Buffer.from(renderQuotePdf(w.preview.document)));
      // A different connection sees the committed claim before the fake runs.
      expect((await cluster.admin.query("SELECT status FROM app.action_outbox WHERE id=$1", [actionId])).rows[0].status).toBe("executing");
      return { kind: "outcome_unknown", code: "FIXTURE_TIMEOUT" };
    },
    async reconcile() { return "unknown"; },
  };
  const worker = await workerFixturePool(cluster.admin);
  const outbox = new CommercialEmailOutbox(worker, new Map([[adapter.name, adapter]]), { emit() {} }, hmac, () => true);
  await outbox.execute({ actionId, tenantId: randomUUID() });
  expect(calls).toBe(0);
  await Promise.all([outbox.execute({ actionId, tenantId: w.tenant }), outbox.execute({ actionId, tenantId: w.tenant })]);
  await outbox.execute({ actionId, tenantId: w.tenant });
  expect(calls).toBe(1);
  expect((await cluster.admin.query("SELECT outcome FROM app.action_attempt WHERE action_id=$1", [actionId])).rows).toEqual([{ outcome: "outcome_unknown" }]);
  await expect(cluster.runtime.query("SELECT * FROM app.pilot_email_signals()")).rejects.toMatchObject({ code: "42501" });
  await expect(worker.query("SELECT * FROM app.quote_document_version")).rejects.toMatchObject({ code: "42501" });
});

it("preserves queued quote evidence when a newer customer revision makes the send stale", async () => {
  const w = await ready();
  const { outbox_action_id: actionId } = (await cluster.admin.query(
    "SELECT outbox_action_id FROM app.quote_send WHERE (tenant_id,document_id)=($1,$2)", [w.tenant, w.preview.documentId],
  )).rows[0];
  await cluster.admin.query(`INSERT INTO app.customer_revision(tenant_id,id,customer_id,revision,payload)
    SELECT tenant_id,$3,customer_id,revision+1,payload || '{"email":"new@fictional.invalid"}'
    FROM app.customer_revision WHERE (tenant_id,customer_id)=($1,$2)`, [w.tenant, w.customer, randomUUID()]);
  const adapter: OutboundAdapter = {
    name: "fake_quote_delivery", supportsProviderDeduplication: false,
    async deliver() { throw new Error("Fixture must stay queued"); },
    async reconcile() { return "unknown"; },
  };
  const outbox = new CommercialEmailOutbox(await workerFixturePool(cluster.admin), new Map([[adapter.name, adapter]]),
    { emit() {} }, hmac, () => true);
  await outbox.execute({ actionId, tenantId: w.tenant });
  expect((await cluster.admin.query("SELECT status,content_hash FROM app.action_outbox WHERE id=$1", [actionId])).rows)
    .toEqual([{ status: "pending", content_hash: w.preview.hash }]);
  expect((await cluster.admin.query("SELECT id FROM app.action_attempt WHERE action_id=$1", [actionId])).rows).toEqual([]);
});

it("stages an existing invoice with separate fake delivery approval and its server amount", async () => {
  const w = await ready();
  const { tenant, jobId, context, member } = w;
  const [baseline, draft, revision, invoice, decision, resolution, approval] = Array.from({ length: 7 }, () => randomUUID());
  const content = "Fictional PDF bytes";
  const contentHash = hash(content);
  const amount = 12000;
  const db = cluster.admin;
  await db.query(`INSERT INTO app.quote_version(id,tenant_id,job_id,version,content_hash,net_value_pence,status)
    VALUES($1,$2,$3,1,$4,10000,'accepted')`, [baseline, tenant, jobId, w.preview.hash]);
  await db.query("INSERT INTO app.final_account_draft(id,tenant_id,job_id) VALUES($1,$2,$3)", [draft, tenant, jobId]);
  await db.query(`INSERT INTO app.final_account_revision(id,tenant_id,job_id,final_account_draft_id,revision,source_hash,
    baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings)
    VALUES($1,$2,$3,$4,1,$5,$6,'GBP','candidate_m1_standard_v1',10000,2000,$7,false,'[]')`,
  [revision, tenant, jobId, draft, w.preview.hash, baseline, amount]);
  await db.query("UPDATE app.final_account_draft SET current_revision_id=$1,revision=1 WHERE (tenant_id,id)=($2,$3)",
    [revision, tenant, draft]);
  await db.query("INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES($1,$2,'job',$3,'final_account.issue')", [decision, tenant, jobId]);
  await db.query("INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES($1,$2,$3,'approved',$4)",
    [resolution, tenant, decision, member]);
  await db.query(`INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,
    content_hash,aggregate_revision,amount_pence,currency,policy_version,expires_at)
    VALUES($1,$2,$3,$4,$5,'final_account.issue',$6,1,$7,'GBP','candidate_m1_standard_v1',clock_timestamp()+interval '1 hour')`,
  [approval, tenant, decision, resolution, member, contentHash, amount]);
  await db.query(`INSERT INTO app.customer_invoice(id,tenant_id,job_id,final_account_revision_id,authorization_id,invoice_number,
    issued_on,issuer_details,tax_policy_version,currency,net_pence,tax_pence,total_pence,source_hash,pdf_sha256,pdf_bytes,synthetic,watermark)
    VALUES($1,$2,$3,$4,$5,'FIXTURE-001',current_date,'{}','candidate_m1_standard_v1','GBP',10000,2000,$6,$7,$8,$9,true,'SYNTHETIC - NOT A REAL INVOICE')`,
  [invoice, tenant, jobId, revision, approval, amount, w.preview.hash, contentHash, Buffer.from(content)]);
  await db.query(`INSERT INTO app.action_outbox(id,tenant_id,authorization_id,adapter,provider_effect_key,action_type,content_hash,
    immutable_content,aggregate_revision,amount_pence,currency,policy_version,authorization_expires_at,status,completed_at)
    SELECT $1,tenant_id,id,'fake_invoice_delivery',$2,action_type,content_hash,$3,aggregate_revision,amount_pence,currency,
    policy_version,expires_at,'succeeded',clock_timestamp() FROM app.action_authorization WHERE id=$4`,
  [randomUUID(), `invoice:${invoice}`, content, approval]);
  const service = new InvoiceEmailRepository(cluster.runtime);
  const input = { version: "invoice-email.v1", commandId: randomUUID(), invoiceId: invoice, contentHash, revision: 1, recipient };
  const pilot = { actorMembershipId: member, checkGate() {} };
  await expect(service.stage(context, jobId, { ...input, recipient: "wrong@fixture.invalid" }, pilot)).rejects.toThrow("INVOICE_EMAIL_CHANGED");
  const staged = await service.stage(context, jobId, input, pilot);
  expect(await service.stage(context, jobId, input, pilot)).toEqual(staged);
  const rows = (await db.query("SELECT id,status FROM app.action_outbox WHERE tenant_id=$1 AND action_type='customer_invoice.send'", [tenant])).rows;
  expect(rows).toHaveLength(1);
  expect(rows[0].status).toBe("pending");
  let calls = 0;
  const adapter: OutboundAdapter = {
    name: "fake_invoice_delivery", supportsProviderDeduplication: false,
    async deliver(action) {
      calls++;
      expect(action).toMatchObject({ immutableContent: content, amountPence: amount, currency: "GBP", recipient, contentHash });
      return { kind: "succeeded", providerReference: "fictional-invoice-receipt" };
    },
    async reconcile() { return "unknown"; },
  };
  const outbox = new CommercialEmailOutbox(await workerFixturePool(db), new Map([[adapter.name, adapter]]),
    { emit() {} }, hmac, () => true);
  await outbox.execute({ actionId: rows[0].id, tenantId: tenant });
  expect(calls).toBe(1);
});

it("pins the issued quote, accepts once at database time and admits the authenticated acceptance to no-charge activation", async () => {
  const w = await ready();
  const keys = [w.tenant, w.jobId, w.customer, w.session];
  const quote = (input: unknown) => identity("SELECT identity.customer_portal_quote($1,$2,$3,$4,$5::jsonb) result", [...keys, JSON.stringify(input)]);
  await expect(identity("SELECT identity.customer_practice_pay_now($1,$2,$3,$4) result", keys)).rejects.toMatchObject(refused);
  const view = await quote({ version: "customer-quote-read.v1", jobId: w.jobId });
  expect(view.quote).toMatchObject({ id: w.preview.documentId, hash: w.preview.hash, document: { cancellationKit: w.preview.document.cancellationKit } });
  const target = { kind: "quote", id: view.quote.id, revision: view.quote.revision, hash: view.quote.hash };
  const command = { version: "customer-quote-acceptance.v1", commandId: randomUUID(), jobId: w.jobId, expectedJobRevision: view.jobRevision, target };
  await expect(quote({ ...command, target: { ...target, hash: hash("stale") } })).rejects.toMatchObject(refused);
  await expect(quote({ ...command, acceptedAt: "2020-01-01T00:00:00Z" })).rejects.toMatchObject(refused);
  const before = (await cluster.admin.query("SELECT clock_timestamp() t")).rows[0].t;
  const [first, replay] = await Promise.all([quote(command), quote(command)]);
  expect(first).toEqual(replay);
  const accepted = (await cluster.admin.query("SELECT acceptance_kind,accepted_at,actor_membership_id,accepted_total_pence FROM app.quote_acceptance WHERE tenant_id=$1 AND job_id=$2", keys.slice(0, 2))).rows;
  expect(accepted).toHaveLength(1);
  expect(accepted[0]).toMatchObject({ acceptance_kind: "customer_authenticated", actor_membership_id: null, accepted_total_pence: String(w.preview.document.totalPence) });
  expect(accepted[0].accepted_at.getTime()).toBeGreaterThanOrEqual(before.getTime());
  const builder = new PilotJobRepository(cluster.runtime);
  const exact = await builder.quote(w.context, w.jobId);
  expect(exact.acceptance?.method).toBe("customer_authenticated");
  await builder.activate(w.context, w.jobId, w.member, {
    commandId: randomUUID(), documentId: target.id, documentHash: target.hash, documentVersion: target.revision, expectedJobRevision: exact.jobRevision,
  }, () => {});

  const message = { version: "customer-portal-message.v1", jobId: w.jobId, commandId: randomUUID(), text: CUSTOMER_MESSAGE_SAFETY_TEXT };
  const send = () => identity("SELECT identity.customer_portal_message($1,$2,$3,$4,$5::jsonb) result", [...keys, JSON.stringify(message)]);
  const [saved, repeated] = await Promise.all([send(), send()]);
  expect(saved).toEqual(repeated);
  expect(saved.record.evidence.sha256).toBe(hash(message.text));
  const originals = (await cluster.admin.query("SELECT synthetic_fixture_ref,convert_from(bytes,'UTF8') text FROM app.job_source_original WHERE tenant_id=$1 AND job_id=$2", keys.slice(0, 2))).rows;
  expect(originals).toHaveLength(1);
  const observation = decodeJobSourceFixture(originals[0].synthetic_fixture_ref, originals[0].text, "customer_request");
  expect(observation).not.toBeNull();
  const { significantWork: _significance, ...facts } = observation!.facts;
  expect(evaluateMustSurface({
    version: "shadow-must-surface.v1", policyVersion: "shadow_attribution_policy_v3", sourceRef: saved.record.evidence.id,
    safetyImplication: facts.safetyImplication, customerClearlyRequested: facts.customerClearlyRequested,
    needsPriorWrittenAgreement: facts.needsPriorWrittenAgreement, activeDispute: facts.activeDispute,
    silenceMateriallyWorsensDispute: facts.silenceMateriallyWorsensDispute, disclosureDuty: facts.disclosureDuty,
  }).firedRules).toContainEqual(expect.objectContaining({ rule: "safety" }));
  const audit = JSON.stringify((await cluster.admin.query("SELECT payload FROM app.audit_event WHERE tenant_id=$1", [w.tenant])).rows);
  for (const value of [recipient, "Practice Customer", message.text]) expect(audit).not.toContain(value);

  await identity("SELECT identity.customer_portal_revoke($1,$2,$3,$4)", [w.tenant, w.builder, w.jobId, w.grant]);
  await expect(send()).rejects.toMatchObject(refused);
  await expect(quote(command)).rejects.toMatchObject(refused);
}, 60_000);
