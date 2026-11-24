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

// ---- V2 b1a walk session record ----
const { createWorkspaceApplication: walkWorkspace } = await import("../../apps/api/dist/workspace/index.js");
const walkId = () => globalThis.crypto.randomUUID();
const HOUR = 3_600_000;
const walkQuery = { version: "v2-walk-query.v1" };
let walkFixture;

// The existing upload path accepts photos only on live jobs, and no seeded job is live. These
// fixture rows stand in for an upload with the same ID so the walk can read its verification.
async function walkFixtureSql(sql, params) {
  await admin.query("BEGIN");
  try {
    await admin.query("SET LOCAL session_replication_role = replica");
    await admin.query(sql, params);
    await admin.query("COMMIT");
  } catch (error) {
    await admin.query("ROLLBACK");
    throw error;
  }
}

async function walkUpload(tenantId, uploadJobId, id = walkId()) {
  await walkFixtureSql(`INSERT INTO app.evidence_upload (id, tenant_id, job_id, object_key, expected_sha256,
    expected_content_type, maximum_bytes, retention_class, device_captured_at, expires_at)
    VALUES ($1, $2, $3, $4, repeat('a', 64), 'image/jpeg', 1000000, 'transient_upload', now() - interval '3 days',
      now() + interval '1 day')`, [id, tenantId, uploadJobId, `tenants/${tenantId}/uploads/${id}/original`]);
  return id;
}

async function walkDraftJob(sessionId, title) {
  const { capture } = walkWorkspace({ pool: runtime, sessionId });
  const saved = await capture.create({
    contractVersion: "job_capture_v1", requested_tenant_id: DEMO_TENANT_ID, captureId: walkId(),
    fixtureId: "v2-b1a-walk-" + walkId(),
    source: { kind: "text", text: `JOB: ${title}\nITEM: Paint a fictional door | QTY: 1 | UNIT: item | RATE: £40.00` },
  });
  return saved.jobId;
}

function walkSetup() {
  walkFixture ??= (async () => {
    process.env.JOBGUARD_LOCAL_V2 = "1";
    const owner = await signIn("builder");
    const outsider = await signIn("second-builder");
    const { context: ownerContext } = await authenticatePracticeSession(runtime, owner.sessionId);
    const { context: outsiderContext } = await authenticatePracticeSession(runtime, outsider.sessionId);
    const otherJob = await walkDraftJob(owner.sessionId, "A second fictional job in the same firm");
    const outsiderJob = await walkDraftJob(outsider.sessionId, "The second firm's fictional job");
    return {
      owner, outsider, ownerContext, outsiderContext, otherJob, outsiderJob,
      walk: walkWorkspace({ pool: runtime, sessionId: owner.sessionId }).walk,
      outsiderWalk: walkWorkspace({ pool: runtime, sessionId: outsider.sessionId }).walk,
    };
  })();
  return walkFixture;
}

const entryCommand = (sessionId, captureOrder, entry, deviceCapturedAt, extra = {}) => ({
  version: "v2-walk-entry-command.v1", sessionId, commandId: walkId(), captureOrder, expectedVersion: 0,
  deviceCapturedAt: deviceCapturedAt.toISOString(), entry, ...extra,
});

async function walkScript(walk, deviceOffset, { order = [1, 2, 3, 4, 5, 6], sameTime = false } = {}) {
  const sessionId = walkId();
  const start = new Date(Date.now() + deviceOffset);
  await walk.start(jobId, { version: "v2-walk-session-command.v1", sessionId, deviceStartedAt: start.toISOString() });
  // Photo IDs come from the phone, in the evidence upload ID space.
  const kitchenPhoto = walkId();
  const hallPhoto = walkId();
  const entries = [
    { kind: "room", room: "Kitchen" },
    { kind: "photo", photoId: kitchenPhoto },
    { kind: "note", text: "Splashback runs the full worktop length." },
    { kind: "room", room: "Hall" },
    { kind: "measurement", quantity: "14.5", unit: "m²", text: "Walls only." },
    { kind: "photo", photoId: hallPhoto, text: "Scuffed skirting by the door." },
  ];
  const commands = entries.map((entry, index) => entryCommand(sessionId, index + 1, entry,
    new Date(start.getTime() + (sameTime ? 0 : index * 60_000))));
  for (const position of order) await walk.record(jobId, commands[position - 1]);
  return { sessionId, commands, kitchenPhoto, hallPhoto };
}

const links = session => session.entries.map(entry => [entry.captureOrder, entry.kind, entry.linkedRoom, entry.link]);
const expectedLinks = [
  [1, "room", "Kitchen", "room"], [2, "photo", "Kitchen", "linked"], [3, "note", "Kitchen", "linked"],
  [4, "room", "Hall", "room"], [5, "measurement", "Hall", "linked"], [6, "photo", "Hall", "linked"],
];

test("walk room links are identical with the device clock 24 hours wrong either way, and the difference is flagged", async () => {
  const { walk } = await walkSetup();
  const sessions = [];
  for (const offset of [0, 24 * HOUR, -24 * HOUR]) {
    const { sessionId } = await walkScript(walk, offset);
    const [session] = await walk.read(jobId, { ...walkQuery, sessionId });
    assert.deepEqual(links(session), expectedLinks);
    sessions.push(session);
  }
  assert.ok(sessions[0].entries.every(entry => !entry.clock.flagged));
  for (const [session, sign] of [[sessions[1], -1], [sessions[2], 1]]) {
    for (const entry of session.entries) {
      assert.equal(entry.clock.flagged, true);
      assert.equal(Math.sign(entry.clock.differenceSeconds), sign);
      assert.ok(Math.abs(Math.abs(entry.clock.differenceSeconds) - 24 * 3600) < 3600);
    }
  }
});

test("walk entries out of order with identical device times keep each photo with its room, and an exact retry adds nothing", async () => {
  const { walk } = await walkSetup();
  const { sessionId, commands, kitchenPhoto, hallPhoto } = await walkScript(walk, 0, { order: [6, 2, 5], sameTime: true });
  const [early] = await walk.read(jobId, { ...walkQuery, sessionId });
  assert.deepEqual(links(early), [[2, "photo", null, "waiting"], [5, "measurement", null, "waiting"], [6, "photo", null, "waiting"]]);
  // Once the Hall marker arrives, entries after it are settled even though earlier numbers are still missing.
  await walk.record(jobId, commands[3]);
  const [hall] = await walk.read(jobId, { ...walkQuery, sessionId });
  assert.deepEqual(links(hall), [[2, "photo", null, "waiting"], [4, "room", "Hall", "room"],
    [5, "measurement", "Hall", "linked"], [6, "photo", "Hall", "linked"]]);
  for (const position of [1, 3]) await walk.record(jobId, commands[position - 1]);
  const count = async () => (await admin.query("SELECT count(*)::int AS n FROM app.v2_walk_entry WHERE session_id = $1",
    [sessionId])).rows[0].n;
  assert.equal(await count(), 6);
  const first = await walk.read(jobId, { ...walkQuery, sessionId });
  assert.deepEqual(links(first[0]), expectedLinks);
  assert.equal(first[0].entries.find(entry => entry.photoId === kitchenPhoto).linkedRoom, "Kitchen");
  assert.equal(first[0].entries.find(entry => entry.photoId === hallPhoto).linkedRoom, "Hall");
  assert.equal(new Set(first[0].entries.map(entry => entry.deviceCapturedAt.getTime())).size, 1);

  const retried = await Promise.all([walk.record(jobId, commands[1]), walk.record(jobId, commands[1])]);
  assert.deepEqual(retried[0], retried[1]);
  assert.equal(retried[0].commandId, commands[1].commandId);
  assert.equal(await count(), 6);
  assert.equal((await walkAudit("v2_walk.entry_recorded", sessionId)).length, 6);
  assert.deepEqual(await walk.read(jobId, { ...walkQuery, sessionId }), first);
});

test("a walk photo from another job in the same firm, or from another firm, is refused", async () => {
  const { walk, outsiderWalk, otherJob, outsiderJob, ownerContext } = await walkSetup();
  const now = new Date();
  const begin = async (app, walkJob) => {
    const sessionId = walkId();
    await app.start(walkJob, { version: "v2-walk-session-command.v1", sessionId, deviceStartedAt: now.toISOString() });
    await app.record(walkJob, entryCommand(sessionId, 1, { kind: "room", room: "Kitchen" }, now));
    return sessionId;
  };
  const sessionId = await begin(walk, jobId);
  // Filed on another job of the same firm, uploaded for another job, and filed by the second firm.
  const sameFirm = walkId();
  await walk.record(otherJob, entryCommand(await begin(walk, otherJob), 2, { kind: "photo", photoId: sameFirm }, now));
  const uploadedElsewhere = await walkUpload(DEMO_TENANT_ID, otherJob);
  const otherFirm = walkId();
  await outsiderWalk.record(outsiderJob,
    entryCommand(await begin(outsiderWalk, outsiderJob), 2, { kind: "photo", photoId: otherFirm }, now));
  for (const photoId of [sameFirm, uploadedElsewhere, otherFirm]) {
    await assert.rejects(walk.record(jobId, entryCommand(sessionId, 2, { kind: "photo", photoId }, now)),
      { code: "WALK_PHOTO_REFUSED" });
  }
  // The table refuses them too, whatever path writes them.
  const { rows: [{ actor }] } = await admin.query("SELECT actor_membership_id AS actor FROM app.v2_walk_session WHERE id = $1", [sessionId]);
  for (const [photoId, code] of [[sameFirm, "23505"], [uploadedElsewhere, "23514"], [otherFirm, "23505"]]) {
    await assert.rejects(withTenant(runtime, ownerContext, db => db.$client.query(`INSERT INTO app.v2_walk_entry
      (tenant_id, job_id, session_id, capture_order, expected_version, command_id, kind, photo_id, device_captured_at, actor_membership_id)
      VALUES ($1, $2, $3, 2, 0, $4, 'photo', $5, now(), $6)`, [DEMO_TENANT_ID, jobId, sessionId, walkId(), photoId, actor])),
    { code });
  }
  const filed = walkId();
  await walk.record(jobId, entryCommand(sessionId, 2, { kind: "photo", photoId: filed }, now));
  await assert.rejects(walk.record(jobId, entryCommand(sessionId, 3, { kind: "photo", photoId: filed }, now)),
    { code: "WALK_PHOTO_ALREADY_FILED" });
  assert.equal((await admin.query("SELECT count(*)::int AS n FROM app.v2_walk_entry WHERE session_id = $1", [sessionId])).rows[0].n, 2);
  assert.equal((await admin.query("SELECT count(*)::int AS n FROM app.v2_walk_entry WHERE photo_id = ANY($1)",
    [[sameFirm, uploadedElsewhere, otherFirm]])).rows[0].n, 2);
});

test("walk device claim, server receipt and photo verification stay distinct in every stored row", async () => {
  const { walk } = await walkSetup();
  const claimed = new Date(Date.now() - 6 * HOUR);
  const before = new Date();
  const { sessionId, commands, hallPhoto } = await walkScript(walk, -6 * HOUR);
  const after = new Date();
  const { rows } = await admin.query(`SELECT capture_order, device_captured_at, server_received_at
    FROM app.v2_walk_entry WHERE session_id = $1 ORDER BY capture_order`, [sessionId]);
  assert.equal(rows.length, 6);
  for (const row of rows) {
    const sent = new Date(commands[row.capture_order - 1].deviceCapturedAt);
    assert.equal(row.device_captured_at.getTime(), sent.getTime());
    assert.ok(row.server_received_at >= before && row.server_received_at <= after);
    assert.notEqual(row.device_captured_at.getTime(), row.server_received_at.getTime());
    assert.ok(Math.abs(sent - claimed) < 10 * 60_000);
  }
  const photo = async () => (await walk.read(jobId, { ...walkQuery, sessionId }))[0].entries.find(entry => entry.photoId === hallPhoto);
  assert.deepEqual((await photo()).photo, { state: "not_uploaded", verifiedAt: null });
  await walkUpload(DEMO_TENANT_ID, jobId, hallPhoto);
  const pending = await photo();
  assert.deepEqual(pending.photo, { state: "pending", verifiedAt: null });

  await walkFixtureSql(`UPDATE app.evidence_upload SET state = 'verified', object_version_id = 'fixture-v1',
    server_verified_at = clock_timestamp() WHERE id = $1`, [hallPhoto]);
  const verified = await photo();
  assert.equal(verified.photo.state, "verified");
  assert.ok(verified.photo.verifiedAt > verified.serverReceivedAt);
  assert.equal(verified.deviceCapturedAt.getTime(), pending.deviceCapturedAt.getTime());
  assert.equal(verified.serverReceivedAt.getTime(), pending.serverReceivedAt.getTime());
  const { rows: [upload] } = await admin.query("SELECT device_captured_at, server_received_at, server_verified_at FROM app.evidence_upload WHERE id = $1", [hallPhoto]);
  assert.equal(new Set([upload.device_captured_at, upload.server_received_at, upload.server_verified_at, verified.deviceCapturedAt]
    .map(value => value.getTime())).size, 4);
});

const walkAudit = async (eventType, sessionId) => (await admin.query(`SELECT actor_ref AS "actorRef", payload
  FROM app.audit_event WHERE subject_type = 'job' AND subject_ref = $1 AND event_type = $2
    AND payload->'references'->>'sessionId' = $3 ORDER BY sequence`, [jobId, eventType, sessionId])).rows;

test("a replayed walk entry is recorded once, and a stale version or changed retry is refused", async () => {
  const { walk, owner } = await walkSetup();
  const now = new Date();
  const sessionId = walkId();
  const start = { version: "v2-walk-session-command.v1", sessionId, deviceStartedAt: now.toISOString() };
  const session = await walk.start(jobId, start);
  assert.deepEqual(await walk.start(jobId, start), session);
  const started = await walkAudit("v2_walk.session_started", sessionId);
  assert.equal(started.length, 1);
  assert.equal(started[0].actorRef, `membership:${owner.membershipId}`);
  await assert.rejects(walk.start(jobId, { ...start, deviceStartedAt: new Date(now.getTime() + 1000).toISOString() }),
    { code: "WALK_SESSION_CONFLICT" });

  const note = entryCommand(sessionId, 1, { kind: "note", text: "Check the boiler cupboard." }, now);
  const saved = await walk.record(jobId, note);
  assert.deepEqual(await walk.record(jobId, note), saved);
  await assert.rejects(walk.record(jobId, { ...note, entry: { kind: "note", text: "Something else." } }),
    { code: "WALK_COMMAND_CONFLICT" });
  await assert.rejects(walk.record(jobId, { ...note, commandId: walkId() }), { code: "WALK_VERSION_CONFLICT" });

  const revisions = [1, 2].map(index => ({ ...note, commandId: walkId(), expectedVersion: 1,
    entry: { kind: "note", text: `Check the boiler cupboard, revision ${index}.` } }));
  const raced = await Promise.allSettled(revisions.map(command => walk.record(jobId, command)));
  assert.equal(raced.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(raced.find(result => result.status === "rejected").reason.code, "WALK_VERSION_CONFLICT");
  await assert.rejects(walk.record(jobId, { ...note, commandId: walkId(), expectedVersion: 1 }), { code: "WALK_VERSION_CONFLICT" });
  await assert.rejects(walk.record(jobId, { ...note, commandId: walkId(), expectedVersion: 2, entry: { kind: "room", room: "Hall" } }),
    { code: "WALK_ENTRY_KIND_FIXED" });

  // One audit event per stored revision, none for replays or refusals, and no note words in the chain.
  const recorded = await walkAudit("v2_walk.entry_recorded", sessionId);
  assert.equal(recorded.length, 2);
  assert.deepEqual(recorded.map(event => [event.payload.references.commandId, event.payload.references.entryVersion,
    event.payload.references.captureOrder, event.payload.references.kind]),
  [[note.commandId, "1", "1", "note"], [raced.find(result => result.status === "fulfilled").value.commandId, "2", "1", "note"]]);
  assert.ok(recorded.every(event => event.actorRef === `membership:${owner.membershipId}`));
  assert.ok(!JSON.stringify(recorded).includes("boiler"));
  assert.equal((await walkAudit("v2_walk.session_started", sessionId)).length, 1);

  const [read] = await walk.read(jobId, { ...walkQuery, sessionId });
  assert.equal(read.entries.length, 1);
  assert.equal(read.entries[0].version, 2);
  const { rows } = await admin.query(`SELECT expected_version, note_text FROM app.v2_walk_entry
    WHERE session_id = $1 ORDER BY expected_version`, [sessionId]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].note_text, "Check the boiler cupboard.");
  assert.equal(read.entries[0].text, rows[1].note_text);
  await assert.rejects(walk.record(jobId, { ...note, version: "v2-walk-entry-command.v0" }), { code: "WALK_INVALID_COMMAND" });
  await assert.rejects(walk.record(jobId, { ...note, commandId: walkId(), entry: { kind: "audio", clip: "x" } }), { code: "WALK_INVALID_COMMAND" });
});

test("forced walk policies hide sessions and entries and reject every change from the second firm", async () => {
  const { walk, outsiderWalk, outsider, outsiderContext, ownerContext } = await walkSetup();
  const { sessionId, commands } = await walkScript(walk, 0);
  await assert.rejects(outsiderWalk.read(jobId, walkQuery), { code: "NOT_FOUND" });
  await assert.rejects(outsiderWalk.start(jobId, { version: "v2-walk-session-command.v1", sessionId: walkId(),
    deviceStartedAt: new Date().toISOString() }), { code: "NOT_FOUND" });
  await assert.rejects(outsiderWalk.record(jobId, { ...commands[2], commandId: walkId(), expectedVersion: 1 }), { code: "NOT_FOUND" });

  for (const table of ["app.v2_walk_session", "app.v2_walk_entry"]) {
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
  }
  const { rows: [{ actor }] } = await admin.query("SELECT actor_membership_id AS actor FROM app.v2_walk_session WHERE id = $1", [sessionId]);
  const query = (scope, sql, params) => withTenant(runtime, scope, db => db.$client.query(sql, params));
  assert.equal((await query(ownerContext, "SELECT * FROM app.v2_walk_entry WHERE session_id = $1", [sessionId])).rowCount, 6);
  for (const scope of [outsider.realContext, outsiderContext]) {
    for (const table of ["app.v2_walk_session", "app.v2_walk_entry"]) {
      const column = table.endsWith("session") ? "id" : "session_id";
      assert.equal((await query(scope, `SELECT * FROM ${table} WHERE ${column} = $1`, [sessionId])).rowCount, 0);
      await assert.rejects(query(scope, `UPDATE ${table} SET job_id = job_id WHERE ${column} = $1`, [sessionId]), { code: "42501" });
      await assert.rejects(query(scope, `DELETE FROM ${table} WHERE ${column} = $1`, [sessionId]), { code: "42501" });
    }
    await assert.rejects(query(scope, `INSERT INTO app.v2_walk_session (tenant_id, job_id, id, actor_membership_id, device_started_at)
      VALUES ($1, $2, $3, $4, now())`, [DEMO_TENANT_ID, jobId, walkId(), actor]), { code: "42501", message: /row-level security policy/u });
    await assert.rejects(query(scope, `INSERT INTO app.v2_walk_entry (tenant_id, job_id, session_id, capture_order, expected_version,
      command_id, kind, note_text, device_captured_at, actor_membership_id)
      VALUES ($1, $2, $3, 7, 0, $4, 'note', 'Not theirs.', now(), $5)`, [DEMO_TENANT_ID, jobId, sessionId, walkId(), actor]),
    { code: "42501", message: /row-level security policy/u });
  }
  assert.equal((await runtime.query("SELECT * FROM app.v2_walk_entry WHERE session_id = $1", [sessionId])).rowCount, 0);
  assert.equal((await admin.query("SELECT count(*)::int AS n FROM app.v2_walk_entry WHERE session_id = $1", [sessionId])).rows[0].n, 6);
  const { rows: [{ outbox }] } = await admin.query("SELECT count(*)::int AS outbox FROM app.action_outbox");
  assert.equal(outbox, 1);
});
