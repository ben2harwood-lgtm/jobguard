import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { Pool } from "../../packages/db/node_modules/pg/esm/index.mjs";
import { createIdentityApplication } from "../../apps/api/dist/auth/index.js";
import { createWorkspaceApplication } from "../../apps/api/dist/workspace/index.js";
import { M1_QUOTE_POLICY } from "../../packages/core/dist/index.js";
import { DEMO_TENANT_ID, WorkPlanRepository, authenticatePracticeSession, verifyAuditChain, withTenant } from "../../packages/db/dist/index.js";
// V2-G3
import { HandoverReleaseRepository, authorizePracticeJob, practiceMaterialPool } from "../../packages/db/dist/index.js";
// V2-G8
import { ReviewRequestRepository } from "../../packages/db/dist/index.js";
// V2-G9
import { AftercareRepository } from "../../packages/db/dist/index.js";
// V2-C3C
import { createHash } from "node:crypto";
import { CrewContactRepository } from "../../packages/db/dist/index.js";
// V2-F8
import { SiteAttendanceRepository } from "../../packages/db/dist/index.js";
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
    ...await enterPractice(signedIn, csrfToken), signedIn, csrfToken,
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

// V2-SYNC-1 (Q45, migration 2056): main's snag list, extra photos and pilot final check on V2.
const snagTables = ["app.snag_command", "app.snag", "app.snag_revision", "app.snag_event", "app.snag_photo", "app.snag_photo_upload"];
const syncLockedTables = [...snagTables, "app.variation_revision_photo"];
const visibleRows = async (scope, table) => withTenant(runtime, scope, async db =>
  (await db.$client.query(`SELECT 1 FROM ${table} WHERE job_id=$1`, [jobId])).rowCount);

test("2056 retargets only the snag fence, keeps its owner and privileges, and locks main's new job tables", async () => {
  const { rows: [routine] } = await admin.query(`SELECT pg_get_functiondef(p.oid) AS definition, p.proowner::regrole::text AS owner,
    p.prosecdef AS definer, p.proacl::text[] AS acl FROM pg_proc p WHERE p.oid='app.snag_practice_actor(uuid,uuid)'::regprocedure`);
  assert.match(routine.definition, /current_database\(\)<>'jobguard_v2_local'/u);
  assert.doesNotMatch(routine.definition, /jobguard_synthetic_demo/u);
  assert.equal(routine.owner, "jobguard_migration");
  assert.equal(routine.definer, true);
  assert.ok(!routine.acl?.some(item => /^(jobguard_runtime|=)/u.test(item)), "runtime and PUBLIC still cannot call it");
  // 0775 and 0777 keep main's fences (SX rev 4; 0777 is proven unreachable below).
  for (const routineName of ["app.lp11_bind_shadow_job(uuid,uuid)"]) {
    const { rows: [kept] } = await admin.query("SELECT pg_get_functiondef($1::regprocedure) AS d", [routineName]);
    assert.match(kept.d, /current_database\(\)<>'jobguard_synthetic_demo'/u, routineName);
  }
  const { rows } = await admin.query(`SELECT c.oid::regclass::text AS relation, NOT p.polpermissive AS restrictive, p.polcmd::text AS command,
    (SELECT array_agg(r::regrole::text) FROM unnest(p.polroles) r) AS roles, pg_get_expr(p.polqual, p.polrelid) AS using
    FROM pg_class c JOIN pg_policy p ON p.polrelid=c.oid AND p.polname='v2_practice_firm' WHERE c.oid=ANY($1::regclass[]) ORDER BY 1`,
  [syncLockedTables]);
  assert.deepEqual(rows.map(row => row.relation).sort(), [...syncLockedTables].sort());
  for (const row of rows) {
    assert.deepEqual([row.restrictive, row.command, row.roles], [true, "*", ["jobguard_runtime"]], row.relation);
    assert.match(row.using, /SELECT\s+FROM app\.job j\s+WHERE \(\(j\.tenant_id = \w+\.tenant_id\) AND \(j\.id = \w+\.job_id\)\)/u, row.relation);
  }
  // 0776's terms approvals are per tenant (no job_id); runtime has no way in.
  const { rows: [terms] } = await admin.query(`SELECT has_table_privilege('jobguard_runtime','app.pilot_final_check_terms_approval',
    'SELECT,INSERT,UPDATE,DELETE') AS runtime`);
  assert.equal(terms.runtime, false);
});

test("a snag is recorded, revised and marked fixed on the V2 practice job, and the second firm sees none of them", async () => {
  const owner = await signIn("builder");
  const snagId = randomUUID();
  const path = `/api/jobs/${jobId}/snags`;
  const added = await json(await request(path, { cookies: owner.cookies, csrf: owner.csrfToken,
    body: { version: "snag.v1", action: "add", commandId: randomUUID(), snagId, title: "Fictional loose hall skirting" } }));
  assert.equal(added.jobId, jobId);
  assert.ok(added.snags.some(snag => snag.id === snagId && snag.state === "open"));
  // Snag photos need open work, and the Switch live test above has closed this job's work (reopening is
  // refused by capacity admission in practice), so this proof covers the snag, its revision and its events.
  await json(await request(path, { cookies: owner.cookies, csrf: owner.csrfToken,
    body: { version: "snag.v1", action: "revise", commandId: randomUUID(), snagId, expectedRevision: 1,
      title: "Fictional loose hall skirting by the door", location: null, assigneeLabel: null, dueOn: null } }));
  await json(await request(`${path}/${snagId}/events`, { cookies: owner.cookies, csrf: owner.csrfToken,
    body: { version: "snag-event.v1", commandId: randomUUID(), action: "mark_fixed" } }));
  const listed = await json(await request(path, { cookies: owner.cookies }));
  assert.equal(listed.snags.find(snag => snag.id === snagId).state, "fixed");

  const { context: ownerContext } = await authenticatePracticeSession(runtime, owner.sessionId);
  for (const table of ["app.snag_command", "app.snag", "app.snag_revision", "app.snag_event"]) {
    assert.ok(await visibleRows(ownerContext, table) > 0, `${table}: the owning firm reads its rows`);
  }

  const second = await signIn("second-builder");
  assert.equal((await json(await request(path, { cookies: second.cookies }), 404)).code, "NOT_FOUND");
  const refused = await request(path, { cookies: second.cookies, csrf: second.csrfToken,
    body: { version: "snag.v1", action: "add", commandId: randomUUID(), snagId: randomUUID(), title: "Fictional intruding snag" } });
  assert.equal((await json(refused, 404)).code, "NOT_FOUND");
  const { context: secondContext } = await authenticatePracticeSession(runtime, second.sessionId);
  for (const scope of [second.realContext, secondContext]) {
    for (const table of snagTables) assert.equal(await visibleRows(scope, table), 0, `${table}: hidden from the second firm`);
  }
});

// V2-G1 (Q53, migration 2081): the snag register. Owner, who fixed and who checked (never the same person), agreed outstanding.
const g1Tables = ["app.v2_snag_owner", "app.v2_snag_event_person", "app.v2_snag_agreed"];
const g1 = {
  path: () => `/api/jobs/${jobId}/snag-register`,
  async crew(owner, displayName, trade) {
    return createWorkspaceApplication({ pool: runtime, sessionId: owner.sessionId }).crewContacts.record({ version: "crew-contact.v1",
      commandId: randomUUID(), crewId: randomUUID(), expectedRevision: 0, displayName, trade, phone: `07700 900${String(Math.floor(Math.random() * 900) + 100)}`,
      email: `${displayName.toLowerCase().replace(/\W+/gu, ".")}@crew.jobguard-v2.invalid` });
  },
  async add(owner, title, fields = {}) {
    const snagId = randomUUID();
    await json(await request(`/api/jobs/${jobId}/snags`, { cookies: owner.cookies, csrf: owner.csrfToken,
      body: { version: "snag.v1", action: "add", commandId: randomUUID(), snagId, title, ...fields } }));
    return snagId;
  },
  post: (owner, body, status = 200) => request(g1.path(), { cookies: owner.cookies, csrf: owner.csrfToken, body }).then(response => json(response, status)),
  event: (snagId, action, person, commandId = randomUUID()) => ({ version: "v2-snag-event-command.v1", commandId, snagId, action, person }),
  snag: (register, snagId) => register.snags.find(row => row.id === snagId),
  mainEvents: async snagId => (await admin.query("SELECT sequence, kind FROM app.snag_event WHERE snag_id=$1 ORDER BY sequence", [snagId])).rows,
};

test("G1 done when: crew owner and due date; fixed by Jordan; Jordan refused as checker with no main event; Sam checks", async () => {
  const owner = await signIn("builder");
  const jordan = await g1.crew(owner, "Jordan Fictional", "joiner"), sam = await g1.crew(owner, "Sam Fictional", "decorator");
  const snagId = await g1.add(owner, "Refit the hall door stop", { dueOn: "2026-12-04" });
  await g1.post(owner, { version: "v2-snag-owner-command.v1", commandId: randomUUID(), snagId, crewId: jordan.crewId });
  await g1.post(owner, g1.event(snagId, "mark_fixed", { kind: "crew", crewId: jordan.crewId }));
  const refused = await g1.post(owner, g1.event(snagId, "mark_checked", { kind: "crew", crewId: jordan.crewId }), 409);
  assert.equal(refused.code, "V2_SNAG_CHECKER_IS_FIXER");
  assert.deepEqual(await g1.mainEvents(snagId), [{ sequence: 1, kind: "fixed" }], "the refused check left no main event");
  const register = await g1.post(owner, g1.event(snagId, "mark_checked", { kind: "crew", crewId: sam.crewId }));
  const snag = g1.snag(register, snagId);
  assert.deepEqual([snag.title, snag.dueOn, snag.state], ["Refit the hall door stop", "2026-12-04", "checked"]);
  assert.deepEqual(snag.owner, { crewId: jordan.crewId, name: "Jordan Fictional", trade: "joiner" });
  assert.deepEqual([snag.people[1].name, snag.people[2].name], ["Jordan Fictional", "Sam Fictional"]);
  const reread = g1.snag(await json(await request(g1.path(), { cookies: owner.cookies })), snagId);
  assert.deepEqual(reread, snag);
  const events = (await admin.query(`SELECT event_type FROM app.audit_event WHERE subject_ref=$1 AND event_type LIKE 'v2.snag.%'
    AND payload->'references'->>'snagId'=$2 ORDER BY sequence`, [jobId, snagId])).rows.map(row => row.event_type);
  assert.deepEqual(events, ["v2.snag.owner_set", "v2.snag.event_person", "v2.snag.event_person"]);
});

test("G1 agreed outstanding reads back and clears; a checked snag cannot be agreed; owner refusals and fallback", async () => {
  const owner = await signIn("builder"), second = await signIn("second-builder");
  const snagId = await g1.add(owner, "Touch up the hall skirting", { assigneeLabel: "Dave (sparky)" });
  let register = await g1.post(owner, { version: "v2-snag-agreed-command.v1", commandId: randomUUID(), snagId, agreed: true, note: "visit agreed with Alex" });
  assert.equal(g1.snag(register, snagId).agreed.note, "visit agreed with Alex");
  register = await g1.post(owner, { version: "v2-snag-agreed-command.v1", commandId: randomUUID(), snagId, agreed: false, note: null });
  assert.equal(g1.snag(register, snagId).agreed, null);
  // Owner: another firm's crew record and an unknown id are refused; clearing falls back to main's label.
  const foreign = await g1.crew(second, "Other Firm Crew", "tiler");
  for (const crewId of [foreign.crewId, randomUUID()]) {
    assert.equal((await g1.post(owner, { version: "v2-snag-owner-command.v1", commandId: randomUUID(), snagId, crewId }, 409)).code, "V2_SNAG_CREW_UNAVAILABLE");
  }
  const mine = await g1.crew(owner, "Riley Fictional", "painter");
  register = await g1.post(owner, { version: "v2-snag-owner-command.v1", commandId: randomUUID(), snagId, crewId: mine.crewId });
  assert.equal(g1.snag(register, snagId).owner.name, "Riley Fictional");
  register = await g1.post(owner, { version: "v2-snag-owner-command.v1", commandId: randomUUID(), snagId, crewId: null });
  assert.deepEqual([g1.snag(register, snagId).owner, g1.snag(register, snagId).assigneeLabel], [null, "Dave (sparky)"]);
  // The builder fixes, a crew member checks: then nothing is outstanding.
  await g1.post(owner, g1.event(snagId, "mark_fixed", { kind: "builder" }));
  assert.equal((await g1.post(owner, g1.event(snagId, "mark_checked", { kind: "builder" }), 409)).code, "V2_SNAG_CHECKER_IS_FIXER");
  await g1.post(owner, g1.event(snagId, "mark_checked", { kind: "crew", crewId: mine.crewId }));
  assert.equal((await g1.post(owner, { version: "v2-snag-agreed-command.v1", commandId: randomUUID(), snagId, agreed: true, note: "late" }, 409)).code,
    "V2_SNAG_NOTHING_OUTSTANDING");
  // Plan check condition 2: a mark made before a later reopen does not carry over.
  const later = await g1.add(owner, "Fictional loose tile in the hall");
  register = await g1.post(owner, { version: "v2-snag-agreed-command.v1", commandId: randomUUID(), snagId: later, agreed: true, note: "agreed at walk-round" });
  assert.equal(g1.snag(register, later).agreed.note, "agreed at walk-round");
  await g1.post(owner, g1.event(later, "mark_fixed", { kind: "builder" }));
  await g1.post(owner, g1.event(later, "reopen", { kind: "builder" }));
  register = await json(await request(g1.path(), { cookies: owner.cookies }));
  assert.equal(g1.snag(register, later).agreed, null, "the reopen clears the earlier agreement");
});

test("G1 replay and conflict; main's own route still works and shows person not recorded", async () => {
  const owner = await signIn("builder");
  const sam = await g1.crew(owner, "Sam Replay", "decorator");
  const snagId = await g1.add(owner, "Fictional sticking drawer");
  const fixed = g1.event(snagId, "mark_fixed", { kind: "builder" });
  const first = await g1.post(owner, fixed);
  assert.deepEqual(await g1.post(owner, fixed), first);
  assert.equal((await g1.post(owner, { ...fixed, person: { kind: "crew", crewId: sam.crewId } }, 409)).code, "V2_SNAG_COMMAND_CONFLICT");
  assert.equal((await admin.query("SELECT count(*)::int AS n FROM app.v2_snag_event_person WHERE snag_id=$1", [snagId])).rows[0].n, 1);
  // One command identity across owner, event and agreed records.
  const ownerSet = { version: "v2-snag-owner-command.v1", commandId: randomUUID(), snagId, crewId: sam.crewId };
  await g1.post(owner, ownerSet);
  assert.equal((await g1.post(owner, { version: "v2-snag-agreed-command.v1", commandId: ownerSet.commandId, snagId, agreed: true, note: "Customer agreed" }, 409)).code,
    "V2_SNAG_COMMAND_CONFLICT");
  assert.equal((await g1.post(owner, { ...ownerSet, commandId: fixed.commandId }, 409)).code, "V2_SNAG_COMMAND_CONFLICT");
  assert.equal((await admin.query("SELECT count(*)::int AS n FROM app.v2_snag_agreed WHERE snag_id=$1", [snagId])).rows[0].n, 0);
  // Reopen and fix again through main's own route: no person row, and the register says so.
  await g1.post(owner, g1.event(snagId, "reopen", { kind: "builder" }));
  await json(await request(`/api/jobs/${jobId}/snags/${snagId}/events`, { cookies: owner.cookies, csrf: owner.csrfToken,
    body: { version: "snag-event.v1", commandId: randomUUID(), action: "mark_fixed" } }));
  const snag = g1.snag(await json(await request(g1.path(), { cookies: owner.cookies })), snagId);
  assert.deepEqual(snag.people[3], { kind: "unknown" });
  assert.equal(snag.state, "fixed");
});

test("G1 tables are forced, append only, firm-locked; person rows bind their own snag; main's snag schema is unchanged", async () => {
  const owner = await signIn("builder"), second = await signIn("second-builder");
  const snagId = await g1.add(owner, "Fictional loose tile");
  const other = await g1.add(owner, "Fictional cracked tile");
  await g1.post(owner, { version: "v2-snag-agreed-command.v1", commandId: randomUUID(), snagId, agreed: true, note: "agreed" });
  await g1.post(owner, { version: "v2-snag-owner-command.v1", commandId: randomUUID(), snagId, crewId: null });
  await g1.post(owner, g1.event(snagId, "mark_fixed", { kind: "builder" }));
  const { context } = await authenticatePracticeSession(runtime, owner.sessionId);
  const { context: shared } = await authenticatePracticeSession(runtime, second.sessionId);
  const query = (scope, sql, args) => withTenant(runtime, scope, db => db.$client.query(sql, args));
  for (const table of g1Tables) {
    const { rows: [acl] } = await admin.query(`SELECT relrowsecurity AND relforcerowsecurity AS forced, relowner::regrole::text AS owner,
      has_table_privilege('jobguard_runtime',oid,'SELECT,INSERT') AS can_write,
      has_table_privilege('jobguard_runtime',oid,'UPDATE,DELETE,TRUNCATE') AS can_mutate FROM pg_class WHERE oid=$1::regclass`, [table]);
    assert.deepEqual(acl, { forced: true, owner: "jobguard_migration", can_write: true, can_mutate: false });
    assert.ok(await visibleRows(context, table) > 0, `${table}: the owning firm reads its rows`);
    for (const scope of [shared, second.realContext]) assert.equal(await visibleRows(scope, table), 0, `${table}: hidden from the second firm`);
    for (const sql of [`UPDATE ${table} SET job_id=job_id WHERE job_id=$1`, `DELETE FROM ${table} WHERE job_id=$1`]) {
      await assert.rejects(query(context, sql, [jobId]), { code: "42501" });
      await assert.rejects(admin.query(sql, [jobId]));
    }
  }
  // A person row for another snag's event (no such event on that snag) is refused.
  await assert.rejects(admin.query(`INSERT INTO app.v2_snag_event_person (tenant_id, job_id, snag_id, event_sequence, person_kind, firm_key, command_id)
    SELECT tenant_id, job_id, $2, event_sequence, person_kind, firm_key, $3 FROM app.v2_snag_event_person WHERE snag_id = $1`,
  [snagId, other, randomUUID()]));
  // Main's snag routines and columns are byte-identical to a fresh read of 0782 + 2056: compare before and after a 2081 rerun.
  const catalog = async () => (await admin.query(`SELECT
    (SELECT jsonb_agg(pg_get_functiondef(p.oid) ORDER BY p.proname) FROM pg_proc p WHERE p.pronamespace='app'::regnamespace AND p.proname LIKE 'snag\\_%') functions,
    (SELECT jsonb_agg(c.relname || '.' || a.attname || ':' || format_type(a.atttypid, a.atttypmod) ORDER BY c.relname, a.attnum)
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid WHERE c.relnamespace='app'::regnamespace AND c.relname LIKE 'snag%'
      AND a.attnum > 0 AND NOT a.attisdropped) columns,
    (SELECT count(*)::int FROM pg_policy WHERE polname LIKE 'v2_snag_%') policies,
    (SELECT count(*)::int FROM pg_trigger WHERE tgname LIKE 'v2_snag_%') triggers`)).rows[0];
  const before = await catalog();
  assert.ok(before.functions.length >= 4 && !before.functions.some(text => /v2_snag/u.test(text)), "no main snag routine names the V2 register");
  await admin.query(readFileSync(new URL("../../packages/db/migrations/2081_v2_snag_register.sql", import.meta.url), "utf8"));
  assert.deepEqual(await catalog(), before, "2081 reruns without change and never touches main's snag schema");
  assert.ok(!before.columns.some(column => column.startsWith("v2_")), "no V2 column on main's snag tables");
  // Rule 29: GET refuses no session, an invalid session and the second firm.
  const typed = async cookies => { const response = await request(g1.path(), cookies ? { cookies } : {});
    return [response.status, (await response.json()).code]; };
  assert.deepEqual(await typed(), [401, "UNAUTHENTICATED"]);
  const invalid = await typed(`jg_session=${randomUUID()}`);
  assert.ok(["UNAUTHENTICATED", "NOT_FOUND"].includes(invalid[1]) && invalid[0] >= 401 && invalid[0] <= 404, String(invalid));
  assert.equal((await json(await request(g1.path(), { cookies: second.cookies }), 404)).code, "NOT_FOUND");
});

test("a variation revision photo on the V2 practice job is hidden from the second firm", async () => {
  // Extra photos are written only by main's pilot route (QW-1), never in practice mode, so the proof
  // row is placed directly with triggers off and removed afterwards. Only visibility is under test.
  const { rows: [revision] } = await admin.query(`SELECT tenant_id, job_id, variation_id, id, scope_item_id FROM app.variation_revision
    WHERE job_id=$1 AND scope_item_id IS NOT NULL LIMIT 1`, [jobId]);
  assert.ok(revision, "the seed suite has recorded a variation revision on the practice job");
  const evidenceId = randomUUID();
  const fixture = await admin.connect();
  const placed = async sql => {
    try { await fixture.query(`BEGIN; SET LOCAL session_replication_role=replica; ${sql}; COMMIT`); }
    catch (error) { await fixture.query("ROLLBACK"); throw error; }
  };
  try {
    await placed(`INSERT INTO app.evidence_object(id, tenant_id, job_id, scope_item_id, upload_id, kind, evidence_type, object_key, object_version_id,
        sha256, byte_length, content_type, retention_class, server_received_at, server_verified_at)
      VALUES ('${evidenceId}', '${revision.tenant_id}', '${revision.job_id}', '${revision.scope_item_id}', '${randomUUID()}', 'original', 'variation_photo',
        'v2-sync1-proof/${evidenceId}', 'v2-sync1-proof', '${"a".repeat(64)}', 1, 'image/png', 'standard_evidence', now(), now());
      INSERT INTO app.variation_revision_photo(tenant_id, job_id, variation_id, revision_id, scope_item_id, evidence_id, position, sha256, received_at)
      VALUES ('${revision.tenant_id}', '${revision.job_id}', '${revision.variation_id}', '${revision.id}', '${revision.scope_item_id}',
        '${evidenceId}', 6, '${"a".repeat(64)}', now())`);
    const owner = await signIn("builder");
    const { context: ownerContext } = await authenticatePracticeSession(runtime, owner.sessionId);
    assert.equal(await visibleRows(ownerContext, "app.variation_revision_photo"), 1, "the owning firm reads the photo link");
    const second = await signIn("second-builder");
    const { context: secondContext } = await authenticatePracticeSession(runtime, second.sessionId);
    for (const scope of [second.realContext, secondContext]) {
      assert.equal(await visibleRows(scope, "app.variation_revision_photo"), 0);
    }
  } finally {
    try {
      await placed(`DELETE FROM app.variation_revision_photo WHERE evidence_id='${evidenceId}';
        DELETE FROM app.evidence_object WHERE id='${evidenceId}'`);
    } finally { fixture.release(); }
  }
});

test("0777's pilot final-check branch cannot be reached from the V2 practice job", async () => {
  // On jobguard_v2_local, lp11_bind_shadow_job takes 0777's pilot branch, which needs the pilot shadow login.
  // That login exists only on jobguard_pilot* databases, so the branch refuses before any pilot side effect.
  const { rows: [state] } = await admin.query(`SELECT app.pilot_final_check_login() AS login,
    (SELECT count(*)::int FROM control_plane.pilot_final_check_binding) AS bindings,
    (SELECT count(*)::int FROM app.pilot_final_check_terms_approval) AS approvals,
    (SELECT count(*)::int FROM infrastructure.final_check_request) AS requests,
    (SELECT tenant_id FROM app.job WHERE id=$1) AS tenant`, [jobId]);
  assert.deepEqual({ ...state, tenant: undefined }, { login: false, bindings: 0, approvals: 0, requests: 0, tenant: undefined });
  const client = await admin.connect();
  try {
    await client.query("BEGIN");
    await assert.rejects(client.query("SELECT app.lp11_bind_shadow_job($1,$2)", [state.tenant, jobId]), /FINAL_CHECK_FORBIDDEN/u);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
  const { rows: [after] } = await admin.query(`SELECT (SELECT count(*)::int FROM control_plane.lp11_shadow_scope) AS scopes,
    (SELECT count(*)::int FROM control_plane.pilot_final_check_binding) AS bindings`);
  assert.deepEqual(after, { scopes: 0, bindings: 0 });
  // The job is a practice job, which the pilot branch's job query also excludes (practice_session_digest IS NULL).
  const { rows: [job] } = await admin.query("SELECT practice_session_digest IS NOT NULL AS practice FROM app.job WHERE id=$1", [jobId]);
  assert.equal(job.practice, true);
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

// V2-G2 (Q56, migration 2082): handover pack versions. The builder ticks what goes in, previews, and saves frozen versions.
const g2 = {
  async job() {
    const { jobId: job, scopeItemId, sessionId } = await pxLiveJob();
    const owner = await signIn("builder");
    const { context } = await authenticatePracticeSession(runtime, sessionId);
    const app = createWorkspaceApplication({ pool: runtime, sessionId });
    const photo = await uploadPracticePhoto(runtime, context, { jobId: job, scopeItemId });
    const variationId = randomUUID();
    const proposed = await app.variation.command(job, { version: "variation-command.v1", action: "propose", proposalId: variationId,
      scopeItemId: randomUUID(), existingScopeItemId: null, lineageParentScopeItemId: null,
      description: "splashback extended to the end of the worktop", captureText: "Customer asks to extend the splashback",
      price: { quantity: "1", unit: "item", unitRatePence: 9500, direction: "addition" } });
    await app.variation.command(job, { version: "variation-command.v1", action: "approve", variationId,
      revisionId: proposed.variations.find(item => item.id === variationId).currentRevisionId, approvalId: randomUUID(),
      attestation: "Builder-recorded practice acceptance — not an authenticated customer signature" });
    const jordan = await g1.crew(owner, "Jordan Handover", "joiner"), sam = await g1.crew(owner, "Sam Handover", "decorator");
    const snagId = randomUUID();
    await json(await request(`/api/jobs/${job}/snags`, { cookies: owner.cookies, csrf: owner.csrfToken,
      body: { version: "snag.v1", action: "add", commandId: randomUUID(), snagId, title: "Refit the hall door stop", dueOn: "2026-12-04" } }));
    const register = body => request(`/api/jobs/${job}/snag-register`, { cookies: owner.cookies, csrf: owner.csrfToken, body }).then(response => json(response));
    await register({ version: "v2-snag-owner-command.v1", commandId: randomUUID(), snagId, crewId: jordan.crewId });
    await register({ version: "v2-snag-agreed-command.v1", commandId: randomUUID(), snagId, agreed: true, note: "Visit agreed with Alex." });
    return { job, owner, sessionId, context, photo, variationId, snagId, jordan, sam, register,
      path: `/api/jobs/${job}/handover`,
      post: (body, status = 200) => request(`/api/jobs/${job}/handover`, { cookies: owner.cookies, csrf: owner.csrfToken, body }).then(response => json(response, status)) };
  },
  save: (choice, expectedVersion = 0, commandId = randomUUID()) => ({ version: "v2-handover-save-command.v1", commandId, expectedVersion, choice }),
  events: async commandId => (await admin.query(`SELECT payload FROM app.audit_event WHERE event_type='v2.handover.version_saved'
    AND payload->'references'->>'commandId'=$1`, [commandId])).rows,
};
const g2Text = content => content.sections.flatMap(section => [section.title, ...section.lines]).join("\n");

test("G2 done when: the builder ticks every section, previews, and saves version 1 with no amounts", async () => {
  const f = await g2.job();
  const view = await json(await request(f.path, { cookies: f.owner.cookies }));
  assert.ok(view.sources.lines.length >= 3);
  assert.deepEqual(view.versions, []);
  assert.equal(JSON.stringify(view.sources).match(/pence|unitRate|netPence|signedDelta/iu), null, "the sources carry no money field");
  const choice = { sections: ["done", "changes", "photos", "certificates", "snags", "contacts"],
    lineIds: view.sources.lines.slice(0, 3).map(row => row.id), variationIds: [f.variationId], photoIds: [f.photo.evidenceId], snagIds: [f.snagId],
    certificates: [{ text: "Tile adhesive and grout data sheets", status: "included" }, { text: "electrical certificate", status: "still_needed" }] };
  const before = (await admin.query("SELECT count(*)::int AS n FROM app.v2_handover_version WHERE job_id=$1", [f.job])).rows[0].n;
  const { preview } = await f.post({ version: "v2-handover-preview.v1", choice });
  assert.deepEqual(preview.refused, []);
  assert.equal((await admin.query("SELECT count(*)::int AS n FROM app.v2_handover_version WHERE job_id=$1", [f.job])).rows[0].n, before, "a preview writes nothing");
  const command = g2.save(choice);
  const { saved } = await f.post(command);
  assert.equal(saved.version, 1);
  assert.deepEqual(saved.content, preview.content, "the saved version is the previewed text");
  const text = g2Text(saved.content);
  assert.match(text, /Agreed change · splashback extended to the end of the worktop/u);
  assert.match(text, /Refit the hall door stop · Jordan Handover · due 4 Dec\. Visit agreed with Alex\./u);
  assert.match(text, /Still needed: electrical certificate\. Your builder will supply it separately\./u);
  assert.match(text, /Site photo 1 · /u);
  assert.deepEqual(saved.content.sections.find(section => section.key === "photos").photos, [{ id: f.photo.evidenceId, sha256: f.photo.sha256 }]);
  const { rows: money } = await admin.query(`SELECT unit_rate_pence::text AS v FROM app.quote_line WHERE job_id=$1
    UNION SELECT signed_delta_pence::text FROM app.variation_revision WHERE job_id=$1 UNION SELECT unit_rate_pence::text FROM app.variation_revision WHERE job_id=$1`, [f.job]);
  const stored = (await admin.query("SELECT content FROM app.v2_handover_version WHERE job_id=$1 AND version=1", [f.job])).rows[0].content;
  const storedText = g2Text(stored);
  assert.doesNotMatch(storedText, /£|pence|pounds|\d+[.,]\d{2}\b/u);
  for (const { v } of money.filter(row => Number(row.v) > 0)) {
    assert.doesNotMatch(storedText, new RegExp(`\\b${v}\\b`, "u"));
    assert.doesNotMatch(storedText, new RegExp(`\\b${(Number(v) / 100).toFixed(2).replace(".", "\\.")}\\b`, "u"));
  }
  assert.deepEqual((await f.post(command)).saved, { ...saved, replayed: true });
  assert.equal((await g2.events(command.commandId)).length, 1);
  const [event] = await g2.events(command.commandId);
  assert.equal(event.payload.hashes.content, saved.contentHash);
  assert.doesNotMatch(JSON.stringify(event.payload), /door stop|splashback|electrical/u);
  const reloaded = await json(await request(f.path, { cookies: f.owner.cookies }));
  assert.deepEqual(reloaded.versions.map(row => [row.version, row.contentHash]), [[1, saved.contentHash]]);
});

test("G2 a checked snag leaves Outstanding in version 2, and version 1 reads back unchanged", async () => {
  const f = await g2.job();
  const choice = { sections: ["snags", "contacts"], lineIds: [], variationIds: [], photoIds: [], snagIds: [f.snagId], certificates: [] };
  const first = (await f.post(g2.save(choice))).saved;
  await f.register({ version: "v2-snag-event-command.v1", commandId: randomUUID(), snagId: f.snagId, action: "mark_fixed", person: { kind: "crew", crewId: f.jordan.crewId } });
  await f.register({ version: "v2-snag-event-command.v1", commandId: randomUUID(), snagId: f.snagId, action: "mark_checked", person: { kind: "crew", crewId: f.sam.crewId } });
  const view = await json(await request(f.path, { cookies: f.owner.cookies }));
  assert.equal(view.sources.snags.some(row => row.id === f.snagId), false, "a checked snag is not outstanding");
  // Naming it again is refused; dropping it saves version 2.
  assert.equal((await f.post(g2.save(choice, 1), 409)).code, "HANDOVER_SOURCE_CHANGED");
  const second = (await f.post(g2.save({ ...choice, sections: ["contacts"], snagIds: [] }, 1))).saved;
  assert.equal(second.version, 2);
  assert.equal(second.content.sections.some(section => section.key === "snags"), false);
  const again = (await admin.query("SELECT content, content_hash FROM app.v2_handover_version WHERE job_id=$1 AND version=1", [f.job])).rows[0];
  assert.equal(again.content_hash, first.contentHash);
  assert.deepEqual(again.content, first.content);
});

test("G2 refusals: an amount, a stale version, a snag checked after preview, another job's photo, nothing ticked", async () => {
  const f = await g2.job();
  const base = { sections: ["certificates"], lineIds: [], variationIds: [], photoIds: [], snagIds: [], certificates: [{ text: "Spare tiles worth £40", status: "included" }] };
  const amount = await f.post(g2.save(base), 409);
  assert.deepEqual([amount.code, amount.refused], ["HANDOVER_LINE_REFUSED", [{ section: "certificates", line: "Spare tiles worth £40", reason: "amount" }]]);
  assert.equal((await f.post(g2.save({ ...base, sections: [] }), 409)).code, "HANDOVER_NOTHING_CHOSEN");
  const ok = { ...base, certificates: [{ text: "Spare tiles left in the loft", status: "included" }] };
  await f.post(g2.save(ok));
  assert.equal((await f.post(g2.save(ok, 0), 409)).code, "HANDOVER_VERSION_CONFLICT");
  // Previewed with the snag, then the snag is checked before Save.
  const withSnag = { ...ok, sections: ["snags"], certificates: [], snagIds: [f.snagId] };
  assert.deepEqual((await f.post({ version: "v2-handover-preview.v1", choice: withSnag })).preview.refused, []);
  await f.register({ version: "v2-snag-event-command.v1", commandId: randomUUID(), snagId: f.snagId, action: "mark_fixed", person: { kind: "builder" } });
  await f.register({ version: "v2-snag-event-command.v1", commandId: randomUUID(), snagId: f.snagId, action: "mark_checked", person: { kind: "crew", crewId: f.sam.crewId } });
  assert.equal((await f.post(g2.save(withSnag, 1), 409)).code, "HANDOVER_SOURCE_CHANGED");
  // Another job's photo is never offered, and naming it is refused.
  const other = await g2.job();
  assert.equal((await json(await request(f.path, { cookies: f.owner.cookies }))).sources.photos.some(row => row.id === other.photo.evidenceId), false);
  assert.equal((await f.post(g2.save({ ...ok, sections: ["photos"], certificates: [], photoIds: [other.photo.evidenceId] }, 1), 409)).code, "HANDOVER_SOURCE_CHANGED");
  assert.equal((await admin.query("SELECT count(*)::int AS n FROM app.v2_handover_version WHERE job_id=$1", [f.job])).rows[0].n, 1);
});

// Codex review on #998: a snag's note edited in another session after the preview must not be frozen unseen.
test("G2 saves only the previewed text: a note changed after the preview refuses the save until it is previewed again", async () => {
  const f = await g2.job();
  const choice = { sections: ["snags"], lineIds: [], variationIds: [], photoIds: [], snagIds: [f.snagId], certificates: [] };
  const first = (await f.post({ version: "v2-handover-preview.v1", choice })).preview;
  assert.match(first.contentHash, /^[0-9a-f]{64}$/u);
  await f.register({ version: "v2-snag-agreed-command.v1", commandId: randomUUID(), snagId: f.snagId, agreed: true, note: "Visit moved to Friday." });
  assert.equal((await f.post({ ...g2.save(choice), previewHash: first.contentHash }, 409)).code, "HANDOVER_SOURCE_CHANGED");
  assert.equal((await admin.query("SELECT count(*)::int AS n FROM app.v2_handover_version WHERE job_id=$1", [f.job])).rows[0].n, 0);
  const again = (await f.post({ version: "v2-handover-preview.v1", choice })).preview;
  assert.notEqual(again.contentHash, first.contentHash);
  const { saved } = await f.post({ ...g2.save(choice), previewHash: again.contentHash });
  assert.deepEqual(saved.content, again.content);
  assert.equal(saved.contentHash, again.contentHash);
  assert.match(g2Text(saved.content), /Visit moved to Friday\./u);
});

test("G2 the pack reads a snag's latest revision, and a revision after the preview refuses the save", async () => {
  const f = await g2.job();
  const choice = { sections: ["snags"], lineIds: [], variationIds: [], photoIds: [], snagIds: [f.snagId], certificates: [] };
  const first = (await f.post({ version: "v2-handover-preview.v1", choice })).preview;
  await json(await request(`/api/jobs/${f.job}/snags`, { cookies: f.owner.cookies, csrf: f.owner.csrfToken,
    body: { version: "snag.v1", action: "revise", commandId: randomUUID(), snagId: f.snagId, expectedRevision: 1,
      title: "Refit the hall door stop and buffer", location: null, assigneeLabel: null, dueOn: null } }));
  assert.equal((await f.post({ ...g2.save(choice), previewHash: first.contentHash }, 409)).code, "HANDOVER_SOURCE_CHANGED");
  const again = (await f.post({ version: "v2-handover-preview.v1", choice })).preview;
  assert.match(g2Text(again.content), /Refit the hall door stop and buffer/u);
  assert.doesNotMatch(g2Text(again.content), /2026-12-04|4 Dec/u, "the revision cleared the due date");
  await f.post({ ...g2.save(choice), previewHash: again.contentHash });
});

test("G2 replay and conflict, append-only, firm A/B read check and route refusals", async () => {
  const f = await g2.job();
  const choice = { sections: ["contacts"], lineIds: [], variationIds: [], photoIds: [], snagIds: [], certificates: [] };
  const command = g2.save(choice);
  await f.post(command);
  assert.equal((await f.post({ ...command, choice: { ...choice, sections: ["contacts", "certificates"], certificates: [{ text: "Other", status: "included" }] } }, 409)).code,
    "HANDOVER_COMMAND_CONFLICT");
  for (const sql of ["UPDATE app.v2_handover_version SET content=content WHERE job_id=$1", "DELETE FROM app.v2_handover_version WHERE job_id=$1"])
    await assert.rejects(withTenant(runtime, f.context, db => db.$client.query(sql, [f.job])), { code: "42501" });
  const { rows: [catalog] } = await admin.query(`SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid='app.v2_handover_version'::regclass`);
  assert.deepEqual(catalog, { relrowsecurity: true, relforcerowsecurity: true });
  // Rule 29 / rule 30: no session, a bad session and the second firm see nothing.
  await json(await request(f.path), 401);
  const invalid = await request(f.path, { cookies: "jg_session=" + "x".repeat(43) });
  assert.ok([401, 404].includes(invalid.status), String(invalid.status));
  const second = await signIn("second-builder");
  await json(await request(f.path, { cookies: second.cookies }), 404);
  await json(await request(f.path, { cookies: second.cookies, csrf: second.csrfToken, body: g2.save(choice, 1) }), 404);
  const { context: secondContext } = await authenticatePracticeSession(runtime, second.sessionId);
  for (const scope of [second.realContext, secondContext]) await withTenant(runtime, scope, async db => {
    assert.equal((await db.$client.query("SELECT 1 FROM app.v2_handover_version WHERE job_id=$1", [f.job])).rowCount, 0);
  });
  await verifyTenantChain(f.context.tenantId);
});

test("G2 migration 2082 reruns without changing policies, triggers or rows", async () => {
  const catalog = async () => (await admin.query(`SELECT
    (SELECT string_agg(polname, ',' ORDER BY polname) FROM pg_policy WHERE polrelid='app.v2_handover_version'::regclass) AS policies,
    (SELECT string_agg(tgname, ',' ORDER BY tgname) FROM pg_trigger WHERE tgrelid='app.v2_handover_version'::regclass AND NOT tgisinternal) AS triggers,
    (SELECT relacl::text FROM pg_class WHERE oid='app.v2_handover_version'::regclass) AS acl,
    (SELECT count(*)::int FROM app.v2_handover_version) AS rows`)).rows[0];
  const before = await catalog();
  await admin.query(readFileSync(new URL("../../packages/db/migrations/2082_v2_handover_version.sql", import.meta.url), "utf8"));
  assert.deepEqual(await catalog(), before);
});

// V2-G3 (Q57, migration 2083): release a saved handover version by customer link, and "Acknowledge receipt".
const g3 = {
  // No V2 command completes site work yet, so the fixture marks every scope item complete directly
  // (the same final state main's proof command reaches through app.transition_scope_progress).
  complete: jobId => admin.query(`UPDATE app.scope_progress SET stage='complete', revision=revision+1, updated_at=clock_timestamp()
    WHERE job_id=$1 AND stage<>'complete'`, [jobId]),
  release: (handoverVersion, commandId = randomUUID()) => ({ version: "v2-handover-release-command.v1", commandId, handoverVersion }),
  releases: f => request(`${f.path}/releases`, { cookies: f.owner.cookies }).then(response => json(response)),
  post: (f, body, status = 200) => request(`${f.path}/releases`, { cookies: f.owner.cookies, csrf: f.owner.csrfToken, body })
    .then(response => json(response, status)),
  open: token => request(`/handover/${token}`),
  acknowledge: (token, status = 200, cookies) => request("/api/v2/handover", { cookies, body: { version: "v2-handover-acknowledge.v1", token } })
    .then(response => json(response, status)),
  // In process, for the catcher count and a past clock. The catcher logs metadata only, under local V2.
  async direct(f, body, clock) {
    const auth = await authorizePracticeJob(runtime, f.sessionId, f.job);
    const repository = new HandoverReleaseRepository(practiceMaterialPool(runtime, auth.digest), clock);
    const captured = [], info = console.info, local = process.env.JOBGUARD_LOCAL_V2;
    console.info = line => captured.push(JSON.parse(line));
    process.env.JOBGUARD_LOCAL_V2 = "1";
    try { return { result: await repository.release(auth.context, f.job, f.sessionId, body).catch(error => error), captured }; }
    finally { console.info = info; if (local === undefined) delete process.env.JOBGUARD_LOCAL_V2; else process.env.JOBGUARD_LOCAL_V2 = local; }
  },
  async ready() {
    const f = await g2.job();
    await g3.complete(f.job);
    const view = await json(await request(f.path, { cookies: f.owner.cookies }));
    const line = view.sources.lines[0].id;
    const v1 = (await f.post(g2.save({ sections: ["done", "snags", "contacts"], lineIds: [line], variationIds: [], photoIds: [],
      snagIds: [f.snagId], certificates: [] }))).saved;
    return { ...f, line, v1 };
  },
};
const linkTables = ["app.snag_event", "app.variation_approval", "app.final_account_lock", "app.customer_invoice", "app.v2_snag_owner",
  "app.v2_snag_agreed", "app.v2_handover_version", "app.v2_handover_release"];
const linkSnapshot = async jobId => Object.fromEntries(await Promise.all(linkTables.map(async table =>
  [table, (await admin.query(`SELECT count(*)::int AS n, md5(coalesce(string_agg(t::text, '|' ORDER BY t::text), '')) AS rows
    FROM ${table} t WHERE job_id=$1`, [jobId])).rows[0]])));

test("G3 done when: the customer opens v1 by link, sees the outstanding snag, acknowledges, and later receives a corrected v2", async () => {
  const f = await g3.ready();
  const first = await g3.direct(f, g3.release(1));
  assert.equal(first.result.replayed, false);
  assert.deepEqual(first.captured, [{ event: "v2.delivery.captured", kind: "v2_handover_release" }], "one catcher delivery, metadata only");
  const { rows: [stored] } = await admin.query("SELECT recipient_email, token_hash FROM app.v2_handover_release WHERE id=$1", [first.result.release.releaseId]);
  assert.equal(stored.recipient_email, "customer@jobguard-v2.invalid");
  assert.equal(stored.token_hash, createHash("sha256").update(first.result.token).digest("hex"), "only the hash is stored");
  // The customer, with no sign-in.
  const page = await g3.open(first.result.token);
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("cache-control")?.includes("no-store") ?? false, true);
  const html = await page.text();
  assert.match(html, /Outstanding snags/u);
  assert.match(html, /Refit the hall door stop/u);
  assert.match(html, /Receipt only: acknowledging this pack does not agree the account or sign off any snag\./u);
  assert.doesNotMatch(html, /Newer version available/u);
  assert.doesNotMatch(html, /£|pence/u);
  const ack = await g3.acknowledge(first.result.token);
  assert.equal(ack.replayed, false);
  // The builder checks the snag, saves version 2 without it and releases it.
  await f.register({ version: "v2-snag-event-command.v1", commandId: randomUUID(), snagId: f.snagId, action: "mark_fixed", person: { kind: "crew", crewId: f.jordan.crewId } });
  await f.register({ version: "v2-snag-event-command.v1", commandId: randomUUID(), snagId: f.snagId, action: "mark_checked", person: { kind: "crew", crewId: f.sam.crewId } });
  const v2 = (await f.post(g2.save({ sections: ["done", "contacts"], lineIds: [f.line], variationIds: [], photoIds: [], snagIds: [], certificates: [] }, 1))).saved;
  const second = await g3.direct(f, g3.release(v2.version));
  assert.equal(second.captured.length, 1, "one more delivery");
  const old = await (await g3.open(first.result.token)).text();
  assert.match(old, /Newer version available/u);
  assert.match(old, /Refit the hall door stop/u, "version 1 still shows unchanged");
  const corrected = await (await g3.open(second.result.token)).text();
  assert.doesNotMatch(corrected, /Refit the hall door stop|Newer version available/u);
  const { releases, siteComplete } = await g3.releases(f);
  assert.equal(siteComplete, true);
  assert.deepEqual(releases.map(row => [row.version, row.acknowledgedAt !== null, row.superseded]), [[1, true, true], [2, false, false]]);
  assert.equal(JSON.stringify(releases).includes(first.result.token), false, "the history never carries a token");
  // A replay returns the release without the link, and delivers nothing.
  const replay = await g3.direct(f, { ...g3.release(1), commandId: (await admin.query("SELECT command_id FROM app.v2_handover_release WHERE id=$1",
    [first.result.release.releaseId])).rows[0].command_id });
  assert.deepEqual([replay.result.replayed, replay.result.token, replay.captured.length], [true, null, 0]);
  const events = (await admin.query(`SELECT event_type, actor_ref, payload FROM app.audit_event WHERE subject_ref=$1
    AND event_type IN ('v2.handover.released', 'v2.handover.acknowledged') ORDER BY sequence`, [f.job])).rows;
  assert.deepEqual(events.map(row => row.event_type), ["v2.handover.released", "v2.handover.acknowledged", "v2.handover.released"]);
  assert.equal(events[1].actor_ref, `handover_link:${first.result.release.releaseId}`);
  assert.doesNotMatch(JSON.stringify(events), /door stop|customer@|jobguard-v2\.invalid/u);
  await verifyTenantChain(f.context.tenantId);
});

test("G3 release is refused while a scope item is still in progress, with no delivery and no row", async () => {
  const f = await g2.job();
  const saved = (await f.post(g2.save({ sections: ["contacts"], lineIds: [], variationIds: [], photoIds: [], snagIds: [], certificates: [] }))).saved;
  assert.equal((await g3.releases(f)).siteComplete, false);
  const refused = await g3.direct(f, g3.release(saved.version));
  assert.equal(refused.result.code, "HANDOVER_SITE_NOT_COMPLETE");
  assert.deepEqual(refused.captured, []);
  assert.equal((await g3.post(f, g3.release(saved.version), 409)).code, "HANDOVER_SITE_NOT_COMPLETE");
  assert.equal((await admin.query("SELECT count(*)::int AS n FROM app.v2_handover_release WHERE job_id=$1", [f.job])).rows[0].n, 0);
  // Never the financial lock: completing the site work alone is enough.
  await g3.complete(f.job);
  assert.equal((await admin.query("SELECT count(*)::int AS n FROM app.final_account_lock WHERE job_id=$1", [f.job])).rows[0].n, 0);
  assert.ok((await g3.post(f, g3.release(saved.version))).token);
});

test("G3 link refusals: a made-up token, an expired link and an altered link with the second firm signed in are one refusal", async () => {
  const f = await g3.ready();
  const expired = await g3.direct(f, { ...g3.release(1), expiresInDays: 30 }, () => Date.now() - 31 * 86_400_000);
  const live = await g3.direct(f, g3.release(1));
  const second = await signIn("second-builder");
  const altered = live.result.token.slice(0, -1) + (live.result.token.endsWith("A") ? "B" : "A");
  const bodies = [];
  for (const [token, cookies] of [["x".repeat(43), undefined], [expired.result.token, undefined], [altered, second.cookies]]) {
    bodies.push(await g3.acknowledge(token, 404, cookies));
    const page = await (await g3.open(token)).text();
    assert.match(page, /This link can’t be opened|This link can&#x27;t be opened|This link can’t/u);
    assert.doesNotMatch(page, /Refit the hall door stop|£|pence/u);
  }
  assert.deepEqual(bodies, Array(3).fill({ code: "HANDOVER_LINK_REFUSED" }));
  assert.equal((await admin.query("SELECT count(*)::int AS n FROM app.v2_handover_acknowledgement WHERE job_id=$1", [f.job])).rows[0].n, 0);
  // The token is the capability: a valid link opens whoever is signed in, even the second firm's builder.
  assert.match(await (await request(`/handover/${live.result.token}`, { cookies: second.cookies })).text(), /Refit the hall door stop/u);
  // The firm check is on the builder routes: the second firm's builder cannot list or release the first firm's versions.
  await json(await request(`${f.path}/releases`, { cookies: second.cookies }), 404);
  await json(await request(`${f.path}/releases`, { cookies: second.cookies, csrf: second.csrfToken, body: g3.release(1) }), 404);
});

test("G3 acknowledging twice is one row, and both tables refuse UPDATE and DELETE", async () => {
  const f = await g3.ready();
  const { result } = await g3.direct(f, g3.release(1));
  const first = await g3.acknowledge(result.token), again = await g3.acknowledge(result.token);
  assert.deepEqual([again.replayed, again.acknowledgedAt], [true, first.acknowledgedAt]);
  assert.equal((await admin.query("SELECT count(*)::int AS n FROM app.v2_handover_acknowledgement WHERE job_id=$1", [f.job])).rows[0].n, 1);
  assert.equal((await admin.query(`SELECT count(*)::int AS n FROM app.audit_event WHERE subject_ref=$1 AND event_type='v2.handover.acknowledged'`, [f.job])).rows[0].n, 1);
  for (const sql of ["UPDATE app.v2_handover_release SET firm_name=firm_name WHERE job_id=$1", "DELETE FROM app.v2_handover_release WHERE job_id=$1",
    "UPDATE app.v2_handover_acknowledgement SET acknowledged_at=acknowledged_at WHERE job_id=$1", "DELETE FROM app.v2_handover_acknowledgement WHERE job_id=$1",
    "INSERT INTO app.v2_handover_acknowledgement (tenant_id, job_id, release_id) SELECT tenant_id, job_id, id FROM app.v2_handover_release WHERE job_id=$1"])
    await assert.rejects(withTenant(runtime, f.context, db => db.$client.query(sql, [f.job])), { code: "42501" });
  for (const sql of ["UPDATE app.v2_handover_release SET firm_name=firm_name WHERE job_id=$1", "DELETE FROM app.v2_handover_acknowledgement WHERE job_id=$1"])
    await assert.rejects(admin.query(sql, [f.job]));
  const { rows } = await admin.query(`SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
    WHERE oid IN ('app.v2_handover_release'::regclass, 'app.v2_handover_acknowledgement'::regclass) ORDER BY relname`);
  assert.deepEqual(rows.map(row => [row.relrowsecurity, row.relforcerowsecurity]), [[true, true], [true, true]]);
});

test("G3 acknowledgement changes nothing else: snag, variation, lock, invoice and handover rows are identical", async () => {
  const f = await g3.ready();
  const { result } = await g3.direct(f, g3.release(1));
  const before = await linkSnapshot(f.job);
  await g3.acknowledge(result.token);
  assert.deepEqual(await linkSnapshot(f.job), before);
  const { rows: [{ triggers }] } = await admin.query(`SELECT coalesce(string_agg(tgname, ',' ORDER BY tgname), '') AS triggers FROM pg_trigger
    WHERE tgrelid='app.v2_handover_acknowledgement'::regclass AND NOT tgisinternal`);
  assert.equal(triggers, "v2_handover_acknowledgement_immutable", "no watchdog or other trigger on the receipt table");
  const reloaded = await (await g3.open(result.token)).text();
  assert.match(reloaded, /Receipt acknowledged/u);
  assert.match(reloaded, /Refit the hall door stop/u, "the snag is still outstanding: receipt signs nothing off");
});

test("G3 a superseded link stays read-only: v1 released, v2 released, then v1 cannot be acknowledged", async () => {
  const f = await g3.ready();
  const first = await g3.direct(f, g3.release(1));
  await f.register({ version: "v2-snag-event-command.v1", commandId: randomUUID(), snagId: f.snagId, action: "mark_fixed", person: { kind: "crew", crewId: f.jordan.crewId } });
  await f.register({ version: "v2-snag-event-command.v1", commandId: randomUUID(), snagId: f.snagId, action: "mark_checked", person: { kind: "crew", crewId: f.sam.crewId } });
  const v2 = (await f.post(g2.save({ sections: ["done", "contacts"], lineIds: [f.line], variationIds: [], photoIds: [], snagIds: [], certificates: [] }, 1))).saved;
  const second = await g3.direct(f, g3.release(v2.version));
  const old = await (await g3.open(first.result.token)).text();
  assert.match(old, /This version can no longer be acknowledged/u);
  assert.doesNotMatch(old, />Acknowledge receipt</u, "no receipt button on a superseded link");
  assert.equal((await g3.acknowledge(first.result.token, 404)).code, "HANDOVER_LINK_REFUSED");
  assert.equal((await admin.query("SELECT 1 FROM app.v2_handover_acknowledgement WHERE release_id=$1", [first.result.release.releaseId])).rowCount, 0);
  assert.equal((await g3.acknowledge(second.result.token)).replayed, false, "the newest link still records receipt");
});

test("G3 firm A/B read check, and migration 2083 reruns without changing policies, triggers or rows", async () => {
  const f = await g3.ready();
  const { result } = await g3.direct(f, g3.release(1));
  await g3.acknowledge(result.token);
  const second = await signIn("second-builder");
  const { context: secondContext } = await authenticatePracticeSession(runtime, second.sessionId);
  for (const scope of [second.realContext, secondContext]) await withTenant(runtime, scope, async db => {
    for (const table of ["app.v2_handover_release", "app.v2_handover_acknowledgement"])
      assert.equal((await db.$client.query(`SELECT 1 FROM ${table} WHERE job_id=$1`, [f.job])).rowCount, 0, `${table} hidden`);
  });
  const catalog = async () => (await admin.query(`SELECT
    (SELECT string_agg(polrelid::regclass::text || ':' || polname, ',' ORDER BY 1) FROM pg_policy WHERE polname LIKE 'v2_handover_%') AS policies,
    (SELECT string_agg(tgname, ',' ORDER BY tgname) FROM pg_trigger WHERE tgrelid IN ('app.v2_handover_release'::regclass,
      'app.v2_handover_acknowledgement'::regclass) AND NOT tgisinternal) AS triggers,
    (SELECT string_agg(relacl::text, ',' ORDER BY relname) FROM pg_class WHERE oid IN ('app.v2_handover_release'::regclass,
      'app.v2_handover_acknowledgement'::regclass)) AS acl,
    (SELECT count(*)::int FROM app.v2_handover_release) + (SELECT count(*)::int FROM app.v2_handover_acknowledgement) AS rows`)).rows[0];
  const before = await catalog();
  await admin.query(readFileSync(new URL("../../packages/db/migrations/2083_v2_handover_release.sql", import.meta.url), "utf8"));
  assert.deepEqual(await catalog(), before);
});

// V2-G4 (Q63, migration 2084): who can read the handover pack. The builder can stop a link, a changed customer
// stops the old one, "newer version available" ignores stopped releases, and another firm sees nothing.
// G3's rerun case reapplies 2083, which puts back the pre-G4 link function bodies. Each G4 case reapplies
// 2084 first (it is idempotent), so these cases always run against the G4 bodies whatever ran before.
const g4Migration = readFileSync(new URL("../../packages/db/migrations/2084_v2_handover_release_stop.sql", import.meta.url), "utf8");
const g4 = {
  async ready() { await admin.query(g4Migration); return g3.ready(); },
  stop: (releaseId, reason = "Sent by mistake", commandId = randomUUID()) => ({ version: "v2-handover-stop-command.v1", commandId, releaseId, reason }),
  // The ordinary customer-and-site path: a correction on a live job, with a reason. A null customerRef is a new customer.
  async customer(f, email, { same = false } = {}) {
    const app = createWorkspaceApplication({ pool: runtime, sessionId: f.sessionId });
    const view = await app.parties.view({ sessionId: f.sessionId }, f.job);
    const known = view.customers.find(row => row.id === view.currentIds.customerId);
    return app.parties.command({ sessionId: f.sessionId }, f.job, {
      version: "job-parties-command.v1", action: "save_form", commandId: randomUUID(),
      expectedJobRevision: view.jobRevision, expectedBindingId: view.currentIds.bindingId,
      customer: { ...view.current.customer, ...(same ? {} : { name: "Fictional Replacement Customer" }), email },
      customerRef: same ? { id: known.id, revisionId: known.revisionId, expectedRevision: known.revision } : null,
      site: view.current.site, savedSiteRevisionId: view.current.siteRevisionId, reuseSiteId: null, expectedReuseRevisionId: null,
      confirmSamePlace: false, payingPartyRevisionId: null, expectedPayerRevisionId: null, correct: true, reason: "Customer contact changed",
    });
  },
  refused: async (token, cookies) => {
    assert.deepEqual(await g3.acknowledge(token, 404, cookies), { code: "HANDOVER_LINK_REFUSED" });
    const page = await (await g3.open(token)).text();
    assert.match(page, /This link can’t be opened|This link can&#x27;t be opened|This link can’t/u);
    assert.doesNotMatch(page, /Refit the hall door stop|£|pence/u);
  },
};

test("G4 stop: a stopped link is refused like an unknown one, history shows it, and a new release opens", async () => {
  const f = await g4.ready();
  const first = await g3.direct(f, g3.release(1));
  const stopped = await g3.post(f, g4.stop(first.result.release.releaseId));
  assert.equal(stopped.replayed, false);
  assert.ok(stopped.release.stoppedAt);
  await g4.refused(first.result.token);
  assert.equal((await admin.query("SELECT count(*)::int AS n FROM app.v2_handover_acknowledgement WHERE job_id=$1", [f.job])).rows[0].n, 0);
  const history = (await g3.releases(f)).releases;
  assert.deepEqual(history.map(row => [row.version, row.stoppedAt !== null, row.recipientCurrent]), [[1, true, true]]);
  const again = await g3.direct(f, g3.release(1));
  assert.equal(again.captured.length, 1, "one more catcher delivery");
  assert.equal((await g3.open(again.result.token)).status, 200);
  assert.match(await (await g3.open(again.result.token)).text(), /Refit the hall door stop/u);
  const events = (await admin.query(`SELECT payload FROM app.audit_event WHERE subject_ref=$1 AND event_type='v2.handover.link_stopped'`, [f.job])).rows;
  assert.equal(events.length, 1);
  assert.deepEqual(Object.keys(events[0].payload.references).sort(), ["commandId", "handoverVersion", "releaseId"]);
  assert.doesNotMatch(JSON.stringify(events), /Sent by mistake|customer@|jobguard-v2\.invalid/u, "no reason text and no email");
  await verifyTenantChain(f.context.tenantId);
});

test("G4 changed customer: the old link is refused, a cosmetic edit keeps it, and a release to the new customer opens", async () => {
  const f = await g4.ready();
  const first = await g3.direct(f, g3.release(1));
  await g4.customer(f, "CUSTOMER@jobguard-v2.invalid", { same: true });
  assert.equal((await g3.open(first.result.token)).status, 200, "a change of case keeps the link");
  assert.equal((await g3.releases(f)).releases[0].recipientCurrent, true);
  await g4.customer(f, "replacement@jobguard-v2.invalid");
  await g4.refused(first.result.token);
  assert.deepEqual((await g3.releases(f)).releases.map(row => [row.recipientCurrent, row.stoppedAt]), [[false, null]]);
  const next = await g3.direct(f, g3.release(1));
  assert.equal(next.captured.length, 1, "one delivery, to the new address");
  assert.equal((await admin.query("SELECT recipient_email FROM app.v2_handover_release WHERE id=$1", [next.result.release.releaseId])).rows[0].recipient_email,
    "replacement@jobguard-v2.invalid");
  assert.match(await (await g3.open(next.result.token)).text(), /Refit the hall door stop/u);
  await g4.refused(first.result.token);
});

test("G4 newer-version ignores a stopped release", async () => {
  const f = await g4.ready();
  const first = await g3.direct(f, g3.release(1));
  const v2 = (await f.post(g2.save({ sections: ["done", "contacts"], lineIds: [f.line], variationIds: [], photoIds: [], snagIds: [], certificates: [] }, 1))).saved;
  const second = await g3.direct(f, g3.release(v2.version));
  assert.match(await (await g3.open(first.result.token)).text(), /Newer version available/u);
  await g3.post(f, g4.stop(second.result.release.releaseId, "Released too early"));
  assert.doesNotMatch(await (await g3.open(first.result.token)).text(), /Newer version available/u);
  assert.deepEqual((await g3.releases(f)).releases.map(row => [row.version, row.superseded, row.stoppedAt !== null]), [[1, false, false], [2, false, true]]);
});

test("G4 other firm: 404 on read, release and stop; a stopped first-firm token with second-firm cookies is refused; no stop rows", async () => {
  const f = await g4.ready();
  const { result } = await g3.direct(f, g3.release(1));
  const second = await signIn("second-builder");
  await json(await request(`${f.path}/releases`, { cookies: second.cookies }), 404);
  await json(await request(`${f.path}/releases`, { cookies: second.cookies, csrf: second.csrfToken, body: g3.release(1) }), 404);
  await json(await request(`${f.path}/releases`, { cookies: second.cookies, csrf: second.csrfToken, body: g4.stop(result.release.releaseId) }), 404);
  await g3.post(f, g4.stop(result.release.releaseId));
  await g4.refused(result.token, second.cookies);
  // Rule 30 firm A/B read check: the second firm's runtime sees no stop rows.
  const { context: secondContext } = await authenticatePracticeSession(runtime, second.sessionId);
  for (const scope of [second.realContext, secondContext]) await withTenant(runtime, scope, async db =>
    assert.equal((await db.$client.query("SELECT 1 FROM app.v2_handover_release_stop WHERE job_id=$1", [f.job])).rowCount, 0));
});

test("G4 stop replay and conflict; an unknown release; UPDATE and DELETE refused", async () => {
  const f = await g4.ready();
  const { result } = await g3.direct(f, g3.release(1));
  const body = g4.stop(result.release.releaseId);
  const first = await g3.post(f, body), replay = await g3.post(f, body);
  assert.deepEqual([replay.replayed, replay.release.stoppedAt], [true, first.release.stoppedAt]);
  assert.equal((await g3.post(f, { ...body, reason: "Another reason" }, 409)).code, "HANDOVER_RELEASE_COMMAND_CONFLICT");
  assert.equal((await g3.post(f, g4.stop(result.release.releaseId), 409)).code, "HANDOVER_LINK_ALREADY_STOPPED");
  assert.equal((await g3.post(f, g4.stop(randomUUID()), 404)).code, "HANDOVER_RELEASE_NOT_FOUND");
  assert.equal((await g3.post(f, { ...g4.stop(result.release.releaseId), reason: " " }, 400)).code, "HANDOVER_RELEASE_INVALID_COMMAND");
  assert.equal((await admin.query("SELECT count(*)::int AS n FROM app.v2_handover_release_stop WHERE job_id=$1", [f.job])).rows[0].n, 1);
  assert.equal((await admin.query(`SELECT count(*)::int AS n FROM app.audit_event WHERE subject_ref=$1 AND event_type='v2.handover.link_stopped'`, [f.job])).rows[0].n, 1);
  for (const sql of ["UPDATE app.v2_handover_release_stop SET reason=reason WHERE job_id=$1", "DELETE FROM app.v2_handover_release_stop WHERE job_id=$1"]) {
    await assert.rejects(withTenant(runtime, f.context, db => db.$client.query(sql, [f.job])), { code: "42501" });
    await assert.rejects(admin.query(sql, [f.job]));
  }
  const { rows: [catalog] } = await admin.query(`SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid='app.v2_handover_release_stop'::regclass`);
  assert.deepEqual([catalog.relrowsecurity, catalog.relforcerowsecurity], [true, true]);
});

test("G4 migration 2084 reruns without changing policies, triggers, function bodies or rows", async () => {
  const f = await g4.ready();
  const { result } = await g3.direct(f, g3.release(1));
  await g3.post(f, g4.stop(result.release.releaseId));
  const catalog = async () => (await admin.query(`SELECT
    (SELECT string_agg(polrelid::regclass::text || ':' || polname, ',' ORDER BY polrelid::regclass::text, polname) FROM pg_policy WHERE polname LIKE 'v2_handover_%') AS policies,
    (SELECT string_agg(tgname, ',' ORDER BY tgname) FROM pg_trigger WHERE tgrelid='app.v2_handover_release_stop'::regclass AND NOT tgisinternal) AS triggers,
    (SELECT relacl::text FROM pg_class WHERE oid='app.v2_handover_release_stop'::regclass) AS acl,
    (SELECT string_agg(md5(prosrc), ',' ORDER BY proname) FROM pg_proc WHERE proname IN ('v2_handover_link_scope_open', 'v2_handover_link_view')) AS bodies,
    (SELECT count(*)::int FROM app.v2_handover_release_stop) AS rows`)).rows[0];
  const before = await catalog();
  await admin.query(readFileSync(new URL("../../packages/db/migrations/2084_v2_handover_release_stop.sql", import.meta.url), "utf8"));
  assert.deepEqual(await catalog(), before);
});

// V2-G8 (migration 2085): one polite review request a week after the handover release, only with the
// builder's switch on, never repeated, none while the final invoice is unpaid or a recovery case is open.
// Practice only: the send reaches the local catcher. A release eight days ago comes from G3's past clock.
const g8 = {
  get: f => request(`${f.path}/review-request`, { cookies: f.owner.cookies }).then(response => json(response)),
  post: (f, body, status = 200) => request(`${f.path}/review-request`, { cookies: f.owner.cookies, csrf: f.owner.csrfToken, body })
    .then(response => json(response, status)),
  turn: (enabled, commandId = randomUUID()) => ({ version: "v2-review-request-switch.v1", commandId, enabled }),
  send: (commandId = randomUUID()) => ({ version: "v2-review-request-send.v1", commandId }),
  async ready({ daysAgo = 8 } = {}) {
    const f = await g4.ready();
    const { result } = await g3.direct(f, g3.release(1), () => Date.now() - daysAgo * 86_400_000);
    return { ...f, releaseId: result.release.releaseId };
  },
  // In process, for the catcher count. The catcher logs metadata only, under local V2.
  async direct(f, body) {
    const auth = await authorizePracticeJob(runtime, f.sessionId, f.job);
    const repository = new ReviewRequestRepository(practiceMaterialPool(runtime, auth.digest));
    const captured = [], info = console.info, local = process.env.JOBGUARD_LOCAL_V2;
    console.info = line => captured.push(JSON.parse(line));
    process.env.JOBGUARD_LOCAL_V2 = "1";
    try { return { result: await repository.command(auth.context, f.job, f.sessionId, body).catch(error => error), captured }; }
    finally { console.info = info; if (local === undefined) delete process.env.JOBGUARD_LOCAL_V2; else process.env.JOBGUARD_LOCAL_V2 = local; }
  },
  // Money and recovery rows are written only by main's money paths, never in practice mode, so they are
  // placed directly with triggers off and removed afterwards. Only the review rule is under test.
  async placed(sql, values = []) {
    const fixture = await admin.connect();
    try { await fixture.query("BEGIN"); await fixture.query("SET LOCAL session_replication_role=replica");
      await fixture.query(sql, values); await fixture.query("COMMIT"); }
    catch (error) { await fixture.query("ROLLBACK"); throw error; }
    finally { fixture.release(); }
  },
  rows: async f => (await admin.query("SELECT count(*)::int AS n FROM app.v2_review_request WHERE job_id=$1", [f.job])).rows[0].n,
};

test("G8 done when: off sends nothing, on a week after release sends one to the catcher, and it is never repeated", async () => {
  const f = await g8.ready();
  assert.deepEqual([(await g8.get(f)).state, (await g8.get(f)).enabled], ["off", false]);
  const off = await g8.direct(f, g8.send());
  assert.deepEqual([off.result.code, off.result.state, off.captured], ["REVIEW_REQUEST_NOT_DUE", "off", []]);
  // The database refuses a request without the switch, whoever writes it.
  const { rows: [actor] } = await admin.query("SELECT actor_membership_id AS id FROM app.v2_handover_release WHERE id=$1", [f.releaseId]);
  await assert.rejects(admin.query(`INSERT INTO app.v2_review_request (tenant_id, job_id, release_id, recipient_email, command_id, request_hash,
    actor_membership_id) VALUES ($1, $2, $3, 'customer@jobguard-v2.invalid', $4, $5, $6)`,
  [f.context.tenantId, f.job, f.releaseId, randomUUID(), "a".repeat(64), actor.id]), /V2_REVIEW_REQUEST_NOT_DUE/u);
  assert.equal((await g8.post(f, g8.turn(true))).state, "due");
  const body = g8.send();
  const sent = await g8.direct(f, body);
  assert.equal(sent.result.state, "sent");
  assert.deepEqual(sent.captured, [{ event: "v2.delivery.captured", kind: "v2_review_request" }], "one catcher delivery, metadata only");
  assert.equal((await admin.query("SELECT recipient_email FROM app.v2_review_request WHERE job_id=$1", [f.job])).rows[0].recipient_email,
    "customer@jobguard-v2.invalid");
  const replay = await g8.direct(f, body);
  assert.deepEqual([replay.result.replayed, replay.captured], [true, []]);
  assert.equal((await g8.post(f, body)).replayed, true, "the route replays too");
  assert.equal((await g8.post(f, g8.send(), 409)).code, "REVIEW_REQUEST_ALREADY_SENT");
  // Off and on again changes nothing: it is never sent twice.
  await g8.post(f, g8.turn(false)); await g8.post(f, g8.turn(true));
  const again = await g8.direct(f, g8.send());
  assert.deepEqual([again.result.code, again.captured], ["REVIEW_REQUEST_ALREADY_SENT", []]);
  assert.equal(await g8.rows(f), 1);
  const events = (await admin.query(`SELECT event_type, payload FROM app.audit_event WHERE subject_ref=$1 AND event_type LIKE 'v2.review_request.%'
    ORDER BY occurred_at`, [f.job])).rows;
  assert.deepEqual(events.map(row => row.event_type).sort(), ["v2.review_request.sent", "v2.review_request.switched",
    "v2.review_request.switched", "v2.review_request.switched"]);
  assert.doesNotMatch(JSON.stringify(events), /customer@|jobguard-v2\.invalid|review would help/u, "no email and no message text");
  await verifyTenantChain(f.context.tenantId);
});

test("G8 waits: too soon after release, a stopped link, and a changed customer send none", async () => {
  const f = await g8.ready({ daysAgo: 2 });
  await g8.post(f, g8.turn(true));
  const soon = await g8.get(f);
  assert.equal(soon.state, "too_soon");
  assert.ok(Math.abs(Date.parse(soon.dueAt) - (Date.now() + 5 * 86_400_000)) < 3_600_000, "due a week after the release");
  assert.deepEqual(await g8.post(f, g8.send(), 409), { code: "REVIEW_REQUEST_NOT_DUE", state: "too_soon", environment: "synthetic_demo" });
  const old = await g8.ready();
  await g8.post(old, g8.turn(true));
  await g3.post(old, g4.stop(old.releaseId));
  assert.equal((await g8.get(old)).state, "no_release");
  const changed = await g8.ready();
  await g8.post(changed, g8.turn(true));
  await g4.customer(changed, "replacement@jobguard-v2.invalid");
  assert.equal((await g8.get(changed)).state, "recipient_changed");
  for (const job of [f, old, changed]) {
    const { captured } = await g8.direct(job, g8.send());
    assert.deepEqual(captured, []);
    assert.equal(await g8.rows(job), 0);
  }
});

test("G8 an unpaid final invoice or an open recovery case sends none", async () => {
  const f = await g8.ready();
  await g8.post(f, g8.turn(true));
  assert.equal((await g8.get(f)).state, "due");
  const [invoice, payment, recovery, supplier] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const t = f.context.tenantId;
  try {
    await g8.placed(`INSERT INTO app.customer_invoice(id,tenant_id,job_id,final_account_revision_id,authorization_id,invoice_number,issued_on,
      issuer_details,tax_policy_version,currency,net_pence,tax_pence,total_pence,source_hash,pdf_sha256,pdf_bytes,synthetic,watermark)
      VALUES($1,$2,$3,$4,$5,$6,'2026-12-01','{}','candidate_m1_standard_v1','GBP',10000,2000,12000,$7,$7,'\\x00',true,'SYNTHETIC - NOT A REAL INVOICE')`,
    [invoice, t, f.job, randomUUID(), randomUUID(), `G8-${invoice.slice(0, 8)}`, "b".repeat(64)]);
    assert.equal((await g8.get(f)).state, "unpaid_invoice");
    assert.equal((await g8.post(f, g8.send(), 409)).state, "unpaid_invoice");
    await g8.placed(`INSERT INTO app.customer_payment(id,tenant_id,job_id,invoice_id,authorization_id,paid_on,amount_pence,currency,method,reference,
      builder_attested,provenance) VALUES($1,$2,$3,$4,$5,'2026-12-02',12000,'GBP','bank_transfer','G8 fixture',true,'manual_builder_attestation')`,
    [payment, t, f.job, invoice, randomUUID()]);
    assert.equal((await g8.get(f)).state, "due", "paid in full");
    await g8.placed(`INSERT INTO app.customer_payment_reversal(id,tenant_id,job_id,payment_id,authorization_id,reason)
      VALUES($1,$2,$3,$4,$5,'G8 fixture')`, [randomUUID(), t, f.job, payment, randomUUID()]);
    assert.equal((await g8.get(f)).state, "unpaid_invoice", "a reversed payment leaves it unpaid");
    await g8.placed("DELETE FROM app.customer_payment_reversal WHERE payment_id=$1", [payment]);
    // A supplier overcharge case is between the builder and a merchant: it does not hold the request.
    await g8.placed(`INSERT INTO app.recovery_case(id,tenant_id,job_id,claim_pence,currency,state,revision,synthetic)
      VALUES($1,$2,$3,5000,'GBP','active',0,true)`, [supplier, t, f.job]);
    assert.equal((await g8.get(f)).state, "due", "a supplier case is not a customer dispute");
    await g8.placed(`INSERT INTO app.recovery_case(id,tenant_id,job_id,claim_pence,currency,state,revision,synthetic,case_type,book,source_type)
      VALUES($1,$2,$3,5000,'GBP','active',0,true,'withheld_customer_payment','builder_customer','customer_invoice')`, [recovery, t, f.job]);
    assert.equal((await g8.get(f)).state, "open_dispute");
    const { result, captured } = await g8.direct(f, g8.send());
    assert.deepEqual([result.code, result.state, captured], ["REVIEW_REQUEST_NOT_DUE", "open_dispute", []]);
    // The workbench keeps the snapshot and appends events: the current state, not the snapshot, decides.
    await g8.placed(`INSERT INTO app.recovery_claim_revision(id,tenant_id,job_id,case_id,revision,claimed_net_pence,currency,reviewer_ref,subject_hash)
      VALUES($1,$2,$3,$4,1,5000,'GBP','G8 fixture',$5)`, [randomUUID(), t, f.job, recovery, "c".repeat(64)]);
    const event = (sequence, type, from, to) => g8.placed(`INSERT INTO app.recovery_case_event(id,tenant_id,job_id,case_id,sequence,
      event_type,from_state,to_state,reviewer_ref,command_id,payload_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'G8 fixture',$9,$10)`,
    [randomUUID(), t, f.job, recovery, sequence, type, from, to, randomUUID(), "d".repeat(64)]);
    await event(1, "assemble_evidence", "identified", "evidence_assembled");
    assert.equal((await g8.get(f)).state, "open_dispute", "a case still being pursued holds the request");
    await event(2, "close_no_recovery", "evidence_assembled", "closed_no_recovery");
    assert.equal((await g8.get(f)).state, "due", "a closed case no longer holds it, though its snapshot still says active");
    assert.equal(await g8.rows(f), 0);
  } finally {
    await g8.placed("DELETE FROM app.recovery_case_event WHERE case_id=$1", [recovery]);
    await g8.placed("DELETE FROM app.recovery_claim_revision WHERE case_id=$1", [recovery]);
    await g8.placed("DELETE FROM app.recovery_case WHERE id IN ($1, $2)", [recovery, supplier]);
    await g8.placed("DELETE FROM app.customer_payment_reversal WHERE payment_id=$1", [payment]);
    await g8.placed("DELETE FROM app.customer_payment WHERE id=$1", [payment]);
    await g8.placed("DELETE FROM app.customer_invoice WHERE id=$1", [invoice]);
  }
});

test("G8 other firm: 404 on read, switch and send; no review rows seen; UPDATE and DELETE refused", async () => {
  const f = await g8.ready();
  await g8.post(f, g8.turn(true));
  await g8.direct(f, g8.send());
  const second = await signIn("second-builder");
  await json(await request(`${f.path}/review-request`, { cookies: second.cookies }), 404);
  for (const body of [g8.turn(false), g8.send()])
    await json(await request(`${f.path}/review-request`, { cookies: second.cookies, csrf: second.csrfToken, body }), 404);
  // Rule 30 firm A/B read check: the second firm's runtime sees no switch or request rows.
  const { context: secondContext } = await authenticatePracticeSession(runtime, second.sessionId);
  for (const scope of [second.realContext, secondContext]) await withTenant(runtime, scope, async db => {
    for (const table of ["app.v2_review_request", "app.v2_review_request_switch"])
      assert.equal((await db.$client.query(`SELECT 1 FROM ${table} WHERE job_id=$1`, [f.job])).rowCount, 0);
  });
  for (const table of ["app.v2_review_request", "app.v2_review_request_switch"]) {
    for (const sql of [`UPDATE ${table} SET command_id=command_id WHERE job_id=$1`, `DELETE FROM ${table} WHERE job_id=$1`]) {
      await assert.rejects(withTenant(runtime, f.context, db => db.$client.query(sql, [f.job])), { code: "42501" });
      await assert.rejects(admin.query(sql, [f.job]));
    }
    const { rows: [catalog] } = await admin.query(`SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid=$1::regclass`, [table]);
    assert.deepEqual([catalog.relrowsecurity, catalog.relforcerowsecurity], [true, true]);
  }
  assert.equal((await g8.post(f, { ...g8.send(), recipient: "someone@example.com" }, 400)).code, "REVIEW_REQUEST_INVALID_COMMAND");
});

test("G8 migration 2085 reruns without changing policies, triggers, function bodies or rows", async () => {
  const f = await g8.ready();
  await g8.post(f, g8.turn(true));
  await g8.direct(f, g8.send());
  const catalog = async () => (await admin.query(`SELECT
    (SELECT string_agg(polrelid::regclass::text || ':' || polname, ',' ORDER BY polrelid::regclass::text, polname) FROM pg_policy
      WHERE polrelid IN ('app.v2_review_request'::regclass, 'app.v2_review_request_switch'::regclass)) AS policies,
    (SELECT string_agg(tgname, ',' ORDER BY tgname) FROM pg_trigger WHERE tgrelid IN ('app.v2_review_request'::regclass,
      'app.v2_review_request_switch'::regclass) AND NOT tgisinternal) AS triggers,
    (SELECT string_agg(md5(prosrc), ',' ORDER BY proname) FROM pg_proc WHERE proname IN ('v2_review_request_due', 'v2_review_request_guard')) AS bodies,
    (SELECT count(*)::int FROM app.v2_review_request) + (SELECT count(*)::int FROM app.v2_review_request_switch) AS rows`)).rows[0];
  const before = await catalog();
  await admin.query(readFileSync(new URL("../../packages/db/migrations/2085_v2_review_request.sql", import.meta.url), "utf8"));
  assert.deepEqual(await catalog(), before);
});

// V2-G9 (migration 2086): after the handover release, one check-up offer at 6 months and one at 12, only
// with the builder's aftercare switch on, each sent once. Practice only: the send reaches the local catcher.
// Releases in the past come from G3's past clock, through G8's ready().
const g9 = {
  get: f => request(`${f.path}/aftercare`, { cookies: f.owner.cookies }).then(response => json(response)),
  post: (f, body, status = 200) => request(`${f.path}/aftercare`, { cookies: f.owner.cookies, csrf: f.owner.csrfToken, body })
    .then(response => json(response, status)),
  turn: (enabled, commandId = randomUUID()) => ({ version: "v2-aftercare-switch.v1", commandId, enabled }),
  send: (commandId = randomUUID()) => ({ version: "v2-aftercare-send.v1", commandId }),
  async direct(f, body) {
    const auth = await authorizePracticeJob(runtime, f.sessionId, f.job);
    const repository = new AftercareRepository(practiceMaterialPool(runtime, auth.digest));
    const captured = [], info = console.info, local = process.env.JOBGUARD_LOCAL_V2;
    console.info = line => captured.push(JSON.parse(line));
    process.env.JOBGUARD_LOCAL_V2 = "1";
    try { return { result: await repository.command(auth.context, f.job, f.sessionId, body).catch(error => error), captured }; }
    finally { console.info = info; if (local === undefined) delete process.env.JOBGUARD_LOCAL_V2; else process.env.JOBGUARD_LOCAL_V2 = local; }
  },
  insert: async (f, months) => {
    const { rows: [actor] } = await admin.query("SELECT actor_membership_id AS id FROM app.v2_handover_release WHERE id=$1", [f.releaseId]);
    return admin.query(`INSERT INTO app.v2_aftercare_offer (tenant_id, job_id, at_months, release_id, recipient_email, command_id, request_hash,
      actor_membership_id) VALUES ($1, $2, $3, $4, 'customer@jobguard-v2.invalid', $5, $6, $7)`,
    [f.context.tenantId, f.job, months, f.releaseId, randomUUID(), "a".repeat(64), actor.id]);
  },
  months: async f => (await admin.query("SELECT at_months FROM app.v2_aftercare_offer WHERE job_id=$1 ORDER BY at_months", [f.job])).rows
    .map(row => row.at_months),
};

test("G9 done when: off sends nothing, the 6-month offer goes once to the catcher, then the 12-month one waits", async () => {
  const f = await g8.ready({ daysAgo: 200 });
  assert.equal((await g9.get(f)).state, "off");
  const off = await g9.direct(f, g9.send());
  assert.deepEqual([off.result.code, off.result.state, off.captured], ["AFTERCARE_NOT_DUE", "off", []]);
  await assert.rejects(g9.insert(f, 6), /V2_AFTERCARE_NOT_DUE/u, "the database refuses an offer without the switch");
  await g9.post(f, g9.turn(true));
  assert.deepEqual([(await g9.get(f)).state, (await g9.get(f)).months], ["due", 6]);
  await assert.rejects(g9.insert(f, 12), /V2_AFTERCARE_NOT_DUE/u, "the 12-month offer is not due yet");
  const body = g9.send();
  const sent = await g9.direct(f, body);
  assert.deepEqual(sent.captured, [{ event: "v2.delivery.captured", kind: "v2_aftercare_offer" }], "one catcher delivery, metadata only");
  assert.equal(sent.result.state, "too_soon");
  const { rows: [release] } = await admin.query("SELECT released_at + interval '12 months' AS at FROM app.v2_handover_release WHERE id=$1", [f.releaseId]);
  assert.equal(sent.result.nextAt, release.at.toISOString(), "next is the 12-month point");
  const replay = await g9.direct(f, body);
  assert.deepEqual([replay.result.replayed, replay.captured], [true, []]);
  assert.equal((await g9.post(f, g9.send(), 409)).state, "too_soon");
  assert.deepEqual(await g9.months(f), [6]);
  const events = (await admin.query(`SELECT event_type, payload FROM app.audit_event WHERE subject_ref=$1 AND event_type LIKE 'v2.aftercare.%'`, [f.job])).rows;
  assert.deepEqual(events.map(row => row.event_type).sort(), ["v2.aftercare.offered", "v2.aftercare.switched"]);
  assert.equal(events.find(row => row.event_type === "v2.aftercare.offered").payload.references.months, "6");
  assert.doesNotMatch(JSON.stringify(events), /customer@|jobguard-v2\.invalid|check-up visit/u, "no email and no message text");
  await verifyTenantChain(f.context.tenantId);
});

test("G9 after 12 months only the 12-month offer goes, once; the late 6-month one is skipped", async () => {
  const f = await g8.ready({ daysAgo: 380 });
  await g9.post(f, g9.turn(true));
  assert.deepEqual([(await g9.get(f)).state, (await g9.get(f)).months], ["due", 12]);
  await assert.rejects(g9.insert(f, 6), /V2_AFTERCARE_NOT_DUE/u, "too late for the 6-month offer");
  const sent = await g9.direct(f, g9.send());
  assert.deepEqual([sent.result.state, sent.captured.length], ["done", 1]);
  const again = await g9.direct(f, g9.send());
  assert.deepEqual([again.result.code, again.result.state, again.captured], ["AFTERCARE_NOT_DUE", "done", []]);
  // Off and on again changes nothing.
  await g9.post(f, g9.turn(false)); await g9.post(f, g9.turn(true));
  assert.equal((await g9.get(f)).state, "done");
  assert.deepEqual(await g9.months(f), [12]);
});

test("G9 waits: before 6 months, after a stopped link, and after a changed customer, nothing is sent", async () => {
  const f = await g8.ready({ daysAgo: 30 });
  await g9.post(f, g9.turn(true));
  const soon = await g9.get(f);
  const { rows: [release] } = await admin.query("SELECT released_at + interval '6 months' AS at FROM app.v2_handover_release WHERE id=$1", [f.releaseId]);
  assert.deepEqual([soon.state, soon.nextAt], ["too_soon", release.at.toISOString()]);
  const stopped = await g8.ready({ daysAgo: 200 });
  await g9.post(stopped, g9.turn(true));
  await g3.post(stopped, g4.stop(stopped.releaseId));
  assert.equal((await g9.get(stopped)).state, "no_release");
  const changed = await g8.ready({ daysAgo: 200 });
  await g9.post(changed, g9.turn(true));
  await g4.customer(changed, "replacement@jobguard-v2.invalid");
  assert.equal((await g9.get(changed)).state, "recipient_changed");
  for (const job of [f, stopped, changed]) {
    const { captured } = await g9.direct(job, g9.send());
    assert.deepEqual(captured, []);
    assert.deepEqual(await g9.months(job), []);
  }
});

test("G9 a re-release does not move the clocks: the months count from the first release", async () => {
  const f = await g8.ready({ daysAgo: 200 });
  await g9.post(f, g9.turn(true));
  await g3.post(f, g4.stop(f.releaseId));
  const again = await g3.direct(f, g3.release(1));
  const view = await g9.get(f);
  assert.deepEqual([view.state, view.months], ["due", 6], "200 days after the first release, though the new one is from today");
  const sent = await g9.direct(f, g9.send());
  assert.deepEqual([sent.result.state, sent.captured.length], ["too_soon", 1]);
  const { rows: [first] } = await admin.query("SELECT released_at + interval '12 months' AS at FROM app.v2_handover_release WHERE id=$1", [f.releaseId]);
  assert.equal(sent.result.nextAt, first.at.toISOString(), "the 12-month point is a year after the first release");
  const { rows: [offer] } = await admin.query("SELECT release_id FROM app.v2_aftercare_offer WHERE job_id=$1", [f.job]);
  assert.equal(offer.release_id, again.result.release.releaseId, "the offer follows the live release");
});

test("G9 holds like G8 while an invoice is unpaid or a recovery case is open; a hold past 12 months skips the 6-month offer", async () => {
  const f = await g8.ready({ daysAgo: 200 });
  const late = await g8.ready({ daysAgo: 380 });
  await g9.post(f, g9.turn(true));
  await g9.post(late, g9.turn(true));
  const [invoice, lateInvoice, recovery] = [randomUUID(), randomUUID(), randomUUID()];
  const t = f.context.tenantId;
  const unpaid = (id, job) => g8.placed(`INSERT INTO app.customer_invoice(id,tenant_id,job_id,final_account_revision_id,authorization_id,invoice_number,
    issued_on,issuer_details,tax_policy_version,currency,net_pence,tax_pence,total_pence,source_hash,pdf_sha256,pdf_bytes,synthetic,watermark)
    VALUES($1,$2,$3,$4,$5,$6,'2026-12-01','{}','candidate_m1_standard_v1','GBP',10000,2000,12000,$7,$7,'\\x00',true,'SYNTHETIC - NOT A REAL INVOICE')`,
  [id, t, job, randomUUID(), randomUUID(), `G9-${id.slice(0, 8)}`, "b".repeat(64)]);
  try {
    await unpaid(invoice, f.job);
    assert.equal((await g9.get(f)).state, "unpaid_invoice");
    const held = await g9.direct(f, g9.send());
    assert.deepEqual([held.result.code, held.result.state, held.captured], ["AFTERCARE_NOT_DUE", "unpaid_invoice", []]);
    await assert.rejects(g9.insert(f, 6), /V2_AFTERCARE_NOT_DUE/u, "the database holds it too");
    await g8.placed(`INSERT INTO app.recovery_case(id,tenant_id,job_id,claim_pence,currency,state,revision,synthetic,case_type,book,source_type)
      VALUES($1,$2,$3,5000,'GBP','active',0,true,'withheld_customer_payment','builder_customer','customer_invoice')`, [recovery, t, f.job]);
    assert.equal((await g9.get(f)).state, "open_dispute");
    assert.equal((await g9.post(f, g9.send(), 409)).state, "open_dispute");
    await g8.placed("DELETE FROM app.recovery_case WHERE id=$1", [recovery]);
    await g8.placed("DELETE FROM app.customer_invoice WHERE id=$1", [invoice]);
    assert.deepEqual([(await g9.get(f)).state, (await g9.get(f)).months], ["due", 6], "released when the hold ends");
    await unpaid(lateInvoice, late.job);
    assert.equal((await g9.get(late)).state, "unpaid_invoice");
    await g8.placed("DELETE FROM app.customer_invoice WHERE id=$1", [lateInvoice]);
    assert.deepEqual([(await g9.get(late)).state, (await g9.get(late)).months], ["due", 12], "the held 6-month offer is now too late");
    assert.deepEqual([await g9.months(f), await g9.months(late)], [[], []]);
  } finally {
    await g8.placed("DELETE FROM app.recovery_case WHERE id=$1", [recovery]);
    await g8.placed("DELETE FROM app.customer_invoice WHERE id IN ($1, $2)", [invoice, lateInvoice]);
  }
});

test("G9 other firm: 404 on read, switch and send; no aftercare rows seen; UPDATE and DELETE refused", async () => {
  const f = await g8.ready({ daysAgo: 200 });
  await g9.post(f, g9.turn(true));
  await g9.direct(f, g9.send());
  const second = await signIn("second-builder");
  await json(await request(`${f.path}/aftercare`, { cookies: second.cookies }), 404);
  for (const body of [g9.turn(false), g9.send()])
    await json(await request(`${f.path}/aftercare`, { cookies: second.cookies, csrf: second.csrfToken, body }), 404);
  // Rule 30 firm A/B read check: the second firm's runtime sees no switch or offer rows.
  const { context: secondContext } = await authenticatePracticeSession(runtime, second.sessionId);
  for (const scope of [second.realContext, secondContext]) await withTenant(runtime, scope, async db => {
    for (const table of ["app.v2_aftercare_offer", "app.v2_aftercare_switch"])
      assert.equal((await db.$client.query(`SELECT 1 FROM ${table} WHERE job_id=$1`, [f.job])).rowCount, 0);
  });
  for (const table of ["app.v2_aftercare_offer", "app.v2_aftercare_switch"]) {
    for (const sql of [`UPDATE ${table} SET command_id=command_id WHERE job_id=$1`, `DELETE FROM ${table} WHERE job_id=$1`]) {
      await assert.rejects(withTenant(runtime, f.context, db => db.$client.query(sql, [f.job])), { code: "42501" });
      await assert.rejects(admin.query(sql, [f.job]));
    }
    const { rows: [catalog] } = await admin.query(`SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid=$1::regclass`, [table]);
    assert.deepEqual([catalog.relrowsecurity, catalog.relforcerowsecurity], [true, true]);
  }
  assert.equal((await g9.post(f, { ...g9.send(), months: 12 }, 400)).code, "AFTERCARE_INVALID_COMMAND");
});

test("G9 migration 2086 reruns without changing policies, triggers, function bodies or rows", async () => {
  const f = await g8.ready({ daysAgo: 200 });
  await g9.post(f, g9.turn(true));
  await g9.direct(f, g9.send());
  const catalog = async () => (await admin.query(`SELECT
    (SELECT string_agg(polrelid::regclass::text || ':' || polname, ',' ORDER BY polrelid::regclass::text, polname) FROM pg_policy
      WHERE polrelid IN ('app.v2_aftercare_offer'::regclass, 'app.v2_aftercare_switch'::regclass)) AS policies,
    (SELECT string_agg(tgname, ',' ORDER BY tgname) FROM pg_trigger WHERE tgrelid IN ('app.v2_aftercare_offer'::regclass,
      'app.v2_aftercare_switch'::regclass) AND NOT tgisinternal) AS triggers,
    (SELECT string_agg(md5(prosrc), ',' ORDER BY proname) FROM pg_proc WHERE proname IN ('v2_aftercare_due', 'v2_aftercare_offer_guard')) AS bodies,
    (SELECT count(*)::int FROM app.v2_aftercare_offer) + (SELECT count(*)::int FROM app.v2_aftercare_switch) AS rows`)).rows[0];
  const before = await catalog();
  await admin.query(readFileSync(new URL("../../packages/db/migrations/2086_v2_aftercare_offer.sql", import.meta.url), "utf8"));
  assert.deepEqual(await catalog(), before);
});

// V2-F8 (Q10, migration 2061): who was on site today. The builder taps each person; no location is stored.
const attendanceTable = "app.v2_site_attendance";
const attendanceApp = sessionId => createWorkspaceApplication({ pool: runtime, sessionId }).siteAttendance;
const attendanceQuery = { version: "v2-site-attendance-query.v1" };
const londonToday = async () => (await admin.query(
  "SELECT (clock_timestamp() AT TIME ZONE 'Europe/London')::date::text AS today")).rows[0].today;
const tapCommand = (day, changes = {}) => ({ version: "v2-site-attendance-command.v1", commandId: randomUUID(), day,
  person: { kind: "builder" }, expectedVersion: 0, onSite: true, note: null, ...changes });
const attendanceEvents = async jobRef => (await admin.query(`SELECT tenant_id, actor_ref, subject_type, payload FROM app.audit_event
  WHERE subject_type = 'job' AND subject_ref = $1 AND event_type = 'v2.site_attendance.recorded' ORDER BY sequence`, [jobRef])).rows;

test("F8: the attendance table stores no location, IP, device or user agent, and the runtime can only read and insert", async () => {
  const { rows } = await admin.query(`SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = 'v2_site_attendance' ORDER BY ordinal_position`);
  const names = rows.map(row => row.column_name);
  assert.deepEqual(names, ["tenant_id", "job_id", "day", "person_kind", "crew_id", "builder_membership_id", "person_ref",
    "revision", "expected_version", "previous_revision", "command_id", "on_site", "note", "tapped_by_membership_id", "recorded_at"]);
  assert.equal(names.flatMap(name => name.split("_"))
    .filter(part => /^(lat|latitude|lon|lng|longitude|geo|location|coords?|ip|address|device|agent|gps|position)$/u.test(part)).length, 0);
  const { rows: [acl] } = await admin.query(`SELECT relrowsecurity AND relforcerowsecurity AS forced, relowner::regrole::text AS owner,
    has_table_privilege('jobguard_runtime',oid,'SELECT') AS can_read, has_table_privilege('jobguard_runtime',oid,'INSERT') AS can_insert,
    has_table_privilege('jobguard_runtime',oid,'UPDATE,DELETE,TRUNCATE') AS can_mutate,
    has_table_privilege('jobguard_identity',oid,'SELECT,INSERT,UPDATE,DELETE') AS identity_access,
    has_table_privilege('jobguard_worker',oid,'SELECT,INSERT,UPDATE,DELETE') AS worker_access,
    has_table_privilege('jobguard_infrastructure',oid,'SELECT,INSERT,UPDATE,DELETE') AS infra_access
    FROM pg_class WHERE oid=$1::regclass`, [attendanceTable]);
  assert.deepEqual(acl, { forced: true, owner: "jobguard_migration", can_read: true, can_insert: true, can_mutate: false,
    identity_access: false, worker_access: false, infra_access: false });
  // A request that carries a location (or any other extra field) is refused before anything is read or written.
  const { sessionId } = await signIn("builder");
  const today = await londonToday();
  for (const extra of [{ latitude: 51.5 }, { location: { lat: 51.5, lon: -0.1 } }, { userAgent: "phone" }, { ip: "192.0.2.1" }]) {
    await assert.rejects(attendanceApp(sessionId).record(jobId, tapCommand(today, extra)), { code: "SITE_ATTENDANCE_INVALID" });
  }
  await assert.rejects(attendanceApp(sessionId).record(jobId, tapCommand(today, { person: { kind: "builder", lat: 1 } })),
    { code: "SITE_ATTENDANCE_INVALID" });
});

test("F8: a replayed tap counts once, an edit is the next revision, and the day window is today and six days back", async () => {
  const { sessionId } = await signIn("builder");
  const attendance = attendanceApp(sessionId);
  const sam = await crewApp(sessionId).record(crewCommand({ displayName: "Sam Attendance" }));
  const today = await londonToday();
  const first = tapCommand(today, { person: { kind: "crew", crewId: sam.crewId } });
  const saved = await attendance.record(jobId, first);
  assert.equal(saved.revision, 1);
  assert.deepEqual(await attendance.record(jobId, first), saved, "an exact replay returns the first receipt");
  await Promise.all([attendance.record(jobId, first), attendance.record(jobId, first)]);
  const count = async () => (await admin.query(`SELECT count(*)::int AS count FROM ${attendanceTable}
    WHERE job_id = $1 AND crew_id = $2 AND day = $3::date`, [jobId, sam.crewId, today])).rows[0].count;
  assert.equal(await count(), 1, "a replayed tap counts once");
  await assert.rejects(attendance.record(jobId, { ...first, onSite: false }), { code: "SITE_ATTENDANCE_COMMAND_CONFLICT" });
  // One command id names one tap: reused on another of the firm's jobs, even concurrently, only one saves.
  const { draftJob } = await draftForPlan();
  await assert.rejects(attendance.record(draftJob, first), { code: "SITE_ATTENDANCE_COMMAND_CONFLICT" });
  const shared = tapCommand(today);
  const raced = await Promise.allSettled([attendance.record(jobId, shared), attendance.record(draftJob, shared),
    attendance.record(draftJob, { ...shared, note: "Changed" })]);
  assert.equal(raced.filter(result => result.status === "fulfilled").length, 1);
  for (const result of raced.filter(result => result.status === "rejected")) {
    assert.equal(result.reason.code, "SITE_ATTENDANCE_COMMAND_CONFLICT");
  }
  assert.equal((await admin.query(`SELECT count(*)::int AS count FROM ${attendanceTable} WHERE command_id = $1`,
    [shared.commandId])).rows[0].count, 1);
  const savedOn = raced.find(result => result.status === "fulfilled").value;
  // A second, different tap at the same version is stale; an edit names the current revision.
  await assert.rejects(attendance.record(jobId, tapCommand(today, { person: first.person })),
    { code: "SITE_ATTENDANCE_VERSION_CONFLICT" });
  const undo = await attendance.record(jobId, tapCommand(today, { person: first.person, expectedVersion: 1, onSite: false,
    note: "Went to another job" }));
  assert.equal(undo.revision, 2);
  assert.equal(await count(), 2, "the first revision is kept unchanged");
  const me = (await attendance.list(jobId, attendanceQuery)).records.some(entry => entry.personKind === "builder" &&
    entry.day === today) ? savedOn : await attendance.record(jobId, tapCommand(today));
  const view = await attendance.list(jobId, attendanceQuery);
  assert.equal(view.today, today);
  assert.equal(view.days.length, 7);
  assert.equal(view.days[0], today);
  const mine = view.records.filter(entry => entry.day === today);
  // Astra's conditions: one row per person per job and London day, from the latest revision, which keeps the undo.
  assert.equal(mine.filter(entry => entry.crewId === sam.crewId).length, 1);
  assert.deepEqual(mine.find(entry => entry.crewId === sam.crewId), { ...undo, recordedAt: undo.recordedAt });
  assert.equal(mine.find(entry => entry.crewId === sam.crewId).onSite, false);
  assert.equal(mine.find(entry => entry.personKind === "builder").personRef, view.me);
  assert.equal(me.personRef, view.me);
  assert.ok(view.crew.some(crew => crew.crewId === sam.crewId && crew.displayName === "Sam Attendance"));
  assert.equal(JSON.stringify(view.crew).includes("07700"), false, "crew phone numbers stay off the screen");
  // Six days back is allowed; a week back, tomorrow and a non-date are refused, also past the app check.
  const back = (await admin.query("SELECT ($1::date - 6)::text AS d, ($1::date - 7)::text AS w, ($1::date + 1)::text AS t",
    [today])).rows[0];
  assert.equal((await attendance.record(jobId, tapCommand(back.d))).revision, 1);
  for (const day of [back.w, back.t]) {
    await assert.rejects(attendance.record(jobId, tapCommand(day)), { code: "SITE_ATTENDANCE_DAY_OUT_OF_RANGE" });
  }
  await assert.rejects(attendance.record(jobId, tapCommand("2026-02-30")), { code: "SITE_ATTENDANCE_INVALID" });
});

test("F8: the second firm sees none of the builder's taps and can't tap on the job, and another firm's crew id is refused", async () => {
  const owner = await signIn("builder");
  const outsider = await signIn("second-builder");
  const today = await londonToday();
  await attendanceApp(owner.sessionId).record(jobId, tapCommand(today, { expectedVersion:
    (await attendanceApp(owner.sessionId).list(jobId, attendanceQuery)).records
      .find(entry => entry.personKind === "builder" && entry.day === today)?.revision ?? 0 }));
  const { rows: [row] } = await admin.query(`SELECT * FROM ${attendanceTable} WHERE job_id = $1 ORDER BY recorded_at DESC LIMIT 1`, [jobId]);
  // Firm A/B read check (rule 30) in the shared practice tenant and the second firm's real tenant.
  const { context: shared } = await authenticatePracticeSession(runtime, outsider.sessionId);
  assert.equal(shared.tenantId, DEMO_TENANT_ID);
  for (const scope of [shared, outsider.realContext]) {
    const query = (sql, params) => withTenant(runtime, scope, db => db.$client.query(sql, params));
    assert.equal((await query(`SELECT * FROM ${attendanceTable} WHERE job_id = $1`, [jobId])).rowCount, 0);
    assert.equal((await query(`SELECT * FROM ${attendanceTable}`)).rows.filter(r => r.job_id === jobId).length, 0);
    await assert.rejects(query(`INSERT INTO ${attendanceTable} (tenant_id, job_id, day, person_kind, builder_membership_id,
      revision, expected_version, command_id, on_site, tapped_by_membership_id) VALUES ($1, $2, $3::date, 'builder', $4, 1, 0, $5, true, $4)`,
    [row.tenant_id, jobId, today, randomUUID(), randomUUID()]), { code: "42501" });
    await assert.rejects(query(`UPDATE ${attendanceTable} SET note = 'x' WHERE job_id = $1`, [jobId]), { code: "42501" });
    await assert.rejects(query(`DELETE FROM ${attendanceTable} WHERE job_id = $1`, [jobId]), { code: "42501" });
  }
  await assert.rejects(attendanceApp(outsider.sessionId).list(jobId, attendanceQuery), { code: "NOT_FOUND" });
  await assert.rejects(attendanceApp(outsider.sessionId).record(jobId, tapCommand(today)), { code: "NOT_FOUND" });
  // The owner's own firm cannot change a saved row either.
  const { context } = await authenticatePracticeSession(runtime, owner.sessionId);
  await assert.rejects(withTenant(runtime, context, db => db.$client.query(
    `UPDATE ${attendanceTable} SET on_site = false WHERE job_id = $1`, [jobId])), { code: "42501" });

  // Another firm's crew record, or an unknown id, can't be tapped on this job, even past the app check.
  const theirs = await crewApp(outsider.sessionId).record(crewCommand({ displayName: "Their crew" }));
  for (const crewId of [theirs.crewId, randomUUID()]) {
    await assert.rejects(attendanceApp(owner.sessionId).record(jobId, tapCommand(today, { person: { kind: "crew", crewId } })),
      { code: "CREW_CONTACT_UNAVAILABLE" });
  }
  await assert.rejects(admin.query(`INSERT INTO ${attendanceTable} (tenant_id, job_id, day, person_kind, crew_id, revision,
    expected_version, command_id, on_site, tapped_by_membership_id) VALUES ($1, $2, $3::date, 'crew', $4, 1, 0, $5, true, $6)`,
  [row.tenant_id, jobId, today, theirs.crewId, randomUUID(), row.tapped_by_membership_id]),
  { code: "23503", message: /CREW_CONTACT_UNAVAILABLE/u });
  // "Me" is always the person who tapped it.
  await assert.rejects(admin.query(`INSERT INTO ${attendanceTable} (tenant_id, job_id, day, person_kind, builder_membership_id,
    revision, expected_version, command_id, on_site, tapped_by_membership_id) VALUES ($1, $2, $3::date, 'builder', $4, 1, 0, $5, true, $6)`,
  [row.tenant_id, jobId, today, randomUUID(), randomUUID(), row.tapped_by_membership_id]), { code: "23514" });
});

test("audit-chain: packages/db/src/v2-site-attendance-repository.ts#SiteAttendanceRepository.record", async () => {
  const { sessionId } = await signIn("builder");
  const { context } = await authenticatePracticeSession(runtime, sessionId);
  const attendance = attendanceApp(sessionId);
  const sam = await crewApp(sessionId).record(crewCommand({ displayName: "Sam Audit" }));
  const today = await londonToday();
  const before = (await attendanceEvents(jobId)).length;
  const command = tapCommand(today, { person: { kind: "crew", crewId: sam.crewId }, note: "Tiling the splashback" });
  const saved = await attendance.record(jobId, command);
  const events = (await attendanceEvents(jobId)).slice(before);
  assert.equal(events.length, 1, "audit-chain: event");
  const [event] = events;
  assert.equal(event.tenant_id, DEMO_TENANT_ID);
  assert.equal(event.actor_ref, `membership:${saved.tappedByMembershipId}`);
  assert.deepEqual(event.payload.references, { ...event.payload.references, commandId: command.commandId, jobId, day: today, personKind: "crew",
    personRef: sam.crewId, expectedVersion: "0", revision: "1", onSite: "true" });
  assert.equal("version" in event.payload.references, false);
  assert.match(event.payload.hashes.note, /^[a-f0-9]{64}$/u);
  assert.doesNotMatch(JSON.stringify(event.payload), /Tiling|Sam|07700/u, "references only: no note or crew details");

  assert.deepEqual(await attendance.record(jobId, command), saved);
  await Promise.all([attendance.record(jobId, command), attendance.record(jobId, command)]);
  assert.equal((await attendanceEvents(jobId)).length, before + 1, "audit-chain: replay");

  const next = tapCommand(today, { person: command.person, expectedVersion: 1, onSite: false });
  await assert.rejects(new SiteAttendanceRepository(failingAuditPool(runtime)).record(context, jobId, sessionId, next),
    { code: "FORCED" });
  const { rows: [{ count }] } = await admin.query(`SELECT count(*)::int AS count FROM ${attendanceTable} WHERE command_id = $1`,
    [next.commandId]);
  assert.equal(count, 0, "audit-chain: rollback");
  assert.equal((await attendanceEvents(jobId)).length, before + 1, "audit-chain: rollback");
  assert.equal((await attendance.record(jobId, next)).revision, 2);
  assert.equal((await attendanceEvents(jobId)).length, before + 2);
  await verifyTenantChain(DEMO_TENANT_ID);
});

test("F8: the attendance route answers the signed-in builder and refuses typed codes to everyone else", async () => {
  const { cookies } = await signIn("builder");
  const path = `/api/v2-backend/jobs/${jobId}/attendance`;
  const view = await json(await request(path, { cookies }));
  assert.equal(view.version, "v2-site-attendance.v1");
  assert.equal(view.days.length, 7);
  assert.equal((await json(await request(path), 401)).code, "UNAUTHENTICATED");
  for (const fake of ["not-a-session", randomUUID()]) {
    const response = await request(path, { cookies: `jg_session=${fake}` });
    assert.ok([401, 403].includes(response.status));
    assert.ok(["UNAUTHENTICATED", "FORBIDDEN", "TENANT_FORBIDDEN"].includes((await response.json()).code));
  }
  const outsider = await signIn("second-builder");
  assert.equal((await json(await request(path, { cookies: outsider.cookies }), 404)).code, "NOT_FOUND");
  const posted = await json(await request(path, { cookies, body: tapCommand(view.today, {
    expectedVersion: view.records.find(entry => entry.personKind === "builder" && entry.day === view.today)?.revision ?? 0 }) }), 201);
  assert.equal(posted.personKind, "builder");
  assert.equal((await json(await request(path, { cookies, body: { ...tapCommand(view.today), latitude: 51.5 } }), 400)).code,
    "SITE_ATTENDANCE_INVALID");
  assert.equal((await json(await request(path, { cookies: outsider.cookies, body: tapCommand(view.today) }), 404)).code,
    "NOT_FOUND");
  assert.equal((await request(`/jobs/${jobId}/records`, { cookies })).status, 200);
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
