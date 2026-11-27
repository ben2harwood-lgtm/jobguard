import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { Pool } from "../../packages/db/node_modules/pg/esm/index.mjs";
import { createIdentityApplication } from "../../apps/api/dist/auth/index.js";
import { createWorkspaceApplication } from "../../apps/api/dist/workspace/index.js";
import { M1_QUOTE_POLICY } from "../../packages/core/dist/index.js";
import { DEMO_TENANT_ID, MeasurementRepository, WorkPlanRepository, authenticatePracticeSession, verifyAuditChain, withTenant } from "../../packages/db/dist/index.js";
import { FactReplyRepository, openFactAnswerFor, openFactCommandV1 } from "../../packages/db/dist/index.js";
// V2-C3C
import { CrewContactRepository } from "../../packages/db/dist/index.js";
import { embeddedSystemId, storageData, verifyDatabaseTarget } from "./local-targets.mjs";
import { migrationUrl, validateSettings } from "./settings.mjs";

import { joineryTemplate } from "./fixtures/joinery-template.mjs";
// V2-PX
import { uploadPracticePhoto } from "./test/practice-photo.mjs";
// V2-FL
import { readdirSync } from "node:fs";
import { firmLockCatalog, firmLockFailures, lockProblems, pendingTables } from "./firm-lock/guard.mjs";

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
  return {
    ...await enterPractice(signedIn, csrfToken), signedIn, csrfToken, membershipId: memberships[0].id,
    realContext: await identity.context({ sessionToken: signedIn.slice("jobguard_session=".length),
      requestedTenantId: memberships[0].tenantId, csrfToken, origin }),
  };
}

async function enterPractice(signedIn, csrfToken) {
  const practice = await request("/api/auth/practice", {
    cookies: signedIn, csrf: csrfToken, body: { version: "linked-practice-company.v1", action: "enter" },
  });
  await json(practice);
  const sessionCookie = practice.headers.getSetCookie().find(cookie => cookie.startsWith("jg_session="));
  return {
    cookies: [signedIn, ...practice.headers.getSetCookie().map(cookie => cookie.split(";", 1)[0])].join("; "),
    sessionId: sessionCookie.split(";", 1)[0].slice("jg_session=".length),
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
  process.env.JOBGUARD_LOCAL_V2 = "1";
  const proposals = await admin.query(`SELECT job_id, model FROM app.job_record_proposal`);
  assert.equal(proposals.rowCount, 1);
  assert.equal(proposals.rows[0].model, "fixture-capture-v1");
  jobId = proposals.rows[0].job_id;
});
after(async () => Promise.all([admin.end(), runtime.end(), identity.provider.repository.pool.end()]));

// V2-SX revision 5: fixed GET boundaries, using this suite's existing cache.
// Pilot gate: these tests do not prove main's MON-5/MON-8 real-role refusals.
import { assertBuilderPositive, assertBuilderRouteRefuses, assertSignedOutBuilderRefuses,
  bindBuilderRoutes, guardCachedSignIn } from "./test/refusals.mjs";
const sxCachedSignIn = signIn;
signIn = guardCachedSignIn(sxCachedSignIn);
let sxRoutes;
async function sxRequest(path, { transport, method, body, cookies, csrf, tenantId } = {}) {
  const target = transport === "api" ? settings.NEXT_PUBLIC_API_URL : origin;
  return fetch(target + path, {
    method: method ?? (body === undefined ? "GET" : "POST"), redirect: "manual",
    headers: { origin, "content-type": "application/json", ...(cookies && { cookie: cookies }),
      ...(csrf && { "x-csrf-token": csrf }), ...(tenantId && { "x-tenant-id": tenantId }) },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
}
test("SX fixed GET list has working positive controls before checking refusals", async t => {
  const routes = bindBuilderRoutes({ jobId, tenantId: DEMO_TENANT_ID });
  sxRoutes = [];
  // Finish ALL mandatory positives first. In particular 2, 6 and 9 must not
  // be mistaken for refusals if this seed cannot read them (planner stop).
  for (const route of routes) {
    if (await assertBuilderPositive({ request: sxRequest, signIn, route })) sxRoutes.push(route);
    else t.diagnostic(`SX dropped optional route 10: ${route.path}; no 200 illustration source`);
  }
  const second = await signIn("second-builder");
  assert.notEqual(second.realContext.tenantId, DEMO_TENANT_ID);
  const { context: practice } = await authenticatePracticeSession(runtime, second.sessionId);
  assert.equal(practice.tenantId, DEMO_TENANT_ID);
  for (const context of [second.realContext, practice]) {
    await withTenant(runtime, context, async db => {
      assert.equal((await db.$client.query("SELECT id FROM app.job WHERE id=$1", [jobId])).rowCount, 0);
    });
  }
  for (const route of sxRoutes) {
    const observed = await assertBuilderRouteRefuses({ request: sxRequest, signIn, route });
    for (const result of observed) t.diagnostic(`SX ${route.transport ?? "web"} ${route.path} ${result.case}: ${result.status} ${result.code}`);
  }
});
// End V2-SX positive and refusal block.

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

const planQuery = { version: "work-plan-query.v1" };
const customTaskKey = "custom-scope-item";

async function draftForPlan() {
  const { sessionId, realContext } = await signIn("builder");
  const { capture, quote, workPlan } = createWorkspaceApplication({ pool: runtime, sessionId });
  const categories = ["Tiling", "Decorating", "Joinery", "Metalwork"];
  const descriptions = ["Tile the kitchen", "Decorate the hall", "Fit a shelf", "Repair a rail"];
  const saved = await capture.create({
    contractVersion: "job_capture_v1", requested_tenant_id: DEMO_TENANT_ID, captureId: randomUUID(),
    fixtureId: "v2-c2-draft-editing",
    source: { kind: "text", text: ["JOB: Plan a fictional renovation",
      ...descriptions.map(description => `ITEM: ${description} | QTY: 1 | UNIT: item | RATE: £95.00`)].join("\n") },
  });
  const draftJob = saved.jobId;
  const review = await capture.save(draftJob, {
    contractVersion: "proposal_review_command_v1", expectedRevision: 0,
    review: {
      version: "proposal_review_v1", jobId: draftJob, proposalId: saved.proposalId, reviewId: saved.reviewId,
      revision: 0,
      questions: saved.proposal.questions.map(({ question }) => ({
        id: randomUUID(), question: question.value, blocking: true, disposition: "answered",
        answer: "The fictional builder will clear the work area.",
      })),
      lines: saved.proposal.lines.map((line, index) => ({
        id: line.id, scopeItemId: line.scopeItemId, origin: "proposal", description: line.description.value,
        room: "Hall", category: categories[index], quantity: line.quantity.value, unit: line.unit.value,
        unitPricePence: line.unitPricePence.value, disposition: "accepted",
        dismissalReason: null, parentScopeItemIds: [], sourceExcerpt: line.sourceExcerpt,
      })),
    },
  });
  await capture.confirm(draftJob, {
    contractVersion: "proposal_review_confirm_v1", commandId: randomUUID(), expectedRevision: review.review.revision,
  });
  const { scope } = await quote.get(draftJob);
  const lines = descriptions.map((description, index) => ({
    ...scope.find(line => line.description === description), id: randomUUID(), origin: "captured",
    included: true, exclusionReason: null, discountPercent: "0", taxTreatment: M1_QUOTE_POLICY.taxTreatment,
    rateProvenance: "entered", category: categories[index], region: null,
  }));
  const draftId = randomUUID();
  const save = (expectedRevision, nextLines = lines) => quote.save(draftJob, {
    contractVersion: "quote_draft_command_v1", draftId, expectedRevision, lines: nextLines,
    currency: M1_QUOTE_POLICY.currency, taxPolicyVersion: M1_QUOTE_POLICY.taxPolicyVersion,
  });
  await save(0);
  const read = () => workPlan.read(draftJob, planQuery);
  const edit = command => workPlan.edit(draftJob, command);
  return { draftJob, realContext, sessionId, lines, save, read, edit };
}

function planEdit(plan, task, changes) {
  return { version: "work-plan-edit.v1", commandId: randomUUID(), quoteRevisionId: plan.quoteRevisionId,
    expectedVersion: plan.version, scopeItemId: task.scopeItemId, taskKey: task.key, changes };
}

test("a custom task is ordered and edited tasks survive a fresh signed-in session", async () => {
  const { draftJob, realContext, lines, read, edit } = await draftForPlan();
  const [,, shelf, rail] = lines;
  const plan = await read();
  assert.equal(plan.version, 0);
  assert.deepEqual(plan.unplanned, [shelf, rail].map(line => ({
    scopeItemId: line.scopeItemId, title: line.description, status: "Unplanned",
  })));
  const task = plan.tasks[2];
  const command = planEdit(plan, task, { position: 1, trade: "painter", durationMinutes: 77 });
  const receipt = await edit(command);
  const { rows: [actor] } = await admin.query(`
    SELECT id FROM app.membership WHERE tenant_id = $1 AND role = 'owner'
  `, [realContext.tenantId]);
  assert.equal(receipt.actorMembershipId, actor.id);
  assert.equal(receipt.commandId, command.commandId);
  assert.equal(receipt.version, 1);
  assert.ok(receipt.recordedAt instanceof Date);
  const custom = planEdit(await read(), { scopeItemId: shelf.scopeItemId, key: customTaskKey },
    { position: 2, trade: "joiner", durationMinutes: 45 });
  await assert.rejects(edit({ ...custom, changes: { trade: "joiner" } }), { code: "WORK_PLAN_INVALID_EDIT" });
  await edit(custom);
  const current = await read();
  assert.deepEqual(current.tasks.slice(0, 2).map(({ key, position, trade, durationMinutes }) =>
    ({ key, position, trade, durationMinutes })), [
    { key: task.key, position: 1, trade: "painter", durationMinutes: 77 },
    { key: customTaskKey, position: 2, trade: "joiner", durationMinutes: 45 },
  ]);
  assert.deepEqual(current.unplanned.map(item => [item.scopeItemId, item.status]), [[rail.scopeItemId, "Unplanned"]]);

  const owner = await signIn("builder");
  const fresh = await enterPractice(owner.signedIn, owner.csrfToken);
  assert.notEqual(fresh.sessionId, owner.sessionId);
  const reopened = new Pool({ connectionString: settings.DATABASE_URL, max: 1 });
  try {
    const { workPlan } = createWorkspaceApplication({ pool: reopened, sessionId: fresh.sessionId });
    assert.deepEqual(await workPlan.read(draftJob, planQuery), current);
    assert.deepEqual(await workPlan.edit(draftJob, command), receipt);
  } finally {
    await reopened.end();
  }
});

test("a draft quote save refreshes the plan, records all task changes and keeps clashing edits for review", async () => {
  const { draftJob, lines, save, read, edit } = await draftForPlan();
  const [tile, hall, shelf, rail] = lines;
  const plan = await read();
  const tilingTask = plan.tasks.find(task => task.scopeItemId === tile.scopeItemId);
  const hallTask = plan.tasks.find(task => task.scopeItemId === hall.scopeItemId);
  const tilingEdit = planEdit(plan, tilingTask, { durationMinutes: 77, trade: "specialist tiler" });
  const receipt = await edit(tilingEdit);
  await edit(planEdit(await read(), hallTask, { durationMinutes: 51 }));
  await edit(planEdit(await read(), { scopeItemId: shelf.scopeItemId, key: customTaskKey },
    { position: 2, trade: "joiner", durationMinutes: 40 }));
  const beforeSave = await counts();
  const quoteLines = [{ ...tile, description: "Tile the kitchen and upstand", quantity: "2" },
    { ...hall, included: false, exclusionReason: "Builder removed this work" }, shelf, { ...rail, category: "Decorating" }];
  const revision = await save(1, quoteLines);
  const nextId = revision.draft.currentRevisionId;
  assert.deepEqual(await planCounts(nextId), [1, 4], "the quote save persisted the refresh before a plan read");
  const refreshed = await read();
  assert.equal(refreshed.jobId, draftJob);
  assert.equal(refreshed.quoteRevisionId, nextId);
  assert.equal(refreshed.version, 0);
  assert.deepEqual(refreshed.changes.added.map(task => task.scopeItemId), [rail.scopeItemId, rail.scopeItemId]);
  assert.deepEqual(refreshed.changes.removed.map(task => task.scopeItemId), [hall.scopeItemId, hall.scopeItemId]);
  assert.equal(refreshed.changes.removed.find(task => task.key === hallTask.key).needsReview, true);
  const changed = refreshed.changes.changed.find(change => change.after.key === tilingTask.key);
  assert.equal(changed.beforeScope.description, tile.description);
  assert.equal(changed.afterScope.description, quoteLines[0].description);
  const carried = refreshed.tasks.find(task => task.key === tilingTask.key);
  assert.equal(carried.durationMinutes, 77);
  assert.equal(carried.trade, "specialist tiler");
  assert.equal(carried.needsReview, true);
  assert.deepEqual(refreshed.tasks.find(task => task.key === customTaskKey), {
    key: customTaskKey, scopeItemId: shelf.scopeItemId, title: shelf.description, position: 2,
    trade: "joiner", durationMinutes: 40, dependsOn: [], materialNeeds: [], proofPoints: [], customerChoices: [],
  });
  assert.deepEqual(await edit(tilingEdit), receipt, "a replay after regeneration returns the original receipt");
  await assert.rejects(edit({ ...tilingEdit, commandId: randomUUID() }), { code: "WORK_PLAN_VERSION_CONFLICT" });
  assert.deepEqual(await read(), refreshed);
  assert.equal((await counts()).sends, beforeSave.sends);
  const { rows: [{ paid }] } = await admin.query(`SELECT count(*)::int AS paid
    FROM app.job_record_proposal WHERE model IS DISTINCT FROM 'fixture-capture-v1'`);
  assert.equal(paid, 0);
});

test("concurrent edits refuse stale versions and exact retries have one effect", async () => {
  const { read, edit } = await draftForPlan();
  const plan = await read();
  const command = planEdit(plan, plan.tasks[0], { durationMinutes: 77 });
  const conflict = planEdit(plan, plan.tasks[0], { durationMinutes: 88 });
  const [recorded, replayed] = await Promise.all([edit(command), edit(command)]);
  assert.deepEqual(recorded, replayed);
  await assert.rejects(edit(conflict), { code: "WORK_PLAN_VERSION_CONFLICT" });
  await assert.rejects(edit({ ...command, changes: conflict.changes }), { code: "WORK_PLAN_COMMAND_CONFLICT" });
  const subsequentRace = await read();
  const outcomes = await Promise.allSettled([
    edit(planEdit(subsequentRace, plan.tasks[0], { durationMinutes: 99 })),
    edit(planEdit(subsequentRace, plan.tasks[0], { durationMinutes: 111 })),
  ]);
  assert.equal(outcomes.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(outcomes.find(result => result.status === "rejected").reason.code, "WORK_PLAN_VERSION_CONFLICT");
  const current = await read();
  assert.equal(current.version, 2);
  const { rows: [{ count }] } = await admin.query(
    "SELECT count(*)::int AS count FROM app.v2_work_plan_edit WHERE quote_revision_id = $1", [plan.quoteRevisionId],
  );
  assert.equal(count, 2);
});

test("forced draft edit policies hide receipts and reject writes from the second firm", async () => {
  const { draftJob, read, edit } = await draftForPlan();
  const plan = await read();
  const command = planEdit(plan, plan.tasks[0], { durationMinutes: 77 });
  const receipt = await edit(command);
  const outsider = await signIn("second-builder");
  const { workPlan } = createWorkspaceApplication({ pool: runtime, sessionId: outsider.sessionId });
  await assert.rejects(workPlan.read(draftJob, planQuery), { code: "NOT_FOUND" });
  await assert.rejects(workPlan.edit(draftJob, command), { code: "NOT_FOUND" });
  const { context } = await authenticatePracticeSession(runtime, outsider.sessionId);
  const { rows: [acl] } = await admin.query(`SELECT
    relrowsecurity AND relforcerowsecurity AS forced, relowner::regrole::text AS owner,
    has_table_privilege('jobguard_runtime',oid,'SELECT') AS can_read,
    has_table_privilege('jobguard_runtime',oid,'INSERT') AS can_insert,
    has_table_privilege('jobguard_runtime',oid,'UPDATE,DELETE,TRUNCATE') AS can_mutate,
    has_table_privilege('jobguard_identity',oid,'SELECT,INSERT,UPDATE,DELETE') AS identity_access,
    has_table_privilege('jobguard_worker',oid,'SELECT,INSERT,UPDATE,DELETE') AS worker_access,
    has_table_privilege('jobguard_infrastructure',oid,'SELECT,INSERT,UPDATE,DELETE') AS infra_access
    FROM pg_class WHERE oid='app.v2_work_plan_edit'::regclass`);
  assert.deepEqual(acl, { forced: true, owner: "jobguard_migration", can_read: true, can_insert: true, can_mutate: false,
    identity_access: false, worker_access: false, infra_access: false });
  for (const scope of [outsider.realContext, context]) {
    const query = (sql, params) => withTenant(runtime, scope, db => db.$client.query(sql, params));
    const key = [DEMO_TENANT_ID, draftJob, plan.quoteRevisionId];
    const filter = "WHERE (tenant_id,job_id,quote_revision_id)=($1,$2,$3)";
    assert.equal((await query(`SELECT * FROM app.v2_work_plan_edit ${filter}`, key)).rowCount, 0);
    await assert.rejects(query(`INSERT INTO app.v2_work_plan_edit
      (tenant_id,job_id,quote_revision_id,command_id,scope_item_id,template_task_key,expected_version,changes,actor_membership_id)
      VALUES ($1,$2,$3,$4,$5,$6,1,'{"durationMinutes":88}',$7)`,
    [...key, randomUUID(), command.scopeItemId, command.taskKey, receipt.actorMembershipId]),
    { code: "42501", message: /row-level security policy/u });
    await assert.rejects(query(`UPDATE app.v2_work_plan_edit SET expected_version=2 ${filter}`, key), { code: "42501" });
    await assert.rejects(query(`DELETE FROM app.v2_work_plan_edit ${filter}`, key), { code: "42501" });
  }
  assert.equal((await runtime.query("SELECT * FROM app.v2_work_plan_edit")).rowCount, 0);
  const owner = await signIn("builder");
  const accepted = createWorkspaceApplication({ pool: runtime, sessionId: owner.sessionId }).workPlan;
  assert.equal((await accepted.read(jobId, planQuery)).state, "accepted");
  const source = await acceptedPlanSource();
  await assert.rejects(accepted.edit(jobId, { ...command, quoteRevisionId: source.quoteRevisionId }),
    { code: "WORK_PLAN_INVALID_EDIT" });
});

const switchLive = () => ({ version: "practice-activation-command.v1", commandId: randomUUID(), scenario: "no_charge" });

async function effectCounts() {
  const tables = ["graphile_worker._private_jobs", "app.scheduled_readiness_plan", "app.practice_exposure_schedule",
    "app.action_outbox", "infrastructure.outbox_signal", "app.job_assignment", "app.site_visit",
    "app.purchase_order_draft", "app.purchase_order_revision", "app.purchase_order_placement",
    "app.synthetic_obligation", "app.recovery_fee_derivation", "app.recovery_fee_journal", "app.success_fee_derivation",
    "app.success_fee_journal", "app.platform_fee_statement", "app.payment_fee_statement",
    "app.job_activation", "app.job_activation_terms", "app.cap_snapshot"];
  const { rows: [counts] } = await admin.query(`SELECT ${tables.map(table =>
    `(SELECT count(*)::int FROM ${table}) AS "${table}"`).join(", ")}`);
  return counts;
}

test("exact acceptance freezes the issued revision without scheduling, sending, booking, ordering or charging", async () => {
  const { draftJob, lines, save, read, edit } = await draftForPlan();
  const { sessionId, realContext, cookies } = await signIn("builder");
  const { parties, quote, workPlan } = createWorkspaceApplication({ pool: runtime, sessionId });
  const partyView = await parties.view({ sessionId }, draftJob);
  const customer = { version: "customer.v1", type: "person", name: "Fictional V2 Customer",
    email: "customer@jobguard-v2.invalid", phone: "+447700900042" };
  await parties.command({ sessionId }, draftJob, {
    version: "job-parties-command.v1", action: "save_form", commandId: randomUUID(),
    expectedJobRevision: partyView.jobRevision, expectedBindingId: null, customer, customerRef: null,
    site: { version: "site.v1", addressLines: ["43 Make-Believe Mews"], town: "Sampleford", postcode: "ZY1 0AA" },
    savedSiteRevisionId: null, reuseSiteId: null, expectedReuseRevisionId: null, confirmSamePlace: false,
    payingPartyRevisionId: null, expectedPayerRevisionId: null, correct: false,
  });
  const draft = await read();
  assert.equal(draft.state, "draft");
  assert.equal(draft.agreement, null);
  await assert.rejects(quote.activate(draftJob, switchLive()), { message: "ACCEPTED_PRICED_QUOTE_REQUIRED" });
  const { view: { documentId, documentVersion, contentHash } } = await quote.preview(draftJob, {
    version: "quote-preview-command.v1", recipient: customer.email,
  });
  await quote.issue(draftJob, { version: "quote-send-command.v1", commandId: randomUUID(),
    documentId, contentHash, recipient: customer.email });
  const delivered = await json(await request(`/api/jobs/${draftJob}/quotes/delivery/execute`, {
    cookies, body: { version: "quote-execute-command.v1", documentId, mode: "success" },
  }));
  assert.equal(delivered.status, "simulated_delivery");
  const target = { documentId, documentVersion, documentHash: contentHash };
  const accept = () => quote.accept(draftJob, { ...target, version: "quote-acceptance-command.v1", commandId: randomUUID(),
    statedCustomerName: customer.name, statedMethod: "verbal", acceptedAt: new Date().toISOString() });
  const effectsBeforeAcceptance = await effectCounts();
  const acceptance = await accept();
  assert.equal(acceptance.activeAcceptance.documentId, documentId);
  const accepted = await read();
  assert.deepEqual(accepted, { ...draft, state: "accepted", agreement: {
    documentId, netPence: acceptance.activeAcceptance.netPence, approvedVariations: [],
  } });
  assert.deepEqual(await effectCounts(), effectsBeforeAcceptance);

  const dates = planEdit(accepted, accepted.tasks[0], { scheduledDate: "2026-12-07" });
  await assert.rejects(edit({ ...dates, changes: { scheduledDate: "2026-02-30" } }), { code: "WORK_PLAN_INVALID_EDIT" });
  const dateReceipt = await edit(dates);
  const dated = await read();
  const assignment = planEdit(dated, dated.tasks[0], { assignee: "Fictional Tess Tile" });
  const assignmentReceipt = await edit(assignment);
  assert.deepEqual(await edit(assignment), assignmentReceipt);
  const { rows: [actor] } = await admin.query("SELECT id FROM app.membership WHERE tenant_id=$1 AND role='owner'", [realContext.tenantId]);
  for (const receipt of [dateReceipt, assignmentReceipt]) {
    assert.equal(receipt.actorMembershipId, actor.id);
    assert.ok(receipt.recordedAt instanceof Date);
  }
  const edited = await read();
  assert.equal(edited.tasks[0].scheduledDate, "2026-12-07");
  assert.equal(edited.tasks[0].assignee, "Fictional Tess Tile");
  assert.deepEqual(edited.agreement, accepted.agreement);
  assert.deepEqual(JSON.parse(await workPlan.exportInternal(draftJob, planQuery)), {
    version: "work-plan-export.v1", environment: "synthetic_demo",
    notice: "Practice sandbox — synthetic data; nothing is sent or charged", plan: edited,
  });
  const outsider = await signIn("second-builder");
  const otherPlan = createWorkspaceApplication({ pool: runtime, sessionId: outsider.sessionId }).workPlan;
  await assert.rejects(otherPlan.exportInternal(draftJob, planQuery), { code: "NOT_FOUND" });

  const cancel = await quote.disposition(draftJob, { ...target, version: "quote-disposition-command.v1",
    commandId: randomUUID(), kind: "acceptance_cancelled", occurredAt: new Date().toISOString() });
  assert.equal(cancel.jobStatus, "quoting");
  assert.equal(cancel.activeAcceptance, null);
  assert.equal(cancel.events.at(-1).kind, "acceptance_cancelled");
  const { rows: [retained] } = await admin.query("SELECT document_id, document_hash FROM app.quote_acceptance WHERE id=$1",
    [acceptance.activeAcceptance.id]);
  assert.deepEqual(retained, { document_id: documentId, document_hash: contentHash });
  const later = await save(1, lines.map((line, i) => i ? line : { ...line, description: "Unaccepted replacement scope",
    quantity: "3", unitRatePence: 30000 }));
  const laterRevisionId = later.draft.currentRevisionId;
  assert.notEqual(laterRevisionId, accepted.quoteRevisionId);
  assert.deepEqual(await planCounts(laterRevisionId), [0, 0]);
  assert.deepEqual(await read(), edited);
  const plans = new WorkPlanRepository(runtime);
  const { context } = await authenticatePracticeSession(runtime, sessionId);
  const laterSource = planSource(draftJob, laterRevisionId);
  for (const action of ["read", "generate"]) {
    await assert.rejects(plans[action](context, laterSource), { code: "WORK_PLAN_VERSION_CONFLICT" });
  }
  await assert.rejects(edit({ ...dates, commandId: randomUUID(), quoteRevisionId: laterRevisionId }), { code: "WORK_PLAN_VERSION_CONFLICT" });
  await assert.rejects(quote.activate(draftJob, switchLive()), { message: "ACCEPTED_PRICED_QUOTE_REQUIRED" });
  assert.deepEqual(await effectCounts(), effectsBeforeAcceptance);
});

const editEvents = async jobRef => (await admin.query(`SELECT tenant_id, actor_ref, payload FROM app.audit_event
  WHERE subject_type = 'job' AND subject_ref = $1 AND event_type = 'v2_work_plan.edited' ORDER BY sequence`, [jobRef])).rows;

async function verifyTenantChain(tenantId) {
  const { rows } = await admin.query(`SELECT id, tenant_id AS "tenantId", sequence::int, version, actor_ref AS "actorRef",
    event_type AS "eventType", subject_type AS "subjectType", subject_ref AS "subjectRef", occurred_at AS "occurredAt", payload,
    trim(payload_hash) AS "payloadHash", trim(previous_hash) AS "previousHash", trim(event_hash) AS "eventHash"
    FROM app.audit_event WHERE tenant_id = $1 ORDER BY sequence`, [tenantId]);
  assert.ok(rows.length > 0);
  assert.doesNotThrow(() => verifyAuditChain(rows));
}

test("existing Switch live activates a plan once and only approved variation revisions regenerate money scope", async () => {
  const { cookies, sessionId, csrfToken } = await signIn("builder");
  const { workPlan, variation, workState } = createWorkspaceApplication({ pool: runtime, sessionId });
  const accepted = await workPlan.read(jobId, planQuery);
  assert.equal(accepted.state, "accepted");
  const path = `/api/jobs/${jobId}/quotes/activation`;
  const command = switchLive();
  const before = await effectCounts();
  const activate = body => request(path, { body, cookies, csrf: csrfToken }).then(response => json(response));
  const result = await activate(command);
  assert.equal(result.activation.acceptedDocumentId, accepted.agreement.documentId);
  assert.equal(result.terms.baselineQuoteVersionId, accepted.agreement.documentId);
  const live = await workPlan.read(jobId, planQuery);
  assert.deepEqual(live, { ...accepted, state: "live", activationId: result.activation.id });
  const afterSwitch = await effectCounts();
  for (const table of ["app.job_activation", "app.job_activation_terms"]) assert.equal(afterSwitch[table], before[table] + 1);
  assert.deepEqual(await activate(command), result);
  assert.deepEqual(await activate(switchLive()), result);
  assert.deepEqual(await effectCounts(), afterSwitch);

  const proposalId = randomUUID();
  const scopeItemId = randomUUID();
  const price = { quantity: "1", unit: "item", unitRatePence: 12500, direction: "addition" };
  const vary = (action, fields) => variation.command(jobId, { version: "variation-command.v1", action, ...fields });
  const proposed = await vary("propose", { proposalId, scopeItemId, existingScopeItemId: null, lineageParentScopeItemId: null,
    description: "Add trim", captureText: "Customer asks about trim", price });
  assert.deepEqual(await workPlan.read(jobId, planQuery), live, "a pending extra adds nothing to the plan");
  const revisionId = proposed.variations.find(item => item.id === proposalId).currentRevisionId;
  const approvalId = randomUUID();
  const approve = { variationId: proposalId, revisionId, approvalId,
    attestation: "Builder-recorded practice acceptance — not an authenticated customer signature" };
  const beforeApproval = await effectCounts();
  await vary("approve", approve);
  assert.deepEqual(await effectCounts(), beforeApproval, "approval schedules, sends, books, orders and charges nothing");
  const expected = { ...live.agreement, approvedVariations: [{ scopeItemId, revisionId, approvalId,
    description: "Add trim", quantity: "1", unit: "item", signedDeltaPence: 12500 }] };
  const extraItem = { scopeItemId, title: "Add trim", status: "Unplanned" };
  const withExtra = { ...live, agreement: expected, unplanned: [...live.unplanned, extraItem],
    scopeItems: [...live.scopeItems, { scopeItemId, description: "Add trim", category: null, quantity: "1", unit: "item",
      variationRevisionId: revisionId }] };
  assert.deepEqual(await workPlan.read(jobId, planQuery), withExtra, "the approved extra joins the plan as Unplanned");
  await vary("approve", approve).catch(() => undefined);
  assert.deepEqual(await workPlan.read(jobId, planQuery), withExtra, "replaying the approval adds no second item");

  const declinedId = randomUUID();
  const declined = await vary("propose", { proposalId: declinedId, scopeItemId: randomUUID(), existingScopeItemId: null,
    lineageParentScopeItemId: null, description: "Declined extra shelf", captureText: "Customer asks about a shelf", price });
  await vary("reject", { variationId: declinedId, revisionId: declined.variations.find(item => item.id === declinedId).currentRevisionId,
    rejectionId: randomUUID() });
  assert.deepEqual(await workPlan.read(jobId, planQuery), withExtra, "a declined extra adds nothing");
  const pendingId = randomUUID();
  await vary("revise", { variationId: proposalId, expectedRevisionId: revisionId, revisionId: pendingId,
    description: "Unapproved replacement trim", price: { ...price, unitRatePence: 35000 } });
  const { context } = await authenticatePracticeSession(runtime, sessionId);
  const regenerated = await new WorkPlanRepository(runtime).generate(context, planSource(jobId, live.quoteRevisionId));
  assert.deepEqual(regenerated, withExtra, "an unapproved later revision changes neither the plan nor the money");
  const liveEdit = planEdit(regenerated, regenerated.tasks[0], { scheduledDate: "2026-12-09", assignee: "Fictional Tiler" });
  const receipt = await workPlan.edit(jobId, liveEdit);
  assert.equal(receipt.version, 1);

  // The builder gives the extra a trade, duration and place, then a date and an assignee.
  const placed = { ...planEdit(await workPlan.read(jobId, planQuery), { scopeItemId, key: customTaskKey },
    { position: 2, trade: "joiner", durationMinutes: 45 }), variationRevisionId: revisionId };
  await assert.rejects(workPlan.edit(jobId, { ...placed, changes: { trade: "joiner" } }), { code: "WORK_PLAN_INVALID_EDIT" });
  const { variationRevisionId: _named, ...unnamed } = placed;
  await assert.rejects(workPlan.edit(jobId, unnamed), { code: "WORK_PLAN_INVALID_EDIT" }, "an extra's edit names its revision");
  await assert.rejects(workPlan.edit(jobId, { ...placed, variationRevisionId: pendingId }), { code: "WORK_PLAN_VERSION_CONFLICT" },
    "an edit naming another revision of the extra is refused");
  await assert.rejects(workPlan.edit(jobId, { ...planEdit(await workPlan.read(jobId, planQuery), regenerated.tasks[0],
    { durationMinutes: 61 }), variationRevisionId: revisionId }), { code: "WORK_PLAN_INVALID_EDIT" }, "a quote line names no revision");
  const placedReceipt = await workPlan.edit(jobId, placed);
  assert.deepEqual(await workPlan.edit(jobId, placed), placedReceipt);
  const dated = { ...planEdit(await workPlan.read(jobId, planQuery), { scopeItemId, key: customTaskKey },
    { scheduledDate: "2026-12-10", assignee: "Fictional Jo Joiner" }), variationRevisionId: revisionId };
  await workPlan.edit(jobId, dated);
  const updated = await workPlan.read(jobId, planQuery);
  assert.equal(updated.version, 3);
  assert.equal(updated.tasks[0].scheduledDate, "2026-12-09");
  assert.equal(updated.tasks[0].assignee, "Fictional Tiler");
  assert.deepEqual(updated.tasks[1], { key: customTaskKey, scopeItemId, title: "Add trim", position: 2, trade: "joiner",
    durationMinutes: 45, dependsOn: [], materialNeeds: [], proofPoints: [], customerChoices: [],
    scheduledDate: "2026-12-10", assignee: "Fictional Jo Joiner" });
  assert.deepEqual(updated.unplanned, live.unplanned);
  assert.deepEqual(updated.agreement, expected);
  const { rows: saved } = await admin.query(`SELECT variation_revision_id FROM app.v2_work_plan_edit
    WHERE (job_id, scope_item_id) = ($1, $2)`, [jobId, scopeItemId]);
  assert.deepEqual(saved, [{ variation_revision_id: revisionId }, { variation_revision_id: revisionId }]);
  const [extraEvent] = (await editEvents(jobId)).filter(event => event.payload.references.commandId === placed.commandId);
  assert.equal(extraEvent.payload.references.variationRevisionId, revisionId);
  assert.equal(extraEvent.payload.references.scopeItemId, scopeItemId);
  assert.equal("version" in extraEvent.payload.references, false);
  await verifyTenantChain(context.tenantId);
  assert.deepEqual(await effectCounts(), beforeApproval, "planning the extra schedules, sends, books, orders and charges nothing");

  // The database refuses an extra's edit that names no approved revision of its scope item.
  const { rows: [actor] } = await admin.query("SELECT actor_membership_id AS id FROM app.v2_work_plan_edit WHERE command_id = $1",
    [placed.commandId]);
  const rawEdit = (variationRevisionId, scope) => withTenant(runtime, context, db => db.$client.query(`INSERT INTO app.v2_work_plan_edit
    (tenant_id,job_id,quote_revision_id,command_id,scope_item_id,template_task_key,expected_version,changes,actor_membership_id,variation_revision_id)
    VALUES ($1,$2,$3,$4,$5,$6,99,'{"durationMinutes":88}',$7,$8)`,
  [context.tenantId, jobId, live.quoteRevisionId, randomUUID(), scope, customTaskKey, actor.id, variationRevisionId]));
  await assert.rejects(rawEdit(pendingId, scopeItemId), { code: "23503" });
  await assert.rejects(rawEdit(null, scopeItemId), { code: "23503" });

  // A fresh signed-in session reads the same planned extra; the second firm sees and changes nothing.
  const owner = await signIn("builder");
  const fresh = await enterPractice(owner.signedIn, owner.csrfToken);
  const reopened = new Pool({ connectionString: settings.DATABASE_URL, max: 1 });
  try {
    assert.deepEqual(await createWorkspaceApplication({ pool: reopened, sessionId: fresh.sessionId }).workPlan
      .read(jobId, planQuery), updated);
  } finally {
    await reopened.end();
  }
  const outsider = await signIn("second-builder");
  const otherPlan = createWorkspaceApplication({ pool: runtime, sessionId: outsider.sessionId }).workPlan;
  await assert.rejects(otherPlan.read(jobId, planQuery), { code: "NOT_FOUND" });
  await assert.rejects(otherPlan.edit(jobId, { ...dated, commandId: randomUUID(), expectedVersion: 3 }), { code: "NOT_FOUND" });
  assert.deepEqual(await workPlan.read(jobId, planQuery), updated);

  // A later approved revision of the extra keeps the builder's planning and flags it for review.
  await vary("approve", { ...approve, revisionId: pendingId, approvalId: randomUUID() });
  const revised = await workPlan.read(jobId, planQuery);
  assert.deepEqual(revised.agreement.approvedVariations.map(item => [item.scopeItemId, item.revisionId, item.signedDeltaPence]),
    [[scopeItemId, pendingId, 35000]]);
  assert.deepEqual(revised.tasks[1], { ...updated.tasks[1], title: "Unapproved replacement trim", needsReview: true });
  assert.deepEqual(revised.unplanned, live.unplanned);
  assert.equal(revised.scopeItems.find(item => item.scopeItemId === scopeItemId).variationRevisionId, pendingId);
  await assert.rejects(workPlan.edit(jobId, { ...planEdit(revised, revised.tasks[1], { durationMinutes: 60 }),
    variationRevisionId: revisionId }), { code: "WORK_PLAN_VERSION_CONFLICT" }, "an edit planned against the old revision is stale");
  await workPlan.edit(jobId, { ...planEdit(revised, revised.tasks[1], { durationMinutes: 60 }), variationRevisionId: pendingId });
  const { rows: [latest] } = await admin.query(`SELECT variation_revision_id FROM app.v2_work_plan_edit
    WHERE (job_id, scope_item_id) = ($1, $2) ORDER BY expected_version DESC LIMIT 1`, [jobId, scopeItemId]);
  assert.equal(latest.variation_revision_id, pendingId);
  const replanned = await workPlan.read(jobId, planQuery);
  assert.equal(replanned.tasks[1].durationMinutes, 60);
  assert.equal(replanned.tasks[1].needsReview, undefined, "an edit against the approved revision clears the review flag");

  // An approved omission is removed work: its money stays in the agreement, but it never becomes a task,
  // even under a tiling parent whose template tasks would otherwise match.
  const tiling = live.scopeItems.find(item => item.category === "Tiling");
  const omissionId = randomUUID();
  const omittedScope = randomUUID();
  const omission = await vary("propose", { proposalId: omissionId, scopeItemId: omittedScope, existingScopeItemId: null,
    lineageParentScopeItemId: tiling.scopeItemId, description: "Omit the upstand tiling", captureText: "Customer drops the upstand",
    price: { ...price, unitRatePence: 18000, direction: "omission" } });
  const omissionRevision = omission.variations.find(item => item.id === omissionId).currentRevisionId;
  await vary("approve", { ...approve, variationId: omissionId, revisionId: omissionRevision, approvalId: randomUUID() });
  // A zero-value extra stores no direction, so it is not assumed to be work.
  const freeId = randomUUID();
  const freeScope = randomUUID();
  const free = await vary("propose", { proposalId: freeId, scopeItemId: freeScope, existingScopeItemId: null,
    lineageParentScopeItemId: null, description: "No-charge extra", captureText: "Builder adds a no-charge extra",
    price: { ...price, unitRatePence: 0 } });
  const freeRevision = free.variations.find(item => item.id === freeId).currentRevisionId;
  await vary("approve", { ...approve, variationId: freeId, revisionId: freeRevision, approvalId: randomUUID() });
  const removed = await workPlan.read(jobId, planQuery);
  assert.deepEqual(removed.tasks, replanned.tasks, "an approved omission adds no task");
  assert.deepEqual(removed.unplanned, replanned.unplanned, "an approved omission is not Unplanned work");
  assert.deepEqual(removed.extrasNotPlanned, [
    { scopeItemId: omittedScope, title: "Omit the upstand tiling", reason: "omission", planningDropped: false },
    { scopeItemId: freeScope, title: "No-charge extra", reason: "direction_unknown", planningDropped: false },
  ]);
  const money = Object.fromEntries(removed.agreement.approvedVariations.map(item => [item.scopeItemId, item.signedDeltaPence]));
  assert.deepEqual(money, { [scopeItemId]: 35000, [omittedScope]: -18000, [freeScope]: 0 }, "the agreement keeps every approved revision's money");
  for (const [scope, revision] of [[omittedScope, omissionRevision], [freeScope, freeRevision]]) {
    const command = planEdit(removed, { scopeItemId: scope, key: customTaskKey }, { position: 1, trade: "tiler", durationMinutes: 30 });
    await assert.rejects(workPlan.edit(jobId, command), { code: "WORK_PLAN_INVALID_EDIT" });
    await assert.rejects(workPlan.edit(jobId, { ...command, variationRevisionId: revision }), { code: "WORK_PLAN_INVALID_EDIT" });
    await assert.rejects(rawEdit(revision, scope), { code: "23503" }, "the database refuses planning a non-addition");
  }

  // A planned extra whose later approved revision is an omission leaves the plan, and the builder is told.
  const flipId = randomUUID();
  await vary("revise", { variationId: proposalId, expectedRevisionId: pendingId, revisionId: flipId,
    description: "Trim no longer needed", price: { ...price, direction: "omission" } });
  await vary("approve", { ...approve, revisionId: flipId, approvalId: randomUUID() });
  const flipped = await workPlan.read(jobId, planQuery);
  assert.equal(flipped.tasks.some(task => task.scopeItemId === scopeItemId), false);
  assert.equal(flipped.unplanned.some(item => item.scopeItemId === scopeItemId), false);
  assert.equal(flipped.scopeItems.some(item => item.scopeItemId === scopeItemId), false);
  assert.deepEqual(flipped.extrasNotPlanned[0],
    { scopeItemId, title: "Trim no longer needed", reason: "omission", planningDropped: true });
  assert.equal(flipped.agreement.approvedVariations.find(item => item.scopeItemId === scopeItemId).signedDeltaPence, -12500);
  assert.equal(flipped.version, replanned.version, "removal by approval records no plan edit");
  assert.deepEqual(await effectCounts(), beforeApproval, "omissions schedule, send, book, order and charge nothing");

  const state = await workState.get(jobId);
  const expectedRevision = (state.events.at(-1)?.sequence ?? 0) + state.links.length;
  const closed = await workState.command(jobId, { version: "job-work-state-command.v1", commandId: randomUUID(),
    expectedRevision, action: "close", reason: "cancelled_by_customer", note: "Fictional customer cancelled the work" });
  assert.equal(closed.events.at(-1).kind, "closed");
  assert.deepEqual(await workPlan.read(jobId, planQuery), flipped);
});

const measurementQuery = { version: "v2-measurement-query.v1" };
const packInputs = {
  wastageMultiplier: "1.10",
  product: { packSize: { quantity: "1.2", unit: "m²" } },
  confirmedUsablePacksSetAside: 0n,
};

async function seededMeasurement(category = "Tiling") {
  const owner = await signIn("builder");
  const { measurements } = createWorkspaceApplication({ pool: runtime, sessionId: owner.sessionId });
  const { quoteRevisionId } = await acceptedPlanSource();
  const { rows: [scope] } = await admin.query(`
    SELECT scope_item_id FROM app.quote_line
    WHERE (tenant_id, job_id, quote_revision_id) = ($1, $2, $3) AND included AND category = $4
  `, [DEMO_TENANT_ID, jobId, quoteRevisionId, category]);
  const scopeItemId = scope.scope_item_id;
  return { measurements, owner, scopeItemId, command: {
    version: "v2-measurement-command.v1", scopeItemId, commandId: randomUUID(),
    expectedVersion: 0, quantity: "6.000000", unit: "m²", confirmed: false,
  } };
}

test("the seeded scope asks for missing and unconfirmed measurements and calculates from a confirmed revision", async () => {
  const { measurements, owner, scopeItemId, command } = await seededMeasurement();
  const before = await effectCounts();
  const query = { ...measurementQuery, scopeItemId };
  const question = { scopeItemId, status: "needs_input", reason: "measurement" };
  const [missing] = await measurements.read(jobId, query);
  assert.deepEqual(missing, { scopeItemId, version: 0, measurement: null });
  assert.deepEqual(await measurements.calculatePacks(jobId, scopeItemId, packInputs), question);
  for (const quantity of ["six", "0.000000", "6.0000001", "06", "6\n", 6]) {
    await assert.rejects(measurements.save(jobId, { ...command, quantity }), { code: "MEASUREMENT_INVALID_COMMAND" });
  }
  await assert.rejects(measurements.save(jobId, { ...command, scopeItemId: randomUUID() }), { code: "NOT_FOUND" });

  const [draft, replay] = await Promise.all([measurements.save(jobId, command), measurements.save(jobId, command)]);
  assert.deepEqual(replay, draft);
  assert.equal(draft.version, 1);
  assert.equal(draft.source, "builder_typed");
  assert.equal(draft.confirmedAt, null);
  assert.equal(draft.confirmedByMembershipId, null);
  assert.deepEqual(await measurements.calculatePacks(jobId, scopeItemId, packInputs), question);

  const confirm = { ...command, commandId: randomUUID(), expectedVersion: 1, confirmed: true };
  const revisions = await Promise.allSettled([
    measurements.save(jobId, confirm),
    measurements.save(jobId, { ...confirm, commandId: randomUUID() }),
  ]);
  assert.equal(revisions.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(revisions.find(result => result.status === "rejected").reason.code, "MEASUREMENT_VERSION_CONFLICT");
  const confirmed = revisions.find(result => result.status === "fulfilled").value;
  assert.equal(confirmed.version, 2);
  assert.equal(confirmed.quantity, "6.000000");
  assert.equal(confirmed.confirmedByMembershipId, owner.membershipId);
  assert.deepEqual(confirmed.confirmedAt, confirmed.recordedAt);
  assert.deepEqual(await measurements.calculatePacks(jobId, scopeItemId, packInputs), {
    scopeItemId, status: "calculated", grossPacks: 6n, setAsidePacksUsed: 0n, neededPacks: 6n,
  });

  const fresh = await enterPractice(owner.signedIn, owner.csrfToken);
  assert.notEqual(fresh.sessionId, owner.sessionId);
  const { measurements: reopened } = createWorkspaceApplication({ pool: runtime, sessionId: fresh.sessionId });
  assert.deepEqual(await reopened.save(jobId, command), draft);
  await assert.rejects(reopened.save(jobId, { ...command, quantity: "7" }), { code: "MEASUREMENT_COMMAND_CONFLICT" });
  assert.deepEqual(await reopened.read(jobId, query), [{ scopeItemId, version: 2, measurement: confirmed }]);
  const listed = await reopened.read(jobId, measurementQuery);
  assert.deepEqual(listed.find(item => item.scopeItemId === scopeItemId), { scopeItemId, version: 2, measurement: confirmed });
  const { scopeItemId: decoratingId } = await seededMeasurement("Decorating");
  assert.deepEqual(listed.find(item => item.scopeItemId === decoratingId), {
    scopeItemId: decoratingId, version: 0, measurement: null,
  });
  const { rows: [stored] } = await admin.query(`
    SELECT count(*)::int AS revisions FROM app.v2_measurement WHERE job_id = $1
  `, [jobId]);
  assert.equal(stored.revisions, 2);
  assert.deepEqual(await effectCounts(), before);
  const { rows: [{ paid }] } = await admin.query(`SELECT count(*)::int AS paid
    FROM app.job_record_proposal WHERE model IS DISTINCT FROM 'fixture-capture-v1'`);
  assert.equal(paid, 0);
});

test("forced measurement policies hide revisions and reject changes from the second firm", async () => {
  const { command, scopeItemId, owner, measurements: builder } = await seededMeasurement("Decorating");
  await builder.save(jobId, { ...command, quantity: "2", unit: "litre", confirmed: true });
  const outsider = await signIn("second-builder");
  const { measurements } = createWorkspaceApplication({ pool: runtime, sessionId: outsider.sessionId });
  await assert.rejects(measurements.read(jobId, measurementQuery), { code: "NOT_FOUND" });
  await assert.rejects(measurements.save(jobId, command), { code: "NOT_FOUND" });
  await assert.rejects(measurements.calculatePacks(jobId, scopeItemId, packInputs), { code: "NOT_FOUND" });

  const { context } = await authenticatePracticeSession(runtime, outsider.sessionId);
  const { rows: [acl] } = await admin.query(`SELECT
    relrowsecurity AND relforcerowsecurity AS forced, relowner::regrole::text AS owner,
    has_table_privilege('jobguard_runtime', oid, 'SELECT') AS can_read,
    has_table_privilege('jobguard_runtime', oid, 'INSERT') AS can_insert,
    has_table_privilege('jobguard_runtime', oid, 'UPDATE,DELETE,TRUNCATE') AS can_mutate,
    has_table_privilege('jobguard_identity', oid, 'SELECT,INSERT,UPDATE,DELETE') AS identity_access,
    has_table_privilege('jobguard_worker', oid, 'SELECT,INSERT,UPDATE,DELETE') AS worker_access,
    has_table_privilege('jobguard_infrastructure', oid, 'SELECT,INSERT,UPDATE,DELETE') AS infra_access
    FROM pg_class WHERE oid = 'app.v2_measurement'::regclass`);
  assert.deepEqual(acl, { forced: true, owner: "jobguard_migration", can_read: true, can_insert: true, can_mutate: false,
    identity_access: false, worker_access: false, infra_access: false });
  const key = [DEMO_TENANT_ID, jobId, scopeItemId];
  const filter = "WHERE (tenant_id, job_id, scope_item_id) = ($1, $2, $3)";
  const select = `SELECT * FROM app.v2_measurement ${filter}`;
  const { context: ownerContext } = await authenticatePracticeSession(runtime, owner.sessionId);
  const query = (scope, sql, params) => withTenant(runtime, scope, db => db.$client.query(sql, params));
  assert.equal((await query(ownerContext, select, key)).rowCount, 1);
  for (const scope of [outsider.realContext, context]) {
    assert.equal((await query(scope, select, key)).rowCount, 0);
    await assert.rejects(query(scope, `INSERT INTO app.v2_measurement
      (tenant_id, job_id, scope_item_id, expected_version, command_id, quantity, unit, source, confirmed, actor_membership_id)
      VALUES ($1,$2,$3,2,$4,'7','m²','builder_typed',true,$5)`,
    [...key, randomUUID(), owner.membershipId]), { code: "42501", message: /row-level security policy/u });
    await assert.rejects(query(scope, `UPDATE app.v2_measurement SET quantity = '7' ${filter}`, key), { code: "42501" });
    await assert.rejects(query(scope, `DELETE FROM app.v2_measurement ${filter}`, key), { code: "42501" });
  }
  assert.equal((await runtime.query(select, key)).rowCount, 0);
});

test("each recorded plan edit appends one audit event in its transaction, and a replay appends none", async () => {
  const { draftJob, sessionId, read, edit } = await draftForPlan();
  const { context: practice } = await authenticatePracticeSession(runtime, sessionId);
  const plan = await read();
  const task = plan.tasks[0];
  const command = planEdit(plan, task, { trade: "specialist tiler", durationMinutes: 77 });
  const receipt = await edit(command);
  const [event, ...extra] = await editEvents(draftJob);
  assert.equal(extra.length, 0);
  assert.equal(event.tenant_id, practice.tenantId);
  assert.equal(event.actor_ref, `membership:${receipt.actorMembershipId}`);
  assert.deepEqual(event.payload.references, {
    ...event.payload.references, commandId: command.commandId, quoteRevisionId: plan.quoteRevisionId,
    scopeItemId: task.scopeItemId, taskKey: task.key, expectedVersion: "0", planVersion: "1",
    changedFields: "durationMinutes/trade",
  });
  assert.equal("version" in event.payload.references, false);
  assert.match(event.payload.hashes.changes, /^[a-f0-9]{64}$/u);
  assert.doesNotMatch(JSON.stringify(event.payload), /specialist tiler/u, "free-text trade stays out of the audit payload");

  assert.deepEqual(await edit(command), receipt);
  await Promise.all([edit(command), edit(command)]);
  assert.equal((await editEvents(draftJob)).length, 1, "replays append nothing");

  // Fail the audit append after the edit insert: the transaction must keep neither.
  const failing = {
    async connect() {
      const client = await runtime.connect();
      const query = client.query.bind(client);
      client.query = (sql, ...rest) => typeof sql === "string" && sql.includes("app.append_audit(")
        ? Promise.reject(Object.assign(new Error("forced audit failure"), { code: "FORCED" })) : query(sql, ...rest);
      const release = client.release.bind(client);
      client.release = (...args) => { client.query = query; return release(...args); };
      return client;
    },
  };
  const next = planEdit(await read(), task, { durationMinutes: 90 });
  await assert.rejects(new WorkPlanRepository(failing).edit(practice, draftJob, sessionId, next), { code: "FORCED" });
  const { rows: [{ count }] } = await admin.query(
    "SELECT count(*)::int AS count FROM app.v2_work_plan_edit WHERE command_id = $1", [next.commandId]);
  assert.equal(count, 0, "the edit rolled back with its audit event");
  assert.equal((await editEvents(draftJob)).length, 1);
  assert.equal((await read()).version, 1);

  await edit(next);
  assert.equal((await editEvents(draftJob)).length, 2);
  await verifyTenantChain(practice.tenantId);

  // The audit chain is tenant-scoped (0001_audit.sql), so the second firm's own tenant sees none of these events.
  // Shared practice sessions share one practice tenant, as for every other practice audit event.
  const outsider = await signIn("second-builder");
  assert.notEqual(outsider.realContext.tenantId, practice.tenantId);
  const { rowCount } = await withTenant(runtime, outsider.realContext, db => db.$client.query(
    "SELECT 1 FROM app.audit_event WHERE subject_ref = $1", [draftJob]));
  assert.equal(rowCount, 0, "the second firm cannot see the edit events");
});

const generatedEvents = async quoteRevisionId => (await admin.query(`SELECT tenant_id, actor_ref, subject_ref, payload
  FROM app.audit_event WHERE event_type = 'v2_work_plan.generated' AND payload->'references'->>'quoteRevisionId' = $1
  ORDER BY sequence`, [quoteRevisionId])).rows;

// Fails the audit append inside the repository's own transaction, after the plan and task inserts.
const failingAuditPool = pool => ({
  async connect() {
    const client = await pool.connect();
    const query = client.query.bind(client);
    client.query = (sql, ...rest) => typeof sql === "string" && sql.includes("app.append_audit(")
      ? Promise.reject(Object.assign(new Error("forced audit failure"), { code: "FORCED" })) : query(sql, ...rest);
    const release = client.release.bind(client);
    client.release = (...args) => { client.query = query; return release(...args); };
    return client;
  },
});

test("creating a plan appends one audit event in its transaction, and a replay appends none", async () => {
  const { sessionId, realContext } = await signIn("builder");
  const { context } = await authenticatePracticeSession(runtime, sessionId);
  const { capture, quote } = createWorkspaceApplication({ pool: runtime, sessionId });
  const saved = await capture.create({
    contractVersion: "job_capture_v1", requested_tenant_id: DEMO_TENANT_ID, captureId: randomUUID(),
    fixtureId: "v2-c1-plan-audit",
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

  // A forced audit failure after the inserts leaves neither the plan, its tasks nor an event.
  await assert.rejects(new WorkPlanRepository(failingAuditPool(runtime), joineryTemplate).generate(context, source),
    { code: "FORCED" });
  assert.deepEqual(await planCounts(source.quoteRevisionId), [0, 0]);
  assert.equal((await generatedEvents(source.quoteRevisionId)).length, 0);

  const plans = new WorkPlanRepository(runtime, joineryTemplate);
  const [first, second] = await Promise.all([plans.generate(context, source), plans.generate(context, source)]);
  assert.deepEqual(second, first);
  assert.deepEqual(await plans.generate(context, source), first);
  const [event, ...extra] = await generatedEvents(source.quoteRevisionId);
  assert.equal(extra.length, 0, "concurrent and repeated generation append one event");
  assert.equal(event.tenant_id, context.tenantId);
  assert.equal(event.actor_ref, "system:v2-work-plan");
  assert.equal(event.subject_ref, saved.jobId);
  assert.deepEqual(event.payload.references, {
    ...event.payload.references, quoteRevisionId: source.quoteRevisionId, templateKey: joineryTemplate.key, taskCount: "1",
  });
  assert.equal("version" in event.payload.references, false);
  assert.match(event.payload.hashes.tasks, /^[a-f0-9]{64}$/u);
  assert.doesNotMatch(JSON.stringify(event.payload), /shelf/iu, "no free text in the audit payload");

  const { rows: chain } = await admin.query(`SELECT id, tenant_id AS "tenantId", sequence::int, version, actor_ref AS "actorRef",
    event_type AS "eventType", subject_type AS "subjectType", subject_ref AS "subjectRef", occurred_at AS "occurredAt", payload,
    trim(payload_hash) AS "payloadHash", trim(previous_hash) AS "previousHash", trim(event_hash) AS "eventHash"
    FROM app.audit_event WHERE tenant_id = $1 ORDER BY sequence`, [context.tenantId]);
  assert.doesNotThrow(() => verifyAuditChain(chain));

  // The audit chain is tenant-scoped, so the second firm's own tenant sees none of it.
  const outsider = await signIn("second-builder");
  assert.notEqual(outsider.realContext.tenantId, context.tenantId);
  assert.notEqual(realContext.tenantId, outsider.realContext.tenantId);
  const { rowCount } = await withTenant(runtime, outsider.realContext, db => db.$client.query(
    "SELECT 1 FROM app.audit_event WHERE subject_ref = $1", [saved.jobId]));
  assert.equal(rowCount, 0);
});

test("opening the plan screen creates the plan with one audit event; a quote-save refresh adds none", async () => {
  const { draftJob, lines, save, read, edit } = await draftForPlan();
  const plan = await read();
  const [opened, ...extra] = await generatedEvents(plan.quoteRevisionId);
  assert.equal(extra.length, 0);
  assert.equal(opened.actor_ref, "system:v2-work-plan");
  assert.equal(opened.subject_ref, draftJob);
  assert.equal(opened.payload.references.taskCount, String(plan.tasks.length));
  await Promise.all([read(), read()]);
  await edit(planEdit(await read(), plan.tasks[0], { durationMinutes: 61 }));
  assert.equal((await generatedEvents(plan.quoteRevisionId)).length, 1, "reopening and editing append no second creation event");

  const revision = await save(1, lines.map((line, index) => index === 0 ? { ...line, quantity: "2" } : line));
  const nextId = revision.draft.currentRevisionId;
  assert.deepEqual(await planCounts(nextId), [1, 4], "the quote save created the refreshed plan");
  assert.equal((await generatedEvents(nextId)).length, 0, "the refresh is covered by the quote save event");
  const { rows: saves } = await admin.query(`SELECT 1 FROM app.audit_event WHERE event_type = 'quote.draft.saved'
    AND subject_ref = $1 AND payload->'references'->>'jobId' = $2`, [nextId, draftJob]);
  assert.equal(saves.length, 1, "the quote save appended its own event for the refreshed revision");
  await read();
  assert.equal((await generatedEvents(nextId)).length, 0);
});


// V2-D1R1: measurement audit append, replay, rollback and tenant-chain proof.
for (const confirmed of [false, true]) {
  test(`a measurement ${confirmed ? "confirmation" : "save"} appends once, rolls back atomically and stays tenant-scoped`, async () => {
    const { measurements, owner, scopeItemId, command: initial } = await seededMeasurement();
    const { context } = await authenticatePracticeSession(runtime, owner.sessionId);
    const [current] = await measurements.read(jobId, { ...measurementQuery, scopeItemId });
    const command = { ...initial, expectedVersion: current.version, confirmed };
    const events = async () => (await admin.query(`SELECT tenant_id, actor_ref, event_type, payload
      FROM app.audit_event WHERE subject_type = 'scope_item' AND subject_ref = $1
      AND event_type IN ('v2.measurement.saved', 'v2.measurement.confirmed') ORDER BY sequence`, [scopeItemId])).rows;
    const before = await events();
    const receipt = await measurements.save(jobId, command);
    const recorded = await events();
    assert.equal(recorded.length, before.length + 1);
    const event = recorded.at(-1);
    assert.equal(event.tenant_id, context.tenantId);
    assert.equal(event.actor_ref, `membership:${owner.membershipId}`);
    assert.equal(event.event_type, confirmed ? "v2.measurement.confirmed" : "v2.measurement.saved");
    assert.deepEqual(event.payload.references, { ...event.payload.references,
      commandId: command.commandId, jobId, scopeItemId, expectedVersion: String(current.version),
      measurementVersion: String(receipt.version), quantity: receipt.quantity,
      source: "builder_typed", confirmed: String(confirmed) });
    assert.equal("version" in event.payload.references, false);
    assert.equal(event.payload.hashes.unit, createHash("sha256").update(command.unit).digest("hex"));

    assert.deepEqual(await measurements.save(jobId, command), receipt);
    const replays = await Promise.all([measurements.save(jobId, command), measurements.save(jobId, command)]);
    assert.deepEqual(replays, [receipt, receipt]);
    await assert.rejects(measurements.save(jobId, { ...command, quantity: "7" }), { code: "MEASUREMENT_COMMAND_CONFLICT" });
    assert.deepEqual(await events(), recorded, "replays and conflicts append nothing");

    const failing = {
      async connect() {
        const client = await runtime.connect();
        const query = client.query.bind(client);
        client.query = (sql, ...rest) => typeof sql === "string" && sql.includes("app.append_audit(")
          ? Promise.reject(Object.assign(new Error("forced audit failure"), { code: "FORCED" })) : query(sql, ...rest);
        const release = client.release.bind(client);
        client.release = (...args) => { client.query = query; return release(...args); };
        return client;
      },
    };
    const next = { ...command, commandId: randomUUID(), expectedVersion: receipt.version, quantity: "8" };
    await assert.rejects(new MeasurementRepository(failing).save(context, jobId, owner.sessionId, next), { code: "FORCED" });
    const { rows: [{ count }] } = await admin.query(
      "SELECT count(*)::int AS count FROM app.v2_measurement WHERE command_id = $1", [next.commandId]);
    assert.equal(count, 0, "the measurement insert rolls back when audit append fails");
    assert.deepEqual(await events(), recorded);
    assert.deepEqual(await measurements.read(jobId, { ...measurementQuery, scopeItemId }),
      [{ scopeItemId, version: receipt.version, measurement: receipt }]);

    await measurements.save(jobId, next);
    assert.equal((await events()).length, recorded.length + 1);
    await verifyTenantChain(context.tenantId);
    const outsider = await signIn("second-builder");
    assert.notEqual(outsider.realContext.tenantId, context.tenantId);
    const { rowCount } = await withTenant(runtime, outsider.realContext, db => db.$client.query(
      "SELECT 1 FROM app.audit_event WHERE subject_type = 'scope_item' AND subject_ref = $1", [scopeItemId]));
    assert.equal(rowCount, 0, "the second firm's real tenant cannot see measurement audit events");
  });
}

test("measurement commands remain disabled outside local V2", async () => {
  const previous = process.env.JOBGUARD_LOCAL_V2;
  delete process.env.JOBGUARD_LOCAL_V2;
  try {
    const { measurements } = createWorkspaceApplication({ pool: runtime });
    await assert.rejects(measurements.save(jobId, {
      version: "v2-measurement-command.v1", scopeItemId: randomUUID(), commandId: randomUUID(),
      expectedVersion: 0, quantity: "1", unit: "m²", confirmed: true,
    }), { code: "SYNTHETIC_MODE_REQUIRED" });
  } finally {
    if (previous === undefined) delete process.env.JOBGUARD_LOCAL_V2;
    else process.env.JOBGUARD_LOCAL_V2 = previous;
  }
});

// V2-C3C (Q28, migration 2027): firm-owned crew records and assigneeRef on work-plan-edit.v1.
const crewTable = "app.v2_crew_contact";
const crewCommand = (changes = {}) => ({ version: "crew-contact.v1", commandId: randomUUID(), crewId: randomUUID(),
  expectedRevision: 0, displayName: "Sam Fictional", trade: "tiler", phone: "07700 900123",
  email: "sam@crew.jobguard-v2.invalid", ...changes });
const crewApp = sessionId => createWorkspaceApplication({ pool: runtime, sessionId }).crewContacts;
const crewEvents = async crewId => (await admin.query(`SELECT tenant_id, actor_ref, event_type, payload FROM app.audit_event
  WHERE subject_type = 'crew_contact' AND subject_ref = $1 ORDER BY sequence`, [crewId])).rows;
const assignedEvents = async jobRef => (await admin.query(`SELECT payload FROM app.audit_event
  WHERE subject_type = 'job' AND subject_ref = $1 AND event_type = 'v2.work_plan.task_assigned' ORDER BY sequence`, [jobRef])).rows;

test("C3C: crew records are forced to their own firm in the shared practice tenant and the second firm's real tenant", async () => {
  const owner = await signIn("builder");
  const outsider = await signIn("second-builder");
  const mine = await crewApp(owner.sessionId).record(crewCommand());
  const { rows: [acl] } = await admin.query(`SELECT
    relrowsecurity AND relforcerowsecurity AS forced, relowner::regrole::text AS owner,
    has_table_privilege('jobguard_runtime',oid,'SELECT') AS can_read,
    has_table_privilege('jobguard_runtime',oid,'INSERT') AS can_insert,
    has_table_privilege('jobguard_runtime',oid,'UPDATE,DELETE,TRUNCATE') AS can_mutate,
    has_table_privilege('jobguard_identity',oid,'SELECT,INSERT,UPDATE,DELETE') AS identity_access,
    has_table_privilege('jobguard_worker',oid,'SELECT,INSERT,UPDATE,DELETE') AS worker_access,
    has_table_privilege('jobguard_infrastructure',oid,'SELECT,INSERT,UPDATE,DELETE') AS infra_access
    FROM pg_class WHERE oid=$1::regclass`, [crewTable]);
  assert.deepEqual(acl, { forced: true, owner: "jobguard_migration", can_read: true, can_insert: true, can_mutate: false,
    identity_access: false, worker_access: false, infra_access: false });

  const { context: shared } = await authenticatePracticeSession(runtime, outsider.sessionId);
  assert.equal(shared.tenantId, DEMO_TENANT_ID, "both firms' practice sessions share one backing tenant");
  const { rows: [row] } = await admin.query(`SELECT tenant_id, firm_key FROM ${crewTable} WHERE crew_id = $1`, [mine.crewId]);
  assert.equal(row.tenant_id, DEMO_TENANT_ID);
  assert.ok(!(await crewApp(outsider.sessionId).list({ version: "crew-contact-query.v1" }))
    .some(contact => contact.crewId === mine.crewId));
  for (const scope of [shared, outsider.realContext]) {
    const query = (sql, params) => withTenant(runtime, scope, db => db.$client.query(sql, params));
    assert.equal((await query(`SELECT * FROM ${crewTable} WHERE crew_id = $1`, [mine.crewId])).rowCount, 0);
    assert.equal((await query(`SELECT * FROM ${crewTable}`)).rows.filter(r => r.firm_key === row.firm_key).length, 0);
    await assert.rejects(query(`INSERT INTO ${crewTable} (tenant_id, firm_key, crew_id, revision, command_id, display_name,
      trade, phone, actor_membership_id) VALUES ($1, $2, $3, 1, $4, 'Copy', 'tiler', '07700900124', $5)`,
    [row.tenant_id, row.firm_key, randomUUID(), randomUUID(), mine.actorMembershipId]),
    { code: "42501", message: /row-level security policy/u });
    await assert.rejects(query(`UPDATE ${crewTable} SET trade = 'x' WHERE crew_id = $1`, [mine.crewId]), { code: "42501" });
    await assert.rejects(query(`DELETE FROM ${crewTable} WHERE crew_id = $1`, [mine.crewId]), { code: "42501" });
  }
  // Nor can a raw insert give another firm's crewId a later revision: it must name a predecessor in its own firm.
  for (const previous of [null, 1]) {
    await assert.rejects(withTenant(runtime, shared, async db => {
      const { rows: [{ key }] } = await db.$client.query("SELECT app.current_firm_profile_key() AS key");
      return db.$client.query(`INSERT INTO ${crewTable} (tenant_id, firm_key, crew_id, revision, previous_revision, command_id,
        display_name, trade, phone, actor_membership_id) VALUES ($1, $2, $3, 2, $4, $5, 'Copy', 'tiler', '07700900124', $6)`,
      [DEMO_TENANT_ID, key, mine.crewId, previous, randomUUID(), mine.actorMembershipId]);
    }), { code: previous === null ? "23514" : "23503" });
  }
  // The second firm cannot take over the crewId either: it is refused as stale, never revealed.
  await assert.rejects(crewApp(outsider.sessionId).record(crewCommand({ crewId: mine.crewId })),
    { code: "CREW_CONTACT_VERSION_CONFLICT" });
  await assert.rejects(crewApp(outsider.sessionId).record(crewCommand({ crewId: mine.crewId, expectedRevision: 1 })),
    { code: "CREW_CONTACT_VERSION_CONFLICT" });
  // The owner's own firm context sees its row; the runtime cannot change it.
  const { context } = await authenticatePracticeSession(runtime, owner.sessionId);
  const own = (sql, params) => withTenant(runtime, context, db => db.$client.query(sql, params));
  assert.equal((await own(`SELECT * FROM ${crewTable} WHERE crew_id = $1`, [mine.crewId])).rowCount, 1);
  await assert.rejects(own(`UPDATE ${crewTable} SET trade = 'x' WHERE crew_id = $1`, [mine.crewId]), { code: "42501" });
  await assert.rejects(own(`DELETE FROM ${crewTable} WHERE crew_id = $1`, [mine.crewId]), { code: "42501" });
});

test("C3C: contacts hold practice data only, and a correction is a new revision", async () => {
  const owner = await signIn("builder");
  const crew = crewApp(owner.sessionId);
  for (const bad of [{ phone: "07911 123456" }, { phone: "020 7946 1234" }, { email: "sam@example.com" }, { displayName: " " }]) {
    await assert.rejects(crew.record(crewCommand(bad)), { code: "CREW_CONTACT_INVALID" });
  }
  const first = await crew.record(crewCommand({ email: null }));
  // The database refuses real-looking contact data even when the app check is bypassed.
  const { context } = await authenticatePracticeSession(runtime, owner.sessionId);
  const { rows: [{ firm_key: firmKey }] } = await admin.query(`SELECT firm_key FROM ${crewTable} WHERE crew_id = $1`, [first.crewId]);
  for (const [phone, email] of [["07911123456", null], ["07700900125", "sam@example.com"]]) {
    await assert.rejects(withTenant(runtime, context, db => db.$client.query(`INSERT INTO ${crewTable}
      (tenant_id, firm_key, crew_id, revision, command_id, display_name, trade, phone, email, actor_membership_id)
      VALUES ($1, $2, $3, 1, $4, 'Raw', 'tiler', $5, $6, $7)`,
    [DEMO_TENANT_ID, firmKey, randomUUID(), randomUUID(), phone, email, first.actorMembershipId])), { code: "23514" });
  }
  const correction = await crew.record(crewCommand({ crewId: first.crewId, expectedRevision: 1, phone: "01632 960001" }));
  assert.equal(correction.revision, 2);
  assert.equal(correction.phone, "01632960001");
  const { rows } = await admin.query(`SELECT revision, previous_revision, phone FROM ${crewTable} WHERE crew_id = $1
    ORDER BY revision`, [first.crewId]);
  assert.deepEqual(rows, [{ revision: 1, previous_revision: null, phone: "07700900123" },
    { revision: 2, previous_revision: 1, phone: "01632960001" }], "the first revision is kept unchanged");
  const listed = (await crew.list({ version: "crew-contact-query.v1" })).filter(contact => contact.crewId === first.crewId);
  assert.deepEqual(listed.map(contact => contact.revision), [2]);
  await assert.rejects(crew.record(crewCommand({ crewId: first.crewId, expectedRevision: 1 })),
    { code: "CREW_CONTACT_VERSION_CONFLICT" });
});

test("audit-chain: packages/db/src/v2-crew-contact-repository.ts#CrewContactRepository.record", async () => {
  const owner = await signIn("builder");
  const crew = crewApp(owner.sessionId);
  const { context } = await authenticatePracticeSession(runtime, owner.sessionId);
  const command = crewCommand();
  const contact = await crew.record(command);
  const [event, ...extra] = await crewEvents(command.crewId);
  assert.equal(extra.length, 0, "audit-chain: event");
  assert.equal(event.event_type, "v2.crew_contact.recorded");
  assert.equal(event.tenant_id, DEMO_TENANT_ID);
  assert.equal(event.actor_ref, `membership:${contact.actorMembershipId}`);
  assert.deepEqual(event.payload.references, { ...event.payload.references, commandId: command.commandId, crewId: command.crewId,
    expectedRevision: "0", revision: "1" });
  assert.match(event.payload.hashes.contact, /^[a-f0-9]{64}$/u);
  assert.doesNotMatch(JSON.stringify(event.payload), /Sam|07700|900123|invalid|tiler/u, "no contact data in the payload");

  assert.deepEqual(await crew.record(command), contact);
  await Promise.all([crew.record(command), crew.record(command)]);
  assert.equal((await crewEvents(command.crewId)).length, 1, "audit-chain: replay");
  await assert.rejects(crew.record({ ...command, displayName: "Someone else" }), { code: "CREW_CONTACT_COMMAND_CONFLICT" });

  const next = crewCommand({ crewId: command.crewId, expectedRevision: 1, trade: "plasterer" });
  await assert.rejects(new CrewContactRepository(failingAuditPool(runtime)).record(context, owner.sessionId, next),
    { code: "FORCED" });
  const { rows: [{ count }] } = await admin.query(`SELECT count(*)::int AS count FROM ${crewTable} WHERE command_id = $1`,
    [next.commandId]);
  assert.equal(count, 0, "audit-chain: rollback");
  assert.equal((await crewEvents(command.crewId)).length, 1, "audit-chain: rollback");
  assert.equal((await crew.record(next)).revision, 2);
  assert.equal((await crewEvents(command.crewId)).length, 2);
  await verifyTenantChain(DEMO_TENANT_ID);
});

test("C3C: two crew records with the same name get separate assignments, and old free text still displays", async () => {
  const { draftJob, sessionId, read, edit } = await draftForPlan();
  const crew = crewApp(sessionId);
  const [samA, samB] = [await crew.record(crewCommand()), await crew.record(crewCommand({ phone: "07700900456" }))];
  assert.equal(samA.displayName, samB.displayName);
  const plan = await read();
  const [first, second, third] = plan.tasks;
  await edit(planEdit(plan, first, { assigneeRef: samA.crewId }));
  await edit(planEdit(await read(), second, { assigneeRef: samB.crewId }));
  await edit(planEdit(await read(), third, { assignee: "Typed name" }));
  const current = await read();
  const byKey = id => current.tasks.find(task => task.scopeItemId === id.scopeItemId && task.key === id.key);
  assert.equal(byKey(first).assigneeRef, samA.crewId);
  assert.equal(byKey(second).assigneeRef, samB.crewId);
  assert.notEqual(byKey(first).assigneeRef, byKey(second).assigneeRef);
  assert.equal(byKey(third).assignee, "Typed name", "an old free-text assignee still displays");
  assert.equal(byKey(third).assigneeRef, undefined, "free text is never resolved to a crew record");
  const tasksFor = crewId => current.tasks.filter(task => task.assigneeRef === crewId).map(task => task.key + task.scopeItemId);
  assert.deepEqual(tasksFor(samA.crewId), [first.key + first.scopeItemId]);
  assert.deepEqual(tasksFor(samB.crewId), [second.key + second.scopeItemId]);
  // Unassign clears the record.
  await edit(planEdit(current, first, { assigneeRef: null }));
  assert.equal((await read()).tasks.find(task => task.key === first.key &&
    task.scopeItemId === first.scopeItemId).assigneeRef, null);
  assert.equal((await assignedEvents(draftJob)).length, 3);
});

test("C3C: a task can never be assigned to another firm's crew record, even past the app check", async () => {
  const { draftJob, sessionId, read, edit } = await draftForPlan();
  const outsider = await signIn("second-builder");
  const theirs = await crewApp(outsider.sessionId).record(crewCommand({ displayName: "Their crew" }));
  const plan = await read();
  const task = plan.tasks[0];
  await assert.rejects(edit(planEdit(plan, task, { assigneeRef: theirs.crewId })), { code: "WORK_PLAN_INVALID_EDIT" });
  await assert.rejects(edit(planEdit(plan, task, { assigneeRef: randomUUID() })), { code: "WORK_PLAN_INVALID_EDIT" });
  const { context } = await authenticatePracticeSession(runtime, sessionId);
  const { rows: [{ actor }] } = await admin.query(`SELECT actor_membership_id AS actor FROM ${crewTable} WHERE crew_id = $1`,
    [theirs.crewId]);
  const rawEdit = (pool, scope) => withTenant(pool, scope, db => db.$client.query(`INSERT INTO app.v2_work_plan_edit
    (tenant_id, job_id, quote_revision_id, command_id, scope_item_id, template_task_key, expected_version, changes, actor_membership_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [DEMO_TENANT_ID, draftJob, plan.quoteRevisionId, randomUUID(), task.scopeItemId,
    task.key, plan.version, JSON.stringify({ assigneeRef: theirs.crewId }), actor]));
  await assert.rejects(rawEdit(runtime, context), { code: "23503", message: /CREW_CONTACT_UNAVAILABLE/u });
  // Even the migration owner, which row security does not filter, cannot bind the job to the other firm's record.
  await assert.rejects(admin.query(`INSERT INTO app.v2_work_plan_edit
    (tenant_id, job_id, quote_revision_id, command_id, scope_item_id, template_task_key, expected_version, changes, actor_membership_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [DEMO_TENANT_ID, draftJob, plan.quoteRevisionId, randomUUID(), task.scopeItemId,
    task.key, plan.version, JSON.stringify({ assigneeRef: theirs.crewId }), actor]), { code: "23503" });
  assert.equal((await read()).version, plan.version, "nothing was recorded");
});

// Covers the assigneeRef path of the edit command (V2-C3C).
test("audit-chain: packages/db/src/v2-work-plan-repository.ts#WorkPlanRepository.edit", async () => {
  const { draftJob, sessionId, read, edit } = await draftForPlan();
  const { context } = await authenticatePracticeSession(runtime, sessionId);
  const sam = await crewApp(sessionId).record(crewCommand());
  const plan = await read();
  const command = planEdit(plan, plan.tasks[0], { assigneeRef: sam.crewId });
  const receipt = await edit(command);
  const [event, ...extra] = await assignedEvents(draftJob);
  assert.equal(extra.length, 0, "audit-chain: event");
  assert.equal(event.payload.references.changedFields, "assigneeRef");
  assert.equal("version" in event.payload.references, false);
  assert.equal((await editEvents(draftJob)).length, 0, "one event per edit, under the assignment name");
  assert.deepEqual(await edit(command), receipt);
  await Promise.all([edit(command), edit(command)]);
  assert.equal((await assignedEvents(draftJob)).length, 1, "audit-chain: replay");
  await assert.rejects(edit({ ...command, changes: { assigneeRef: null } }), { code: "WORK_PLAN_COMMAND_CONFLICT" });
  const next = planEdit(await read(), plan.tasks[1], { assigneeRef: sam.crewId });
  await assert.rejects(new WorkPlanRepository(failingAuditPool(runtime)).edit(context, draftJob, sessionId, next),
    { code: "FORCED" });
  const { rows: [{ count }] } = await admin.query(
    "SELECT count(*)::int AS count FROM app.v2_work_plan_edit WHERE command_id = $1", [next.commandId]);
  assert.equal(count, 0, "audit-chain: rollback");
  assert.equal((await assignedEvents(draftJob)).length, 1, "audit-chain: rollback");
});

test("C3C: an old free-text edit keeps its saved changes, audit hash and replay", async () => {
  const { draftJob, read, edit } = await draftForPlan();
  const plan = await read();
  const changes = { durationMinutes: 70, assignee: "Sam (typed)" };
  const command = planEdit(plan, plan.tasks[0], changes);
  const receipt = await edit(command);
  const { rows: [saved] } = await admin.query("SELECT changes::text AS changes FROM app.v2_work_plan_edit WHERE command_id = $1",
    [command.commandId]);
  assert.deepEqual(JSON.parse(saved.changes), changes);
  assert.equal("assigneeRef" in JSON.parse(saved.changes), false);
  const [event] = await editEvents(draftJob);
  const sorted = Object.fromEntries(Object.entries(changes).sort(([a], [b]) => a < b ? -1 : 1));
  assert.equal(event.payload.hashes.changes,
    createHash("sha256").update(JSON.stringify(sorted)).digest("hex"));
  assert.equal(event.payload.references.changedFields, "assignee/durationMinutes");
  assert.deepEqual(await edit(command), receipt, "the old command still replays");
});

// V2-PX (Q27, migration 2025): Ben's photo lock, and the shared real-upload photo helper.
const photoTables = ["app.evidence_upload", "app.evidence_object", "app.synthetic_evidence_original", "app.evidence_link",
  "app.job_photo_purpose", "app.evidence_pack", "app.evidence_pack_revision", "app.evidence_pack_attachment_approval",
  "app.extra_evidence_pack", "app.signed_evidence_export", "app.customer_invoice_evidence", "app.final_account_proof",
  "app.proof_application_response"];
const photoTablesByLink = { "app.evidence_invalidation": "evidence_id", "app.synthetic_evidence_chunk": "upload_id" };

// A fresh live practice job of the builder's firm (the shared seeded job is closed by an earlier case).
async function pxLiveJob() {
  const { draftJob, lines, save } = await draftForPlan();
  const { sessionId, cookies, csrfToken } = await signIn("builder");
  const app = createWorkspaceApplication({ pool: runtime, sessionId });
  await save(1, lines);
  const party = await app.parties.view({ sessionId }, draftJob);
  await app.parties.command({ sessionId }, draftJob, {
    version: "job-parties-command.v1", action: "save_form", commandId: randomUUID(),
    expectedJobRevision: party.jobRevision, expectedBindingId: null,
    customer: { version: "customer.v1", type: "person", name: "Fictional Photo Customer",
      email: "customer@jobguard-v2.invalid", phone: "+447700900044" }, customerRef: null,
    site: { version: "site.v1", addressLines: ["14 Fictional Lane"], town: "Sampleford", postcode: "ZY1 0AA" },
    savedSiteRevisionId: null, reuseSiteId: null, expectedReuseRevisionId: null, confirmSamePlace: false,
    payingPartyRevisionId: null, expectedPayerRevisionId: null, correct: false,
  });
  const { view: { documentId, documentVersion, contentHash } } = await app.quote.preview(draftJob, {
    version: "quote-preview-command.v1", recipient: "customer@jobguard-v2.invalid",
  });
  await app.quote.issue(draftJob, { version: "quote-send-command.v1", commandId: randomUUID(),
    documentId, contentHash, recipient: "customer@jobguard-v2.invalid" });
  await json(await request(`/api/jobs/${draftJob}/quotes/delivery/execute`, {
    cookies, body: { version: "quote-execute-command.v1", documentId, mode: "success" },
  }));
  await app.quote.accept(draftJob, { version: "quote-acceptance-command.v1", commandId: randomUUID(),
    documentId, documentVersion, documentHash: contentHash,
    statedCustomerName: "Fictional Photo Customer", statedMethod: "verbal", acceptedAt: new Date().toISOString() });
  await json(await request(`/api/jobs/${draftJob}/quotes/activation`, { cookies, csrf: csrfToken, body: switchLive() }));
  const { rows: [scope] } = await admin.query("SELECT id FROM app.scope_identity WHERE job_id = $1 ORDER BY id LIMIT 1", [draftJob]);
  return { jobId: draftJob, scopeItemId: scope.id, sessionId };
}

test("PX: a real practice photo is locked to its own firm on every evidence and photo table", async () => {
  const { jobId: photoJob, scopeItemId, sessionId } = await pxLiveJob();
  const { context } = await authenticatePracticeSession(runtime, sessionId);
  const photo = await uploadPracticePhoto(runtime, context, { jobId: photoJob, scopeItemId });
  const second = await uploadPracticePhoto(runtime, context, { jobId: photoJob, scopeItemId, fixture: "j3-drainage-photo" });
  assert.notEqual(second.sha256, photo.sha256);

  const { rows: policies } = await admin.query(`SELECT polrelid::regclass::text AS relation FROM pg_policy
    WHERE polname = 'v2_practice_firm' AND NOT polpermissive AND polcmd = '*'
      AND polroles = ARRAY['jobguard_runtime'::regrole::oid] AND polrelid = ANY($1::regclass[])`,
  [[...photoTables, ...Object.keys(photoTablesByLink)]]);
  assert.deepEqual(policies.map(row => row.relation).sort(), [...photoTables, ...Object.keys(photoTablesByLink)].sort());

  // The builder still reads its own photo rows and the exact bytes.
  const own = (sql, params) => withTenant(runtime, context, db => db.$client.query(sql, params));
  const { rows: [object] } = await own(`SELECT o.sha256, o.content_type, s.bytes FROM app.evidence_object o
    JOIN app.synthetic_evidence_original s ON (s.tenant_id, s.upload_id) = (o.tenant_id, o.upload_id)
    WHERE o.job_id = $1 AND o.id = $2`, [photoJob, photo.evidenceId]);
  assert.equal(object.sha256.trim(), photo.sha256);
  assert.equal(object.content_type, "image/png");
  assert.equal(createHash("sha256").update(object.bytes).digest("hex"), photo.sha256);
  const { rows: [upload] } = await own("SELECT state FROM app.evidence_upload WHERE id = $1", [photo.uploadId]);
  assert.equal(upload.state, "verified", "verified by the evidence service itself, not by a fixture");

  const counts = async () => Object.fromEntries(await Promise.all([...photoTables, ...Object.keys(photoTablesByLink)]
    .map(async table => [table, (await admin.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n])));
  const before = await counts();
  const outsider = await signIn("second-builder");
  const { context: shared } = await authenticatePracticeSession(runtime, outsider.sessionId);
  assert.equal(shared.tenantId, context.tenantId, "both firms' practice sessions share one backing tenant");
  for (const scope of [shared, outsider.realContext]) {
    const query = (sql, params) => withTenant(runtime, scope, db => db.$client.query(sql, params));
    for (const table of photoTables) {
      assert.equal((await query(`SELECT 1 FROM ${table} WHERE job_id = $1`, [photoJob])).rowCount, 0, `${table} hidden`);
    }
    assert.equal((await query("SELECT 1 FROM app.evidence_invalidation WHERE evidence_id = ANY($1::uuid[])",
      [[photo.evidenceId, second.evidenceId]])).rowCount, 0);
    assert.equal((await query("SELECT 1 FROM app.synthetic_evidence_chunk WHERE upload_id = ANY($1::uuid[])",
      [[photo.uploadId, second.uploadId]])).rowCount, 0);
    // Writes aimed at the builder's job are refused or touch nothing.
    await assert.rejects(query(`INSERT INTO app.synthetic_evidence_original
      (tenant_id, upload_id, job_id, scope_item_id, object_key, object_version_id, environment, content_type, bytes)
      VALUES ($1, $2, $3, $4, $5, 'copy', 'synthetic_demo', 'image/png', $6)`,
    [context.tenantId, photo.uploadId, photoJob, scopeItemId, `copy/${randomUUID()}`, photo.bytes]), { code: "42501" });
    for (const table of ["app.evidence_upload", "app.evidence_object"]) {
      for (const sql of [`UPDATE ${table} SET retention_class = retention_class WHERE job_id = $1`, `DELETE FROM ${table} WHERE job_id = $1`]) {
        const result = await query(sql, [photoJob]).catch(error => error);
        assert.ok(result.code === "42501" || result.rowCount === 0, `${sql} must not reach the builder's rows`);
      }
    }
  }
  assert.deepEqual(await counts(), before, "the second firm changed nothing");
});

test("PX: main's demo-only proof command still refuses on the V2 database (42501)", async () => {
  const { jobId: photoJob, scopeItemId, sessionId } = await pxLiveJob();
  const { proof } = createWorkspaceApplication({ pool: runtime, sessionId });
  await assert.rejects(proof.command(photoJob, { version: "practice-proof-command.v1", action: "select_generated",
    commandId: randomUUID(), scopeItemId, fixture: "completion-photo" }),
  error => error.code === "42501" && /REQUEST_BINDING_REFUSED/u.test(error.message) &&
    /app\.lp6_session_authority/u.test(error.where ?? ""));
});

test("PX: the photo lock migration is safe to run twice", async () => {
  const policyCount = async () => (await admin.query(
    "SELECT count(*)::int AS n FROM pg_policy WHERE polname = 'v2_practice_firm'")).rows[0].n;
  const before = await policyCount();
  await admin.query(readFileSync(new URL("./migrations/2025_v2_evidence_firm_lock.sql", import.meta.url), "utf8"));
  assert.equal(await policyCount(), before);
});

// V2-E1 open facts. Added as its own block; earlier pieces' tests stay as they are.
const factQuery = { version: "v2-open-fact-query.v1" };
const factCommand = fields => ({ version: "v2-open-fact-command.v1", commandId: randomUUID(), ...fields });
const logFact = fields => factCommand({ action: "log", scopeItemId: null, planTask: null, ...fields });
// Every row a fact answer must leave untouched: plan, stock, scope, price, variation, order and outbox.
const untouchedTables = ["app.job", "app.v2_work_plan", "app.v2_work_plan_task", "app.v2_work_plan_edit",
  "app.v2_measurement", "app.material_requirement", "app.material_pack_conversion", "app.scope_identity",
  "app.scope_revision", "app.scope_lineage", "app.scope_progress", "app.quote_revision", "app.quote_line",
  "app.quote_document_version", "app.quote_acceptance", "app.job_activation", "app.job_activation_terms",
  "app.variation", "app.variation_revision", "app.variation_approval", "app.customer_variation_approval",
  "app.purchase_order_draft", "app.purchase_order_revision", "app.purchase_order_placement", "app.work_order",
  "app.work_order_revision", "app.work_order_line", "app.action_outbox", "app.scheduled_readiness_plan",
  "app.site_visit", "app.job_assignment"];

async function rowContents() {
  const snapshot = {};
  for (const table of untouchedTables) {
    const { rows: [{ rows }] } = await admin.query(`SELECT coalesce(array_agg(to_jsonb(t)::text
      ORDER BY to_jsonb(t)::text), '{}') AS rows FROM ${table} t`);
    snapshot[table] = rows;
  }
  return snapshot;
}

async function seededFacts() {
  const owner = await signIn("builder");
  const { openFacts } = createWorkspaceApplication({ pool: runtime, sessionId: owner.sessionId });
  const source = await acceptedPlanSource();
  const { quoteRevisionId } = source;
  const { context } = await authenticatePracticeSession(runtime, owner.sessionId);
  // Earlier tests generate this plan; generating again is an exact no-op.
  if ((await planCounts(quoteRevisionId))[1] === 0) await new WorkPlanRepository(runtime).generate(context, source);
  const { rows: tasks } = await admin.query(`
    SELECT t.scope_item_id, t.template_task_key, l.category FROM app.v2_work_plan_task t
    JOIN app.quote_line l ON (l.tenant_id, l.quote_revision_id, l.scope_item_id) = (t.tenant_id, t.quote_revision_id, t.scope_item_id)
    WHERE (t.tenant_id, t.job_id, t.quote_revision_id) = ($1, $2, $3) ORDER BY t.position
  `, [DEMO_TENANT_ID, jobId, quoteRevisionId]);
  const tiling = tasks.find(task => task.category === "Tiling");
  const decorating = tasks.find(task => task.category === "Decorating");
  assert.ok(tiling && decorating);
  return { owner, openFacts, quoteRevisionId, tiling, decorating };
}

test("the builder logs each kind of open fact, answers and cancels them, and they survive a fresh session", async () => {
  const { owner, openFacts, quoteRevisionId, tiling, decorating } = await seededFacts();
  const before = await effectCounts();
  const choice = logFact({ scopeItemId: tiling.scope_item_id, owner: { kind: "customer" }, neededBy: "2026-12-01",
    detail: { kind: "customer_choice", question: "Which grout colour for the splashback?", mayChangePrice: true } });
  const delivery = logFact({ scopeItemId: tiling.scope_item_id,
    planTask: { quoteRevisionId, taskKey: tiling.template_task_key },
    owner: { kind: "merchant", name: "Fictional Teacup Tile Merchant" }, neededBy: "2026-12-03",
    detail: { kind: "merchant_delivery_date", item: "Splashback tiles, 6 packs" } });
  const crew = logFact({ scopeItemId: decorating.scope_item_id,
    planTask: { quoteRevisionId, taskKey: decorating.template_task_key },
    owner: { kind: "crew_member", name: "Fictional Decorator" }, neededBy: "2026-12-05",
    detail: { kind: "crew_availability", need: "Two days to prepare and paint the hall" } });
  const access = logFact({ owner: { kind: "customer" }, neededBy: "2026-12-02",
    detail: { kind: "access", need: "Who lets the crew in on the first morning?" } });

  // The four kinds stay apart, and bad shapes never reach the database.
  for (const bad of [
    { ...choice, detail: { ...choice.detail, item: "mixed" } },
    { ...delivery, detail: { kind: "merchant_delivery_date", item: "Tiles", question: "mixed" } },
    { ...delivery, owner: { kind: "merchant" } },
    { ...access, owner: { kind: "customer", name: "Not allowed" } },
    { ...choice, neededBy: "2026-02-30" },
    { ...choice, scopeItemId: null, planTask: delivery.planTask },
    { ...access, detail: { kind: "access", need: " " } },
  ]) await assert.rejects(openFacts.command(jobId, bad), { code: "OPEN_FACT_INVALID_COMMAND" });

  const [logged, replayed] = await Promise.all([openFacts.command(jobId, choice), openFacts.command(jobId, choice)]);
  assert.deepEqual(replayed, logged);
  assert.deepEqual({ ...logged, recordedAt: undefined }, { factId: choice.commandId, commandId: choice.commandId,
    action: "log", version: 1, status: "open", actorMembershipId: owner.membershipId, recordedAt: undefined });
  await assert.rejects(openFacts.command(jobId, { ...choice, neededBy: "2026-12-09" }), { code: "OPEN_FACT_COMMAND_CONFLICT" });
  await assert.rejects(openFacts.command(jobId, { ...choice, detail: { ...choice.detail, mayChangePrice: false } }),
    { code: "OPEN_FACT_COMMAND_CONFLICT" });
  for (const command of [delivery, crew, access]) assert.equal((await openFacts.command(jobId, command)).version, 1);

  // Answering the customer choice is a stored answer and a flag for chunk F, nothing else.
  const contents = await rowContents();
  const answer = factCommand({ action: "answer", factId: choice.commandId, expectedVersion: 1,
    answer: { kind: "customer_choice", choice: "Charcoal grout", mayChangePrice: true } });
  await assert.rejects(openFacts.command(jobId, { ...answer, answer: { kind: "access", arrangement: "Keys" } }),
    { code: "OPEN_FACT_KIND_MISMATCH" });
  await assert.rejects(openFacts.command(jobId, { ...answer, expectedVersion: 0 }), { code: "OPEN_FACT_VERSION_CONFLICT" });
  const racing = await Promise.allSettled([
    openFacts.command(jobId, answer),
    openFacts.command(jobId, { ...answer, commandId: randomUUID(), answer: { ...answer.answer, choice: "White grout" } }),
  ]);
  assert.equal(racing.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(racing.find(result => result.status === "rejected").reason.code, "OPEN_FACT_VERSION_CONFLICT");
  const winner = racing.find(result => result.status === "fulfilled").value;
  const answered = winner.commandId === answer.commandId ? answer
    : { ...answer, commandId: winner.commandId, answer: { ...answer.answer, choice: "White grout" } };
  assert.deepEqual(await openFacts.command(jobId, answered), winner);
  await assert.rejects(openFacts.command(jobId, { ...answered, answer: { ...answered.answer, choice: "Grey grout" } }),
    { code: "OPEN_FACT_COMMAND_CONFLICT" });
  await assert.rejects(openFacts.command(jobId, { ...answered, commandId: randomUUID(), expectedVersion: 2 }),
    { code: "OPEN_FACT_CLOSED" });
  assert.deepEqual(await rowContents(), contents);
  assert.deepEqual(await effectCounts(), before);

  // Identical concurrent retries share one receipt, even when one commits between the other's checks.
  const cancel = factCommand({ action: "cancel", factId: access.commandId, expectedVersion: 1 });
  const cancels = await Promise.all(Array.from({ length: 4 }, () => openFacts.command(jobId, cancel)));
  for (const receipt of cancels) assert.deepEqual(receipt, cancels[0]);
  const [cancelled] = cancels;
  assert.equal(cancelled.status, "cancelled");
  await assert.rejects(openFacts.command(jobId, factCommand({ action: "answer", factId: access.commandId, expectedVersion: 2,
    answer: { kind: "access", arrangement: "Customer is home" } })), { code: "OPEN_FACT_CLOSED" });
  const late = await openFacts.command(jobId, factCommand({ action: "mark_out_of_date", factId: delivery.commandId, expectedVersion: 1 }));
  assert.equal(late.status, "out_of_date");
  const deliveryAnswer = await openFacts.command(jobId, factCommand({ action: "answer", factId: delivery.commandId,
    expectedVersion: 2, answer: { kind: "merchant_delivery_date", deliveryDate: "2026-12-04" } }));
  assert.equal(deliveryAnswer.version, 3);

  const facts = await openFacts.read(jobId, factQuery);
  assert.deepEqual(facts.map(fact => [fact.kind, fact.status, fact.neededBy]), [
    ["customer_choice", "answered", "2026-12-01"], ["access", "cancelled", "2026-12-02"],
    ["merchant_delivery_date", "answered", "2026-12-03"], ["crew_availability", "open", "2026-12-05"],
  ]);
  const [choiceFact, accessFact, deliveryFact, crewFact] = facts;
  assert.deepEqual(choiceFact.detail, choice.detail);
  assert.deepEqual(choiceFact.answer, answered.answer);
  assert.equal(choiceFact.mayChangePrice, true);
  assert.equal(choiceFact.scopeItemId, tiling.scope_item_id);
  assert.equal(choiceFact.planTask, null);
  assert.equal(choiceFact.source, "builder_logged");
  assert.deepEqual(choiceFact.history.map(change => [change.version, change.action, change.status, change.actorMembershipId]), [
    [1, "log", "open", owner.membershipId], [2, "answer", "answered", owner.membershipId],
  ]);
  assert.equal(accessFact.answer, null);
  assert.deepEqual(accessFact.owner, { kind: "customer" });
  assert.equal(accessFact.mayChangePrice, false);
  assert.deepEqual(deliveryFact.planTask, delivery.planTask);
  assert.deepEqual(deliveryFact.owner, delivery.owner);
  assert.deepEqual(deliveryFact.answer, { kind: "merchant_delivery_date", deliveryDate: "2026-12-04" });
  assert.deepEqual(deliveryFact.history.map(change => change.status), ["open", "out_of_date", "answered"]);
  assert.deepEqual(crewFact.owner, crew.owner);
  assert.deepEqual(crewFact.detail, crew.detail);
  assert.deepEqual(crewFact.history.length, 1);

  const fresh = await enterPractice(owner.signedIn, owner.csrfToken);
  assert.notEqual(fresh.sessionId, owner.sessionId);
  const { openFacts: reopened } = createWorkspaceApplication({ pool: runtime, sessionId: fresh.sessionId });
  assert.deepEqual(await reopened.read(jobId, factQuery), facts);
  assert.deepEqual(await reopened.read(jobId, { ...factQuery, factId: crew.commandId }), [crewFact]);
  assert.deepEqual(await reopened.command(jobId, choice), logged);
  assert.deepEqual(await reopened.command(jobId, answered), winner);
  await assert.rejects(reopened.read(jobId, { ...factQuery, factId: randomUUID() }), { code: "NOT_FOUND" });
  const { rows: [stored] } = await admin.query(`SELECT
    (SELECT count(*)::int FROM app.v2_open_fact WHERE job_id = $1) AS facts,
    (SELECT count(*)::int FROM app.v2_open_fact_change WHERE job_id = $1) AS changes`, [jobId]);
  assert.deepEqual(stored, { facts: 4, changes: 8 });
  // Each new change appends one audit event in its own transaction; replays and refusals append none.
  const { rows: events } = await admin.query(`SELECT event_type AS "eventType", actor_ref AS "actorRef", payload
    FROM app.audit_event WHERE subject_type = 'job' AND subject_ref = $1 AND event_type LIKE 'v2_open_fact.%'
    ORDER BY sequence`, [jobId]);
  assert.deepEqual(events.map(event => event.eventType), ["log", "log", "log", "log", "answer", "cancel",
    "mark_out_of_date", "answer"].map(action => `v2_open_fact.${action}`));
  assert.ok(events.every(event => event.actorRef === `membership:${owner.membershipId}`));
  const { rows: changeRows } = await admin.query(`SELECT command_id, fact_id, expected_version, status, request_digest
    FROM app.v2_open_fact_change WHERE job_id = $1`, [jobId]);
  for (const event of events) {
    const row = changeRows.find(change => change.command_id === event.payload.references.commandId);
    assert.ok(row, event.payload.references.commandId);
    assert.deepEqual([event.payload.references.factId, event.payload.references.factVersion, event.payload.references.status,
      event.payload.hashes.request], [row.fact_id, String(row.expected_version + 1), row.status, row.request_digest]);
  }
  assert.deepEqual(events.filter(event => event.eventType === "v2_open_fact.log").map(event => event.payload.references.kind),
    ["customer_choice", "merchant_delivery_date", "crew_availability", "access"]);
  for (const words of ["grout", "Teacup", "Decorator", "crew in", "Splashback"]) assert.ok(!JSON.stringify(events).includes(words), words);
  assert.deepEqual(await effectCounts(), before);
  const { rows: [{ paid }] } = await admin.query(`SELECT count(*)::int AS paid
    FROM app.job_record_proposal WHERE model IS DISTINCT FROM 'fixture-capture-v1'`);
  assert.equal(paid, 0);
});

test("an open fact refuses a scope item or plan task from another job in the same firm", async () => {
  const { owner, openFacts, quoteRevisionId, tiling } = await seededFacts();
  const { draftJob, read } = await draftForPlan();
  const otherPlan = await read();
  const otherTask = otherPlan.tasks.find(task => task.key !== customTaskKey);
  assert.ok(otherTask);
  const { rows: [otherRow] } = await admin.query(`SELECT count(*)::int AS count FROM app.v2_work_plan_task
    WHERE (job_id, quote_revision_id, scope_item_id, template_task_key) = ($1, $2, $3, $4)`,
  [draftJob, otherPlan.quoteRevisionId, otherTask.scopeItemId, otherTask.key]);
  assert.equal(otherRow.count, 1);
  const before = await admin.query("SELECT count(*)::int AS count FROM app.v2_open_fact");
  const base = { owner: { kind: "builder" }, neededBy: "2026-12-07",
    detail: { kind: "access", need: "Parking permit for the van" } };
  for (const reference of [
    { scopeItemId: otherTask.scopeItemId },
    { scopeItemId: otherTask.scopeItemId, planTask: { quoteRevisionId: otherPlan.quoteRevisionId, taskKey: otherTask.key } },
    { scopeItemId: tiling.scope_item_id, planTask: { quoteRevisionId: otherPlan.quoteRevisionId, taskKey: otherTask.key } },
    { scopeItemId: otherTask.scopeItemId, planTask: { quoteRevisionId, taskKey: tiling.template_task_key } },
    { scopeItemId: tiling.scope_item_id, planTask: { quoteRevisionId, taskKey: customTaskKey } },
    { scopeItemId: randomUUID() },
  ]) await assert.rejects(openFacts.command(jobId, logFact({ ...base, ...reference })), { code: "OPEN_FACT_REFERENCE_INVALID" });

  // The composite foreign keys refuse the same thing below the repository.
  const { context } = await authenticatePracticeSession(runtime, owner.sessionId);
  const insert = (scopeItemId, planRevision, taskKey) => withTenant(runtime, context, db => db.$client.query(`
    INSERT INTO app.v2_open_fact (tenant_id, job_id, id, kind, scope_item_id, plan_quote_revision_id, plan_task_key,
      owner_kind, needed_by, source, access_need)
    VALUES ($1,$2,$3,'access',$4,$5,$6,'builder','2026-12-07','builder_logged','Parking')`,
  [DEMO_TENANT_ID, jobId, randomUUID(), scopeItemId, planRevision, taskKey]));
  await assert.rejects(insert(otherTask.scopeItemId, null, null), { code: "23503" });
  await assert.rejects(insert(otherTask.scopeItemId, otherPlan.quoteRevisionId, otherTask.key), { code: "23503" });
  assert.deepEqual(await admin.query("SELECT count(*)::int AS count FROM app.v2_open_fact").then(r => r.rows[0]), before.rows[0]);

  // A fact on one job cannot be read or changed through another job.
  const [fact] = await openFacts.read(jobId, factQuery);
  await assert.rejects(openFacts.read(draftJob, { ...factQuery, factId: fact.id }), { code: "NOT_FOUND" });
  await assert.rejects(openFacts.command(draftJob, factCommand({ action: "cancel", factId: fact.id,
    expectedVersion: fact.version })), { code: "NOT_FOUND" });
});

test("forced open fact policies hide facts and reject changes from the second firm", async () => {
  const { owner, openFacts } = await seededFacts();
  const command = logFact({ owner: { kind: "builder" }, neededBy: "2026-12-08",
    detail: { kind: "access", need: "Skip permit for the drive" } });
  await openFacts.command(jobId, command);
  const outsider = await signIn("second-builder");
  const { openFacts: theirs } = createWorkspaceApplication({ pool: runtime, sessionId: outsider.sessionId });
  await assert.rejects(theirs.read(jobId, factQuery), { code: "NOT_FOUND" });
  await assert.rejects(theirs.command(jobId, { ...command, commandId: randomUUID() }), { code: "NOT_FOUND" });
  await assert.rejects(theirs.command(jobId, factCommand({ action: "cancel", factId: command.commandId, expectedVersion: 1 })),
    { code: "NOT_FOUND" });

  const { context } = await authenticatePracticeSession(runtime, outsider.sessionId);
  const { context: ownerContext } = await authenticatePracticeSession(runtime, owner.sessionId);
  const query = (scope, sql, params) => withTenant(runtime, scope, db => db.$client.query(sql, params));
  for (const table of ["app.v2_open_fact", "app.v2_open_fact_change"]) {
    const { rows: [acl] } = await admin.query(`SELECT
      relrowsecurity AND relforcerowsecurity AS forced, relowner::regrole::text AS owner,
      has_table_privilege('jobguard_runtime', oid, 'SELECT') AS can_read,
      has_table_privilege('jobguard_runtime', oid, 'INSERT') AS can_insert,
      has_table_privilege('jobguard_runtime', oid, 'UPDATE,DELETE,TRUNCATE') AS can_mutate,
      has_table_privilege('jobguard_identity', oid, 'SELECT,INSERT,UPDATE,DELETE') AS identity_access,
      has_table_privilege('jobguard_worker', oid, 'SELECT,INSERT,UPDATE,DELETE') AS worker_access,
      has_table_privilege('jobguard_infrastructure', oid, 'SELECT,INSERT,UPDATE,DELETE') AS infra_access
      FROM pg_class WHERE oid = $1::regclass`, [table]);
    assert.deepEqual(acl, { forced: true, owner: "jobguard_migration", can_read: true, can_insert: true, can_mutate: false,
      identity_access: false, worker_access: false, infra_access: false }, table);
    const idColumn = table === "app.v2_open_fact" ? "id" : "fact_id";
    const filter = `WHERE (tenant_id, job_id, ${idColumn}) = ($1, $2, $3)`;
    const key = [DEMO_TENANT_ID, jobId, command.commandId];
    assert.equal((await query(ownerContext, `SELECT * FROM ${table} ${filter}`, key)).rowCount, 1, table);
    for (const scope of [outsider.realContext, context]) {
      assert.equal((await query(scope, `SELECT * FROM ${table} ${filter}`, key)).rowCount, 0, table);
      await assert.rejects(query(scope, `UPDATE ${table} SET tenant_id = tenant_id ${filter}`, key), { code: "42501" });
      await assert.rejects(query(scope, `DELETE FROM ${table} ${filter}`, key), { code: "42501" });
    }
    assert.equal((await runtime.query(`SELECT * FROM ${table} ${filter}`, key)).rowCount, 0, table);
  }
  for (const scope of [outsider.realContext, context]) {
    await assert.rejects(query(scope, `INSERT INTO app.v2_open_fact (tenant_id, job_id, id, kind, owner_kind, needed_by,
      source, access_need) VALUES ($1,$2,$3,'access','builder','2026-12-08','builder_logged','Skip')`,
    [DEMO_TENANT_ID, jobId, randomUUID()]), { code: "42501", message: /row-level security policy/u });
    await assert.rejects(query(scope, `INSERT INTO app.v2_open_fact_change (tenant_id, job_id, fact_id, expected_version,
      command_id, request_digest, action, status, actor_membership_id)
      VALUES ($1,$2,$3,1,$4,$5,'cancel','cancelled',$6)`,
    [DEMO_TENANT_ID, jobId, command.commandId, randomUUID(), "0".repeat(64), owner.membershipId]),
    { code: "42501", message: /row-level security policy/u });
  }
});

// V2-E2 replies. Added as its own block; earlier pieces' tests stay as they are.
const replyCommand = fields => ({ version: "v2-fact-reply-command.v1", ...fields });
const linkAnswer = (answer, commandId = randomUUID()) => ({ version: "v2-fact-reply-link.v1", commandId, answer });
// The sealer adds its own audit actor fields; compare only the command's references.
const ownReferences = event => Object.fromEntries(Object.entries(event.payload.references).filter(([key]) => !key.startsWith("audit")));
const tokenOf = receipt => receipt.replyPath.slice("/reply/".length);

async function replySetup() {
  const owner = await signIn("builder");
  const { openFacts, factReplies } = createWorkspaceApplication({ pool: runtime, sessionId: owner.sessionId });
  const { context } = await authenticatePracticeSession(runtime, owner.sessionId);
  const fact = async (fields) => {
    const command = logFact({ neededBy: "2026-12-10", ...fields });
    await openFacts.command(jobId, command);
    return command.commandId;
  };
  const request = (factId, fields = {}) => factReplies.command(jobId, replyCommand({ action: "request", commandId: randomUUID(),
    factId, expectedFactVersion: 1, recipient: { kind: "customer" }, options: null, allowOther: false, expiresInDays: 14, ...fields }));
  return { owner, context, openFacts, factReplies, fact, request };
}

async function replyEvents(type) {
  return (await admin.query(`SELECT event_type AS "eventType", actor_ref AS "actorRef", payload FROM app.audit_event
    WHERE subject_type = 'job' AND subject_ref = $1 AND event_type = $2 ORDER BY sequence`, [jobId, type])).rows;
}

async function replyChain(tenantId) {
  const { rows } = await admin.query(`SELECT id, version, tenant_id AS "tenantId", sequence::int, actor_ref AS "actorRef",
    event_type AS "eventType", subject_type AS "subjectType", subject_ref AS "subjectRef", occurred_at AS "occurredAt",
    payload, payload_hash AS "payloadHash", previous_hash AS "previousHash", event_hash AS "eventHash"
    FROM app.audit_event WHERE tenant_id = $1 ORDER BY sequence`, [tenantId]);
  verifyAuditChain(rows);
}

// Counts the local catcher's metadata lines while a call runs.
async function caught(run) {
  const lines = [];
  const info = console.info;
  console.info = (line, ...rest) => {
    if (typeof line === "string" && line.includes("v2.delivery.captured")) lines.push(JSON.parse(line));
    else info(line, ...rest);
  };
  try { return { result: await run(), lines }; }
  finally { console.info = info; }
}

// Fails the first query that matches, inside whatever transaction is open.
function failingPool(match) {
  return {
    async connect() {
      const client = await runtime.connect();
      const query = client.query.bind(client);
      client.query = (sql, ...rest) => typeof sql === "string" && match(sql)
        ? Promise.reject(Object.assign(new Error("forced failure"), { code: "FORCED" })) : query(sql, ...rest);
      const release = client.release.bind(client);
      client.release = (...args) => { client.query = query; return release(...args); };
      return client;
    },
  };
}
const auditFails = sql => sql.includes("app.append_audit(");

test("V2-E2: a customer request uses the party record, the link records one answer and the builder applies it once", async () => {
  const { owner, context, openFacts, factReplies, fact, request } = await replySetup();
  const before = await effectCounts();
  const factId = await fact({ owner: { kind: "customer" },
    detail: { kind: "customer_choice", question: "Which grout colour for the hall floor?", mayChangePrice: true } });
  // Options belong to a customer choice only; a non-choice gets none.
  await assert.rejects(request(factId), { code: "REPLY_OPTIONS_INVALID" });
  await assert.rejects(request(factId, { options: ["Same", "Same"] }), { code: "REPLY_INVALID_COMMAND" });
  await assert.rejects(request(factId, { options: ["Grey"] }), { code: "REPLY_INVALID_COMMAND" });
  await assert.rejects(request(factId, { options: ["Charcoal grout", "White grout"], expectedFactVersion: 2 }),
    { code: "REPLY_FACT_VERSION_CONFLICT" });

  const command = replyCommand({ action: "request", commandId: randomUUID(), factId, expectedFactVersion: 1,
    recipient: { kind: "customer" }, options: ["Charcoal grout", "White grout"], allowOther: false, expiresInDays: 14 });
  const { result: made, lines } = await caught(() => factReplies.command(jobId, command));
  assert.deepEqual(lines, [{ event: "v2.delivery.captured", kind: "v2_fact_reply_request" }]);
  assert.match(made.replyPath, /^\/reply\/[A-Za-z0-9_-]{43}$/u);
  const token = tokenOf(made);
  const { result: again, lines: none } = await caught(() => factReplies.command(jobId, command));
  assert.deepEqual([again, none], [{ action: "request", id: command.commandId, replayed: true }, []]);
  await assert.rejects(factReplies.command(jobId, { ...command, allowOther: true }), { code: "REPLY_COMMAND_CONFLICT" });

  // The request binds the job's current party record and the email of that customer revision.
  const { rows: [stored] } = await admin.query(`SELECT r.contact_email, r.party_binding_id, r.customer_revision_id, r.token_hash,
      p.binding_id AS current_binding, b.customer_revision_id AS current_revision
    FROM app.v2_fact_reply_request r JOIN app.job_party_current p ON (p.tenant_id, p.job_id) = (r.tenant_id, r.job_id)
    JOIN app.job_party_binding b ON (b.tenant_id, b.id) = (p.tenant_id, p.binding_id) WHERE r.id = $1`, [command.commandId]);
  assert.equal(stored.contact_email, "customer@jobguard-v2.invalid");
  assert.equal(stored.party_binding_id, stored.current_binding);
  assert.equal(stored.customer_revision_id, stored.current_revision);
  assert.equal(stored.token_hash, createHash("sha256").update(token).digest("hex"));

  // The page shows the one question and its stored options, nothing about the job or firm.
  const view = await factReplies.open(token);
  assert.deepEqual(Object.keys(view).sort(), ["allowOther", "answer", "answeredAt", "current", "expiresAt", "kind", "options",
    "question", "recipient", "status"]);
  assert.deepEqual([view.status, view.kind, view.question, view.options, view.allowOther, view.current, view.answer],
    ["open", "customer_choice", "Which grout colour for the hall floor?", ["Charcoal grout", "White grout"], false, true, null]);
  for (const words of [jobId, DEMO_TENANT_ID, "customer@", "Patchwork"]) assert.ok(!JSON.stringify(view).includes(words), words);

  // An option not in the stored list, or "something else" when not allowed, is refused.
  await assert.rejects(factReplies.receive(token, linkAnswer({ choice: "Black grout" })), { code: "REPLY_ANSWER_INVALID" });
  await assert.rejects(factReplies.receive(token, linkAnswer({ other: "Black grout" })), { code: "REPLY_ANSWER_INVALID" });
  await assert.rejects(factReplies.receive(token, linkAnswer({ deliveryDate: "2026-12-01" })), { code: "REPLY_ANSWER_INVALID" });

  const answer = linkAnswer({ choice: "White grout" });
  const both = await Promise.all([factReplies.receive(token, answer), factReplies.receive(token, answer)]);
  assert.deepEqual(both.map(entry => entry.replayed).sort(), [false, true]);
  assert.ok(both.every(entry => entry.id === answer.commandId && entry.current === true));
  await assert.rejects(factReplies.receive(token, linkAnswer({ choice: "Charcoal grout" })), { code: "REPLY_ALREADY_ANSWERED" });
  await assert.rejects(factReplies.receive(token, { ...answer, answer: { choice: "Charcoal grout" } }), { code: "REPLY_ALREADY_ANSWERED" });
  assert.equal((await factReplies.open(token)).status, "answered");
  assert.deepEqual((await factReplies.open(token)).answer, { choice: "White grout", other: false });

  // Recorded, not applied: the fact is still open until the builder presses apply.
  let replies = await factReplies.read(jobId);
  const reply = replies.replies.find(entry => entry.id === answer.commandId);
  assert.deepEqual([reply.status, reply.source, reply.answer], ["ready", "reply_link", { choice: "White grout" }]);
  assert.equal(replies.requests.find(entry => entry.id === command.commandId).status, "answered");
  assert.equal((await openFacts.read(jobId, { ...factQuery, factId }))[0].status, "open");

  const apply = replyCommand({ action: "apply", replyId: answer.commandId, expectedFactVersion: 1 });
  await assert.rejects(factReplies.command(jobId, { ...apply, expectedFactVersion: 2 }), { code: "REPLY_OUT_OF_DATE" });
  const applied = await Promise.allSettled([factReplies.command(jobId, apply), factReplies.command(jobId, apply)]);
  assert.ok(applied.every(entry => entry.status === "fulfilled"), JSON.stringify(applied.map(entry => entry.reason?.code)));
  assert.deepEqual(applied.map(entry => entry.value.replayed).sort(), [false, true]);
  assert.deepEqual(await factReplies.command(jobId, apply), { action: "apply", id: answer.commandId, replayed: true, factVersion: 2 });
  const [answered] = await openFacts.read(jobId, { ...factQuery, factId });
  assert.deepEqual([answered.status, answered.version, answered.answer], ["answered", 2,
    { kind: "customer_choice", choice: "White grout", mayChangePrice: true }]);
  assert.deepEqual(answered.history.map(change => [change.action, change.commandId, change.actorMembershipId]),
    [["log", factId, owner.membershipId], ["answer", answer.commandId, owner.membershipId]]);
  replies = await factReplies.read(jobId);
  assert.equal(replies.replies.find(entry => entry.id === answer.commandId).status, "applied");

  // One event each, references and hashes only: no email, option, question or token.
  const requested = (await replyEvents("v2.fact_reply.requested")).filter(event => event.payload.references.requestId === command.commandId);
  const received = (await replyEvents("v2.fact_reply.received")).filter(event => event.payload.references.replyId === answer.commandId);
  const appliedEvents = (await replyEvents("v2.fact_reply.applied_by_builder")).filter(event => event.payload.references.replyId === answer.commandId);
  assert.deepEqual([requested.length, received.length, appliedEvents.length], [1, 1, 1]);
  assert.equal(requested[0].actorRef, `membership:${owner.membershipId}`);
  assert.deepEqual(ownReferences(requested[0]), { commandId: command.commandId, requestId: command.commandId, factId,
    factVersion: "1", recipientKind: "customer", partyBindingId: stored.party_binding_id, customerRevisionId: stored.customer_revision_id });
  assert.equal(received[0].actorRef, `reply_link:${command.commandId}`);
  assert.deepEqual(ownReferences(received[0]), { commandId: answer.commandId, replyId: answer.commandId,
    requestId: command.commandId, factId, factVersion: "1", source: "reply_link", current: "true" });
  assert.equal(appliedEvents[0].actorRef, `membership:${owner.membershipId}`);
  assert.equal(appliedEvents[0].payload.references.factVersion, "2");
  const payloads = JSON.stringify([requested, received, appliedEvents]);
  for (const words of ["customer@", "grout", "Charcoal", token, stored.token_hash]) assert.ok(!payloads.includes(words), words);
  assert.ok(!JSON.stringify(await replyEvents("v2_open_fact.answer")).includes("White"));
  await replyChain(context.tenantId);
  assert.deepEqual(await effectCounts(), before);
});

test("V2-E2: replies to a changed question, options or customer are kept as out of date and never applied", async () => {
  const { openFacts, factReplies, fact, request } = await replySetup();
  const options = { options: ["Keep the radiator", "Take it off"], allowOther: true };

  // The fact moves on after the link went out: the reply is kept, marked not current, and refused at apply.
  const moved = await fact({ owner: { kind: "customer" },
    detail: { kind: "customer_choice", question: "Paint behind the hall radiator?", mayChangePrice: false } });
  const first = await request(moved, options);
  await openFacts.command(jobId, factCommand({ action: "mark_out_of_date", factId: moved, expectedVersion: 1 }));
  assert.equal((await factReplies.open(tokenOf(first))).current, false);
  const late = linkAnswer({ other: "Only if it is easy" });
  assert.equal((await factReplies.receive(tokenOf(first), late)).current, false);
  let view = await factReplies.read(jobId);
  assert.equal(view.replies.find(entry => entry.id === late.commandId).status, "out_of_date");
  await assert.rejects(factReplies.command(jobId, replyCommand({ action: "apply", replyId: late.commandId, expectedFactVersion: 1 })),
    { code: "REPLY_OUT_OF_DATE" });
  await assert.rejects(factReplies.command(jobId, replyCommand({ action: "apply", replyId: late.commandId, expectedFactVersion: 2 })),
    { code: "REPLY_OUT_OF_DATE" });
  assert.equal((await openFacts.read(jobId, { ...factQuery, factId: moved }))[0].status, "out_of_date");

  // Changing the options makes a new request; the old token's reply is out of date, the new one applies.
  const choice = await fact({ owner: { kind: "customer" },
    detail: { kind: "customer_choice", question: "Gloss or satin for the hall skirting?", mayChangePrice: false } });
  const old = await request(choice, { options: ["Gloss", "Satin"], allowOther: false });
  const fresh = await request(choice, { options: ["Gloss", "Satin", "Eggshell"], allowOther: false });
  assert.equal((await factReplies.open(tokenOf(old))).current, false);
  const oldReply = linkAnswer({ choice: "Gloss" });
  assert.equal((await factReplies.receive(tokenOf(old), oldReply)).current, false);
  await assert.rejects(factReplies.command(jobId, replyCommand({ action: "apply", replyId: oldReply.commandId, expectedFactVersion: 1 })),
    { code: "REPLY_OUT_OF_DATE" });
  const newReply = linkAnswer({ choice: "Eggshell" });
  assert.equal((await factReplies.receive(tokenOf(fresh), newReply)).current, true);
  assert.equal((await factReplies.command(jobId, replyCommand({ action: "apply", replyId: newReply.commandId,
    expectedFactVersion: 1 }))).factVersion, 2);

  // A new customer revision on the job makes an open customer request out of date.
  const access = await fact({ owner: { kind: "customer" }, detail: { kind: "access", need: "Where should the skip go?" } });
  const pending = await request(access);
  const answered = await request(await fact({ owner: { kind: "customer" }, detail: { kind: "access", need: "Key safe code?" } }));
  const answeredReply = linkAnswer({ arrangement: "Under the mat" });
  await factReplies.receive(tokenOf(answered), answeredReply);
  const { rows: [party] } = await admin.query(`SELECT b.*, r.customer_id AS rev_customer, r.revision AS rev_number, r.payload
    FROM app.job_party_current p JOIN app.job_party_binding b ON (b.tenant_id, b.id) = (p.tenant_id, p.binding_id)
    JOIN app.customer_revision r ON (r.tenant_id, r.id) = (b.tenant_id, b.customer_revision_id) WHERE p.job_id = $1`, [jobId]);
  const revisionId = randomUUID();
  const bindingId = randomUUID();
  await admin.query(`INSERT INTO app.customer_revision (tenant_id, id, customer_id, revision, payload) VALUES ($1,$2,$3,$4,$5)`,
    [party.tenant_id, revisionId, party.customer_id, (await admin.query(`SELECT max(revision)::int + 1 AS n FROM app.customer_revision
      WHERE customer_id = $1`, [party.customer_id])).rows[0].n, { ...party.payload, phone: "+447700900042" }]);
  await admin.query(`INSERT INTO app.job_party_binding (tenant_id, id, job_id, revision, customer_id, customer_revision_id,
    paying_party_id, paying_party_revision_id, site_id, site_revision_id, provenance)
    SELECT tenant_id, $2, job_id, revision + 1, customer_id, $3, paying_party_id, paying_party_revision_id, site_id,
      site_revision_id, 'entered' FROM app.job_party_binding WHERE id = $1`, [party.id, bindingId, revisionId]);
  await admin.query("UPDATE app.job_party_current SET binding_id = $1 WHERE job_id = $2", [bindingId, jobId]);
  assert.equal((await factReplies.open(tokenOf(pending))).current, false);
  view = await factReplies.read(jobId);
  assert.equal(view.requests.find(entry => entry.id === pending.id).current, false);
  assert.equal(view.replies.find(entry => entry.id === answeredReply.commandId).status, "out_of_date");
  await assert.rejects(factReplies.command(jobId, replyCommand({ action: "apply", replyId: answeredReply.commandId,
    expectedFactVersion: 1 })), { code: "REPLY_OUT_OF_DATE" });
  // A new request binds the new revision and applies.
  const rebound = await request(access);
  const { rows: [bound] } = await admin.query("SELECT party_binding_id, customer_revision_id FROM app.v2_fact_reply_request WHERE id = $1",
    [rebound.id]);
  assert.deepEqual(bound, { party_binding_id: bindingId, customer_revision_id: revisionId });
  const reboundReply = linkAnswer({ arrangement: "On the drive" });
  assert.equal((await factReplies.receive(tokenOf(rebound), reboundReply)).current, true);
  assert.equal((await factReplies.command(jobId, replyCommand({ action: "apply", replyId: reboundReply.commandId,
    expectedFactVersion: 1 }))).factVersion, 2);
});

test("V2-E2: merchant and crew replies go only to the recorded recipient named on the fact", async () => {
  const { context, owner, openFacts, factReplies, fact, request } = await replySetup();
  const { rows: [merchant] } = await admin.query("SELECT id, name FROM app.merchant WHERE tenant_id = $1", [DEMO_TENANT_ID]);
  const delivery = await fact({ owner: { kind: "merchant", name: merchant.name },
    detail: { kind: "merchant_delivery_date", item: "Hall floor tiles, 4 packs" } });
  const crew = await fact({ owner: { kind: "crew_member", name: "Fictional Tiler" },
    detail: { kind: "crew_availability", need: "Grout the hall on Thursday" } });
  const record = fields => factReplies.command(jobId, replyCommand({ action: "record_recipient", commandId: randomUUID(),
    merchantId: null, displayName: null, correctsId: null, ...fields }));

  // Practice addresses only, both in the contract and in the database.
  for (const contactEmail of ["orders@teacup.example", "Merchant@jobguard-v2.invalid", "merchant@jobguard-v2.invalid.com"]) {
    await assert.rejects(record({ role: "merchant", merchantId: merchant.id, contactEmail }), { code: "REPLY_INVALID_COMMAND" });
  }
  await assert.rejects(record({ role: "merchant", merchantId: merchant.id, displayName: merchant.name, contactEmail: "nobody@jobguard-v2.invalid" }),
    { code: "REPLY_RECIPIENT_INVALID" });
  await assert.rejects(record({ role: "crew_member", merchantId: merchant.id, contactEmail: "tiler@jobguard-v2.invalid" }),
    { code: "REPLY_INVALID_COMMAND" });
  const insert = (fields) => withTenant(runtime, context, db => db.$client.query(`INSERT INTO app.v2_reply_recipient
    (tenant_id, job_id, id, role, display_name, merchant_id, contact_email, request_digest, recorded_by)
    VALUES ($1,$2,$3,'merchant',$4,$5,$6,$7,$8)`, [DEMO_TENANT_ID, jobId, randomUUID(), fields.name, fields.merchantId ?? null,
    fields.email ?? "merchant@jobguard-v2.invalid", "0".repeat(64), owner.membershipId]));
  await assert.rejects(insert({ name: merchant.name, email: "orders@teacup.example" }), { code: "23514" });
  // A known merchant's name must be the merchant record's name.
  await assert.rejects(insert({ name: "Another Merchant", merchantId: merchant.id }), { code: "23503" });

  await assert.rejects(record({ role: "merchant", merchantId: merchant.id, displayName: "Another Merchant",
    contactEmail: "merchant@jobguard-v2.invalid" }), { code: "REPLY_RECIPIENT_INVALID" });
  const merchantRow = await record({ role: "merchant", merchantId: merchant.id, displayName: merchant.name,
    contactEmail: "merchant@jobguard-v2.invalid" });
  const wrongName = await record({ role: "merchant", displayName: "Fictional Other Merchant", contactEmail: "merchant@jobguard-v2.invalid" });
  const tiler = await record({ role: "crew_member", displayName: "Fictional Tiler", contactEmail: "tiler@jobguard-v2.invalid" });
  const { rows: [copied] } = await admin.query("SELECT display_name, merchant_id FROM app.v2_reply_recipient WHERE id = $1", [merchantRow.id]);
  assert.deepEqual(copied, { display_name: merchant.name, merchant_id: merchant.id });
  const recorded = (await replyEvents("v2.reply_recipient.recorded")).find(event => event.payload.references.recipientId === merchantRow.id);
  assert.deepEqual(ownReferences(recorded), { commandId: merchantRow.id, recipientId: merchantRow.id, role: "merchant",
    merchantId: merchant.id });
  assert.equal(recorded.payload.hashes.contact, createHash("sha256").update("merchant@jobguard-v2.invalid").digest("hex"));
  assert.ok(!JSON.stringify(recorded).includes("merchant@"));

  // The recipient must match the fact's owner role and name, and a customer only answers customer facts.
  const to = recipientId => ({ recipient: { kind: "recorded", recipientId } });
  await assert.rejects(request(delivery, to(wrongName.id)), { code: "REPLY_RECIPIENT_MISMATCH" });
  await assert.rejects(request(delivery, to(tiler.id)), { code: "REPLY_RECIPIENT_MISMATCH" });
  await assert.rejects(request(crew, to(merchantRow.id)), { code: "REPLY_RECIPIENT_MISMATCH" });
  await assert.rejects(request(crew), { code: "REPLY_RECIPIENT_MISMATCH" });
  await assert.rejects(request(delivery), { code: "REPLY_RECIPIENT_MISMATCH" });
  const choice = await fact({ owner: { kind: "merchant", name: merchant.name },
    detail: { kind: "customer_choice", question: "Which tile finish?", mayChangePrice: false } });
  await assert.rejects(request(choice, { ...to(merchantRow.id), options: ["Gloss", "Matt"] }), { code: "REPLY_RECIPIENT_MISMATCH" });

  const { result: sent, lines } = await caught(() => request(delivery, to(merchantRow.id)));
  assert.deepEqual(lines, [{ event: "v2.delivery.captured", kind: "v2_fact_reply_request" }]);
  const { rows: [pinned] } = await admin.query("SELECT recipient_kind, recipient_id, contact_email FROM app.v2_fact_reply_request WHERE id = $1",
    [sent.id]);
  assert.deepEqual(pinned, { recipient_kind: "merchant", recipient_id: merchantRow.id, contact_email: "merchant@jobguard-v2.invalid" });
  const date = linkAnswer({ deliveryDate: "2026-12-04" });
  await assert.rejects(factReplies.receive(tokenOf(sent), linkAnswer({ deliveryDate: "2026-02-30" })), { code: "REPLY_ANSWER_INVALID" });
  await factReplies.receive(tokenOf(sent), date);
  await factReplies.command(jobId, replyCommand({ action: "apply", replyId: date.commandId, expectedFactVersion: 1 }));
  assert.deepEqual((await openFacts.read(jobId, { ...factQuery, factId: delivery }))[0].answer,
    { kind: "merchant_delivery_date", deliveryDate: "2026-12-04" });

  // A corrected recipient never re-points an open request: the old one goes out of date, a new one is needed.
  const crewRequest = await request(crew, to(tiler.id));
  await assert.rejects(record({ role: "merchant", displayName: "Fictional Tiler", contactEmail: "decorator@jobguard-v2.invalid",
    correctsId: tiler.id }), { code: "REPLY_RECIPIENT_INVALID" });
  const corrected = await record({ role: "crew_member", displayName: "Fictional Tiler", contactEmail: "decorator@jobguard-v2.invalid",
    correctsId: tiler.id });
  await assert.rejects(record({ role: "crew_member", displayName: "Fictional Tiler", contactEmail: "tiler@jobguard-v2.invalid",
    correctsId: tiler.id }), { code: "REPLY_RECIPIENT_INVALID" });
  await assert.rejects(request(crew, to(tiler.id)), { code: "REPLY_RECIPIENT_INVALID" });
  const stale = linkAnswer({ available: true });
  assert.equal((await factReplies.receive(tokenOf(crewRequest), stale)).current, false);
  await assert.rejects(factReplies.command(jobId, replyCommand({ action: "apply", replyId: stale.commandId, expectedFactVersion: 1 })),
    { code: "REPLY_OUT_OF_DATE" });
  const view = await factReplies.read(jobId);
  assert.deepEqual(view.recipients.filter(entry => [tiler.id, corrected.id].includes(entry.id)).map(entry => [entry.id, entry.current]),
    [[tiler.id, false], [corrected.id, true]]);
  const correctedRequest = await request(crew, to(corrected.id));
  const yes = linkAnswer({ available: false });
  assert.equal((await factReplies.receive(tokenOf(correctedRequest), yes)).current, true);
  await factReplies.command(jobId, replyCommand({ action: "apply", replyId: yes.commandId, expectedFactVersion: 1 }));
  assert.deepEqual((await openFacts.read(jobId, { ...factQuery, factId: crew }))[0].answer, { kind: "crew_availability", available: false });
});

test("V2-E2: a reply pasted from a call answers the fact on screen, and each kind maps to E1's own answer", async () => {
  const { owner, openFacts, factReplies, fact } = await replySetup();
  const access = await fact({ owner: { kind: "customer" }, detail: { kind: "access", need: "Can we park on the drive?" } });
  const paste = fields => replyCommand({ action: "paste", commandId: randomUUID(), expectedFactVersion: 1, ...fields });
  await assert.rejects(factReplies.command(jobId, paste({ factId: access, answer: { available: true } })), { code: "REPLY_ANSWER_INVALID" });
  await assert.rejects(factReplies.command(jobId, paste({ factId: access, answer: { choice: "Yes" } })), { code: "REPLY_INVALID_COMMAND" });
  const pasted = paste({ factId: access, answer: { arrangement: "Yes, after 9am" } });
  await assert.rejects(factReplies.command(jobId, { ...pasted, expectedFactVersion: 2 }), { code: "REPLY_FACT_VERSION_CONFLICT" });
  assert.deepEqual(await factReplies.command(jobId, pasted), { action: "paste", id: pasted.commandId, replayed: false });
  assert.deepEqual(await factReplies.command(jobId, pasted), { action: "paste", id: pasted.commandId, replayed: true });
  await assert.rejects(factReplies.command(jobId, { ...pasted, answer: { arrangement: "No" } }), { code: "REPLY_COMMAND_CONFLICT" });
  const event = (await replyEvents("v2.fact_reply.received")).find(entry => entry.payload.references.replyId === pasted.commandId);
  assert.equal(event.actorRef, `membership:${owner.membershipId}`);
  assert.equal(event.payload.references.source, "pasted_by_builder");
  assert.ok(!JSON.stringify(event).includes("9am"));
  await factReplies.command(jobId, replyCommand({ action: "apply", replyId: pasted.commandId, expectedFactVersion: 1 }));
  assert.deepEqual((await openFacts.read(jobId, { ...factQuery, factId: access }))[0].answer,
    { kind: "access", arrangement: "Yes, after 9am" });
  // Applying a closed fact again is refused, and a pasted reply to an answered fact is refused.
  await assert.rejects(factReplies.command(jobId, paste({ factId: access, expectedFactVersion: 2, answer: { arrangement: "No" } })),
    { code: "REPLY_FACT_CLOSED" });

  // Every kind's reply becomes an answer E1's own parser accepts.
  const facts = { customer_choice: { question: "Q", mayChangePrice: true }, merchant_delivery_date: { item: "I" },
    crew_availability: { need: "N" }, access: { need: "N" } };
  const answers = { customer_choice: [{ choice: "A" }, { other: "B" }], merchant_delivery_date: [{ deliveryDate: "2026-12-04" }],
    crew_availability: [{ available: true }], access: [{ arrangement: "Keys" }] };
  for (const kind of Object.keys(facts)) {
    for (const reply of answers[kind]) {
      const mapped = openFactAnswerFor({ kind, mayChangePrice: kind === "customer_choice" ? facts[kind].mayChangePrice : null }, reply);
      openFactCommandV1.parse({ version: "v2-open-fact-command.v1", action: "answer", commandId: randomUUID(), factId: randomUUID(),
        expectedVersion: 1, answer: mapped });
      if (kind === "customer_choice") assert.deepEqual(mapped, { kind, choice: reply.choice ?? reply.other, mayChangePrice: true });
    }
  }
});

test("V2-E2: applying waits on the same fact lock as a new request, so no newer request slips in between", async () => {
  const { factReplies, fact } = await replySetup();
  const factId = await fact({ owner: { kind: "customer" }, detail: { kind: "access", need: "Key under the mat?" } });
  const pasted = replyCommand({ action: "paste", commandId: randomUUID(), factId, expectedFactVersion: 1, answer: { arrangement: "Yes" } });
  await factReplies.command(jobId, pasted);
  const holder = await admin.connect();
  let settled = false;
  try {
    await holder.query("BEGIN");
    await holder.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 2013))", [`${DEMO_TENANT_ID}:fact:${factId}`]);
    const applying = factReplies.command(jobId, replyCommand({ action: "apply", replyId: pasted.commandId, expectedFactVersion: 1 }))
      .finally(() => { settled = true; });
    await new Promise(resolve => setTimeout(resolve, 500));
    assert.equal(settled, false, "apply must wait for the fact lock that request() holds");
    await holder.query("COMMIT");
    assert.equal((await applying).factVersion, 2);
  } finally { holder.release(); }
});

test("V2-E2: applying also waits on the recipient correction lock, so no correction slips in between", async () => {
  const { factReplies, fact } = await replySetup();
  const factId = await fact({ owner: { kind: "customer" }, detail: { kind: "access", need: "Bins out on the day?" } });
  const pasted = replyCommand({ action: "paste", commandId: randomUUID(), factId, expectedFactVersion: 1, answer: { arrangement: "Yes" } });
  await factReplies.command(jobId, pasted);
  const holder = await admin.connect();
  let settled = false;
  try {
    await holder.query("BEGIN");
    await holder.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 2013))", [`${DEMO_TENANT_ID}:recipient:${jobId}`]);
    const applying = factReplies.command(jobId, replyCommand({ action: "apply", replyId: pasted.commandId, expectedFactVersion: 1 }))
      .finally(() => { settled = true; });
    await new Promise(resolve => setTimeout(resolve, 500));
    assert.equal(settled, false, "apply must wait for the lock that recordRecipient() holds");
    await holder.query("COMMIT");
    assert.equal((await applying).factVersion, 2);
  } finally { holder.release(); }
});

test("V2-E2: applying also waits on a customer rebinding, which holds the job row", async () => {
  const { factReplies, fact } = await replySetup();
  const factId = await fact({ owner: { kind: "customer" }, detail: { kind: "access", need: "Alarm code needed?" } });
  const pasted = replyCommand({ action: "paste", commandId: randomUUID(), factId, expectedFactVersion: 1, answer: { arrangement: "No" } });
  await factReplies.command(jobId, pasted);
  const holder = await admin.connect();
  let settled = false;
  try {
    await holder.query("BEGIN");
    // app.bind_job_parties() takes this row lock first.
    await holder.query("SELECT 1 FROM app.job WHERE (tenant_id, id) = ($1, $2) FOR UPDATE", [DEMO_TENANT_ID, jobId]);
    const applying = factReplies.command(jobId, replyCommand({ action: "apply", replyId: pasted.commandId, expectedFactVersion: 1 }))
      .finally(() => { settled = true; });
    await new Promise(resolve => setTimeout(resolve, 500));
    assert.equal(settled, false, "apply must wait for the job row a rebinding holds");
    // A rebinding then appends its audit batch. Apply must not hold the audit head while it
    // waits for the job row, or the two would deadlock.
    await holder.query("SET LOCAL lock_timeout = '5s'");
    await holder.query("SELECT 1 FROM audit_control.audit_head WHERE tenant_id = $1 FOR UPDATE", [DEMO_TENANT_ID]);
    await holder.query("COMMIT");
    assert.equal((await applying).factVersion, 2);
  } finally { holder.release(); }
});

test("V2-E2: a link transaction may seal exactly one received event, carrying the stored reply's own content", async () => {
  const { fact, request } = await replySetup();
  const sent = await request(await fact({ owner: { kind: "customer" }, detail: { kind: "access", need: "Parking on the drive?" } }));
  const hash = createHash("sha256").update(tokenOf(sent)).digest("hex");
  const replyId = randomUUID();
  const digest = "a".repeat(64);
  const client = await runtime.connect();
  try {
    await client.query("BEGIN");
    const { rows: [{ saved }] } = await client.query("SELECT app.v2_fact_reply_receive($1, $2, $3, $4::jsonb) AS saved",
      [hash, replyId, digest, JSON.stringify({ arrangement: "Yes, on the left" })]);
    assert.equal(saved.status, "recorded");
    const event = (hashes, extra = {}) => JSON.stringify([{ id: randomUUID(), version: "audit.v1", actorRef: `reply_link:${saved.requestId}`,
      eventType: "v2.fact_reply.received", subjectType: "job", subjectRef: saved.jobId, payload: { references: {
        commandId: replyId, replyId, requestId: saved.requestId, factId: saved.factId, factVersion: String(saved.factVersion),
        source: "reply_link", current: String(saved.current), ...extra }, hashes, classifications: { action: "operational" } } }]);
    const append = async body => {
      await client.query("SAVEPOINT attempt");
      try { await client.query("SELECT id FROM app.append_audit($1::jsonb)", [body]); await client.query("RELEASE SAVEPOINT attempt"); return true; }
      catch (error) { await client.query("ROLLBACK TO SAVEPOINT attempt"); assert.equal(error.code, "42501", error.message); return false; }
    };
    // Other content for the same reply is refused, then the true event seals once and only once.
    assert.equal(await append(event({ request: "b".repeat(64) })), false);
    assert.equal(await append(event({ request: digest }, { factVersion: "9" })), false);
    assert.equal(await append(event({ request: digest })), true);
    assert.equal(await append(event({ request: digest })), false);
    await client.query("SELECT app.v2_fact_reply_close()");
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
  const sealed = (await replyEvents("v2.fact_reply.received")).filter(entry => entry.payload.references.replyId === replyId);
  assert.equal(sealed.length, 1);
  await replyChain(DEMO_TENANT_ID);
});

test("V2-E2: expired and cancelled links are refused plainly, and failed token attempts are limited", async () => {
  const { factReplies, fact, request } = await replySetup();
  const factId = await fact({ owner: { kind: "customer" }, detail: { kind: "access", need: "Is the side gate unlocked?" } });
  const cancelled = await request(factId);
  const cancel = replyCommand({ action: "cancel", commandId: randomUUID(), requestId: cancelled.id });
  assert.deepEqual(await factReplies.command(jobId, cancel), { action: "cancel", id: cancelled.id, replayed: false });
  assert.deepEqual(await factReplies.command(jobId, cancel), { action: "cancel", id: cancelled.id, replayed: true });
  await assert.rejects(factReplies.command(jobId, { ...cancel, commandId: randomUUID() }), { code: "REPLY_CLOSED" });
  await assert.rejects(factReplies.open(tokenOf(cancelled)), { code: "REPLY_LINK_REFUSED" });
  // The token never appears in an error: the refusal carries the code only.
  const refusal = await factReplies.open(tokenOf(cancelled)).catch(error => error);
  for (const text of [refusal.message, refusal.stack ?? "", JSON.stringify(refusal)]) assert.ok(!text.includes(tokenOf(cancelled)));
  await assert.rejects(factReplies.receive(tokenOf(cancelled), linkAnswer({ arrangement: "Yes" })), { code: "REPLY_LINK_REFUSED" });

  const expired = await request(factId);
  await admin.query(`UPDATE app.v2_fact_reply_request SET requested_at = now() - interval '20 days',
    expires_at = now() - interval '1 day' WHERE id = $1`, [expired.id]);
  await assert.rejects(factReplies.open(tokenOf(expired)), { code: "REPLY_LINK_REFUSED" });
  await assert.rejects(factReplies.receive(tokenOf(expired), linkAnswer({ arrangement: "Yes" })), { code: "REPLY_LINK_REFUSED" });
  await assert.rejects(factReplies.open("A".repeat(43)), { code: "REPLY_LINK_REFUSED" });
  await assert.rejects(factReplies.open("not-a-token"), { code: "REPLY_LINK_REFUSED" });
  const { rows: [{ replies }] } = await admin.query("SELECT count(*)::int AS replies FROM app.v2_fact_reply WHERE request_id = ANY($1)",
    [[cancelled.id, expired.id]]);
  assert.equal(replies, 0);
  const view = await factReplies.read(jobId);
  assert.deepEqual([cancelled.id, expired.id].map(id => view.requests.find(entry => entry.id === id).status), ["cancelled", "expired"]);

  // After 20 failed attempts in ten minutes, even a good token is refused until the window passes.
  const good = await request(factId);
  assert.equal((await factReplies.open(tokenOf(good))).status, "open");
  const { rows: [{ failures }] } = await admin.query(`SELECT count(*)::int AS failures FROM control_plane.v2_fact_reply_failure
    WHERE failed_at > clock_timestamp() - interval '10 minutes'`);
  assert.ok(failures >= 4, String(failures));
  await admin.query(`INSERT INTO control_plane.v2_fact_reply_failure SELECT clock_timestamp() FROM generate_series(1, 20)`);
  try {
    await assert.rejects(factReplies.open(tokenOf(good)), { code: "REPLY_LINK_REFUSED" });
    await assert.rejects(factReplies.receive(tokenOf(good), linkAnswer({ arrangement: "Yes" })), { code: "REPLY_LINK_REFUSED" });
  } finally {
    await admin.query("DELETE FROM control_plane.v2_fact_reply_failure");
  }
  assert.equal((await factReplies.open(tokenOf(good))).status, "open");
  // The scope table never keeps a row after a transaction.
  assert.equal((await admin.query("SELECT count(*)::int AS n FROM control_plane.v2_fact_reply_scope")).rows[0].n, 0);
});

test("V2-E2: forced reply policies hide every row from the second firm, and recorded rows are immutable", async () => {
  const { owner, context, factReplies, fact, request } = await replySetup();
  const factId = await fact({ owner: { kind: "customer" }, detail: { kind: "access", need: "Bin day for the skip?" } });
  const sent = await request(factId);
  const reply = linkAnswer({ arrangement: "Tuesday" });
  await factReplies.receive(tokenOf(sent), reply);
  const cancelledRequest = await request(factId);
  await factReplies.command(jobId, replyCommand({ action: "cancel", commandId: randomUUID(), requestId: cancelledRequest.id }));
  const recipient = await factReplies.command(jobId, replyCommand({ action: "record_recipient", commandId: randomUUID(),
    role: "crew_member", merchantId: null, displayName: "Fictional Decorator", contactEmail: "decorator@jobguard-v2.invalid", correctsId: null }));
  const applyFact = await fact({ owner: { kind: "customer" }, detail: { kind: "access", need: "Alarm code?" } });
  const pasted = replyCommand({ action: "paste", commandId: randomUUID(), factId: applyFact, expectedFactVersion: 1,
    answer: { arrangement: "Customer will be in" } });
  await factReplies.command(jobId, pasted);
  await factReplies.command(jobId, replyCommand({ action: "apply", replyId: pasted.commandId, expectedFactVersion: 1 }));

  const outsider = await signIn("second-builder");
  const { factReplies: theirs } = createWorkspaceApplication({ pool: runtime, sessionId: outsider.sessionId });
  await assert.rejects(theirs.read(jobId), { code: "NOT_FOUND" });
  await assert.rejects(theirs.command(jobId, replyCommand({ action: "request", commandId: randomUUID(), factId, expectedFactVersion: 1,
    recipient: { kind: "customer" }, options: null, allowOther: false, expiresInDays: 14 })), { code: "NOT_FOUND" });
  await assert.rejects(theirs.command(jobId, replyCommand({ action: "apply", replyId: reply.commandId, expectedFactVersion: 1 })),
    { code: "NOT_FOUND" });

  const { context: theirContext } = await authenticatePracticeSession(runtime, outsider.sessionId);
  const query = (scope, sql, params) => withTenant(runtime, scope, db => db.$client.query(sql, params));
  const rows = { "app.v2_reply_recipient": ["id", recipient.id], "app.v2_fact_reply_request": ["id", sent.id],
    "app.v2_fact_reply_cancel": ["request_id", cancelledRequest.id], "app.v2_fact_reply": ["id", reply.commandId],
    "app.v2_fact_reply_applied": ["reply_id", pasted.commandId] };
  for (const [table, [column, id]] of Object.entries(rows)) {
    const { rows: [acl] } = await admin.query(`SELECT relrowsecurity AND relforcerowsecurity AS forced, relowner::regrole::text AS owner,
      has_table_privilege('jobguard_runtime', oid, 'SELECT') AS can_read, has_table_privilege('jobguard_runtime', oid, 'INSERT') AS can_insert,
      has_table_privilege('jobguard_runtime', oid, 'UPDATE,DELETE,TRUNCATE') AS can_mutate,
      has_table_privilege('jobguard_identity', oid, 'SELECT,INSERT,UPDATE,DELETE') AS identity_access,
      has_table_privilege('jobguard_worker', oid, 'SELECT,INSERT,UPDATE,DELETE') AS worker_access
      FROM pg_class WHERE oid = $1::regclass`, [table]);
    assert.deepEqual(acl, { forced: true, owner: "jobguard_migration", can_read: true, can_insert: true, can_mutate: false,
      identity_access: false, worker_access: false }, table);
    const filter = `WHERE (tenant_id, job_id, ${column}) = ($1, $2, $3)`;
    const key = [DEMO_TENANT_ID, jobId, id];
    assert.equal((await query(context, `SELECT * FROM ${table} ${filter}`, key)).rowCount, 1, table);
    // Immutable to the app role, even in its own firm.
    await assert.rejects(query(context, `UPDATE ${table} SET tenant_id = tenant_id ${filter}`, key), { code: "42501" }, table);
    await assert.rejects(query(context, `DELETE FROM ${table} ${filter}`, key), { code: "42501" }, table);
    for (const scope of [outsider.realContext, theirContext]) {
      assert.equal((await query(scope, `SELECT * FROM ${table} ${filter}`, key)).rowCount, 0, table);
      await assert.rejects(query(scope, `UPDATE ${table} SET tenant_id = tenant_id ${filter}`, key), { code: "42501" });
      await assert.rejects(query(scope, `DELETE FROM ${table} ${filter}`, key), { code: "42501" });
    }
    assert.equal((await runtime.query(`SELECT * FROM ${table} ${filter}`, key)).rowCount, 0, table);
  }
  for (const scope of [outsider.realContext, theirContext]) {
    await assert.rejects(query(scope, `INSERT INTO app.v2_reply_recipient (tenant_id, job_id, id, role, display_name, contact_email,
      request_digest, recorded_by) VALUES ($1,$2,$3,'crew_member','X','tiler@jobguard-v2.invalid',$4,$5)`,
    [DEMO_TENANT_ID, jobId, randomUUID(), "0".repeat(64), owner.membershipId]), { code: "42501", message: /row-level security policy/u });
    await assert.rejects(query(scope, `INSERT INTO app.v2_fact_reply (tenant_id, job_id, id, fact_id, fact_version, source,
      arrangement, request_digest, recorded_by) VALUES ($1,$2,$3,$4,1,'pasted_by_builder','X',$5,$6)`,
    [DEMO_TENANT_ID, jobId, randomUUID(), factId, "0".repeat(64), owner.membershipId]), { code: "42501", message: /row-level security policy/u });
  }
  // Runtime cannot call the link's private helpers or open its scope directly.
  for (const sql of ["SELECT app.v2_fact_reply_scope_open($1)", "SELECT app.v2_fact_reply_scoped($1::uuid, $1::uuid)"]) {
    await assert.rejects(runtime.query(sql, [randomUUID()]), { code: "42501" });
  }
  await assert.rejects(runtime.query("SELECT * FROM control_plane.v2_fact_reply_scope"), { code: "42501" });
});

test("V2-E2: replies stay disabled outside local V2", async () => {
  const { factReplies, fact, request } = await replySetup();
  const sent = await request(await fact({ owner: { kind: "customer" }, detail: { kind: "access", need: "Doorbell works?" } }));
  const previous = process.env.JOBGUARD_LOCAL_V2;
  delete process.env.JOBGUARD_LOCAL_V2;
  try {
    await assert.rejects(factReplies.read(jobId), { code: "SYNTHETIC_MODE_REQUIRED" });
    await assert.rejects(factReplies.open(tokenOf(sent)), { code: "SYNTHETIC_MODE_REQUIRED" });
    await assert.rejects(factReplies.receive(tokenOf(sent), linkAnswer({ arrangement: "Yes" })), { code: "SYNTHETIC_MODE_REQUIRED" });
  } finally { process.env.JOBGUARD_LOCAL_V2 = previous; }
});

// Audit-chain evidence, one case per command (V2-CI2 guard): one event, an exact replay adds none,
// and a forced failure rolls back the command's rows and event together.
test("audit-chain: packages/db/src/v2-fact-reply-repository.ts#FactReplyRepository.recordRecipient", async () => {
  const { owner, context, factReplies } = await replySetup();
  const command = replyCommand({ action: "record_recipient", commandId: randomUUID(), role: "crew_member", merchantId: null,
    displayName: "Fictional Plasterer", contactEmail: "decorator@jobguard-v2.invalid", correctsId: null });
  const before = await replyEvents("v2.reply_recipient.recorded");
  await assert.rejects(new FactReplyRepository(failingPool(auditFails)).command(context, jobId, owner.sessionId, command), { code: "FORCED" });
  assert.equal((await admin.query("SELECT count(*)::int AS n FROM app.v2_reply_recipient WHERE id = $1", [command.commandId])).rows[0].n, 0,
    "audit-chain: rollback");
  assert.deepEqual(await replyEvents("v2.reply_recipient.recorded"), before);
  await factReplies.command(jobId, command);
  const recorded = await replyEvents("v2.reply_recipient.recorded");
  assert.equal(recorded.length, before.length + 1, "audit-chain: event");
  assert.equal(recorded.at(-1).payload.references.commandId, command.commandId);
  await factReplies.command(jobId, command);
  assert.deepEqual(await replyEvents("v2.reply_recipient.recorded"), recorded, "audit-chain: replay");
  await replyChain(context.tenantId);
});

test("audit-chain: packages/db/src/v2-fact-reply-repository.ts#FactReplyRepository.request", async () => {
  const { owner, context, factReplies, fact } = await replySetup();
  const factId = await fact({ owner: { kind: "customer" }, detail: { kind: "access", need: "Water stopcock location?" } });
  const command = replyCommand({ action: "request", commandId: randomUUID(), factId, expectedFactVersion: 1,
    recipient: { kind: "customer" }, options: null, allowOther: false, expiresInDays: 7 });
  const before = await replyEvents("v2.fact_reply.requested");
  const { lines } = await caught(() => assert.rejects(new FactReplyRepository(failingPool(auditFails)).command(context, jobId,
    owner.sessionId, command), { code: "FORCED" }));
  assert.deepEqual(lines, [], "nothing reaches the catcher when the request rolls back");
  assert.equal((await admin.query("SELECT count(*)::int AS n FROM app.v2_fact_reply_request WHERE id = $1", [command.commandId])).rows[0].n,
    0, "audit-chain: rollback");
  assert.deepEqual(await replyEvents("v2.fact_reply.requested"), before);
  await factReplies.command(jobId, command);
  const recorded = await replyEvents("v2.fact_reply.requested");
  assert.equal(recorded.length, before.length + 1, "audit-chain: event");
  await factReplies.command(jobId, command);
  assert.deepEqual(await replyEvents("v2.fact_reply.requested"), recorded, "audit-chain: replay");
  await replyChain(context.tenantId);
});

test("audit-chain: packages/db/src/v2-fact-reply-repository.ts#FactReplyRepository.cancel", async () => {
  const { owner, context, factReplies, fact, request } = await replySetup();
  const sent = await request(await fact({ owner: { kind: "customer" }, detail: { kind: "access", need: "Dog in the garden?" } }));
  const command = replyCommand({ action: "cancel", commandId: randomUUID(), requestId: sent.id });
  const before = await replyEvents("v2.fact_reply.cancelled");
  await assert.rejects(new FactReplyRepository(failingPool(auditFails)).command(context, jobId, owner.sessionId, command), { code: "FORCED" });
  assert.equal((await admin.query("SELECT count(*)::int AS n FROM app.v2_fact_reply_cancel WHERE request_id = $1", [sent.id])).rows[0].n, 0,
    "audit-chain: rollback");
  assert.equal((await factReplies.open(tokenOf(sent))).status, "open");
  await factReplies.command(jobId, command);
  const recorded = await replyEvents("v2.fact_reply.cancelled");
  assert.equal(recorded.length, before.length + 1, "audit-chain: event");
  await factReplies.command(jobId, command);
  assert.deepEqual(await replyEvents("v2.fact_reply.cancelled"), recorded, "audit-chain: replay");
  await replyChain(context.tenantId);
});

test("audit-chain: packages/db/src/v2-fact-reply-repository.ts#FactReplyRepository.receive", async () => {
  const { context, factReplies, fact, request } = await replySetup();
  const sent = await request(await fact({ owner: { kind: "customer" }, detail: { kind: "access", need: "Wi-Fi for the crew?" } }));
  const answer = linkAnswer({ arrangement: "No, use your own" });
  const before = await replyEvents("v2.fact_reply.received");
  await assert.rejects(new FactReplyRepository(failingPool(auditFails)).receive(tokenOf(sent), answer), { code: "FORCED" });
  assert.equal((await admin.query("SELECT count(*)::int AS n FROM app.v2_fact_reply WHERE id = $1", [answer.commandId])).rows[0].n, 0,
    "audit-chain: rollback");
  assert.deepEqual(await replyEvents("v2.fact_reply.received"), before);
  assert.equal((await factReplies.open(tokenOf(sent))).status, "open");
  await factReplies.receive(tokenOf(sent), answer);
  const recorded = await replyEvents("v2.fact_reply.received");
  assert.equal(recorded.length, before.length + 1, "audit-chain: event");
  assert.equal(recorded.at(-1).payload.references.commandId, answer.commandId);
  assert.equal((await factReplies.receive(tokenOf(sent), answer)).replayed, true);
  assert.deepEqual(await replyEvents("v2.fact_reply.received"), recorded, "audit-chain: replay");
  await replyChain(context.tenantId);
});

test("audit-chain: packages/db/src/v2-fact-reply-repository.ts#FactReplyRepository.paste", async () => {
  const { owner, context, factReplies, fact } = await replySetup();
  const factId = await fact({ owner: { kind: "customer" }, detail: { kind: "access", need: "Shoes off indoors?" } });
  const command = replyCommand({ action: "paste", commandId: randomUUID(), factId, expectedFactVersion: 1, answer: { arrangement: "Yes" } });
  const before = await replyEvents("v2.fact_reply.received");
  await assert.rejects(new FactReplyRepository(failingPool(auditFails)).command(context, jobId, owner.sessionId, command), { code: "FORCED" });
  assert.equal((await admin.query("SELECT count(*)::int AS n FROM app.v2_fact_reply WHERE id = $1", [command.commandId])).rows[0].n, 0,
    "audit-chain: rollback");
  await factReplies.command(jobId, command);
  const recorded = await replyEvents("v2.fact_reply.received");
  assert.equal(recorded.length, before.length + 1, "audit-chain: event");
  await factReplies.command(jobId, command);
  assert.deepEqual(await replyEvents("v2.fact_reply.received"), recorded, "audit-chain: replay");
  await replyChain(context.tenantId);
});

test("audit-chain: packages/db/src/v2-fact-reply-repository.ts#FactReplyRepository.apply", async () => {
  const { owner, context, openFacts, factReplies, fact, request } = await replySetup();
  const factId = await fact({ owner: { kind: "customer" }, detail: { kind: "access", need: "Which loo can the crew use?" } });
  const sent = await request(factId);
  const answer = linkAnswer({ arrangement: "Downstairs" });
  await factReplies.receive(tokenOf(sent), answer);
  const apply = replyCommand({ action: "apply", replyId: answer.commandId, expectedFactVersion: 1 });
  const before = { applied: await replyEvents("v2.fact_reply.applied_by_builder"), answers: await replyEvents("v2_open_fact.answer") };
  const unchanged = async () => {
    const [current] = await openFacts.read(jobId, { ...factQuery, factId });
    assert.deepEqual([current.status, current.version], ["open", 1]);
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM app.v2_fact_reply_applied WHERE reply_id = $1",
      [answer.commandId])).rows[0].n, 0, "audit-chain: rollback");
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM app.v2_open_fact_change WHERE command_id = $1",
      [answer.commandId])).rows[0].n, 0);
    assert.deepEqual(await replyEvents("v2.fact_reply.applied_by_builder"), before.applied);
    assert.deepEqual(await replyEvents("v2_open_fact.answer"), before.answers);
  };
  // After E1's answer and before E2's record: both roll back together.
  await assert.rejects(new FactReplyRepository(failingPool(sql => sql.includes("INSERT INTO app.v2_fact_reply_applied")))
    .command(context, jobId, owner.sessionId, apply), { code: "FORCED" });
  await unchanged();
  // The applied event's append fails: E1's answer and its event roll back too.
  let appends = 0;
  await assert.rejects(new FactReplyRepository(failingPool(sql => auditFails(sql) && ++appends === 2))
    .command(context, jobId, owner.sessionId, apply), { code: "FORCED" });
  assert.equal(appends, 2);
  await unchanged();
  // A stale fact version refuses both writes.
  await assert.rejects(factReplies.command(jobId, { ...apply, expectedFactVersion: 2 }), { code: "REPLY_OUT_OF_DATE" });
  await unchanged();

  await factReplies.command(jobId, apply);
  const recorded = await replyEvents("v2.fact_reply.applied_by_builder");
  assert.equal(recorded.length, before.applied.length + 1, "audit-chain: event");
  assert.equal((await replyEvents("v2_open_fact.answer")).length, before.answers.length + 1);
  await factReplies.command(jobId, apply);
  assert.deepEqual(await replyEvents("v2.fact_reply.applied_by_builder"), recorded, "audit-chain: replay");
  assert.equal((await replyEvents("v2_open_fact.answer")).length, before.answers.length + 1);
  await replyChain(context.tenantId);
});

// V2-FL (Q35 to Q39): the firm-lock guard, then every slice's firm A/B checks in name order.

test("FL guard: every job-bound table runtime can touch is firm-locked or named in a pending slice", async () => {
  const failures = await firmLockFailures(admin);
  assert.deepEqual(failures, [], "not firm-locked:\n" +
    failures.map(row => `  ${row.relation} (${row.kind}): ${row.problems.join("; ")}`).join("\n"));
});

test("FL guard: every pending table is still in the catalog and still unlocked", async () => {
  const catalog = new Map((await firmLockCatalog(admin)).map(row => [row.relation, row]));
  const stale = [...pendingTables()].filter(([table]) => !catalog.has(table) || catalog.get(table).firm_policy)
    .map(([table, slice]) => `${slice}: ${table}`);
  assert.deepEqual(stale, [], "a slice locked its tables but kept its pending file, or a table left the catalog");
});

test("FL guard: a lock must be mandatory joins on every job-bound parent's full key", async () => {
  const catalog = await firmLockCatalog(admin);
  const locked = new Set(catalog.filter(row => row.firm_policy).map(row => row.relation));
  const jobBound = new Set(catalog.map(row => row.relation));
  const check = (relation, using) => {
    const row = catalog.find(entry => entry.relation === relation);
    return lockProblems(using ? { ...row, firm_policy: { ...row.firm_policy, using } } : row, locked, jobBound);
  };
  assert.deepEqual(check("app.finding_suppression"), [], "the real 2047 policy passes");
  assert.deepEqual(check("app.job_link"), [], "the real 2047 policy passes");
  // Codex r1: a tenant-only EXISTS on the real parent.
  assert.match(check("app.finding_suppression", "(EXISTS ( SELECT\n   FROM app.job_finding f\n  WHERE (f.tenant_id = finding_suppression.tenant_id)))")
    .join(), /app\.job_finding\(tenant_id, finding_id\)/u);
  // Codex r3: a job link must check both bindings; drop each in turn.
  const binding = side => `(EXISTS ( SELECT\n   FROM app.job_party_binding b\n  WHERE ((b.tenant_id = job_link.tenant_id) AND (b.job_id = job_link.${side}_job_id) AND (b.id = job_link.${side}_binding_id))))`;
  assert.match(check("app.job_link", binding("predecessor")).join(), /successor_job_id, successor_binding_id/u);
  assert.match(check("app.job_link", binding("successor")).join(), /predecessor_job_id, predecessor_binding_id/u);
  // Codex r4: an OR alternative makes the join optional, so it doesn't lock anything.
  const optional = "v2_practice_firm is not only mandatory EXISTS joins on column equalities (an OR or extra condition)";
  const diary = check("app.job_diary_entry").length === 0 && catalog.find(entry => entry.relation === "app.job_diary_entry").firm_policy.using;
  assert.ok(diary, "the real 2047 direct policy passes");
  assert.ok(check("app.job_diary_entry", `(${diary} OR true)`).includes(optional));
  assert.ok(check("app.job_link", `(${binding("predecessor")} OR ${binding("successor")})`).includes(optional));
  assert.ok(check("app.job_diary_entry", diary.replace("(j.id = job_diary_entry.job_id)", "((j.id = job_diary_entry.job_id) OR true)")).includes(optional));
  // Codex r5: a repeated equality in place of the job key must fail.
  assert.ok(check("app.job_diary_entry", diary.replace("(j.id = job_diary_entry.job_id)", "(j.tenant_id = job_diary_entry.tenant_id)"))
    .includes("v2_practice_firm does not join app.job on (tenant_id, job_id)"));
  assert.ok(check("app.finding_suppression", "(EXISTS ( SELECT\n   FROM app.job_finding f\n  WHERE ((f.tenant_id = finding_suppression.tenant_id) AND (f.tenant_id = finding_suppression.tenant_id))))")
    .join().includes("app.job_finding(tenant_id, finding_id)"));
  assert.notDeepEqual(lockProblems(catalog.find(entry => entry.relation === "app.finding_suppression"), new Set(), jobBound), [],
    "a parent without its own firm lock doesn't count");
});

let firmContexts;
const firmLockHelpers = {
  test, assert, admin, runtime, withTenant,
  contexts: () => firmContexts ??= (async () => {
    await pxLiveJob(); // a fresh live job for firm A, so quote, party and activation rows exist
    const builder = await signIn("builder");
    const outsider = await signIn("second-builder");
    return {
      firmA: (await authenticatePracticeSession(runtime, builder.sessionId)).context,
      firmB: (await authenticatePracticeSession(runtime, outsider.sessionId)).context,
      firmBReal: outsider.realContext,
    };
  })(),
};
for (const file of readdirSync(new URL("./firm-lock/", import.meta.url)).filter(name => /^FL-.*\.checks\.mjs$/u.test(name)).sort()) {
  (await import(`./firm-lock/${file}`)).register(firmLockHelpers);
}

test("FL-1: the core firm lock migration is safe to run twice", async () => {
  const policies = async () => (await admin.query(
    "SELECT polrelid::regclass::text AS t, pg_get_expr(polqual, polrelid) AS q FROM pg_policy WHERE polname = 'v2_practice_firm' ORDER BY 1")).rows;
  const before = await policies();
  await admin.query(readFileSync(new URL("./migrations/2047_v2_firm_lock_core.sql", import.meta.url), "utf8"));
  assert.deepEqual(await policies(), before);
});

// must stay the last test: it signs the cached builder out
// Later packets append GET routes to builderGetRoutes in test/refusals.mjs.
test("SX signed-out builder cannot reuse the old real or practice cookies", async t => {
  assert.ok(sxRoutes?.length >= 9, "all mandatory positive controls must have passed");
  await assertSignedOutBuilderRefuses({ request: sxRequest, signIn, routes: sxRoutes,
    record: (route, result) => t.diagnostic(`SX ${route.transport ?? "web"} ${route.path} c: ${result.status} ${result.code}`),
  });
});
