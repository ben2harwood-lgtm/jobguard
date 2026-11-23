import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { Pool } from "../../packages/db/node_modules/pg/esm/index.mjs";
import { createIdentityApplication } from "../../apps/api/dist/auth/index.js";
import { createWorkspaceApplication } from "../../apps/api/dist/workspace/index.js";
import { M1_QUOTE_POLICY } from "../../packages/core/dist/index.js";
import { DEMO_TENANT_ID, WorkPlanRepository, authenticatePracticeSession, withTenant } from "../../packages/db/dist/index.js";
import { embeddedSystemId, storageData, verifyDatabaseTarget } from "./local-targets.mjs";
import { migrationUrl, validateSettings } from "./settings.mjs";

import { joineryTemplate } from "./fixtures/joinery-template.mjs";

const { settings } = validateSettings({});
const origin = settings.AUTH_ALLOWED_ORIGIN;
const backend = process.env.JOBGUARD_V2_BACKEND ?? "docker";
const embedded = backend === "embedded";
const systemId = embedded ? embeddedSystemId() : process.env.JOBGUARD_V2_TEST_SYSTEM_ID;
const authSecret = readFileSync(new URL("../../.jobguard/v2-auth-secret", import.meta.url), "utf8");
const admin = new Pool({ connectionString: migrationUrl, max: 1 });
const runtime = new Pool({ connectionString: settings.DATABASE_URL, max: 3 });
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

// Reuse the signed-in sessions across this suite to stay within the real OTP limit.
const sessions = new Map();
function signIn(localPart) {
  if (!sessions.has(localPart)) sessions.set(localPart, openSession(localPart));
  return sessions.get(localPart);
}

async function openSession(localPart) {
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

const planSource = (jobId, quoteRevisionId) => ({ version: "work-plan-source.v1", jobId, quoteRevisionId });
const planTables = ["app.v2_work_plan", "app.v2_work_plan_task"];
const planCounts = async quoteRevisionId => (await Promise.all(planTables.map(async table =>
  (await admin.query(`SELECT count(*)::int AS count FROM ${table} WHERE quote_revision_id=$1`, [quoteRevisionId]))
    .rows[0].count)));

async function acceptedPlanSource() {
  const { rows: [quote] } = await admin.query(`SELECT d.quote_revision_id FROM app.quote_acceptance a
    JOIN app.quote_document_version d ON (d.tenant_id,d.job_id,d.id)=(a.tenant_id,a.job_id,a.document_id)
    WHERE a.job_id=$1`, [jobId]);
  return planSource(jobId, quote.quote_revision_id);
}

test("the V2 accepted quote produces one plan after concurrent generation, reopening and retrying", async () => {
  const { sessionId } = await signIn("builder");
  const { context } = await authenticatePracticeSession(runtime, sessionId);
  const source = await acceptedPlanSource();
  const before = await counts();
  const plans = new WorkPlanRepository(runtime);
  assert.equal(await plans.read(context, source), null);
  const [first, second] = await Promise.all([plans.generate(context, source), plans.generate(context, source)]);
  assert.deepEqual(second, first);
  const reopened = new Pool({ connectionString: settings.DATABASE_URL, max: 1 });
  try {
    const { context: reopenedContext } = await authenticatePracticeSession(reopened, sessionId);
    assert.deepEqual(await new WorkPlanRepository(reopened).read(reopenedContext, source), first);
  } finally {
    await reopened.end();
  }
  assert.deepEqual(await plans.generate(context, source), first);
  assert.deepEqual(await planCounts(source.quoteRevisionId), [1, 4]);

  const { rows: scope } = await admin.query(
    "SELECT scope_item_id, category FROM app.quote_line WHERE quote_revision_id=$1", [source.quoteRevisionId],
  );
  const tilingId = scope.find(line => line.category === "Tiling").scope_item_id;
  const decoratingId = scope.find(line => line.category === "Decorating").scope_item_id;
  assert.deepEqual(first.tasks.map(task => task.position), [1, 2, 3, 4]);
  assert.deepEqual(first.tasks.filter(task => task.trade === "tiler").map(task => task.scopeItemId), [tilingId, tilingId]);
  const hall = first.tasks.filter(task => task.trade === "decorator");
  assert.deepEqual(hall.map(task => task.scopeItemId), [decoratingId, decoratingId]);
  assert.deepEqual(hall.map(task => task.dependsOn), [
    [], [{ scopeItemId: decoratingId, templateTaskKey: "prepare-hall" }],
  ]);
  assert.deepEqual(await counts(), before);
});

test("a draft from typed capture produces one plan using a second template data file", async () => {
  const { sessionId } = await signIn("builder");
  const { context } = await authenticatePracticeSession(runtime, sessionId);
  const { capture, quote } = createWorkspaceApplication({ pool: runtime, sessionId });
  const saved = await capture.create({
    contractVersion: "job_capture_v1", requested_tenant_id: DEMO_TENANT_ID, captureId: randomUUID(),
    fixtureId: "v2-c1-typed-joinery",
    source: { kind: "text", text: "JOB: Fit a shelf\nITEM: Fit a timber shelf | QTY: 1 | UNIT: item | RATE: £95.00" },
  });
  const review = await capture.save(saved.jobId, {
    contractVersion: "proposal_review_command_v1", expectedRevision: 0,
    review: {
      version: "proposal_review_v1", jobId: saved.jobId, proposalId: saved.proposalId, reviewId: saved.reviewId,
      revision: 0,
      questions: saved.proposal.questions.map(({ question }) => ({
        id: randomUUID(), question: question.value, blocking: true, disposition: "answered",
        answer: "Builder will supply the shelf and clear the work area.",
      })),
      lines: saved.proposal.lines.map(line => ({
        id: line.id, scopeItemId: line.scopeItemId, origin: "proposal", description: line.description.value,
        room: "Utility", category: "Joinery", quantity: line.quantity.value, unit: line.unit.value,
        unitPricePence: line.unitPricePence.value, disposition: "accepted",
        dismissalReason: null, parentScopeItemIds: [], sourceExcerpt: line.sourceExcerpt,
      })),
    },
  });
  await capture.confirm(saved.jobId, {
    contractVersion: "proposal_review_confirm_v1", commandId: randomUUID(), expectedRevision: review.review.revision,
  });
  const workspace = await quote.get(saved.jobId);
  const draft = await quote.save(saved.jobId, {
    contractVersion: "quote_draft_command_v1", draftId: randomUUID(), expectedRevision: 0,
    currency: M1_QUOTE_POLICY.currency, taxPolicyVersion: M1_QUOTE_POLICY.taxPolicyVersion,
    lines: workspace.scope.map(line => ({
      ...line, id: randomUUID(), origin: "captured", included: true, exclusionReason: null,
      discountPercent: "0", taxTreatment: M1_QUOTE_POLICY.taxTreatment, rateProvenance: "entered",
      category: "Joinery", region: null,
    })),
  });
  const source = planSource(saved.jobId, draft.draft.currentRevisionId);
  const before = await counts();
  const plans = new WorkPlanRepository(runtime, joineryTemplate);
  const generated = await plans.generate(context, source);
  assert.equal(generated.templateKey, joineryTemplate.key);
  assert.deepEqual(generated.tasks, [{
    key: "fit-shelf", title: "Fit the shelf", trade: "joiner", durationMinutes: 45, dependsOn: [],
    materialNeeds: ["Shelf", "Brackets"], proofPoints: ["Photo of fitted shelf"], customerChoices: ["Shelf finish"],
    position: 1, scopeItemId: saved.proposal.lines[0].scopeItemId,
  }]);
  assert.deepEqual(await plans.generate(context, source), generated);
  assert.deepEqual(await planCounts(source.quoteRevisionId), [1, 1]);
  assert.deepEqual(await counts(), before);
  const { rows: [{ paid }] } = await admin.query(`SELECT count(*)::int AS paid
    FROM app.job_record_proposal WHERE model IS DISTINCT FROM 'fixture-capture-v1'`);
  assert.equal(paid, 0);
});

test("forced work plan policies isolate the second firm's real and shared practice sessions", async () => {
  const { sessionId, realContext } = await signIn("second-builder");
  const { context } = await authenticatePracticeSession(runtime, sessionId);
  assert.equal(context.tenantId, DEMO_TENANT_ID);
  assert.notEqual(realContext.tenantId, context.tenantId);
  const source = await acceptedPlanSource();
  const { rows: [task] } = await admin.query(`SELECT scope_item_id, template_task_key
    FROM app.v2_work_plan_task WHERE quote_revision_id=$1 ORDER BY position LIMIT 1`, [source.quoteRevisionId]);
  const { rows } = await admin.query(`SELECT
    relrowsecurity AND relforcerowsecurity AS forced, relowner::regrole::text AS owner,
    has_table_privilege('jobguard_runtime',oid,'SELECT') AS can_read,
    has_table_privilege('jobguard_runtime',oid,'INSERT') AS can_insert,
    has_table_privilege('jobguard_runtime',oid,'UPDATE,DELETE,TRUNCATE') AS can_mutate,
    has_table_privilege('jobguard_identity',oid,'SELECT,INSERT,UPDATE,DELETE') AS identity_access,
    has_table_privilege('jobguard_worker',oid,'SELECT,INSERT,UPDATE,DELETE') AS worker_access,
    has_table_privilege('jobguard_infrastructure',oid,'SELECT,INSERT,UPDATE,DELETE') AS infra_access
    FROM pg_class WHERE oid=ANY($1::regclass[])`, [planTables]);
  assert.deepEqual(rows, planTables.map(() => ({
    forced: true, owner: "jobguard_migration", can_read: true, can_insert: true, can_mutate: false,
    identity_access: false, worker_access: false, infra_access: false,
  })));

  const plans = new WorkPlanRepository(runtime);
  for (const outsider of [realContext, context]) {
    assert.equal(await plans.read(outsider, source), null);
    await assert.rejects(plans.generate(outsider, source), { code: "QUOTE_REVISION_NOT_FOUND" });
    const key = [DEMO_TENANT_ID, jobId, source.quoteRevisionId];
    for (const [table, column, insert, values] of [
      [planTables[0], "template_key", "(tenant_id,job_id,quote_revision_id,template_key) VALUES($1,$2,$3,$4)",
        [...key, "splashback-decorating.v1"]],
      [planTables[1], "position", "(tenant_id,job_id,quote_revision_id,scope_item_id,template_task_key,position) VALUES($1,$2,$3,$4,$5,1)",
        [...key, task.scope_item_id, task.template_task_key]],
    ]) {
      const query = (sql, params) => withTenant(runtime, outsider, db => db.$client.query(sql, params));
      const where = "WHERE (tenant_id,job_id,quote_revision_id)=($1,$2,$3)";
      assert.equal((await query(`SELECT * FROM ${table} ${where}`, key)).rowCount, 0);
      await assert.rejects(query(`INSERT INTO ${table} ${insert}`, values),
        { code: "42501", message: /row-level security policy/u });
      await assert.rejects(query(`UPDATE ${table} SET ${column}=${column} ${where}`, key), { code: "42501" });
      await assert.rejects(query(`DELETE FROM ${table} ${where}`, key), { code: "42501" });
    }
  }
  assert.deepEqual(await planCounts(source.quoteRevisionId), [1, 4]);
});
