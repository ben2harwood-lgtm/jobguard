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

async function ready() {
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
  const executor = new WorkerActionExecutor(await workerFixturePool(db), new Map([[adapter.name, adapter]]), { emit() {} }, hmac);
  await executor.execute(email.id);
  await executor.execute(email.id);
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
