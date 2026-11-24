import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { Pool } from "../../packages/db/node_modules/pg/esm/index.mjs";
import { createIdentityApplication } from "../../apps/api/dist/auth/index.js";
import { DEMO_TENANT_ID, authenticatePracticeSession, withTenant } from "../../packages/db/dist/index.js";
import { embeddedSystemId, storageData, verifyDatabaseTarget } from "./local-targets.mjs";
import { migrationUrl, validateSettings } from "./settings.mjs";

const { settings } = validateSettings({});
const origin = settings.AUTH_ALLOWED_ORIGIN;
const backend = process.env.JOBGUARD_V2_BACKEND ?? "docker";
const embedded = backend === "embedded";
const systemId = embedded ? embeddedSystemId() : process.env.JOBGUARD_V2_TEST_SYSTEM_ID;
const authSecret = readFileSync(new URL("../../.jobguard/v2-auth-secret", import.meta.url), "utf8");
const admin = new Pool({ connectionString: migrationUrl, max: 1 });
const runtime = new Pool({ connectionString: settings.DATABASE_URL, max: 1 });
const identity = createIdentityApplication({ ...settings, AUTH_CODE_SECRET: authSecret });

async function request(path, { body, cookies, csrf } = {}) {
  return fetch(origin + path, {
    headers: { origin, "content-type": "application/json", ...(cookies && { cookie: cookies }),
      ...(csrf && { "x-csrf-token": csrf }) },
    ...(body && { method: "POST", body: JSON.stringify(body) }),
  });
}

async function json(response, status = 200) {
  const body = await response.json();
  assert.equal(response.status, status, body.code ?? response.statusText);
  return body;
}

async function signIn(localPart) {
  const input = { email: localPart + "@jobguard-v2.invalid", purpose: "signin" };
  const { fixtureCode } = await json(await request("/api/auth/request", {
    body: { version: "identity-request.v1", ...input },
  }));
  const response = await request("/api/auth/verify", {
    body: { version: "identity-verify.v1", ...input, code: fixtureCode },
  });
  const { csrfToken } = await json(response);
  const signedIn = response.headers.getSetCookie()[0].split(";", 1)[0];
  const { memberships } = await json(await request("/api/auth/session", { cookies: signedIn }));
  assert.equal(memberships.length, 1);
  assert.equal(memberships[0].role, "owner");
  const practice = await request("/api/auth/practice", {
    cookies: signedIn, csrf: csrfToken, body: { version: "linked-practice-company.v1", action: "enter" },
  });
  await json(practice);
  const sessionCookie = practice.headers.getSetCookie().find(cookie => cookie.startsWith("jg_session="));
  return {
    cookies: [signedIn, ...practice.headers.getSetCookie().map(cookie => cookie.split(";", 1)[0])].join("; "),
    sessionId: sessionCookie.split(";", 1)[0].slice("jg_session=".length),
    realContext: await identity.context({ sessionToken: signedIn.slice("jobguard_session=".length),
      requestedTenantId: memberships[0].tenantId, csrfToken, origin }),
  };
}

const jobsPath = "/api/jobs?tenantId=" + DEMO_TENANT_ID;
const counts = async () => (await admin.query(`SELECT
  (SELECT count(*)::int FROM identity.user_email) AS identities,
  (SELECT count(*)::int FROM control_plane.identity_practice_company) AS firms,
  (SELECT count(*)::int FROM app.job) AS jobs,
  (SELECT count(*)::int FROM app.customer) AS customers,
  (SELECT count(*)::int FROM app.merchant) AS merchants,
  (SELECT count(*)::int FROM app.job_party_binding) AS bindings,
  (SELECT count(*)::int FROM app.material_requirement) AS materials,
  (SELECT count(*)::int FROM app.quote_revision) AS revisions,
  (SELECT count(*)::int FROM app.quote_document_version) AS documents,
  (SELECT count(*)::int FROM app.quote_acceptance) AS acceptances,
  (SELECT count(*)::int FROM app.action_outbox) AS sends`)).rows[0];

let jobId;
before(async () => {
  await verifyDatabaseTarget(admin, systemId, embedded);
  const proposals = await admin.query(`SELECT job_id, model FROM app.job_record_proposal`);
  assert.equal(proposals.rowCount, 1);
  assert.equal(proposals.rows[0].model, "fixture-capture-v1");
  jobId = proposals.rows[0].job_id;
});
after(async () => Promise.all([admin.end(), runtime.end(), identity.provider.repository.pool.end()]));

test("a fresh owner session reloads the fictional job, both work areas and the exact acceptance", async () => {
  const { cookies } = await signIn("builder");
  const first = await json(await request(jobsPath, { cookies }));
  const second = await json(await request(jobsPath, { cookies }));
  assert.deepEqual(second, first);
  assert.equal(first.jobs.length, 1);
  assert.equal(first.jobs[0].id, jobId);
  assert.match(first.jobs[0].title, /Occupied-home kitchen splashback and hall decorating/u);

  const path = `/api/jobs/${jobId}`;
  const capture = await json(await request(path + "/proposal", { cookies }));
  assert.deepEqual(capture.review.lines.map(line => line.room).sort(), ["Hall decorating", "Kitchen splashback"]);
  assert.match(capture.source.text, /tiler@jobguard-v2\.invalid/u);
  assert.match(capture.source.text, /decorator@jobguard-v2\.invalid/u);
  const parties = await json(await request(path + "/parties", { cookies }));
  assert.equal(parties.current.customer.email, "customer@jobguard-v2.invalid");
  const material = await json(await request(path + "/materials", { cookies }));
  assert.equal(material.materials[0].merchant, "Fictional Teacup Tile Merchant");
  const delivery = await json(await request(path + "/quotes/delivery", { cookies }));
  assert.equal(delivery.status, "simulated_delivery");
  assert.equal(delivery.effects.realExternalActions, 0);
  const accepted = await json(await request(path + "/quotes/acceptance", { cookies }));
  assert.deepEqual(await json(await request(path + "/quotes/acceptance", { cookies })), accepted);
  assert.equal(accepted.jobStatus, "accepted");
  assert.equal(accepted.activeAcceptance.documentId, accepted.currentDocument.id);
  assert.equal(accepted.activeAcceptance.documentVersion, accepted.currentDocument.version);
  assert.equal(accepted.activeAcceptance.documentHash, accepted.currentDocument.hash);
  assert.equal(accepted.activeAcceptance.totalPence, accepted.currentDocument.totalPence);
  assert.deepEqual(accepted.effects, { platformObligations: 0, settlements: 0, recoveryFees: 0 });
  assert.equal((await request(`/jobs/${jobId}/work`, { cookies })).status, 200);
});

test("the checked bootstrap reruns without duplicating or delivering anything", async () => {
  const before = await counts();
  assert.deepEqual(before, { identities: 2, firms: 2, jobs: 1, customers: 1, merchants: 1,
    bindings: 1, materials: 1, revisions: 1, documents: 1, acceptances: 1, sends: 1 });
  const targets = Object.fromEntries(Object.entries(settings).filter(([key]) =>
    key !== "MIGRATION_DATABASE_URL" && !(embedded && key.startsWith("S3_"))));
  const result = spawnSync(process.execPath, ["tools/v2/bootstrap.mjs", systemId, backend], {
    env: { PATH: process.env.PATH, ...targets, JOBGUARD_LOCAL_V2: "1", JOBGUARD_V2_BACKEND: backend,
      ...(embedded && { JOBGUARD_V2_STORAGE_DIR: storageData }),
      NODE_OPTIONS: "--import=./tools/v2/network.mjs" },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes(`${origin}/jobs/${jobId}/work#quote`));
  assert.doesNotMatch(result.stdout, /v2\.delivery\.captured/u);
  assert.deepEqual(await counts(), before);
});

test("the second firm's fresh session cannot list or open the job, and forced RLS hides its rows", async () => {
  const { cookies, realContext, sessionId } = await signIn("second-builder");
  assert.deepEqual((await json(await request(jobsPath, { cookies }))).jobs, []);
  for (const suffix of ["proposal", "quotes", "quotes/acceptance"]) {
    assert.deepEqual(await json(await request(`/api/jobs/${jobId}/${suffix}`, { cookies }), 404),
      { code: "NOT_FOUND" });
  }
  assert.notEqual(realContext.tenantId, DEMO_TENANT_ID);
  const { context } = await authenticatePracticeSession(runtime, sessionId);
  const { rows: [runtimeRole] } = await runtime.query(
    "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user",
  );
  assert.deepEqual(runtimeRole, { rolsuper: false, rolbypassrls: false });
  for (const scope of [realContext, context]) {
    await withTenant(runtime, scope, async db => {
      const tables = ["app.job", "app.quote_acceptance", "app.quote_document_version", "app.job_record_proposal", "app.capture_source"];
      const { rows } = await db.$client.query(`SELECT relrowsecurity AND relforcerowsecurity AS forced
        FROM pg_class WHERE oid=ANY($1::regclass[])`, [tables]);
      assert.equal(rows.length, tables.length);
      assert.ok(rows.every(row => row.forced));
      for (const [table, column, value] of [
        ["app.job", "id", jobId],
        ["app.quote_acceptance", "job_id", jobId],
        ["app.quote_document_version", "job_id", jobId],
        ["app.job_record_proposal", "job_id", jobId],
        ["app.capture_source", "id", "e2020000-0000-4000-8000-000000000001"],
      ]) {
        assert.equal((await db.$client.query(`SELECT id FROM ${table} WHERE ${column}=$1`, [value])).rowCount, 0, table);
      }
      const permission = await db.$client.query("SELECT has_column_privilege(current_user,'app.job','title','UPDATE') allowed");
      if (permission.rows[0].allowed) {
        assert.equal((await db.$client.query("UPDATE app.job SET title=title WHERE id=$1", [jobId])).rowCount, 0);
      }
    });
  }
});

// V2-F6: independent reserved migration and command/audit/tenant proof block.
test("V2-F6 exact customer link claims, audit rollback, replay and firm isolation", async () => {
  const { randomBytes, randomUUID } = await import("node:crypto");
  const { V2CustomerExtraLinkRepository } = await import("../../packages/db/dist/index.js");
  const { VariationApplication } = await import("../../apps/api/dist/variation/variation.application.js");
  const { V2CustomerExtraLinkApplication } = await import("../../apps/api/dist/v2-customer-extra-link.application.js");
  const owner = await signIn("builder"), other = await signIn("second-builder");
  const auth = await authenticatePracticeSession(runtime, owner.sessionId);
  const second = await authenticatePracticeSession(runtime, other.sessionId);
  await json(await request(`/api/jobs/${jobId}/quotes/activation`, { cookies: owner.cookies,
    body: { version: "practice-activation-command.v1", commandId: randomUUID(), scenario: "no_charge" } }));
  const variations = new VariationApplication(runtime, owner.sessionId);
  const repository = new V2CustomerExtraLinkRepository(runtime);
  const protectedFacts = async () => (await admin.query(`SELECT
    (SELECT jsonb_agg(to_jsonb(q)) FROM app.quote_acceptance q WHERE job_id=$1) quotes,
    (SELECT jsonb_agg(to_jsonb(i)) FROM app.customer_invoice i WHERE job_id=$1) invoices`, [jobId])).rows;
  const untouched = await protectedFacts();
  const proposalId = randomUUID();
  const proposed = await variations.command(jobId, { version: "variation-command.v1", action: "propose",
    proposalId, scopeItemId: randomUUID(), existingScopeItemId: null, lineageParentScopeItemId: null,
    description: "F6 fictional splashback extension", captureText: "Customer asks for an extension",
    price: { quantity: "1", unit: "item", unitRatePence: 12500, direction: "addition" } });
  const variation = proposed.variations.find(v => v.id === proposalId), revisionId = variation.currentRevisionId;
  const baseline = proposed.approvedAdditionsPence;
  const events = async () => (await admin.query(`SELECT id,event_type,payload FROM app.audit_event
    WHERE event_type LIKE 'v2.customer_extra_link.%' ORDER BY sequence`)).rows;
  const create = () => ({ version: "v2-extra-link.v1", action: "create", commandId: randomUUID(),
    expectedVersion: 1, occurredAt: new Date().toISOString(), variationId: proposalId, revisionId,
    token: randomBytes(32).toString("hex"), expiresAt: new Date(Date.now() + 86400000).toISOString(), photoIds: [] });
  const command = create(), first = await repository.create(auth.context, jobId, auth.membershipId, command);
  const afterCreate = await events();
  assert.equal(afterCreate.at(-1).event_type, "v2.customer_extra_link.created");
  assert.equal(afterCreate.at(-1).payload.references.commandId, command.commandId);
  await repository.create(auth.context, jobId, auth.membershipId, command);
  assert.deepEqual(await events(), afterCreate);
  await assert.rejects(repository.create(auth.context, jobId, auth.membershipId, { ...command, photoIds: [randomUUID()] }));
  assert.equal((await admin.query("SELECT token_hash FROM app.v2_customer_extra_link WHERE id=$1", [first.linkId])).rows[0].token_hash === command.token, false);
  const customer = await repository.open(first.capability);
  assert.equal(customer.amount, "125.00"); assert.equal(customer.description, "F6 fictional splashback extension");
  assert.deepEqual(Object.keys(customer).sort(), ["version", "environment", "jobId", "revisionId", "variationVersion", "amount", "description", "photoIds", "expectedVersion", "agreedAt"].sort());
  await assert.rejects(new V2CustomerExtraLinkApplication(runtime, other.sessionId).open(first.capability));
  await assert.rejects(repository.open("f".repeat(64) + first.capability.slice(64)));
  const stored = (await admin.query("SELECT * FROM app.v2_customer_extra_link WHERE id=$1", [first.linkId])).rows[0];
  const forced = (await admin.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='app.v2_customer_extra_link'::regclass")).rows[0];
  assert.deepEqual(forced, { relrowsecurity: true, relforcerowsecurity: true });
  await withTenant(runtime, second.context, async db => {
    assert.equal((await db.$client.query("SELECT * FROM app.v2_customer_extra_link WHERE id=$1", [first.linkId])).rowCount, 0);
    assert.equal((await db.$client.query("UPDATE app.v2_customer_extra_link SET description=description WHERE id=$1", [first.linkId])).rowCount, 0);
  });
  await assert.rejects(withTenant(runtime, second.context, db => db.$client.query(`INSERT INTO app.v2_customer_extra_link
    SELECT * FROM jsonb_populate_record(NULL::app.v2_customer_extra_link,$1::jsonb)`, [JSON.stringify({ ...stored, id: randomUUID(), token_hash: randomBytes(32).toString("hex") })])));
  await assert.rejects(withTenant(runtime, second.context, db => db.$client.query("DELETE FROM app.v2_customer_extra_link WHERE id=$1", [first.linkId])));

  // Force an error AFTER both the business row and audit event are inserted.
  let fail = true;
  const failingPool = { connect: async () => {
    const client = await runtime.connect();
    return { release: () => client.release(), query: async (sql, values) => {
      const result = await client.query(sql, values);
      if (fail && sql.includes("app.append_audit")) { fail = false; throw new Error("F6_FORCED_FAILURE"); }
      return result;
    } };
  } };
  const failedCreate = create();
  await assert.rejects(new V2CustomerExtraLinkRepository(failingPool).create(auth.context, jobId, auth.membershipId, failedCreate), /F6_FORCED_FAILURE/u);
  assert.equal((await admin.query("SELECT * FROM app.v2_customer_extra_link WHERE id=$1", [failedCreate.commandId])).rowCount, 0);
  assert.deepEqual(await events(), afterCreate);
  const agree = { version: "v2-extra-link.v1", action: "agree", commandId: randomUUID(), occurredAt: new Date().toISOString(),
    expectedVersion: 1, jobId, revisionId, amount: "125.00", name: "Fictional customer" };
  fail = true;
  await assert.rejects(new V2CustomerExtraLinkRepository(failingPool).agree(first.capability, agree), /F6_FORCED_FAILURE/u);
  assert.equal((await repository.open(first.capability)).agreedAt, null);
  assert.deepEqual(await events(), afterCreate);
  const agreed = await repository.agree(first.capability, agree), afterAgree = await events();
  assert.ok(agreed.agreedAt); assert.equal(afterAgree.length, afterCreate.length + 1);
  assert.equal(afterAgree.at(-1).event_type, "v2.customer_extra_link.agreed");
  assert.doesNotMatch(JSON.stringify(afterAgree), /Fictional customer/u);
  assert.deepEqual(await repository.agree(first.capability, agree), agreed);
  assert.deepEqual(await events(), afterAgree);
  await assert.rejects(repository.agree(first.capability, { ...agree, name: "Changed person" }));
  assert.equal((await variations.get(jobId)).approvedAdditionsPence, baseline, "agreement alone cannot commit money");

  const cancelled = await repository.create(auth.context, jobId, auth.membershipId, create());
  const cancel = { version: "v2-extra-link.v1", action: "cancel", commandId: randomUUID(), occurredAt: new Date().toISOString(), expectedVersion: 1, linkId: cancelled.linkId };
  await repository.cancel(auth.context, jobId, auth.membershipId, cancel);
  const afterCancel = await events();
  await repository.cancel(auth.context, jobId, auth.membershipId, cancel);
  assert.deepEqual(await events(), afterCancel);
  assert.equal(afterCancel.at(-1).event_type, "v2.customer_extra_link.cancelled");
  await assert.rejects(repository.open(cancelled.capability));
  await assert.rejects(repository.agree(cancelled.capability, { ...agree, commandId: randomUUID() }));
  const expired = await repository.create(auth.context, jobId, auth.membershipId, create());
  await admin.query("UPDATE app.v2_customer_extra_link SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [expired.linkId]);
  await assert.rejects(repository.open(expired.capability));
  await assert.rejects(repository.agree(expired.capability, { ...agree, commandId: randomUUID() }));
  const revisedId = randomUUID();
  await variations.command(jobId, { version: "variation-command.v1", action: "revise", variationId: proposalId,
    revisionId: revisedId, expectedRevisionId: revisionId, description: "Repriced extension",
    price: { quantity: "1", unit: "item", unitRatePence: 17500, direction: "addition" } });
  await assert.rejects(repository.open(first.capability));
  await assert.rejects(repository.agree(first.capability, { ...agree, commandId: randomUUID() }));
  const repriced = await repository.create(auth.context, jobId, auth.membershipId, { ...create(), expectedVersion: 2, revisionId: revisedId });
  assert.equal((await repository.open(repriced.capability)).amount, "175.00");
  await assert.rejects(repository.agree(repriced.capability, { ...agree, commandId: randomUUID(), revisionId: revisedId }));
  await variations.command(jobId, { version: "variation-command.v1", action: "reject", variationId: proposalId,
    revisionId: revisedId, rejectionId: randomUUID() });
  await assert.rejects(repository.agree(repriced.capability, { ...agree, commandId: randomUUID(), revisionId: revisedId, amount: "175.00" }));
  assert.equal((await variations.get(jobId)).approvedAdditionsPence, baseline);
  assert.deepEqual(await protectedFacts(), untouched);
});
