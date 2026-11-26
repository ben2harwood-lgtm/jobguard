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
// V2-C3C
import { CrewContactRepository } from "../../packages/db/dist/index.js";
import { embeddedSystemId, storageData, verifyDatabaseTarget } from "./local-targets.mjs";
import { migrationUrl, validateSettings } from "./settings.mjs";

import { joineryTemplate } from "./fixtures/joinery-template.mjs";
// V2-PX
import { uploadPracticePhoto } from "./test/practice-photo.mjs";

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
