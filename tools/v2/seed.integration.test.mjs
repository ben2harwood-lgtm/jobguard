import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { Pool } from "../../packages/db/node_modules/pg/esm/index.mjs";
import { createIdentityApplication } from "../../apps/api/dist/auth/index.js";
import { createWorkspaceApplication } from "../../apps/api/dist/workspace/index.js";
import { M1_QUOTE_POLICY } from "../../packages/core/dist/index.js";
import { CrewBriefRepository, DEMO_TENANT_ID, MeasurementRepository, WorkPlanRepository, authenticatePracticeSession, verifyAuditChain, withTenant } from "../../packages/db/dist/index.js";
// V2-C3C
import { CrewContactRepository } from "../../packages/db/dist/index.js";
// V2-F7M
import { CrewLinkRepository } from "../../packages/db/dist/index.js";
import { CrewLinkPageApplication } from "../../apps/api/dist/workspace/index.js";
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

const briefQuery = { version: "v2-crew-brief-query.v1" };

async function plantPhoto(targetJobId, scopeItemId, contentType = "image/jpeg") {
  const uploadId = randomUUID();
  const evidenceId = randomUUID();
  const sha = randomUUID().replaceAll("-", "").repeat(2);
  const objectKey = `v2-brief-test/${evidenceId}`;
  // Stands in for photos verified on site while the job was live. An earlier test
  // has since closed the seeded job, so skip the site-work triggers for this fixture only.
  await admin.query("BEGIN");
  try {
    await admin.query("SET LOCAL session_replication_role = replica");
    await admin.query(`INSERT INTO app.evidence_upload (id, tenant_id, job_id, scope_item_id, object_key, expected_sha256,
      expected_content_type, maximum_bytes, retention_class, state, object_version_id, server_verified_at, expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,1024,'standard_evidence','verified','v1',now(),now() + interval '1 day')`,
    [uploadId, DEMO_TENANT_ID, targetJobId, scopeItemId, objectKey, sha, contentType]);
    await admin.query(`INSERT INTO app.evidence_object (id, tenant_id, upload_id, job_id, scope_item_id, kind, evidence_type,
      object_key, object_version_id, sha256, byte_length, content_type, retention_class, server_received_at, server_verified_at)
      VALUES ($1,$2,$3,$4,$5,'original','photo',$6,'v1',$7,512,$8,'standard_evidence',now(),now())`,
    [evidenceId, DEMO_TENANT_ID, uploadId, targetJobId, scopeItemId, objectKey, sha, contentType]);
    await admin.query("COMMIT");
  } catch (error) {
    await admin.query("ROLLBACK");
    throw error;
  }
  return evidenceId;
}

async function briefSetup() {
  const owner = await signIn("builder");
  const { crewBriefs, workPlan } = createWorkspaceApplication({ pool: runtime, sessionId: owner.sessionId });
  const { quoteRevisionId } = await acceptedPlanSource();
  const { rows: scope } = await admin.query(`SELECT scope_item_id, category FROM app.quote_line
    WHERE (tenant_id, job_id, quote_revision_id) = ($1, $2, $3) AND included`, [DEMO_TENANT_ID, jobId, quoteRevisionId]);
  const tilingId = scope.find(line => line.category === "Tiling").scope_item_id;
  const decoratingId = scope.find(line => line.category === "Decorating").scope_item_id;
  const command = (trade, fields = {}) => ({ version: "v2-crew-brief-command.v1", commandId: randomUUID(), trade,
    expectedVersion: 0, accessWindow: "Weekdays 08:30 to 16:00, key from the fictional neighbour", photoIds: [], ...fields });
  return { owner, crewBriefs, workPlan, quoteRevisionId, tilingId, decoratingId, command };
}

const briefEvents = async () => (await admin.query(`SELECT tenant_id, actor_ref, payload FROM app.audit_event
  WHERE subject_type = 'job' AND subject_ref = $1 AND event_type = 'v2_crew_brief.generated' ORDER BY sequence`, [jobId])).rows;

const briefRows = async () => (await admin.query(`SELECT
  (SELECT count(*)::int FROM app.v2_crew_brief WHERE job_id = $1) AS briefs,
  (SELECT count(*)::int FROM app.v2_crew_brief_photo WHERE job_id = $1) AS photos,
  (SELECT count(*)::int FROM app.v2_crew_brief_command WHERE job_id = $1) AS receipts`, [jobId])).rows[0];

test("each trade's unpriced brief has only its own tasks and picked photos, and generating twice keeps one current brief", async () => {
  const { owner, crewBriefs, workPlan, quoteRevisionId, tilingId, decoratingId, command } = await briefSetup();
  const before = await effectCounts();
  assert.deepEqual(await crewBriefs.read(jobId, briefQuery), []);
  const tilerPhoto = await plantPhoto(jobId, tilingId);
  const hallPhoto = await plantPhoto(jobId, decoratingId);
  const pdf = await plantPhoto(jobId, tilingId, "application/pdf");
  const { rows: [other] } = await admin.query("SELECT id FROM app.job WHERE tenant_id = $1 AND id <> $2 LIMIT 1",
    [DEMO_TENANT_ID, jobId]);
  const elsewhere = await plantPhoto(other.id, null);
  for (const photoIds of [[pdf], [elsewhere], [randomUUID()]]) {
    await assert.rejects(crewBriefs.generate(jobId, command("tiler", { photoIds })), { code: "CREW_BRIEF_PHOTO_NOT_FOUND" });
  }
  await assert.rejects(crewBriefs.generate(jobId, command("plumber")), { code: "CREW_BRIEF_TRADE_NOT_FOUND" });
  for (const bad of [{ photoIds: [tilerPhoto, tilerPhoto] }, { accessWindow: " " }, { trade: "" }, { price: 1 }]) {
    await assert.rejects(crewBriefs.generate(jobId, command("tiler", bad)), { code: "CREW_BRIEF_INVALID_COMMAND" });
  }

  const tiler = command("tiler", { photoIds: [tilerPhoto] });
  const [first, replay] = await Promise.all([crewBriefs.generate(jobId, tiler), crewBriefs.generate(jobId, tiler)]);
  assert.deepEqual(replay, first);
  assert.equal(first.version, 1);
  assert.equal(first.actorMembershipId, owner.membershipId);
  // Visit and owner come from the plan; the Switch live test edited whichever task the seed put first.
  const livePlan = await workPlan.read(jobId, planQuery);
  const planned = key => livePlan.tasks.find(task => task.key === key);
  const visit = key => planned(key).scheduledDate ?? null;
  const assignee = key => planned(key).assignee ?? null;
  assert.deepEqual(first.content, {
    version: "v2-crew-brief.v1", trade: "tiler", quoteRevisionId,
    accessWindow: "Weekdays 08:30 to 16:00, key from the fictional neighbour",
    tasks: [
      { position: 1, scopeItemId: tilingId, taskKey: "prepare-splashback", title: "Prepare the splashback surface",
        scope: { description: "Fit and grout kitchen splashback tiles", quantity: "6", unit: "m2" },
        durationMinutes: 60, visit: visit("prepare-splashback"), owner: assignee("prepare-splashback"),
        proofNeeded: ["Photo of the prepared surface"] },
      { position: 2, scopeItemId: tilingId, taskKey: "tile-splashback", title: "Fit and grout the splashback",
        scope: { description: "Fit and grout kitchen splashback tiles", quantity: "6", unit: "m2" },
        durationMinutes: 240, visit: visit("tile-splashback"), owner: assignee("tile-splashback"),
        proofNeeded: ["Photo of the finished splashback"] },
    ],
    photos: [{ evidenceId: tilerPhoto, scopeItemId: tilingId, contentType: "image/jpeg" }],
    proofNeeded: ["Photo of the prepared surface", "Photo of the finished splashback"],
  });
  const decorator = await crewBriefs.generate(jobId, command("decorator", { photoIds: [hallPhoto] }));
  assert.deepEqual(decorator.content.tasks.map(task => task.title),
    ["Protect and prepare the hall", "Paint the hall walls and trim"]);
  assert.deepEqual(decorator.content.photos.map(photo => photo.evidenceId), [hallPhoto]);
  assert.deepEqual(decorator.content.tasks.map(task => task.scopeItemId), [decoratingId, decoratingId]);
  // Each brief task carries the plan task's key, so progress can name the exact task.
  assert.deepEqual(decorator.content.tasks.map(task => task.taskKey),
    decorator.content.tasks.map(task => livePlan.tasks.find(item => item.title === task.title).key));
  assert.deepEqual([...first.content.tasks, ...decorator.content.tasks].filter(task => task.owner)
    .map(({ visit: date, owner: name }) => [date, name]), [["2026-12-09", "Fictional Tiler"]]);
  const { rows: rates } = await admin.query("SELECT unit_rate_pence::text AS rate FROM app.quote_line WHERE quote_revision_id = $1",
    [quoteRevisionId]);
  for (const brief of [first, decorator]) {
    const text = JSON.stringify(brief.content);
    assert.doesNotMatch(text, /pence|price|rate|total|£|cost|fee/iu);
    for (const { rate } of rates) assert.ok(!text.includes(rate), rate);
  }

  // Same inputs again: still one current brief. Stale or altered commands are refused.
  const repeat = command("tiler", { expectedVersion: 1, photoIds: [tilerPhoto] });
  assert.deepEqual(await crewBriefs.generate(jobId, repeat), first);
  assert.deepEqual(await briefRows(), { briefs: 2, photos: 2, receipts: 3 });
  // One audit event per recorded command, in its transaction; the concurrent replay appended nothing.
  const events = await briefEvents();
  assert.equal(events.length, 3);
  const { context: practice } = await authenticatePracticeSession(runtime, owner.sessionId);
  for (const event of events) {
    assert.equal(event.tenant_id, practice.tenantId);
    assert.equal(event.actor_ref, `membership:${owner.membershipId}`);
    assert.equal("version" in event.payload.references, false);
    assert.doesNotMatch(JSON.stringify(event.payload), /tiler|decorator|fictional neighbour|splashback/iu,
      "free text stays out of the audit payload");
    for (const value of Object.values(event.payload.hashes)) assert.match(value, /^[a-f0-9]{64}$/u);
  }
  assert.deepEqual(events.map(({ payload: { references: { auditActorKind, auditActorRef, auditTrust, ...own } } }) => own), [
    { commandId: tiler.commandId, quoteRevisionId, expectedVersion: "0", briefVersion: "1", outcome: "created",
      taskCount: "2", photoCount: "1" },
    { commandId: events[1].payload.references.commandId, quoteRevisionId, expectedVersion: "0", briefVersion: "1",
      outcome: "created", taskCount: "2", photoCount: "1" },
    { commandId: repeat.commandId, quoteRevisionId, expectedVersion: "1", briefVersion: "1", outcome: "unchanged",
      taskCount: "2", photoCount: "1" },
  ]);
  // The unchanged generation keeps its own receipt: a changed replay is refused, not applied.
  await assert.rejects(crewBriefs.generate(jobId, { ...repeat, accessWindow: "Weekends" }), { code: "CREW_BRIEF_COMMAND_CONFLICT" });
  await assert.rejects(crewBriefs.generate(jobId, { ...tiler, accessWindow: "Weekends" }), { code: "CREW_BRIEF_COMMAND_CONFLICT" });
  await assert.rejects(crewBriefs.generate(jobId, command("tiler", { photoIds: [] })), { code: "CREW_BRIEF_VERSION_CONFLICT" });
  const revised = await crewBriefs.generate(jobId, command("tiler", { expectedVersion: 1, photoIds: [], accessWindow: "Mornings only" }));
  assert.equal(revised.version, 2);
  assert.deepEqual(revised.content.photos, []);
  assert.equal(revised.content.accessWindow, "Mornings only");

  const fresh = await enterPractice(owner.signedIn, owner.csrfToken);
  const { crewBriefs: reopened } = createWorkspaceApplication({ pool: runtime, sessionId: fresh.sessionId });
  assert.deepEqual(await reopened.read(jobId, briefQuery), [
    { ...decorator, current: true }, { ...revised, current: true },
  ]);
  assert.deepEqual(await reopened.generate(jobId, tiler), first);

  // A plan change leaves the stored brief intact but no longer current.
  const plan = await workPlan.read(jobId, planQuery);
  const task = plan.tasks.find(item => item.trade === "tiler" && item.key === "tile-splashback");
  await workPlan.edit(jobId, planEdit(plan, task, { scheduledDate: "2026-12-10" }));
  const [stale] = await reopened.read(jobId, { ...briefQuery, trade: "tiler" });
  assert.deepEqual(stale, { ...revised, current: false });
  const refreshed = await reopened.generate(jobId, command("tiler", { expectedVersion: 2, accessWindow: "Mornings only" }));
  assert.equal(refreshed.version, 3);
  assert.equal(refreshed.content.tasks[1].visit, "2026-12-10");
  // Exact replays after the plan change still return their original results, and append nothing.
  assert.deepEqual(await reopened.generate(jobId, repeat), first);
  assert.deepEqual(await reopened.generate(jobId, tiler), first);
  assert.equal((await briefEvents()).length, 5);

  // Fail the audit append after the brief and receipt inserts: the transaction must keep none of them.
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
  const rowsBefore = await briefRows();
  await assert.rejects(new CrewBriefRepository(failing).generate(practice, jobId, owner.sessionId,
    command("tiler", { expectedVersion: 3, accessWindow: "Afternoons" })), { code: "FORCED" });
  assert.deepEqual(await briefRows(), rowsBefore, "the brief and receipt rolled back with the audit event");
  assert.equal((await briefEvents()).length, 5);
  await verifyTenantChain(practice.tenantId);

  assert.deepEqual(await effectCounts(), before);
  const { rows: [{ paid }] } = await admin.query(`SELECT count(*)::int AS paid
    FROM app.job_record_proposal WHERE model IS DISTINCT FROM 'fixture-capture-v1'`);
  assert.equal(paid, 0);
});

test("a planted hidden financial finding leaves the exported briefs byte-identical", async () => {
  const { crewBriefs, command } = await briefSetup();
  const [decorator, tiler] = await crewBriefs.read(jobId, briefQuery);
  const exports = () => Promise.all(["decorator", "tiler"].map(trade => crewBriefs.exportInternal(jobId, trade)));
  const clean = await exports();
  const rebuild = () => Promise.all([decorator, tiler].map(brief => crewBriefs.generate(jobId, command(brief.trade, {
    expectedVersion: brief.version, accessWindow: brief.content.accessWindow,
    photoIds: brief.content.photos.map(photo => photo.evidenceId) }))));
  const cleanRebuild = await rebuild();
  const rows = await briefRows();
  rows.receipts += 2;
  const eventCount = (await briefEvents()).length + 2;
  const findings = await admin.query(`SELECT
    (SELECT count(*)::int FROM app.commercial_integrity_value_fact) AS values,
    (SELECT count(*)::int FROM app.commercial_integrity_activity_fact) AS activities`);

  // The hidden finding: a final value far below the accepted value, plus an outside-app settlement.
  await admin.query(`INSERT INTO app.commercial_integrity_value_fact
    (id, tenant_id, job_id, value_kind, net_value_pence, currency, source_ref, occurred_at, synthetic)
    VALUES ($1, $2, $3, 'final', 1, 'GBP', $4, now(), true)`, [randomUUID(), DEMO_TENANT_ID, jobId, randomUUID()]);
  await admin.query(`INSERT INTO app.commercial_integrity_activity_fact (id, tenant_id, job_id, activity_kind, occurred_at, synthetic)
    VALUES ($1, $2, $3, 'outside_app_settlement', now(), true)`, [randomUUID(), DEMO_TENANT_ID, jobId]);
  const planted = await admin.query(`SELECT
    (SELECT count(*)::int FROM app.commercial_integrity_value_fact) AS values,
    (SELECT count(*)::int FROM app.commercial_integrity_activity_fact) AS activities`);
  assert.deepEqual(planted.rows[0], { values: findings.rows[0].values + 1, activities: findings.rows[0].activities + 1 });

  assert.deepEqual(await exports(), clean);
  assert.deepEqual(await rebuild(), cleanRebuild);
  assert.deepEqual(await crewBriefs.read(jobId, briefQuery), [decorator, tiler]);
  assert.deepEqual(await briefRows(), rows);
  // Each rebuild appended one "unchanged" event, with the same content hash with or without the finding.
  const events = await briefEvents();
  assert.equal(events.length, eventCount);
  // The two rebuilds run concurrently, so compare each pair as a set.
  const hashes = events.slice(-4).map(event => event.payload.hashes.content);
  assert.deepEqual(hashes.slice(2).sort(), hashes.slice(0, 2).sort());
  assert.deepEqual(events.slice(-4).map(event => event.payload.references.outcome), Array(4).fill("unchanged"));
  const exported = JSON.parse(clean[1]);
  assert.deepEqual(exported, { version: "v2-crew-brief-export.v1", environment: "synthetic_demo",
    notice: "Practice sandbox — synthetic data; nothing is sent or charged", brief: tiler.content });
});

test("forced crew brief policies hide briefs and photos and reject changes from the second firm", async () => {
  const { owner, command } = await briefSetup();
  const outsider = await signIn("second-builder");
  const { crewBriefs } = createWorkspaceApplication({ pool: runtime, sessionId: outsider.sessionId });
  await assert.rejects(crewBriefs.read(jobId, briefQuery), { code: "NOT_FOUND" });
  await assert.rejects(crewBriefs.generate(jobId, command("tiler", { expectedVersion: 3 })), { code: "NOT_FOUND" });
  await assert.rejects(crewBriefs.exportInternal(jobId, "tiler"), { code: "NOT_FOUND" });

  const { context } = await authenticatePracticeSession(runtime, outsider.sessionId);
  const { context: ownerContext } = await authenticatePracticeSession(runtime, owner.sessionId);
  const query = (scope, sql, params) => withTenant(runtime, scope, db => db.$client.query(sql, params));
  const { rows: [photo] } = await admin.query("SELECT * FROM app.v2_crew_brief_photo WHERE job_id = $1 LIMIT 1", [jobId]);
  for (const table of ["app.v2_crew_brief", "app.v2_crew_brief_photo", "app.v2_crew_brief_command"]) {
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
      identity_access: false, worker_access: false, infra_access: false });
    const select = `SELECT * FROM ${table} WHERE (tenant_id, job_id) = ($1, $2)`;
    assert.ok((await query(ownerContext, select, [DEMO_TENANT_ID, jobId])).rowCount > 0);
    for (const scope of [outsider.realContext, context]) {
      assert.equal((await query(scope, select, [DEMO_TENANT_ID, jobId])).rowCount, 0);
      await assert.rejects(query(scope, `UPDATE ${table} SET trade = 'tiler' WHERE job_id = $1`, [jobId]), { code: "42501" });
      await assert.rejects(query(scope, `DELETE FROM ${table} WHERE job_id = $1`, [jobId]), { code: "42501" });
    }
    assert.equal((await runtime.query(select, [DEMO_TENANT_ID, jobId])).rowCount, 0);
  }
  for (const scope of [outsider.realContext, context]) {
    await assert.rejects(query(scope, `INSERT INTO app.v2_crew_brief (tenant_id, job_id, trade, expected_version, command_id,
      quote_revision_id, access_window, content, actor_membership_id)
      VALUES ($1, $2, 'tiler', 99, $3, $5, 'Any time', '{}', $4)`,
    [DEMO_TENANT_ID, jobId, randomUUID(), owner.membershipId, (await acceptedPlanSource()).quoteRevisionId]),
    { code: "42501", message: /row-level security policy/u });
    await assert.rejects(query(scope, `INSERT INTO app.v2_crew_brief_photo
      (tenant_id, job_id, trade, expected_version, position, evidence_id) VALUES ($1, $2, $3, $4, 20, $5)`,
    [DEMO_TENANT_ID, jobId, photo.trade, photo.expected_version, photo.evidence_id]),
    { code: "42501", message: /row-level security policy/u });
    await assert.rejects(query(scope, `INSERT INTO app.v2_crew_brief_command (tenant_id, job_id, command_id, trade,
      expected_version, access_window, photo_ids, brief_version, actor_membership_id)
      VALUES ($1, $2, $3, $4, $5, 'Any time', '{}', $5, $6)`,
    [DEMO_TENANT_ID, jobId, randomUUID(), photo.trade, photo.expected_version, owner.membershipId]),
    { code: "42501", message: /row-level security policy/u });
  }
});

// V2-F1 uses its own live job: earlier suite tests deliberately close the seeded job.
// Keep every earlier test and its assertions unchanged; use normal commands for setup.
const { BriefProgressRepository } = await import("../../packages/db/dist/index.js");
const { describe: describeF1 } = await import("node:test");
describeF1("V2-F1 brief progress", () => {
let jobId;
async function f1Setup() {
  const owner = await signIn("builder");
  const app = createWorkspaceApplication({ pool: runtime, sessionId: owner.sessionId });
  const command = (trade, fields = {}) => ({ version: "v2-crew-brief-command.v1", commandId: randomUUID(), trade,
    expectedVersion: 0, accessWindow: "F1 fictional mornings", photoIds: [], ...fields });
  return { owner, crewBriefs: app.crewBriefs, command };
}
// An accepted, live job with a current tiler brief, through normal commands.
async function f1LiveJob() {
  const { draftJob: jobId } = await draftForPlan();
  const owner = await signIn("builder");
  const { parties, quote, workPlan, crewBriefs } = createWorkspaceApplication({ pool: runtime, sessionId: owner.sessionId });
  const party = await parties.view({ sessionId: owner.sessionId }, jobId);
  const customer = { version: "customer.v1", type: "person", name: "Fictional F1 Customer",
    email: "customer@jobguard-v2.invalid", phone: "+447700900042" };
  await parties.command({ sessionId: owner.sessionId }, jobId, {
    version: "job-parties-command.v1", action: "save_form", commandId: randomUUID(),
    expectedJobRevision: party.jobRevision, expectedBindingId: null, customer, customerRef: null,
    site: { version: "site.v1", addressLines: ["45 Make-Believe Mews"], town: "Sampleford", postcode: "ZY1 0AA" },
    savedSiteRevisionId: null, reuseSiteId: null, expectedReuseRevisionId: null, confirmSamePlace: false,
    payingPartyRevisionId: null, expectedPayerRevisionId: null, correct: false,
  });
  const { view: preview } = await quote.preview(jobId, { version: "quote-preview-command.v1", recipient: customer.email });
  await quote.issue(jobId, { version: "quote-send-command.v1", commandId: randomUUID(),
    documentId: preview.documentId, contentHash: preview.contentHash, recipient: customer.email });
  await json(await request(`/api/jobs/${jobId}/quotes/delivery/execute`, {
    cookies: owner.cookies, body: { version: "quote-execute-command.v1", documentId: preview.documentId, mode: "success" },
  }));
  await quote.accept(jobId, { version: "quote-acceptance-command.v1", commandId: randomUUID(),
    documentId: preview.documentId, documentVersion: preview.documentVersion, documentHash: preview.contentHash,
    statedCustomerName: customer.name, statedMethod: "verbal", acceptedAt: new Date().toISOString() });
  await workPlan.read(jobId, planQuery);
  await quote.activate(jobId, switchLive());
  await crewBriefs.generate(jobId, (await f1Setup()).command("tiler"));
  return jobId;
}
before(async () => { jobId = await f1LiveJob(); });
// V2-F1 · own block: real application + database/audit/isolation proofs.
const progressEvents = commandId => admin.query(`SELECT actor_ref, event_type, payload FROM app.audit_event
  WHERE subject_ref = $1 AND event_type LIKE 'v2.progress.%'
    AND payload->'references'->>'commandId' = $2`, [jobId, commandId]).then(result => result.rows);
const progressCommand = (brief, task, fields = {}) => ({ version: "v2-brief-progress-command.v1", commandId: randomUUID(),
  trade: brief.trade, briefVersion: brief.version, scopeItemId: task.scopeItemId, taskKey: task.taskKey,
  expectedVersion: 0, kind: "done", note: "", ...fields });
const f1CommercialSnapshot = async () => {
  const tables = ["quote_line", "scope_revision", "scope_progress", "purchase_order_draft", "purchase_order_revision", "stage_completion"];
  return Promise.all(tables.map(async table => [table, (await admin.query(`SELECT to_jsonb(t) AS row FROM app.${table} t
    WHERE (tenant_id, job_id) = ($1, $2) ORDER BY to_jsonb(t)::text`, [DEMO_TENANT_ID, jobId])).rows]));
};

test("F1 Done, Blocked and Changed append once with exact audit, and replay or changed replay cannot add records", async () => {
  const { owner } = await f1Setup();
  const app = createWorkspaceApplication({ pool: runtime, sessionId: owner.sessionId });
  const view = await app.briefProgress.read(jobId);
  const brief = view.briefs.find(item => item.trade === "tiler");
  assert.ok(brief);
  assert.ok(brief.content.tasks.length >= 2, "two tasks may share a scope identity");
  const task = brief.content.tasks[0];
  const snapshot = await f1CommercialSnapshot();
  let recorded;
  for (const [index, kind] of ["done", "blocked", "changed"].entries()) {
    const command = progressCommand(brief, task, { kind, expectedVersion: index,
      note: kind === "done" ? "" : `F1 fictional ${kind} reason` });
    recorded = command;
    const before = await app.briefProgress.read(jobId);
    const [first, replay] = await Promise.all([app.briefProgress.record(jobId, command), app.briefProgress.record(jobId, command)]);
    assert.deepEqual(replay, first);
    assert.equal(first.version, index + 1);
    assert.equal(first.briefVersion, brief.version);
    assert.equal(first.photoReference, null);
    const events = await progressEvents(command.commandId);
    assert.equal(events.length, 1);
    assert.equal(events[0].actor_ref, `membership:${owner.membershipId}`);
    assert.equal(events[0].event_type, `v2.progress.${kind}_recorded`);
    assert.equal(events[0].payload.references.commandId, command.commandId);
    assert.equal(events[0].payload.references.briefVersion, String(brief.version));
    assert.equal(Object.hasOwn(events[0].payload.references, "version"), false);
    assert.doesNotMatch(JSON.stringify(events), /fictional|reason|note/u);
    assert.equal((await app.briefProgress.read(jobId)).progress.length, before.progress.length + 1);
    await assert.rejects(app.briefProgress.record(jobId, { ...command, note: "changed replay" }), { code: "BRIEF_PROGRESS_COMMAND_CONFLICT" });
    assert.equal((await progressEvents(command.commandId)).length, 1);
  }
  // The same command ID on another live job conflicts and adds nothing there.
  const otherJob = await f1LiveJob();
  await assert.rejects(app.briefProgress.record(otherJob, recorded), { code: "BRIEF_PROGRESS_COMMAND_CONFLICT" });
  assert.equal((await app.briefProgress.read(otherJob)).progress.length, 0);
  assert.equal((await progressEvents(recorded.commandId)).length, 1);
  assert.deepEqual(await f1CommercialSnapshot(), snapshot, "no scope, price, order or completion writes");
  const otherTask = brief.content.tasks[1];
  assert.equal(otherTask.scopeItemId, task.scopeItemId);
  assert.notEqual(otherTask.taskKey, task.taskKey);
  const independent = await app.briefProgress.record(jobId, progressCommand(brief, otherTask));
  assert.equal(independent.version, 1, "each task has its own expected version");
  await assert.rejects(app.briefProgress.record(jobId, progressCommand(brief, task)), { code: "BRIEF_PROGRESS_VERSION_CONFLICT" });
  await assert.rejects(app.briefProgress.record(jobId, progressCommand(brief, task, { taskKey: "missing-task" })), { code: "BRIEF_PROGRESS_TASK_NOT_FOUND" });
  const { context } = await authenticatePracticeSession(runtime, owner.sessionId);
  await verifyTenantChain(context.tenantId);
});

test("F1 failure after row and audit insertion rolls both back for every kind", async () => {
  const { owner } = await f1Setup();
  const { context } = await authenticatePracticeSession(runtime, owner.sessionId);
  const app = createWorkspaceApplication({ pool: runtime, sessionId: owner.sessionId });
  const brief = (await app.briefProgress.read(jobId)).briefs.find(item => item.trade === "tiler");
  // Execute the real audit append, then throw before commit. Both staged writes must disappear.
  const failing = { async connect() {
    const client = await runtime.connect(), original = client.query.bind(client), release = client.release.bind(client);
    client.query = async (sql, ...args) => {
      const result = await original(sql, ...args);
      if (typeof sql === "string" && sql.includes("app.append_audit(")) throw Object.assign(new Error("forced after audit"), { code: "F1_FORCED" });
      return result;
    };
    client.release = (...args) => { client.query = original; return release(...args); };
    return client;
  } };
  for (const kind of ["done", "blocked", "changed"]) {
    const command = progressCommand(brief, brief.content.tasks[0], { kind, expectedVersion: 3, note: "F1 rollback" });
    const before = await app.briefProgress.read(jobId);
    await assert.rejects(new BriefProgressRepository(failing).record(context, jobId, owner.sessionId, command), { code: "F1_FORCED" });
    assert.equal((await admin.query("SELECT 1 FROM app.v2_brief_progress WHERE command_id=$1", [command.commandId])).rowCount, 0);
    assert.deepEqual(await progressEvents(command.commandId), []);
    assert.deepEqual(await app.briefProgress.read(jobId), before);
  }
});

test("F1 records survive brief regeneration; stale versions and saved briefs without taskKey are refused", async () => {
  const { owner, crewBriefs, command } = await f1Setup();
  const app = createWorkspaceApplication({ pool: runtime, sessionId: owner.sessionId });
  const before = await app.briefProgress.read(jobId);
  const brief = before.briefs.find(item => item.trade === "tiler");
  const regenerated = await crewBriefs.generate(jobId, command("tiler", { expectedVersion: brief.version,
    accessWindow: "F1 fictional afternoon access" }));
  assert.ok(regenerated.version > brief.version);
  assert.deepEqual((await app.briefProgress.read(jobId)).progress, before.progress);
  const stale = progressCommand(brief, brief.content.tasks[0], { expectedVersion: 3 });
  await assert.rejects(app.briefProgress.record(jobId, stale), { code: "BRIEF_PROGRESS_STALE_BRIEF" });
  assert.deepEqual(await progressEvents(stale.commandId), []);
  const legacyContent = structuredClone(regenerated.content);
  legacyContent.tasks.forEach(task => delete task.taskKey);
  // Synthetic legacy fixture only, preserving the real v1 stored schema label.
  await admin.query(`INSERT INTO app.v2_crew_brief (tenant_id,job_id,trade,expected_version,command_id,quote_revision_id,
    access_window,content,actor_membership_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
  [DEMO_TENANT_ID,jobId,brief.trade,regenerated.version,randomUUID(),regenerated.content.quoteRevisionId,
    regenerated.content.accessWindow,JSON.stringify(legacyContent),owner.membershipId]);
  const legacy = progressCommand(regenerated, regenerated.content.tasks[0], { briefVersion: regenerated.version + 1, expectedVersion: 3 });
  await assert.rejects(app.briefProgress.record(jobId, legacy), { code: "BRIEF_PROGRESS_REGENERATE" });
  assert.deepEqual(await progressEvents(legacy.commandId), []);
  const current = await crewBriefs.generate(jobId, command("tiler", { expectedVersion: regenerated.version + 1,
    accessWindow: "F1 fictional morning access restored" }));
  const saved = await app.briefProgress.record(jobId, progressCommand(current, current.content.tasks[0], { expectedVersion: 3 }));
  assert.equal(saved.version, 4);
  assert.equal(saved.briefVersion, current.version);
  const reloaded = createWorkspaceApplication({ pool: runtime, sessionId: owner.sessionId });
  assert.deepEqual((await reloaded.briefProgress.read(jobId)).progress, [...before.progress, saved]);
});

test("F1 second firm cannot read, press, insert, update or delete; grants are forced and append only", async () => {
  const owner = await signIn("builder"), outsider = await signIn("second-builder");
  const app = createWorkspaceApplication({ pool: runtime, sessionId: owner.sessionId });
  const foreign = createWorkspaceApplication({ pool: runtime, sessionId: outsider.sessionId });
  const brief = (await app.briefProgress.read(jobId)).briefs.find(item => item.trade === "tiler");
  await assert.rejects(foreign.briefProgress.read(jobId), { code: "NOT_FOUND" });
  await assert.rejects(foreign.briefProgress.record(jobId, progressCommand(brief, brief.content.tasks[0])), { code: "NOT_FOUND" });
  const { context } = await authenticatePracticeSession(runtime, outsider.sessionId);
  const { context: ownerContext } = await authenticatePracticeSession(runtime, owner.sessionId);
  const query = (scope, sql, args) => withTenant(runtime, scope, db => db.$client.query(sql, args));
  const table = "app.v2_brief_progress";
  const { rows: [acl] } = await admin.query(`SELECT relrowsecurity AND relforcerowsecurity AS forced,
    relowner::regrole::text AS owner, has_table_privilege('jobguard_runtime',oid,'SELECT') AS can_read,
    has_table_privilege('jobguard_runtime',oid,'INSERT') AS can_insert,
    has_table_privilege('jobguard_runtime',oid,'UPDATE,DELETE,TRUNCATE') AS can_mutate,
    has_table_privilege('jobguard_identity',oid,'SELECT,INSERT,UPDATE,DELETE') AS identity_access,
    has_table_privilege('jobguard_worker',oid,'SELECT,INSERT,UPDATE,DELETE') AS worker_access,
    has_table_privilege('jobguard_infrastructure',oid,'SELECT,INSERT,UPDATE,DELETE') AS infra_access
    FROM pg_class WHERE oid=$1::regclass`, [table]);
  assert.deepEqual(acl, { forced: true, owner: "jobguard_migration", can_read: true, can_insert: true, can_mutate: false,
    identity_access: false, worker_access: false, infra_access: false });
  for (const scope of [outsider.realContext, context]) {
    assert.equal((await query(scope, `SELECT * FROM ${table} WHERE job_id=$1`, [jobId])).rowCount, 0);
    for (const sql of [`UPDATE ${table} SET note='forged' WHERE job_id=$1`, `DELETE FROM ${table} WHERE job_id=$1`]) {
      await assert.rejects(query(scope, sql, [jobId]), { code: "42501" });
    }
    await assert.rejects(query(scope, `INSERT INTO ${table} (tenant_id,job_id,command_id,trade,brief_version,scope_item_id,
      task_key,expected_version,kind,note,actor_membership_id) VALUES ($1,$2,$3,$4,$5,$6,$7,99,'done','',$8)`,
    [DEMO_TENANT_ID,jobId,randomUUID(),brief.trade,brief.version-1,brief.content.tasks[0].scopeItemId,
      brief.content.tasks[0].taskKey,owner.membershipId]), { code: "42501" });
  }
  assert.ok((await query(ownerContext, `SELECT * FROM ${table} WHERE job_id=$1`, [jobId])).rowCount > 0);
  for (const verb of ["UPDATE", "DELETE"]) await assert.rejects(query(ownerContext,
    verb === "UPDATE" ? `UPDATE ${table} SET note='forged' WHERE job_id=$1` : `DELETE FROM ${table} WHERE job_id=$1`, [jobId]), { code: "42501" });
  assert.equal((await runtime.query(`SELECT * FROM ${table} WHERE job_id=$1`, [jobId])).rowCount, 0);
});

// Codex P2 on #953: a plan edit after the page loaded must not let a press land on the outdated brief.
test("F1 refuses a press on a brief the plan has outdated since it loaded, then records on the regenerated brief", async () => {
  const { owner, crewBriefs, command } = await f1Setup();
  const app = createWorkspaceApplication({ pool: runtime, sessionId: owner.sessionId });
  const loaded = await app.briefProgress.read(jobId);
  const brief = loaded.briefs.find(item => item.trade === "tiler");
  assert.equal(brief.current, true);
  const task = brief.content.tasks.at(-1);
  const head = () => app.briefProgress.read(jobId).then(view => Math.max(0, ...view.progress
    .filter(row => row.trade === "tiler" && row.scopeItemId === task.scopeItemId && row.taskKey === task.taskKey)
    .map(row => row.version)));
  const plan = await app.workPlan.read(jobId, planQuery);
  const planned = plan.tasks.find(item => item.scopeItemId === task.scopeItemId && item.key === task.taskKey);
  await app.workPlan.edit(jobId, planEdit(plan, planned, { durationMinutes: planned.durationMinutes + 15 }));
  const outdated = progressCommand(brief, task, { expectedVersion: await head() });
  const rows = () => admin.query("SELECT 1 FROM app.v2_brief_progress WHERE command_id=$1", [outdated.commandId]);
  await assert.rejects(app.briefProgress.record(jobId, outdated), { code: "BRIEF_PROGRESS_REGENERATE" });
  assert.equal((await rows()).rowCount, 0);
  assert.deepEqual(await progressEvents(outdated.commandId), []);
  assert.equal((await app.briefProgress.read(jobId)).briefs.find(item => item.trade === "tiler").current, false);
  const regenerated = await crewBriefs.generate(jobId, command("tiler", { expectedVersion: brief.version,
    accessWindow: brief.content.accessWindow }));
  const fresh = regenerated.content.tasks.find(item => item.scopeItemId === task.scopeItemId && item.taskKey === task.taskKey);
  const saved = await app.briefProgress.record(jobId, progressCommand(regenerated, fresh, { expectedVersion: await head() }));
  assert.equal(saved.briefVersion, regenerated.version);
  assert.equal((await progressEvents(saved.commandId)).length, 1);
});

// V2-F1-P own block: migration rerun preserves all grants and policies.
test("F1-P migration 2053 reruns without changing grants or policies", async () => {
  const catalog = () => admin.query(`SELECT c.relname,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity,
    p.polname,pg_get_expr(p.polqual,p.polrelid) AS predicate,pg_get_expr(p.polwithcheck,p.polrelid) AS check_predicate
    FROM pg_class c LEFT JOIN pg_policy p ON p.polrelid=c.oid
    WHERE c.oid IN ('app.v2_brief_progress'::regclass,'app.evidence_upload'::regclass)
    ORDER BY c.relname,p.polname`).then(r => r.rows);
  const before = await catalog();
  const sql = readFileSync(new URL("../../packages/db/migrations/2053_v2_brief_progress_photo.sql", import.meta.url), "utf8");
  await admin.query(sql); await admin.query(sql);
  assert.deepEqual(await catalog(), before);
  const fk = await admin.query(`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
    WHERE conrelid='app.v2_brief_progress'::regclass AND conname='v2_brief_progress_photo_fk'`);
  assert.match(fk.rows[0].definition, /FOREIGN KEY \(tenant_id, photo_reference\) REFERENCES app.evidence_upload\(tenant_id, id\)/u);
});

// V2-F1-P own block: reuse F1's live job before its closing-boundary test below.
test("F1-P photo upload and all progress kinds: audit, replay, live state, isolation and rollback", async () => {
  const owner = await signIn("builder"), outsider = await signIn("second-builder");
  const app = createWorkspaceApplication({ pool: runtime, sessionId: owner.sessionId });
  const { context } = await authenticatePracticeSession(runtime, owner.sessionId);
  const { context: foreignContext } = await authenticatePracticeSession(runtime, outsider.sessionId);
  const view = await app.briefProgress.read(jobId), brief = view.briefs.find(item => item.trade === "tiler");
  const task = brief.content.tasks[0];
  const next = async () => Math.max(0, ...(await app.briefProgress.read(jobId)).progress
    .filter(row => row.trade === brief.trade && row.scopeItemId === task.scopeItemId && row.taskKey === task.taskKey).map(row => row.version));
  const photo = { version: "v2-brief-progress-photo-command.v1", commandId: randomUUID(), scopeItemId: task.scopeItemId, fixture: "completion-photo" };
  const auditRows = id => admin.query(`SELECT event_type,payload FROM app.audit_event WHERE subject_ref=$1
    AND event_type LIKE 'v2.progress_photo.%' AND (payload->'references'->>'commandId'=$2 OR payload->'references'->>'uploadCommandId'=$2)`, [jobId,id]).then(r => r.rows);
  const uploaded = await app.briefProgress.uploadPhoto(jobId, photo);
  assert.deepEqual(uploaded, { uploadId: photo.commandId, evidenceId: photo.commandId, state: "verified" });
  // Codex P2 4703616019: a progress photo is never a stage-proof upload for its scope.
  assert.deepEqual((await admin.query(`SELECT u.scope_item_id AS upload, e.scope_item_id AS evidence, e.evidence_type
    FROM app.evidence_upload u JOIN app.evidence_object e ON (e.tenant_id,e.upload_id)=(u.tenant_id,u.id) WHERE u.id=$1`,
  [photo.commandId])).rows, [{ upload: null, evidence: null, evidence_type: "progress_photo" }]);
  assert.equal((await admin.query(`SELECT count(*)::int AS n FROM app.evidence_upload WHERE job_id=$1 AND scope_item_id=$2`,
    [jobId, task.scopeItemId])).rows[0].n, 0, "the proof card's newest-upload-for-scope query cannot see it");
  const events = await auditRows(photo.commandId);
  assert.deepEqual(events.map(e => e.event_type).sort(), ["v2.progress_photo.attached", "v2.progress_photo.finalized"]);
  assert.equal(new Set(events.map(event => event.payload.references.commandId)).size, 2,
    "begin and finalize have separate durable command identities and one event each");
  assert.deepEqual(await app.briefProgress.uploadPhoto(jobId, photo), uploaded);
  assert.deepEqual(await auditRows(photo.commandId), events);
  await assert.rejects(app.briefProgress.uploadPhoto(jobId, { ...photo, fixture: "j3-drainage-photo" }));
  // Codex P2 4707412001: overlapping uploads reusing one commandId with different scopes: one wins, one conflicts.
  // Upload binds scope only through its audit event, so any other scope id exercises the race.
  const otherScope = randomUUID();
  const raced = { ...photo, commandId: randomUUID() };
  const outcomes = await Promise.allSettled([app.briefProgress.uploadPhoto(jobId, raced),
    app.briefProgress.uploadPhoto(jobId, { ...raced, scopeItemId: otherScope })]);
  assert.equal(outcomes.filter(outcome => outcome.status === "fulfilled").length, 1);
  const [lost] = outcomes.filter(outcome => outcome.status === "rejected");
  assert.equal(lost.reason.code, "BRIEF_PROGRESS_COMMAND_CONFLICT");
  const racedEvents = await auditRows(raced.commandId);
  assert.deepEqual(racedEvents.map(e => e.event_type).sort(), ["v2.progress_photo.attached", "v2.progress_photo.finalized"]);
  const winner = outcomes.findIndex(outcome => outcome.status === "fulfilled") === 0 ? task.scopeItemId : otherScope;
  for (const event of racedEvents) assert.equal(event.payload.references.scopeItemId, winner);
  for (const kind of ["done", "blocked", "changed"]) {
    const command = progressCommand(brief, task, { version: "v2-brief-progress-command.v2", photoId: uploaded.uploadId,
      kind, note: kind === "blocked" ? "no power" : "F1-P fictional observation", expectedVersion: await next() });
    const first = await app.briefProgress.record(jobId, command);
    assert.equal(first.photoReference, uploaded.uploadId);
    assert.equal(first.photoState, "verified");
    assert.match(first.thumbnail, /^data:image\/png;base64,/u);
    assert.deepEqual(await app.briefProgress.record(jobId, command), first);
    assert.equal((await progressEvents(command.commandId)).length, 1);
    await assert.rejects(app.briefProgress.record(jobId, { ...command, photoId: randomUUID() }), { code: "BRIEF_PROGRESS_COMMAND_CONFLICT" });
    const restored = (await createWorkspaceApplication({ pool: runtime, sessionId: owner.sessionId }).briefProgress.read(jobId)).progress.find(row => row.commandId === command.commandId);
    assert.deepEqual(restored, first);
  }
  // Forced failure after the actual append must remove the row and event for every photo-bearing kind.
  let failEvent = "";
  const failing = { async connect() {
    const client = await runtime.connect(), original = client.query.bind(client), release = client.release.bind(client);
    client.query = async (sql, ...args) => {
      const result = await original(sql, ...args);
      if (typeof sql === "string" && sql.includes("app.append_audit(") && (!failEvent || JSON.stringify(args).includes(failEvent))) throw new Error("F1P_FORCED");
      return result;
    };
    client.release = (...args) => { client.query = original; return release(...args); };
    return client;
  } };
  for (const kind of ["done", "blocked", "changed"]) {
    const command = progressCommand(brief, task, { version: "v2-brief-progress-command.v2", photoId: uploaded.uploadId,
      kind, note: "no power", expectedVersion: await next() });
    await assert.rejects(new BriefProgressRepository(failing).record(context, jobId, owner.sessionId, command), /F1P_FORCED/u);
    assert.equal((await admin.query("SELECT 1 FROM app.v2_brief_progress WHERE command_id=$1", [command.commandId])).rowCount, 0);
    assert.deepEqual(await progressEvents(command.commandId), []);
  }
  const failedPhoto = { ...photo, commandId: randomUUID() };
  const { uploadBriefProgressPhoto } = await import("../../apps/api/dist/workspace/brief-progress-photo.application.js");
  await assert.rejects(uploadBriefProgressPhoto(failing, context, jobId, owner.membershipId, failedPhoto), /F1P_FORCED/u);
  assert.equal((await admin.query("SELECT 1 FROM app.evidence_upload WHERE id=$1", [failedPhoto.commandId])).rowCount, 0);
  assert.equal((await admin.query("SELECT 1 FROM app.synthetic_evidence_original WHERE upload_id=$1", [failedPhoto.commandId])).rowCount, 0);
  assert.deepEqual(await auditRows(failedPhoto.commandId), []);
  assert.equal((await admin.query("SELECT 1 FROM app.v2_brief_progress WHERE photo_reference=$1", [failedPhoto.commandId])).rowCount, 0);
  failEvent = "v2.progress_photo.finalized";
  const failedFinalize = { ...photo, commandId: randomUUID() };
  await assert.rejects(uploadBriefProgressPhoto(failing, context, jobId, owner.membershipId, failedFinalize), /F1P_FORCED/u);
  assert.equal((await admin.query("SELECT 1 FROM app.evidence_object WHERE upload_id=$1", [failedFinalize.commandId])).rowCount, 0);
  assert.deepEqual((await auditRows(failedFinalize.commandId)).map(row => row.event_type), ["v2.progress_photo.attached"]);
  assert.equal((await admin.query("SELECT 1 FROM app.v2_brief_progress WHERE photo_reference=$1", [failedFinalize.commandId])).rowCount, 0);
  await app.briefProgress.uploadPhoto(jobId, failedFinalize);
  assert.equal((await auditRows(failedFinalize.commandId)).length, 2);
  // The same-tenant wrong-job link is refused by the insert guard, independently of the API.
  const otherUpload = (await admin.query("SELECT id FROM app.evidence_upload WHERE tenant_id=$1 AND job_id<>$2 LIMIT 1", [DEMO_TENANT_ID,jobId])).rows[0];
  assert.ok(otherUpload, "earlier full-suite proof fixtures provide another job's upload");
  await assert.rejects(app.briefProgress.record(jobId, progressCommand(brief, task, { version: "v2-brief-progress-command.v2",
    photoId: otherUpload.id, expectedVersion: await next() })), /V2_PROGRESS_PHOTO_OTHER_JOB/u);
  const foreign = createWorkspaceApplication({ pool: runtime, sessionId: outsider.sessionId });
  await assert.rejects(foreign.briefProgress.read(jobId), { code: "NOT_FOUND" });
  await assert.rejects(foreign.briefProgress.uploadPhoto(jobId, photo), { code: "NOT_FOUND" });
  for (const scope of [outsider.realContext, foreignContext]) {
    // PX #964 (2025) locks the evidence tables to the firm, so the second firm sees none of this job's rows.
    for (const table of ["v2_brief_progress", "evidence_upload", "evidence_object", "synthetic_evidence_original"]) {
      assert.equal((await withTenant(runtime, scope, db => db.$client.query(
        `SELECT * FROM app.${table} WHERE job_id=$1`, [jobId]))).rowCount, 0, table);
    }
    try {
      const changed = await withTenant(runtime, scope, db => db.$client.query(
        "UPDATE app.evidence_upload SET state='rejected' WHERE tenant_id=$1 AND id=$2", [DEMO_TENANT_ID,uploaded.uploadId]));
      assert.equal(changed.rowCount, 0);
    } catch (error) { assert.equal(error.code, "42501"); }
    await assert.rejects(withTenant(runtime, scope, db => db.$client.query(
      "DELETE FROM app.evidence_upload WHERE tenant_id=$1 AND id=$2", [DEMO_TENANT_ID,uploaded.uploadId])), { code: "42501" });
  }
  // Live state comes from evidence_upload, without updating the immutable progress observation.
  await admin.query("UPDATE app.evidence_upload SET state='rejected',rejection_code='verification_invalid' WHERE id=$1", [uploaded.uploadId]);
  const rejected = (await app.briefProgress.read(jobId)).progress.filter(row => row.photoReference === uploaded.uploadId);
  assert.equal(rejected.length, 3);
  assert.ok(rejected.every(row => row.photoState === "rejected" && row.thumbnail === null));
  const legacy = await app.briefProgress.record(jobId, progressCommand(brief, task, { expectedVersion: await next() }));
  assert.equal(legacy.photoReference, null);
  await verifyTenantChain(context.tenantId);
});

// V2-F2 own block: a Done task that needs proof stays open until its photo is verified (derived only).
test("F2 proof holds the task open: missing, pending then verified with no new record, rejected then a new verified Done, isolation", async () => {
  const owner = await signIn("builder"), outsider = await signIn("second-builder");
  const app = createWorkspaceApplication({ pool: runtime, sessionId: owner.sessionId });
  const { context } = await authenticatePracticeSession(runtime, owner.sessionId);
  const { context: foreignContext } = await authenticatePracticeSession(runtime, outsider.sessionId);
  const brief = (await app.briefProgress.read(jobId)).briefs.find(item => item.trade === "tiler");
  const task = brief.content.tasks.at(-1);
  assert.ok(task.proofNeeded.length > 0, "every practice task has a proof point");
  const status = async () => (await app.briefProgress.read(jobId)).tasks.find(item =>
    item.trade === brief.trade && item.scopeItemId === task.scopeItemId && item.taskKey === task.taskKey);
  const next = async () => (await status())?.version ?? 0;
  const done = async photoId => app.briefProgress.record(jobId, progressCommand(brief, task, {
    version: "v2-brief-progress-command.v2", ...(photoId && { photoId }), expectedVersion: await next() }));
  const photo = () => ({ version: "v2-brief-progress-photo-command.v1", commandId: randomUUID(), scopeItemId: task.scopeItemId, fixture: "completion-photo" });
  // Done with no photo.
  await done();
  assert.equal((await status()).status, "done_proof_missing");
  // Done with a photo still pending: begin the upload, fail its finalize, then finish it with the same command.
  const failing = { async connect() {
    const client = await runtime.connect(), original = client.query.bind(client), release = client.release.bind(client);
    client.query = async (sql, ...args) => {
      const result = await original(sql, ...args);
      if (typeof sql === "string" && sql.includes("app.append_audit(") && JSON.stringify(args).includes("v2.progress_photo.finalized")) throw new Error("F2_FORCED");
      return result;
    };
    client.release = (...args) => { client.query = original; return release(...args); };
    return client;
  } };
  const { uploadBriefProgressPhoto } = await import("../../apps/api/dist/workspace/brief-progress-photo.application.js");
  const pending = photo();
  await assert.rejects(uploadBriefProgressPhoto(failing, context, jobId, owner.membershipId, pending), /F2_FORCED/u);
  // The finalize marks the upload quarantined before it stores the object, so the failed attempt leaves it quarantined, not verified.
  assert.equal((await admin.query("SELECT state FROM app.evidence_upload WHERE id=$1", [pending.commandId])).rows[0].state, "quarantined");
  const pendingDone = await done(pending.commandId);
  assert.equal(pendingDone.photoState, "quarantined");
  assert.equal((await status()).status, "done_proof_pending");
  const rowsBefore = (await app.briefProgress.read(jobId)).progress.length;
  assert.equal((await app.briefProgress.uploadPhoto(jobId, pending)).state, "verified");
  assert.deepEqual(await status(), { trade: brief.trade, scopeItemId: task.scopeItemId, taskKey: task.taskKey,
    version: pendingDone.version, status: "done" });
  assert.equal((await app.briefProgress.read(jobId)).progress.length, rowsBefore, "verification adds no record");
  // A rejected photo reopens the task; a new Done with a verified photo closes it.
  await admin.query("UPDATE app.evidence_upload SET state='rejected',rejection_code='verification_invalid' WHERE id=$1", [pending.commandId]);
  assert.equal((await status()).status, "done_proof_rejected");
  const replacement = photo();
  await app.briefProgress.uploadPhoto(jobId, replacement);
  await done(replacement.commandId);
  assert.equal((await status()).status, "done");
  // Codex P1 4710983805: a verified photo uploaded for another scope item does not prove this task.
  const { rows: [otherScope] } = await admin.query("SELECT id FROM app.scope_identity WHERE job_id=$1 AND id<>$2 ORDER BY id LIMIT 1",
    [jobId, task.scopeItemId]);
  assert.ok(otherScope, "the seeded job has a second scope item");
  const elsewhere = { ...photo(), scopeItemId: otherScope.id };
  assert.equal((await app.briefProgress.uploadPhoto(jobId, elsewhere)).state, "verified");
  await done(elsewhere.commandId);
  assert.equal((await status()).status, "done_proof_missing");
  await done(replacement.commandId);
  assert.equal((await status()).status, "done");
  // Blocked keeps its kind even with a verified photo.
  await app.briefProgress.record(jobId, progressCommand(brief, task, { version: "v2-brief-progress-command.v2",
    photoId: replacement.commandId, kind: "blocked", note: "F2 fictional no power", expectedVersion: await next() }));
  assert.equal((await status()).status, "blocked");
  // The second firm reads no status for the first firm's job (rule 30 A/B, as jobguard_runtime).
  const foreign = createWorkspaceApplication({ pool: runtime, sessionId: outsider.sessionId });
  await assert.rejects(foreign.briefProgress.read(jobId), { code: "NOT_FOUND" });
  await assert.rejects(new BriefProgressRepository(runtime).read(foreignContext, jobId), { code: "NOT_FOUND" });
  assert.ok((await new BriefProgressRepository(runtime).read(context, jobId)).tasks.length > 0, "positive control");
  await verifyTenantChain(context.tenantId);
});

// V2-F7M own block (Q52, migration 2041): crew links show one trade's brief and record observations for the builder to confirm.
const f7m = {
  async setup(trade = "tiler") {
    const { owner, crewBriefs, command } = await f1Setup();
    const app = createWorkspaceApplication({ pool: runtime, sessionId: owner.sessionId });
    let brief = (await app.briefProgress.read(jobId)).briefs.find(item => item.trade === "tiler");
    if (!brief.current) brief = await crewBriefs.generate(jobId, command("tiler", { expectedVersion: brief.version,
      accessWindow: brief.content.accessWindow }));
    const crew = await app.crewContacts.record({ version: "crew-contact.v1", commandId: randomUUID(), crewId: randomUUID(),
      expectedRevision: 0, displayName: "Ria Fictional", trade, phone: "07700 900321", email: "ria@crew.jobguard-v2.invalid" });
    const issue = (fields = {}) => app.crewLinks.command(jobId, { version: "v2-crew-link-command.v1", action: "issue",
      commandId: randomUUID(), crewId: crew.crewId, ...fields });
    return { owner, app, brief, crew, issue, crewBriefs, command, page: new CrewLinkPageApplication(runtime) };
  },
  press: (token, brief, task, fields = {}) => ({ version: "v2-crew-link-press.v1", token, commandId: randomUUID(),
    briefVersion: brief.version, scopeItemId: task.scopeItemId, taskKey: task.taskKey, kind: "done", note: "", ...fields }),
  rows: commandId => admin.query("SELECT * FROM app.v2_crew_progress WHERE command_id = $1", [commandId]).then(r => r.rows),
  events: commandId => admin.query(`SELECT actor_ref, event_type FROM app.audit_event WHERE subject_ref = $1
    AND payload->'references'->>'commandId' = $2`, [jobId, commandId]).then(r => r.rows),
};

test("F7M a link shows only its trade's unpriced brief; presses record once, replay, and the builder confirms them", async () => {
  const { app, brief, crew, page } = await f7m.setup();
  const command = { version: "v2-crew-link-command.v1", action: "issue", commandId: randomUUID(), crewId: crew.crewId };
  const made = await app.crewLinks.command(jobId, command);
  assert.match(made.token, /^[A-Za-z0-9_-]{43}$/u);
  const replay = await app.crewLinks.command(jobId, command);
  assert.equal(replay.token, null, "the token is shown once");
  assert.equal(replay.linkId, made.linkId);
  assert.deepEqual((await f7m.events(command.commandId)).map(e => e.event_type), ["v2.crew_link.issued"]);
  const stored = (await admin.query("SELECT token_hash FROM app.v2_crew_link WHERE id = $1", [made.linkId])).rows[0];
  assert.equal(stored.token_hash, createHash("sha256").update(made.token).digest("hex"), "only the hash is stored");
  const view = await page.open(made.token);
  assert.equal(view.trade, "tiler");
  assert.equal(view.crewName, "Ria Fictional");
  assert.equal(view.brief.version, brief.version);
  assert.equal(view.brief.changed, false);
  assert.deepEqual(view.brief.tasks.map(task => [task.scopeItemId, task.taskKey]),
    brief.content.tasks.map(task => [task.scopeItemId, task.taskKey]));
  const text = JSON.stringify(view);
  for (const hidden of ["£", "price", "amount", "customer@", "Make-Believe", "07700", "@crew.", made.token]) {
    assert.ok(!text.includes(hidden), `the crew page must not carry ${hidden}`);
  }
  const f1Before = (await admin.query("SELECT count(*)::int AS n FROM app.v2_brief_progress WHERE job_id = $1", [jobId])).rows[0].n;
  const task = brief.content.tasks[0];
  for (const kind of ["done", "blocked", "changed"]) {
    const press = f7m.press(made.token, brief, task, { kind, note: kind === "done" ? "" : `F7M fictional ${kind}` });
    const first = await page.receive(press);
    assert.equal(first.replayed, false);
    assert.equal((await page.receive(press)).replayed, true);
    await assert.rejects(page.receive({ ...press, note: "F7M other body" }), { code: "CREW_LINK_REFUSED" });
    assert.equal((await f7m.rows(press.commandId)).length, 1);
    assert.deepEqual(await f7m.events(press.commandId), [{ actor_ref: `crew_link:${made.linkId}`, event_type: "v2.crew_progress.recorded" }]);
  }
  assert.equal((await admin.query("SELECT count(*)::int AS n FROM app.v2_brief_progress WHERE job_id = $1", [jobId])).rows[0].n,
    f1Before, "a crew press is an observation, never a builder progress record");
  const reopened = (await page.open(made.token)).brief.tasks.find(row => row.taskKey === task.taskKey && row.scopeItemId === task.scopeItemId);
  assert.deepEqual([reopened.reported.kind, reopened.reported.note], ["changed", "F7M fictional changed"], "a reopened link shows what the crew sent");
  // A second, different "changed" report on the same task: confirming the first must not confirm this one.
  await page.receive(f7m.press(made.token, brief, task, { kind: "changed", note: "F7M fictional changed differently" }));
  const presses = (await app.crewLinks.read(jobId)).presses.filter(row => row.linkId === made.linkId);
  assert.deepEqual(presses.map(row => [row.kind, row.confirmed]), [["done", false], ["blocked", false], ["changed", false], ["changed", false]]);
  // Confirm is an ordinary builder F1 press.
  const head = Math.max(0, ...(await app.briefProgress.read(jobId)).progress.filter(row => row.trade === "tiler"
    && row.scopeItemId === task.scopeItemId && row.taskKey === task.taskKey).map(row => row.version));
  const changed = presses[2];
  await app.briefProgress.record(jobId, progressCommand(brief, task, { kind: "changed", note: changed.note, expectedVersion: head }));
  assert.deepEqual((await app.crewLinks.read(jobId)).presses.filter(row => row.linkId === made.linkId).map(row => row.confirmed),
    [false, false, true, false]);
  const listed = (await app.crewLinks.read(jobId)).links.find(row => row.linkId === made.linkId);
  assert.deepEqual([listed.cancelled, listed.replaced], [false, false]);
});

test("F7M one refusal for unknown, cancelled, expired, replaced and edited-crew links; other tasks refuse and stale briefs say so", async () => {
  const { app, brief, crew, issue, page } = await f7m.setup();
  const task = brief.content.tasks[0];
  const refused = async (token, extra = {}) => {
    await assert.rejects(page.open(token), { code: "CREW_LINK_REFUSED" });
    const press = f7m.press(token, brief, task, extra);
    await assert.rejects(page.receive(press), { code: "CREW_LINK_REFUSED" });
    assert.deepEqual(await f7m.rows(press.commandId), []);
    assert.deepEqual(await f7m.events(press.commandId), []);
  };
  await refused("not-a-real-link");
  const cancelled = await issue();
  const cancel = { version: "v2-crew-link-command.v1", action: "cancel", commandId: randomUUID(), linkId: cancelled.linkId };
  await app.crewLinks.command(jobId, cancel);
  assert.equal((await app.crewLinks.command(jobId, cancel)).replayed, true);
  await refused(cancelled.token);
  // Expired: issued 20 days ago for one day, through the repository's clock.
  const { context } = await authenticatePracticeSession(runtime, (await f1Setup()).owner.sessionId);
  const { owner } = await f1Setup();
  const old = await new CrewLinkRepository(runtime, () => Date.now() - 20 * 86_400_000).command(context, jobId, owner.sessionId,
    { version: "v2-crew-link-command.v1", action: "issue", commandId: randomUUID(), crewId: crew.crewId, expiresInDays: 1 });
  await refused(old.token);
  // A newer link for the same crew member and trade replaces the older one.
  const older = await issue(), newer = await issue();
  await refused(older.token);
  assert.equal((await page.open(newer.token)).status, "open");
  // Editing the crew record (new revision) retires its links.
  await app.crewContacts.record({ version: "crew-contact.v1", commandId: randomUUID(), crewId: crew.crewId, expectedRevision: 1,
    displayName: "Ria Fictional", trade: "tiler", phone: "07700 900322", email: "ria@crew.jobguard-v2.invalid" });
  await refused(newer.token);
  const live = await issue();
  // A task outside this trade's brief is refused; a wrong brief version is stale.
  const outside = f7m.press(live.token, brief, { scopeItemId: randomUUID(), taskKey: task.taskKey });
  await assert.rejects(page.receive(outside), { code: "CREW_LINK_REFUSED" });
  await assert.rejects(page.receive(f7m.press(live.token, { version: brief.version + 1 }, task)), { code: "CREW_LINK_STALE" });
  // Another firm's crew member never gets a link.
  const outsider = await signIn("second-builder");
  const foreign = await createWorkspaceApplication({ pool: runtime, sessionId: outsider.sessionId }).crewContacts.record({
    version: "crew-contact.v1", commandId: randomUUID(), crewId: randomUUID(), expectedRevision: 0, displayName: "Other Firm",
    trade: "tiler", phone: "07700 900999", email: "other@crew.jobguard-v2.invalid" });
  await assert.rejects(issue({ crewId: foreign.crewId }), { code: "CREW_LINK_CREW_UNAVAILABLE" });
  await assert.rejects(createWorkspaceApplication({ pool: runtime, sessionId: outsider.sessionId }).crewLinks.read(jobId),
    { code: "NOT_FOUND" });
  // A plan edit after the brief: the page says changed and presses are stale until the brief is regenerated.
  const plan = await app.workPlan.read(jobId, planQuery);
  const planned = plan.tasks.find(item => item.scopeItemId === task.scopeItemId && item.key === task.taskKey);
  await app.workPlan.edit(jobId, planEdit(plan, planned, { durationMinutes: planned.durationMinutes + 5 }));
  assert.equal((await page.open(live.token)).brief.changed, true);
  await assert.rejects(page.receive(f7m.press(live.token, brief, task)), { code: "CREW_LINK_STALE" });
});

test("F7M tables are forced, append only and closed to the runtime and the second firm", async () => {
  const { brief, issue } = await f7m.setup();
  const made = await issue();
  await new CrewLinkPageApplication(runtime).receive(f7m.press(made.token, brief, brief.content.tasks[0]));
  const owner = await signIn("builder"), outsider = await signIn("second-builder");
  const { context } = await authenticatePracticeSession(runtime, owner.sessionId);
  const { context: shared } = await authenticatePracticeSession(runtime, outsider.sessionId);
  const query = (scope, sql, args) => withTenant(runtime, scope, db => db.$client.query(sql, args));
  const acl = async table => (await admin.query(`SELECT relrowsecurity AND relforcerowsecurity AS forced,
    has_table_privilege('jobguard_runtime',oid,'INSERT') AS can_insert,
    has_table_privilege('jobguard_runtime',oid,'UPDATE,DELETE,TRUNCATE') AS can_mutate
    FROM pg_class WHERE oid=$1::regclass`, [table])).rows[0];
  assert.deepEqual(await acl("app.v2_crew_link"), { forced: true, can_insert: true, can_mutate: false });
  assert.deepEqual(await acl("app.v2_crew_link_cancel"), { forced: true, can_insert: true, can_mutate: false });
  assert.deepEqual(await acl("app.v2_crew_progress"), { forced: true, can_insert: false, can_mutate: false });
  for (const fn of ["v2_crew_link_scope_open(text)", "v2_crew_link_view(app.v2_crew_link)", "v2_crew_link_audit_take(text,text,text,jsonb)"]) {
    const { rows } = await admin.query("SELECT to_regprocedure($1) AS oid", [`app.${fn}`]);
    if (rows[0].oid) assert.equal((await admin.query("SELECT has_function_privilege('jobguard_runtime',$1,'EXECUTE') AS ok",
      [rows[0].oid])).rows[0].ok, false, `${fn} is internal`);
  }
  for (const table of ["app.v2_crew_link", "app.v2_crew_progress"]) {
    for (const scope of [shared, outsider.realContext]) {
      assert.equal((await query(scope, `SELECT * FROM ${table} WHERE job_id=$1`, [jobId])).rowCount, 0);
    }
    assert.ok((await query(context, `SELECT * FROM ${table} WHERE job_id=$1`, [jobId])).rowCount > 0);
    for (const sql of [`UPDATE ${table} SET trade='x' WHERE job_id=$1`, `DELETE FROM ${table} WHERE job_id=$1`]) {
      await assert.rejects(query(context, sql, [jobId]), { code: "42501" });
    }
  }
  await assert.rejects(query(context, `INSERT INTO app.v2_crew_progress (tenant_id,job_id,command_id,crew_link_id,trade,brief_version,
    scope_item_id,task_key,kind,note,seen_head,request_digest) VALUES ($1,$2,$3,$4,'tiler',0,$5,'x','done','',0,$6)`,
  [DEMO_TENANT_ID, jobId, randomUUID(), made.linkId, randomUUID(), "0".repeat(64)]), { code: "42501" });
  await assert.rejects(admin.query("UPDATE app.v2_crew_link SET expires_at = expires_at WHERE id = $1", [made.linkId]));
});

// Plan check condition 1: a link shows unassigned tasks and the crew member's own, by ownerRef, never by name.
test("F7M a link hides a task assigned to another crew record, and refuses a press on it", async () => {
  const { app, crew, issue, crewBriefs, command, page } = await f7m.setup();
  const other = await app.crewContacts.record({ version: "crew-contact.v1", commandId: randomUUID(), crewId: randomUUID(),
    expectedRevision: 0, displayName: "Ria Fictional", trade: "tiler", phone: "07700 900322", email: "ria2@crew.jobguard-v2.invalid" });
  const plan = await app.workPlan.read(jobId, planQuery);
  const task = plan.tasks.find(item => item.trade === "tiler");
  await app.workPlan.edit(jobId, planEdit(plan, task, { assigneeRef: other.crewId }));
  const latest = (await app.briefProgress.read(jobId)).briefs.find(item => item.trade === "tiler");
  const brief = await crewBriefs.generate(jobId, command("tiler", { expectedVersion: latest.version, accessWindow: latest.content.accessWindow }));
  const visible = async crewId => (await page.open((await issue({ crewId })).token)).brief.tasks
    .some(row => row.scopeItemId === task.scopeItemId && row.taskKey === task.key);
  // Same display name, different crew record: only the assigned record sees the task.
  assert.equal(await visible(crew.crewId), false);
  assert.equal(await visible(other.crewId), true);
  const mine = await issue({ crewId: crew.crewId });
  const press = f7m.press(mine.token, brief, { scopeItemId: task.scopeItemId, taskKey: task.key });
  await assert.rejects(page.receive(press), { code: "CREW_LINK_REFUSED" });
  assert.equal((await f7m.rows(press.commandId)).length, 0);
});

// V2-F1 repair (Codex P2 4705000559): progress ids share the tenant-wide watchdog command namespace, both ways.
test("F1 progress command ids conflict with another watchdog command's id in both directions", async () => {
  const { owner } = await f1Setup();
  const app = createWorkspaceApplication({ pool: runtime, sessionId: owner.sessionId });
  const { context } = await authenticatePracticeSession(runtime, owner.sessionId);
  const { claimCommandIdentity } = await import("../../packages/db/dist/index.js");
  const brief = (await app.briefProgress.read(jobId)).briefs.find(item => item.trade === "tiler");
  const task = brief.content.tasks[0];
  const next = async () => Math.max(0, ...(await app.briefProgress.read(jobId)).progress
    .filter(row => row.trade === brief.trade && row.scopeItemId === task.scopeItemId && row.taskKey === task.taskKey).map(row => row.version));
  const claimAs = (commandId, kind) => withTenant(runtime, context, database => claimCommandIdentity(database,
    { tenantId: context.tenantId, commandId, jobId, kind, requestHash: "0".repeat(64) }));
  // Another command first: the progress press with its id is refused, with no row and no audit.
  const taken = randomUUID();
  assert.equal(await claimAs(taken, "readiness.record"), "new");
  const reused = progressCommand(brief, task, { commandId: taken, expectedVersion: await next() });
  await assert.rejects(app.briefProgress.record(jobId, reused), { code: "BRIEF_PROGRESS_COMMAND_CONFLICT" });
  assert.equal((await admin.query("SELECT 1 FROM app.v2_brief_progress WHERE command_id=$1", [taken])).rowCount, 0);
  assert.deepEqual(await progressEvents(taken), []);
  // Progress first: its id is claimed, so another kind of command can't reuse it, and the exact replay still returns the row.
  const press = progressCommand(brief, task, { expectedVersion: await next() });
  const saved = await app.briefProgress.record(jobId, press);
  assert.deepEqual((await admin.query("SELECT job_id, command_type FROM app.watchdog_command_identity WHERE command_id=$1",
    [press.commandId])).rows, [{ job_id: jobId, command_type: "v2.brief_progress.record" }]);
  await assert.rejects(claimAs(press.commandId, "readiness.record"), { code: "IDEMPOTENCY_CONFLICT" });
  assert.deepEqual(await app.briefProgress.record(jobId, press), saved);
  assert.equal((await progressEvents(press.commandId)).length, 1);
});

// V2-F1 repair (Codex P2 4707355984): a C3C crew assignment is part of the brief, so reassigning makes it outdated.
test("F1 briefs carry the linked crew assignment, and a reassignment needs a regenerated brief before progress", async () => {
  const { owner, crewBriefs, command } = await f1Setup();
  const app = createWorkspaceApplication({ pool: runtime, sessionId: owner.sessionId });
  const crew = name => app.crewContacts.record({ version: "crew-contact.v1", commandId: randomUUID(), crewId: randomUUID(),
    expectedRevision: 0, displayName: name, trade: "tiler", phone: "07700 900123", email: "crew@crew.jobguard-v2.invalid" });
  const [first, second] = [await crew("F1 Fictional Tiler A"), await crew("F1 Fictional Tiler B")];
  const assign = async crewId => {
    const plan = await app.workPlan.read(jobId, planQuery);
    const task = plan.tasks.find(item => item.trade === "tiler");
    await app.workPlan.edit(jobId, planEdit(plan, task, { assigneeRef: crewId }));
    return task;
  };
  const latest = async () => (await app.briefProgress.read(jobId)).briefs.find(item => item.trade === "tiler");
  const planTask = await assign(first.crewId);
  const brief = await crewBriefs.generate(jobId, command("tiler", { expectedVersion: (await latest()).version }));
  const briefTask = brief.content.tasks.find(item => item.scopeItemId === planTask.scopeItemId && item.taskKey === planTask.key);
  assert.equal(briefTask.ownerRef, first.crewId);
  assert.equal((await latest()).current, true);
  await assign(second.crewId);
  assert.equal((await latest()).current, false, "the reassigned brief reads outdated");
  const progress = (await app.briefProgress.read(jobId)).progress.filter(row => row.trade === "tiler"
    && row.scopeItemId === briefTask.scopeItemId && row.taskKey === briefTask.taskKey);
  const press = progressCommand(brief, briefTask, { expectedVersion: Math.max(0, ...progress.map(row => row.version)) });
  await assert.rejects(app.briefProgress.record(jobId, press), { code: "BRIEF_PROGRESS_REGENERATE" });
  assert.deepEqual(await progressEvents(press.commandId), []);
  const regenerated = await crewBriefs.generate(jobId, command("tiler", { expectedVersion: brief.version }));
  assert.equal(regenerated.content.tasks.find(item => item.taskKey === briefTask.taskKey && item.scopeItemId === briefTask.scopeItemId).ownerRef, second.crewId);
  assert.equal((await latest()).current, true);
  // A task with no linked crew record keeps the older content shape.
  assert.ok(regenerated.content.tasks.filter(item => item.scopeItemId !== briefTask.scopeItemId || item.taskKey !== briefTask.taskKey)
    .every(item => !("ownerRef" in item)));
});

// V2-F1: preserve the existing job-stage boundary and historical reads.
test("F1 refuses non-live and closed job presses without rows or audit", async () => {
  const owner = await signIn("builder");
  const app = createWorkspaceApplication({ pool: runtime, sessionId: owner.sessionId });
  const view = await app.briefProgress.read(jobId);
  const brief = view.briefs.find(item => item.trade === "tiler");
  const { draftJob } = await draftForPlan();
  const nonlive = progressCommand(brief, brief.content.tasks[0], { expectedVersion: 4 });
  await assert.rejects(app.briefProgress.record(draftJob, nonlive), { code: "JOB_NOT_LIVE" });
  assert.equal((await admin.query("SELECT 1 FROM app.v2_brief_progress WHERE command_id=$1", [nonlive.commandId])).rowCount, 0);
  const state = await app.workState.get(jobId);
  await app.workState.command(jobId, { version: "job-work-state-command.v1", commandId: randomUUID(), action: "close",
    expectedRevision: (state.events.at(-1)?.sequence ?? 0) + state.links.length,
    reason: "cancelled_by_customer", note: "F1 fictional closing fixture" });
  // F1-P's block runs first and adds rows for this task, so read the current version rather than a literal.
  const task = brief.content.tasks[0];
  const current = Math.max(0, ...(await app.briefProgress.read(jobId)).progress
    .filter(row => row.trade === brief.trade && row.scopeItemId === task.scopeItemId && row.taskKey === task.taskKey).map(row => row.version));
  const closed = progressCommand(brief, task, { expectedVersion: current });
  await assert.rejects(app.briefProgress.record(jobId, closed), { message: "JOB_WORK_CLOSED" });
  assert.equal((await admin.query("SELECT 1 FROM app.v2_brief_progress WHERE command_id=$1", [closed.commandId])).rowCount, 0);
  assert.deepEqual(await progressEvents(closed.commandId), []);
  assert.deepEqual((await app.briefProgress.read(jobId)).progress, view.progress);
});

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
