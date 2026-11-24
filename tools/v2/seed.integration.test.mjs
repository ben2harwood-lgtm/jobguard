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
  assert.deepEqual((await workPlan.read(jobId, planQuery)).agreement, live.agreement);
  const revisionId = proposed.variations.find(item => item.id === proposalId).currentRevisionId;
  const approvalId = randomUUID();
  await vary("approve", { variationId: proposalId, revisionId, approvalId,
    attestation: "Builder-recorded practice acceptance — not an authenticated customer signature" });
  const expected = { ...live.agreement, approvedVariations: [{ scopeItemId, revisionId, approvalId,
    description: "Add trim", quantity: "1", unit: "item", signedDeltaPence: 12500 }] };
  assert.deepEqual((await workPlan.read(jobId, planQuery)).agreement, expected);
  const pendingId = randomUUID();
  await vary("revise", { variationId: proposalId, expectedRevisionId: revisionId, revisionId: pendingId,
    description: "Unapproved replacement trim", price: { ...price, unitRatePence: 35000 } });
  const { context } = await authenticatePracticeSession(runtime, sessionId);
  const regenerated = await new WorkPlanRepository(runtime).generate(context, planSource(jobId, live.quoteRevisionId));
  assert.deepEqual(regenerated, { ...live, agreement: expected });
  const liveEdit = planEdit(regenerated, regenerated.tasks[0], { scheduledDate: "2026-12-09", assignee: "Fictional Tiler" });
  const receipt = await workPlan.edit(jobId, liveEdit);
  assert.equal(receipt.version, 1);
  const updated = await workPlan.read(jobId, planQuery);
  assert.equal(updated.tasks[0].scheduledDate, "2026-12-09");
  assert.equal(updated.tasks[0].assignee, "Fictional Tiler");
  assert.deepEqual(updated.agreement, expected);

  const state = await workState.get(jobId);
  const expectedRevision = (state.events.at(-1)?.sequence ?? 0) + state.links.length;
  const closed = await workState.command(jobId, { version: "job-work-state-command.v1", commandId: randomUUID(),
    expectedRevision, action: "close", reason: "cancelled_by_customer", note: "Fictional customer cancelled the work" });
  assert.equal(closed.events.at(-1).kind, "closed");
  assert.deepEqual(await workPlan.read(jobId, planQuery), updated);
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

// V2-K5A: payment schedules only. Reuse suite sessions and existing quote helpers.
async function k5AcceptedJob() {
  const fixture = await draftForPlan();
  const { cookies, csrfToken } = await signIn("builder");
  const app = createWorkspaceApplication({ pool: runtime, sessionId: fixture.sessionId });
  const partyView = await app.parties.view({ sessionId: fixture.sessionId }, fixture.draftJob);
  await app.parties.command({ sessionId: fixture.sessionId }, fixture.draftJob, {
    version: "job-parties-command.v1", action: "save_form", commandId: randomUUID(),
    expectedJobRevision: partyView.jobRevision, expectedBindingId: null,
    customer: { version: "customer.v1", type: "person", name: "Fictional Schedule Customer",
      email: "customer@jobguard-v2.invalid", phone: "+447700900042" }, customerRef: null,
    site: { version: "site.v1", addressLines: ["45 Make-Believe Mews"], town: "Sampleford", postcode: "ZY1 0AA" },
    savedSiteRevisionId: null, reuseSiteId: null, expectedReuseRevisionId: null, confirmSamePlace: false,
    payingPartyRevisionId: null, expectedPayerRevisionId: null, correct: false,
  });
  const { view } = await app.quote.preview(fixture.draftJob, { version: "quote-preview-command.v1", recipient: "customer@jobguard-v2.invalid" });
  await app.quote.issue(fixture.draftJob, { version: "quote-send-command.v1", commandId: randomUUID(),
    documentId: view.documentId, contentHash: view.contentHash, recipient: "customer@jobguard-v2.invalid" });
  await json(await request(`/api/jobs/${fixture.draftJob}/quotes/delivery/execute`, { cookies,
    body: { version: "quote-execute-command.v1", documentId: view.documentId, mode: "success" } }));
  await app.quote.accept(fixture.draftJob, { version: "quote-acceptance-command.v1", commandId: randomUUID(),
    documentId: view.documentId, documentVersion: view.documentVersion, documentHash: view.contentHash,
    statedCustomerName: "Fictional Schedule Customer", statedMethod: "verbal", acceptedAt: new Date().toISOString() });
  await fixture.read();
  return { ...fixture, app, cookies, csrfToken };
}
const k5Command = (view, triggers) => ({ version: "payment-schedule-set.v1", commandId: randomUUID(),
  jobId: view.jobId, quoteRevisionId: view.quoteRevisionId, expectedVersion: 0,
  stages: ["30", "40", "30"].map((value, index) => ({ label: `Fictional stage ${index + 1}`,
    split: { kind: "percentage", value }, trigger: triggers[index] })) });
const k5Events = async commandId => (await admin.query(`SELECT actor_ref,payload FROM app.audit_event
  WHERE event_type='v2.payment_schedule.set' AND payload->'references'->>'commandId'=$1`, [commandId])).rows;

test("K5A saves 30/40/30, persists across reads, audits once, rejects replay changes and stale commands, sends nothing", async () => {
  const { app, draftJob, cookies, csrfToken } = await k5AcceptedJob();
  const view = await app.paymentSchedule.read(draftJob);
  const command = k5Command(view, [{ kind: "acceptance" }, { kind: "date", date: "2099-01-01" }, { kind: "date", date: "2099-02-01" }]);
  const before = await effectCounts();
  const path = `/api/jobs/${draftJob}/payment-schedule`;
  const receipt = await json(await request(path, { cookies, csrf: csrfToken, body: command }));
  assert.deepEqual(await app.paymentSchedule.set(draftJob, command), receipt);
  assert.deepEqual(await Promise.all([app.paymentSchedule.set(draftJob, command), app.paymentSchedule.set(draftJob, command)]), [receipt, receipt]);
  const [event] = await k5Events(command.commandId);
  assert.equal((await k5Events(command.commandId)).length, 1);
  assert.equal(event.actor_ref, `membership:${receipt.actorMembershipId}`);
  assert.equal(event.payload.references.commandId, command.commandId);
  assert.equal("version" in event.payload.references, false);
  assert.doesNotMatch(JSON.stringify(event.payload), /Fictional stage/u);
  const saved = await json(await request(path, { cookies }));
  assert.deepEqual(saved, await app.paymentSchedule.read(draftJob));
  const pence = amount => BigInt(amount.replace(".", ""));
  assert.equal(saved.schedule.stages.reduce((sum, stage) => sum + pence(stage.amount), 0n), pence(saved.acceptedTotal));
  assert.deepEqual(saved.schedule.stages.map(stage => stage.status), ["due", "planned", "planned"]);
  await assert.rejects(app.paymentSchedule.set(draftJob, { ...command, stages: command.stages.map(stage => ({ ...stage, label: "Changed" })) }), { code: "SCHEDULE_REPLAY_CONFLICT" });
  await assert.rejects(app.paymentSchedule.set(draftJob, { ...command, commandId: randomUUID(), expectedVersion: 1 }), { code: "SCHEDULE_STALE" });
  await assert.rejects(app.paymentSchedule.set(draftJob, { ...command, commandId: randomUUID() }), { code: "SCHEDULE_STALE" });
  assert.deepEqual(await effectCounts(), before, "schedule creates no catcher, invoice, payment, queue or fee effects");
  await verifyTenantChain(DEMO_TENANT_ID);
});

test("K5A audit failure after insert rolls back both schedule and event", async () => {
  const { app, draftJob, sessionId } = await k5AcceptedJob();
  const view = await app.paymentSchedule.read(draftJob);
  const command = k5Command(view, Array.from({length:3}, () => ({kind:"acceptance"})));
  const failing = { async connect() {
    const client = await runtime.connect();
    const query = client.query.bind(client), release = client.release.bind(client);
    client.query = (sql, ...rest) => typeof sql === "string" && sql.includes("app.append_audit(")
      ? Promise.reject(Object.assign(new Error("forced audit failure"), {code:"FORCED"})) : query(sql, ...rest);
    client.release = (...args) => { client.query = query; return release(...args); };
    return client;
  } };
  const { PaymentScheduleRepository } = await import("../../packages/db/dist/index.js");
  const { context } = await authenticatePracticeSession(runtime, sessionId);
  await assert.rejects(new PaymentScheduleRepository(failing).set(context, draftJob, sessionId, command), {code:"FORCED"});
  assert.equal((await admin.query("SELECT 1 FROM app.v2_payment_schedule WHERE command_id=$1", [command.commandId])).rowCount, 0);
  assert.equal((await k5Events(command.commandId)).length, 0);
  await app.paymentSchedule.set(draftJob, command);
  assert.equal((await k5Events(command.commandId)).length, 1);
});

test("K5A forced RLS hides the schedule from both second-firm contexts and denies insert/update/delete", async () => {
  const { app, draftJob } = await k5AcceptedJob();
  const view = await app.paymentSchedule.read(draftJob);
  const command = k5Command(view, Array.from({length:3}, () => ({kind:"acceptance"})));
  const receipt = await app.paymentSchedule.set(draftJob, command);
  const outsider = await signIn("second-builder");
  const otherApp = createWorkspaceApplication({pool:runtime,sessionId:outsider.sessionId});
  await assert.rejects(otherApp.paymentSchedule.read(draftJob), {code:"NOT_FOUND"});
  await assert.rejects(otherApp.paymentSchedule.set(draftJob, command), {code:"NOT_FOUND"});
  const {context: otherPractice} = await authenticatePracticeSession(runtime, outsider.sessionId);
  for (const context of [otherPractice, outsider.realContext]) {
    const query = (sql, values) => withTenant(runtime,context,db => db.$client.query(sql,values));
    assert.equal((await query("SELECT * FROM app.v2_payment_schedule WHERE job_id=$1",[draftJob])).rowCount,0);
    await assert.rejects(query(`INSERT INTO app.v2_payment_schedule
      (tenant_id,job_id,quote_revision_id,command_id,expected_version,stages,actor_membership_id)
      VALUES($1,$2,$3,$4,0,$5,$6)`, [DEMO_TENANT_ID,draftJob,command.quoteRevisionId,randomUUID(),JSON.stringify(command.stages),receipt.actorMembershipId]),{code:"42501"});
    await assert.rejects(query("UPDATE app.v2_payment_schedule SET expected_version=0 WHERE job_id=$1",[draftJob]),{code:"42501"});
    await assert.rejects(query("DELETE FROM app.v2_payment_schedule WHERE job_id=$1",[draftJob]),{code:"42501"});
  }
  const {rows:[catalog]} = await admin.query(`SELECT relrowsecurity AND relforcerowsecurity AS forced,
    relowner::regrole::text AS owner,has_table_privilege('jobguard_runtime',oid,'UPDATE,DELETE,TRUNCATE') AS mutable
    FROM pg_class WHERE oid='app.v2_payment_schedule'::regclass`);
  assert.deepEqual(catalog,{forced:true,owner:"jobguard_migration",mutable:false});
});

test("K5A an approved extra changes only planned stages; after all stages are due extras stay separate", async () => {
  for (const allDue of [false,true]) {
    const {app,draftJob} = await k5AcceptedJob();
    await app.quote.activate(draftJob,switchLive());
    const view = await app.paymentSchedule.read(draftJob);
    const triggers = [{kind:"acceptance"},...Array.from({length:2},()=>allDue ? {kind:"acceptance"} : {kind:"date",date:"2099-01-01"})];
    await app.paymentSchedule.set(draftJob,k5Command(view,triggers));
    const before = await app.paymentSchedule.read(draftJob);
    const proposalId=randomUUID(),scopeItemId=randomUUID();
    const proposed=await app.variation.command(draftJob,{version:"variation-command.v1",action:"propose",proposalId,scopeItemId,
      existingScopeItemId:null,lineageParentScopeItemId:null,description:"Fictional trim",captureText:"Fictional trim requested",
      price:{quantity:"1",unit:"item",unitRatePence:700,direction:"addition"}});
    const revisionId=proposed.variations.find(item=>item.id===proposalId).currentRevisionId;
    assert.deepEqual((await app.paymentSchedule.read(draftJob)).schedule,before.schedule,"unapproved proposal has no effect");
    await app.variation.command(draftJob,{version:"variation-command.v1",action:"approve",variationId:proposalId,revisionId,
      approvalId:randomUUID(),attestation:"Builder-recorded practice acceptance — not an authenticated customer signature"});
    const after=await app.paymentSchedule.read(draftJob);
    assert.equal(after.schedule.stages[0].amount,before.schedule.stages[0].amount);
    assert.equal(after.schedule.extrasSinceSchedule,"7.00");
    assert.equal(after.schedule.unscheduledExtras,allDue ? "7.00" : "0.00");
    if(allDue)assert.deepEqual(after.schedule.stages,before.schedule.stages);
    else assert.notEqual(after.schedule.stages[1].amount,before.schedule.stages[1].amount);
  }
});

test("K5A task confirmation turns the exact stage due, audits once, and rolls back atomically", async () => {
  const { app, draftJob, sessionId } = await k5AcceptedJob();
  const view=await app.paymentSchedule.read(draftJob), task=view.tasks[0];
  assert.ok(task);
  const taskTrigger={kind:"task",scopeItemId:task.scopeItemId,taskKey:task.taskKey};
  const set=k5Command(view,[{kind:"acceptance"},taskTrigger,{kind:"date",date:"2000-01-01"}]);
  const invalid={...set,stages:set.stages.map((stage,index)=>index===1 ? {...stage,trigger:{...taskTrigger,scopeItemId:randomUUID()}} : stage)};
  await assert.rejects(app.paymentSchedule.set(draftJob,invalid),{code:"SCHEDULE_INVALID"});
  assert.equal((await k5Events(set.commandId)).length,0);
  await app.paymentSchedule.set(draftJob,set);
  const before=await app.paymentSchedule.read(draftJob);
  assert.deepEqual(before.schedule.stages.map(stage=>stage.status),["due","planned","due"]);
  const command={version:"payment-schedule-task-done.v1",commandId:randomUUID(),jobId:draftJob,
    quoteRevisionId:view.quoteRevisionId,expectedVersion:1,scopeItemId:task.scopeItemId,taskKey:task.taskKey};
  const failing={async connect(){
    const client=await runtime.connect(),query=client.query.bind(client),release=client.release.bind(client);
    client.query=(sql,...rest)=>typeof sql==="string"&&sql.includes("app.append_audit(")
      ?Promise.reject(Object.assign(new Error("forced audit failure"),{code:"FORCED"})):query(sql,...rest);
    client.release=(...args)=>{client.query=query;return release(...args);};return client;
  }};
  const {PaymentScheduleRepository}=await import("../../packages/db/dist/index.js");
  const {context}=await authenticatePracticeSession(runtime,sessionId);
  await assert.rejects(new PaymentScheduleRepository(failing).recordTaskDone(context,draftJob,sessionId,command),{code:"FORCED"});
  assert.equal((await admin.query("SELECT 1 FROM app.v2_payment_schedule_task_done WHERE command_id=$1",[command.commandId])).rowCount,0);
  assert.equal((await admin.query("SELECT 1 FROM app.audit_event WHERE payload->'references'->>'commandId'=$1",[command.commandId])).rowCount,0);
  const effects=await effectCounts();
  const receipt=await app.paymentSchedule.set(draftJob,command);
  assert.deepEqual(await app.paymentSchedule.set(draftJob,command),receipt);
  const after=await app.paymentSchedule.read(draftJob);
  assert.equal(after.schedule.version,2);
  assert.deepEqual(after.schedule.stages.map(stage=>stage.status),["due","due","due"]);
  assert.deepEqual(after.schedule.stages.map(stage=>stage.amount),before.schedule.stages.map(stage=>stage.amount));
  await assert.rejects(app.paymentSchedule.set(draftJob,{...command,taskKey:"wrong-task"}),{code:"SCHEDULE_REPLAY_CONFLICT"});
  await assert.rejects(app.paymentSchedule.set(draftJob,{...command,commandId:randomUUID()}),{code:"SCHEDULE_STALE"});
  const {rows:[event],rowCount}=await admin.query(`SELECT actor_ref,payload FROM app.audit_event
    WHERE event_type='v2.payment_schedule.task_recorded' AND payload->'references'->>'commandId'=$1`,[command.commandId]);
  assert.equal(rowCount,1);assert.ok(event.actor_ref.startsWith("membership:"));
  assert.equal("version" in event.payload.references,false);
  assert.deepEqual(await effectCounts(),effects);
  await verifyTenantChain(DEMO_TENANT_ID);
  const outsider=await signIn("second-builder");
  const {context:other}=await authenticatePracticeSession(runtime,outsider.sessionId);
  for(const ctx of [other,outsider.realContext]) {
    const query=(sql,values)=>withTenant(runtime,ctx,db=>db.$client.query(sql,values));
    assert.equal((await query("SELECT * FROM app.v2_payment_schedule_task_done WHERE job_id=$1",[draftJob])).rowCount,0);
    await assert.rejects(query(`INSERT INTO app.v2_payment_schedule_task_done
      (tenant_id,job_id,quote_revision_id,command_id,expected_version,scope_item_id,template_task_key,actor_membership_id)
      VALUES($1,$2,$3,$4,2,$5,$6,$7)`,[DEMO_TENANT_ID,draftJob,view.quoteRevisionId,randomUUID(),task.scopeItemId,task.taskKey,
      (await app.paymentSchedule.read(draftJob)).schedule.actorMembershipId]),{code:"42501"});
    await assert.rejects(query("UPDATE app.v2_payment_schedule_task_done SET expected_version=2 WHERE job_id=$1",[draftJob]),{code:"42501"});
    await assert.rejects(query("DELETE FROM app.v2_payment_schedule_task_done WHERE job_id=$1",[draftJob]),{code:"42501"});
  }
});

// V2-K5A: both working tables have the same forced firm boundary and immutable grants.
test("K5A task-confirmation catalogue and rerunnable migration preserve existing schedules",async()=>{
  const before=(await admin.query("SELECT count(*)::int AS n FROM app.v2_payment_schedule")).rows[0].n;
  await admin.query(readFileSync(new URL("../../packages/db/migrations/2012_v2_payment_schedule.sql",import.meta.url),"utf8"));
  assert.equal((await admin.query("SELECT count(*)::int AS n FROM app.v2_payment_schedule")).rows[0].n,before);
  const {rows:[catalog]}=await admin.query(`SELECT relrowsecurity AND relforcerowsecurity AS forced,
    relowner::regrole::text AS owner,has_table_privilege('jobguard_runtime',oid,'UPDATE,DELETE,TRUNCATE') AS mutable
    FROM pg_class WHERE oid='app.v2_payment_schedule_task_done'::regclass`);
  assert.deepEqual(catalog,{forced:true,owner:"jobguard_migration",mutable:false});
});
