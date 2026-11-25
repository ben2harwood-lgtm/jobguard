import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { Pool } from "../../packages/db/node_modules/pg/esm/index.mjs";
import { createIdentityApplication } from "../../apps/api/dist/auth/index.js";
import { ChoiceAllowanceApplication, createWorkspaceApplication } from "../../apps/api/dist/workspace/index.js";
import { M1_QUOTE_POLICY } from "../../packages/core/dist/index.js";
import { ChoiceAllowanceRepository, DEMO_TENANT_ID, MeasurementRepository, choiceUuid, WorkPlanRepository, authenticatePracticeSession, verifyAuditChain, withTenant } from "../../packages/db/dist/index.js";
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

  const cancelled = await openFacts.command(jobId, factCommand({ action: "cancel", factId: access.commandId, expectedVersion: 1 }));
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

// V2-E9 flow check (first commit, main's variation code only): an unpriced builder extra is
// priced by revise with a deterministic revision id, and the revise replays exactly.
function e9Uuid(namespace, name) {
  const bytes = createHash("sha1").update(Buffer.from(namespace.replaceAll("-", ""), "hex")).update(name).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// A fresh accepted and live job of the E9 block's own (the seeded job is closed by an earlier test).
async function e9LiveJob() {
  const fixture = await draftForPlan();
  const { cookies } = await signIn("builder");
  const app = createWorkspaceApplication({ pool: runtime, sessionId: fixture.sessionId });
  const partyView = await app.parties.view({ sessionId: fixture.sessionId }, fixture.draftJob);
  await app.parties.command({ sessionId: fixture.sessionId }, fixture.draftJob, {
    version: "job-parties-command.v1", action: "save_form", commandId: randomUUID(),
    expectedJobRevision: partyView.jobRevision, expectedBindingId: null,
    customer: { version: "customer.v1", type: "person", name: "Fictional Choices Customer",
      email: "customer@jobguard-v2.invalid", phone: "+447700900042" }, customerRef: null,
    site: { version: "site.v1", addressLines: ["47 Make-Believe Mews"], town: "Sampleford", postcode: "ZY1 0AA" },
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
    statedCustomerName: "Fictional Choices Customer", statedMethod: "verbal", acceptedAt: new Date().toISOString() });
  await fixture.read();
  await app.quote.activate(fixture.draftJob, switchLive());
  return { ...fixture, app };
}

test("e9 flow: an unpriced builder extra is priced by revise with a deterministic id, and the revise replays exactly", async () => {
  const { draftJob: jobId, app: { variation } } = await e9LiveJob();
  const vary = (action, fields) => variation.command(jobId, { version: "variation-command.v1", action, ...fields });
  const proposalId = e9Uuid(DEMO_TENANT_ID, `e9-flow-check:${jobId}:excess`);
  const revisionId = e9Uuid(proposalId, "price");
  const propose = { proposalId, scopeItemId: e9Uuid(proposalId, "scope"), existingScopeItemId: null, lineageParentScopeItemId: null,
    description: "Tiles over allowance", captureText: "Customer chose tiles above the allowance", price: null };
  const proposed = await vary("propose", propose);
  const draft = proposed.variations.find(item => item.id === proposalId);
  assert.equal(draft.currentRevisionId, null, "propose without a price creates an unpriced draft");
  assert.deepEqual(await vary("propose", propose), proposed, "an exact propose retry replays");

  const revise = { variationId: proposalId, revisionId, expectedRevisionId: null, description: "Tiles over allowance",
    price: { quantity: "6", unit: "m2", unitRatePence: 600, direction: "addition" } };
  const priced = await vary("revise", revise);
  const pricedDraft = priced.variations.find(item => item.id === proposalId);
  assert.equal(pricedDraft.currentRevisionId, revisionId, "revise accepts the deterministic revision id");
  assert.deepEqual(pricedDraft.revisions.map(r => [r.id, r.revision, r.signedDeltaPence, r.approved, r.rejected]),
    [[revisionId, pricedDraft.revisions[0].revision, 3600, false, false]]);
  const revisionRows = async () => (await admin.query(`SELECT count(*)::int AS n FROM app.variation_revision WHERE variation_id = $1`, [proposalId])).rows[0].n;
  const eventRows = async () => (await admin.query(`SELECT count(*)::int AS n FROM app.audit_event WHERE subject_ref = $1 OR subject_ref = $2`, [proposalId, revisionId])).rows[0].n;
  const [revisionsBefore, eventsBefore] = [await revisionRows(), await eventRows()];
  assert.equal(revisionsBefore, 1);

  assert.deepEqual(await vary("revise", revise), priced, "an exact revise replay returns the same workspace");
  assert.equal(await revisionRows(), revisionsBefore, "the replay adds no revision");
  assert.equal(await eventRows(), eventsBefore, "the replay appends no audit event");
  await assert.rejects(vary("revise", { ...revise, price: { ...revise.price, unitRatePence: 700 } }),
    { message: "VARIATION_COMMAND_CONFLICT" }, "the same revision id with different content is refused");
});

// V2-E9 choices and allowances. Its own block; earlier pieces' tests stay as they are.
const e9Attestation = "Builder-recorded practice acceptance — not an authenticated customer signature";
const e9Tiles = { basis: "per_unit", amount: "25.00", quantity: "6", unit: "m2" };

async function e9Setup(variations) {
  const live = await e9LiveJob();
  const { sessionId } = live;
  const app = createWorkspaceApplication({ pool: runtime, sessionId });
  const logged = await app.openFacts.command(live.draftJob, { version: "v2-open-fact-command.v1", action: "log", commandId: randomUUID(),
    scopeItemId: null, planTask: null, owner: { kind: "customer" }, neededBy: "2099-01-10",
    detail: { kind: "customer_choice", question: "Which wall tiles for the kitchen?", mayChangePrice: true } });
  const choices = variations ? new ChoiceAllowanceApplication(runtime, sessionId, variations) : app.choiceAllowances;
  const command = (expectedVersion, fields) => ({ version: "v2-choice-allowance-command.v1", commandId: randomUUID(),
    factId: logged.factId, expectedVersion, allowance: e9Tiles, decideBy: "2099-01-05", chosen: null, ...fields });
  return { ...live, jobId: live.draftJob, app, choices, factId: logged.factId, command };
}

const e9Events = async (jobRef, eventType) => (await admin.query(`SELECT actor_ref AS "actorRef", payload FROM app.audit_event
  WHERE subject_type = 'job' AND subject_ref = $1 AND event_type = $2 ORDER BY sequence`, [jobRef, eventType])).rows;
const e9Drafts = async jobRef => (await admin.query(`SELECT v.id, v.state, v.current_revision_id AS "revisionId",
  (SELECT count(*)::int FROM app.variation_revision r WHERE r.variation_id = v.id) AS revisions,
  (SELECT count(*)::int FROM app.variation_approval a WHERE a.tenant_id = v.tenant_id AND a.revision_id = v.current_revision_id) AS approvals
  FROM app.variation v WHERE v.job_id = $1 ORDER BY v.id`, [jobRef])).rows;
const e9Receipts = async ids => (await admin.query(`SELECT count(*)::int AS n FROM app.command_receipt WHERE command_id = ANY($1::uuid[])`, [ids])).rows[0].n;

test("audit-chain: packages/db/src/v2-choice-allowance-repository.ts#ChoiceAllowanceRepository.set", async () => {
  const { jobId, choices, command, factId, sessionId } = await e9Setup();
  const { context } = await authenticatePracticeSession(runtime, sessionId);
  const editor = (await signIn("builder")).membershipId;
  const set = command(0, { chosen: null });
  const first = await choices.command(jobId, set);
  const events = await e9Events(jobId, "v2.choice_allowance.set");
  assert.equal(events.length, 1, "audit-chain: event");
  assert.equal(events[0].actorRef, `membership:${editor}`);
  const { commandId: c, factId: f, choiceVersion, draft, withdraws } = events[0].payload.references;
  assert.deepEqual({ commandId: c, factId: f, choiceVersion, draft, withdraws }, { commandId: set.commandId, factId, choiceVersion: "1", draft: "none", withdraws: "none" });
  assert.doesNotMatch(JSON.stringify(events[0].payload), /tiles|25\.00/u, "no free text or amount enters the chain");
  assert.equal("version" in events[0].payload.references, false);
  assert.deepEqual((await Promise.all([choices.command(jobId, set), choices.command(jobId, set)])).map(r => r.receipt), [first.receipt, first.receipt]);
  await assert.rejects(choices.command(jobId, { ...set, decideBy: "2099-01-06" }), { code: "CHOICE_ALLOWANCE_COMMAND_CONFLICT" });
  await assert.rejects(choices.command(jobId, command(0, {})), { code: "CHOICE_ALLOWANCE_VERSION_CONFLICT" }, "a stale version is refused");
  assert.deepEqual(await e9Events(jobId, "v2.choice_allowance.set"), events, "audit-chain: replay");

  // Fail the audit append after the version insert: the transaction keeps neither.
  const next = command(1, { chosen: { item: "Fictional metro tile", amount: "31.00" } });
  await assert.rejects(new ChoiceAllowanceRepository(e9FailingAuditPool()).set(context, jobId, sessionId, next), { code: "FORCED" });
  assert.equal((await admin.query("SELECT count(*)::int AS n FROM app.v2_choice_allowance WHERE command_id = $1", [next.commandId])).rows[0].n, 0,
    "audit-chain: rollback");
  assert.deepEqual(await e9Events(jobId, "v2.choice_allowance.set"), events);
  assert.deepEqual(await e9Drafts(jobId), [], "an allowance with no choice drafts nothing");
  await verifyTenantChain(context.tenantId);
});

test("audit-chain: packages/db/src/v2-choice-allowance-repository.ts#ChoiceAllowanceRepository.step", async () => {
  const { jobId, choices, command, factId, sessionId } = await e9Setup();
  const { context } = await authenticatePracticeSession(runtime, sessionId);
  const set = command(0, { chosen: { item: "Fictional metro tile", amount: "31.00" } });
  const { choices: [view] } = await choices.command(jobId, set);
  const steps = await e9Events(jobId, "v2.choice_allowance.step");
  assert.deepEqual(steps.map(e => [e.payload.references.step, e.payload.references.outcome]), [["current", "none"], ["proposed", "none"], ["priced", "none"]],
    "audit-chain: event");
  assert.deepEqual(steps.map(e => [e.payload.references.commandId, e.payload.references.variationId]),
    [[set.commandId, "none"], [set.commandId, view.draft.variationId], [set.commandId, view.draft.variationId]]);
  const repo = new ChoiceAllowanceRepository(runtime);
  assert.equal(await repo.step(context, jobId, sessionId, { factId, version: 1, step: "priced", outcome: null }), false);
  await assert.rejects(repo.step(context, jobId, sessionId, { factId, version: 1, step: "current", outcome: "withdrawn" }), { code: "CHOICE_ALLOWANCE_STEP_INVALID" });
  await choices.read(jobId);
  assert.deepEqual(await e9Events(jobId, "v2.choice_allowance.step"), steps, "audit-chain: replay");

  // Fail the audit append after a step insert: the transaction keeps neither, and the next read finishes it.
  const next = command(1, { chosen: { item: "Fictional zellige tile", amount: "40.00" } });
  await repo.set(context, jobId, sessionId, next);
  await assert.rejects(new ChoiceAllowanceRepository(e9FailingAuditPool()).step(context, jobId, sessionId,
    { factId, version: 2, step: "current", outcome: "withdrawn" }), { code: "FORCED" });
  assert.equal((await admin.query("SELECT count(*)::int AS n FROM app.v2_choice_allowance_step WHERE fact_id = $1 AND version = 2", [factId])).rows[0].n, 0,
    "audit-chain: rollback");
  assert.deepEqual(await e9Events(jobId, "v2.choice_allowance.step"), steps);
  const [finished] = await choices.read(jobId);
  assert.equal(finished.chosen.amount, "40.00");
  assert.equal(finished.draft.amount, "90.00");
  await verifyTenantChain(context.tenantId);
});

test("e9: tiles at £31/m² for 6 m² against £25/m² draft one unapproved £36 extra; at or under drafts nothing", async () => {
  const { jobId, choices, command, factId, app } = await e9Setup();
  const before = await counts();
  const atAllowance = await choices.command(jobId, command(0, { chosen: { item: "Fictional plain tile", amount: "25.00" } }));
  assert.equal(atAllowance.choices[0].draft, null);
  assert.deepEqual(await e9Drafts(jobId), [], "a choice at the allowance drafts nothing");
  const { choices: [view] } = await choices.command(jobId, command(1, { chosen: { item: "Fictional metro tile", amount: "31.00" } }));
  const proposalId = choiceUuid(DEMO_TENANT_ID, `${factId}:2:excess`);
  assert.deepEqual(view.draft, { variationId: proposalId, revisionId: choiceUuid(proposalId, "price"), state: "awaiting_approval", amount: "36.00" });
  assert.deepEqual(view.allowance, { version: 2, basis: "per_unit", amount: "25.00", quantity: "6", unit: "m2", decideBy: "2099-01-05" });
  assert.deepEqual(view.chosen, { item: "Fictional metro tile", amount: "31.00" });
  assert.deepEqual(await e9Drafts(jobId), [{ id: proposalId, state: "priced", revisionId: choiceUuid(proposalId, "price"), revisions: 1, approvals: 0 }]);
  const workspace = await app.variation.get(jobId);
  assert.equal(workspace.approvedAdditionsPence, 0, "nothing is committed to the price");
  assert.equal(workspace.pendingExtrasPence, 3600);
  assert.deepEqual(await counts(), before, "the accepted quote, documents and sends are untouched");

  // A change that keeps the same excess (only the decide-by date) keeps the same draft.
  const { choices: [kept] } = await choices.command(jobId, command(2, { decideBy: "2099-01-07", chosen: { item: "Fictional metro tile", amount: "31.00" } }));
  assert.equal(kept.draft.variationId, proposalId);
  assert.equal((await e9Drafts(jobId)).length, 1);

  // A total allowance drafts the difference once.
  const { choices: [total] } = await choices.command(jobId, command(3, { allowance: { basis: "total", amount: "150.00" },
    chosen: { item: "Fictional metro tile, whole kitchen", amount: "186.50" } }));
  assert.equal(total.draft.amount, "36.50");
  assert.equal((await e9Drafts(jobId)).find(d => d.id === proposalId).state, "rejected", "the superseded draft is withdrawn");
});

test("e9: over to equal after a draft exists rejects the draft, which can then never be approved", async () => {
  const { jobId, choices, command, app } = await e9Setup();
  const { choices: [over] } = await choices.command(jobId, command(0, { chosen: { item: "Fictional metro tile", amount: "31.00" } }));
  const { choices: [equal] } = await choices.command(jobId, command(1, { chosen: { item: "Fictional plain tile", amount: "25.00" } }));
  assert.equal(equal.draft, null);
  const rejectionId = choiceUuid(over.draft.variationId, "superseded");
  assert.deepEqual(equal.withdrawn, [{ variationId: over.draft.variationId, rejectionId, reason: "superseded_by_choice_change", outcome: "withdrawn" }]);
  const { rows: [rejection] } = await admin.query("SELECT revision_id, reason_code FROM app.variation_rejection WHERE id = $1", [rejectionId]);
  assert.deepEqual(rejection, { revision_id: over.draft.revisionId, reason_code: "customer_did_not_approve" }, "main's fixed reason; E9 keeps the true one");
  await assert.rejects(app.variation.command(jobId, { version: "variation-command.v1", action: "approve", variationId: over.draft.variationId,
    revisionId: over.draft.revisionId, approvalId: randomUUID(), attestation: e9Attestation }));
  assert.deepEqual((await e9Drafts(jobId)).map(d => [d.state, d.approvals]), [["rejected", 0]]);
});

test("e9: after the builder approves, a changed choice keeps the approval, warns and drafts no second extra", async () => {
  const { jobId, choices, command, app } = await e9Setup();
  const { choices: [over] } = await choices.command(jobId, command(0, { chosen: { item: "Fictional metro tile", amount: "31.00" } }));
  await app.variation.command(jobId, { version: "variation-command.v1", action: "approve", variationId: over.draft.variationId,
    revisionId: over.draft.revisionId, approvalId: randomUUID(), attestation: e9Attestation });
  const { choices: [changed] } = await choices.command(jobId, command(1, { chosen: { item: "Fictional zellige tile", amount: "40.00" } }));
  assert.equal(changed.warning, "Approved extra no longer matches this choice: raise a credit if needed");
  assert.equal(changed.draft, null);
  assert.deepEqual(changed.withdrawn.map(w => w.outcome), ["kept_agreed"]);
  assert.deepEqual((await e9Drafts(jobId)).map(d => [d.id, d.state, d.revisions, d.approvals]), [[over.draft.variationId, "approved", 1, 1]]);
  const { choices: [again] } = await choices.command(jobId, command(2, { chosen: { item: "Fictional marble tile", amount: "55.00" } }));
  assert.equal(again.draft, null);
  assert.equal((await e9Drafts(jobId)).length, 1, "never a second draft on top of an approved extra");
});

// Fail once at one seam of the variation flow, then let a read finish the work.
function e9Seam(real, seam) {
  let armed = true;
  const fail = () => { armed = false; throw Object.assign(new Error("forced seam failure"), { code: "SEAM" }); };
  return { get: jobRef => real.get(jobRef), async command(jobRef, body) {
    if (armed && seam === `before:${body.action}`) fail();
    const result = await real.command(jobRef, body);
    if (armed && seam === `after:${body.action}`) fail();
    return result;
  } };
}

// "step:<name>" fails that step's insert once, after the variation command it records has committed.
function e9FailingStepPool(step) {
  let armed = true;
  return {
    query: (...args) => runtime.query(...args),
    async connect() {
      const client = await runtime.connect();
      const query = client.query.bind(client);
      client.query = (sql, values, ...rest) => {
        if (armed && typeof sql === "string" && sql.includes("INSERT INTO app.v2_choice_allowance_step") && values?.[4] === step) {
          armed = false;
          return Promise.reject(Object.assign(new Error("forced seam failure"), { code: "SEAM" }));
        }
        return query(sql, values, ...rest);
      };
      const release = client.release.bind(client);
      client.release = (...args) => { client.query = query; return release(...args); };
      return client;
    },
  };
}

for (const seam of ["before:propose", "after:propose", "before:revise", "step:priced"]) {
  test(`e9: a failure at ${seam} ends, after a read, with one variation, one priced revision, one receipt and one event per step`, async () => {
    const { jobId, choices: real, command, factId, sessionId, app } = await e9Setup();
    const broken = seam.startsWith("step:") ? new ChoiceAllowanceApplication(e9FailingStepPool(seam.slice(5)), sessionId, app.variation)
      : new ChoiceAllowanceApplication(runtime, sessionId, e9Seam(app.variation, seam));
    const set = command(0, { chosen: { item: "Fictional metro tile", amount: "31.00" } });
    await assert.rejects(broken.command(jobId, set), { code: "SEAM" });
    const [view] = await real.read(jobId);
    const proposalId = choiceUuid(DEMO_TENANT_ID, `${factId}:1:excess`);
    assert.deepEqual(view.draft, { variationId: proposalId, revisionId: choiceUuid(proposalId, "price"), state: "awaiting_approval", amount: "36.00" });
    assert.equal(view.unfinished, null);
    assert.deepEqual(await e9Drafts(jobId), [{ id: proposalId, state: "priced", revisionId: choiceUuid(proposalId, "price"), revisions: 1, approvals: 0 }]);
    assert.equal(await e9Receipts([proposalId]), 1);
    assert.equal((await e9Events(jobId, "v2.choice_allowance.set")).length, 1);
    assert.deepEqual((await e9Events(jobId, "v2.choice_allowance.step")).map(e => e.payload.references.step), ["current", "proposed", "priced"]);
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM app.audit_event WHERE event_type = 'variation.builder_logged' AND subject_ref = $1",
      [proposalId])).rows[0].n, 1);
    assert.deepEqual((await real.command(jobId, set)).receipt, { factId, version: 1, commandId: set.commandId }, "a retry replays");
    assert.equal((await e9Drafts(jobId)).length, 1);
  });
}

test("e9: a failure after the withdrawal commits finishes on the next read without a second rejection", async () => {
  const { jobId, choices: real, command, sessionId, app } = await e9Setup();
  const { choices: [over] } = await real.command(jobId, command(0, { chosen: { item: "Fictional metro tile", amount: "31.00" } }));
  const broken = new ChoiceAllowanceApplication(e9FailingStepPool("current"), sessionId, app.variation);
  await assert.rejects(broken.command(jobId, command(1, { chosen: { item: "Fictional zellige tile", amount: "40.00" } })), { code: "SEAM" });
  const [view] = await real.read(jobId);
  assert.equal(view.draft.amount, "90.00");
  assert.equal((await admin.query("SELECT count(*)::int AS n FROM app.variation_rejection WHERE variation_id = $1", [over.draft.variationId])).rows[0].n, 1);
  assert.deepEqual((await e9Drafts(jobId)).map(d => d.state).sort(), ["priced", "rejected"]);
});

test("e9: the same choice version sent twice at once gives one variation", async () => {
  const { jobId, choices, command } = await e9Setup();
  const set = command(0, { chosen: { item: "Fictional metro tile", amount: "31.00" } });
  const results = await Promise.allSettled([choices.command(jobId, set), choices.command(jobId, set), choices.read(jobId)]);
  assert.ok(results.slice(0, 2).some(result => result.status === "fulfilled"));
  const [view] = await choices.read(jobId);
  assert.equal(view.draft.amount, "36.00");
  assert.equal((await e9Drafts(jobId)).length, 1);
  assert.equal((await e9Events(jobId, "v2.choice_allowance.set")).length, 1);
  assert.deepEqual((await e9Events(jobId, "v2.choice_allowance.step")).map(e => e.payload.references.step), ["current", "proposed", "priced"]);
});

test("e9: a late choice is flagged, a non-choice fact is refused and V2 mode is required", async () => {
  const { jobId, choices, command, app } = await e9Setup();
  await choices.command(jobId, command(0, { decideBy: "2020-01-01" }));
  assert.equal((await choices.read(jobId))[0].late, "overdue");
  await choices.command(jobId, command(1, { decideBy: "2020-01-01", chosen: { item: "Fictional plain tile", amount: "20.00" } }));
  assert.equal((await choices.read(jobId))[0].late, "chosen_late");
  const access = await app.openFacts.command(jobId, { version: "v2-open-fact-command.v1", action: "log", commandId: randomUUID(),
    scopeItemId: null, planTask: null, owner: { kind: "builder" }, neededBy: "2099-01-10", detail: { kind: "access", need: "Fictional key safe" } });
  await assert.rejects(choices.command(jobId, { ...command(0, {}), factId: access.factId }), { code: "CHOICE_ALLOWANCE_NOT_A_CHOICE" });
  assert.equal((await choices.read(jobId)).length, 1, "only customer-choice facts are listed");
  const previous = process.env.JOBGUARD_LOCAL_V2;
  delete process.env.JOBGUARD_LOCAL_V2;
  try { await assert.rejects(choices.read(jobId), { code: "SYNTHETIC_MODE_REQUIRED" }); }
  finally { process.env.JOBGUARD_LOCAL_V2 = previous; }
});

test("e9: forced choice-allowance policies hide rows and refuse writes from the second firm", async () => {
  const { jobId, choices, command, factId } = await e9Setup();
  await choices.command(jobId, command(0, { chosen: { item: "Fictional metro tile", amount: "31.00" } }));
  const outsider = await signIn("second-builder");
  await assert.rejects(createWorkspaceApplication({ pool: runtime, sessionId: outsider.sessionId }).choiceAllowances.read(jobId));
  const { context } = await authenticatePracticeSession(runtime, outsider.sessionId);
  for (const scope of [outsider.realContext, context]) {
    const query = (sql, values) => withTenant(runtime, scope, db => db.$client.query(sql, values));
    for (const table of ["app.v2_choice_allowance", "app.v2_choice_allowance_step"]) {
      assert.equal((await query(`SELECT * FROM ${table} WHERE job_id = $1`, [jobId])).rowCount, 0);
      await assert.rejects(query(`UPDATE ${table} SET actor_membership_id = actor_membership_id WHERE job_id = $1`, [jobId]), { code: "42501" });
      await assert.rejects(query(`DELETE FROM ${table} WHERE job_id = $1`, [jobId]), { code: "42501" });
    }
    await assert.rejects(query(`INSERT INTO app.v2_choice_allowance_step (tenant_id, job_id, fact_id, version, step, actor_membership_id)
      VALUES ($1, $2, $3, 1, 'priced', $4)`, [DEMO_TENANT_ID, jobId, factId, randomUUID()]));
  }
  const { rows } = await admin.query(`SELECT relname, relrowsecurity AND relforcerowsecurity AS forced, relowner::regrole::text AS owner,
    has_table_privilege('jobguard_runtime', oid, 'UPDATE,DELETE,TRUNCATE') AS mutable
    FROM pg_class WHERE oid IN ('app.v2_choice_allowance'::regclass, 'app.v2_choice_allowance_step'::regclass) ORDER BY relname`);
  assert.deepEqual(rows, [{ relname: "v2_choice_allowance", forced: true, owner: "jobguard_migration", mutable: false },
    { relname: "v2_choice_allowance_step", forced: true, owner: "jobguard_migration", mutable: false }]);
});

function e9FailingAuditPool() {
  return {
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
}
