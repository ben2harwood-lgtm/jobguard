import { createServer, type Server } from "node:http";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { NextRequest } from "next/server";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { migrate } from "@jobguard/db";
import { closeTestDatabase, freePort, installAuditCommandWriterRoles } from "../../../../packages/db/test/pool-test-utils.js";
import { pilotApprovalFixture, unavailablePilotApproval, unavailablePilotApprovals } from "../../../../packages/config/src/policy-gates.pilot-test-fixture.js";
import { pilotSessionCookie } from "../../../../packages/config/src/pilot-resources.js";
import { GET } from "../api/jobs/route";
import { POST as captureJob } from "../api/jobs/capture/route";
import { POST as saveReview } from "../api/jobs/[id]/review/route";
import { POST as confirmScope } from "../api/jobs/[id]/confirm/route";
import { POST as saveProfile } from "../api/firm-profile/route";
import { POST as saveParties } from "../api/jobs/[id]/parties/route";
import { GET as readQuote, POST as saveQuote } from "../api/jobs/[id]/quotes/route";
import { POST as previewQuote } from "../api/jobs/[id]/quotes/preview/route";
import { POST as issueQuote } from "../api/jobs/[id]/quotes/delivery/route";
import { GET as readArtifact } from "../api/jobs/[id]/quotes/artifacts/[artifactId]/route";

import { GET as readAcceptance, POST as recordAcceptance } from "../api/jobs/[id]/quotes/acceptance/route";
import { POST as activateJob } from "../api/jobs/[id]/quotes/activation/route";
import { GET as readProgress, POST as changeProgress } from "../api/jobs/[id]/work-state/route";
import { GET as readExtras, POST as logExtra } from "../api/jobs/[id]/variations/route";
import { GET as readProof, POST as saveProof } from "../api/jobs/[id]/proof/route";
import { GET as readFinalAccount, POST as assembleFinalAccount } from "../api/jobs/[id]/final-account/route";
import { POST as lockFinalAccount } from "../api/jobs/[id]/final-account/lock/route";
import { POST as recordScopeDisposition } from "../api/jobs/[id]/final-account/dispositions/route";
import { GET as readFinalCheck } from "../api/jobs/[id]/final-check/route";
import { GET as readFinalCheckDisputes } from "../api/jobs/[id]/final-check/disputes/route";
import { POST as confirmFinalCheckCatch } from "../api/jobs/[id]/final-check/catches/route";
import { POST as issuePilotInvoice } from "../api/jobs/[id]/customer-invoices/route";




const { cookieJar, blockedPractice } = vi.hoisted(() => ({ cookieJar: new Map<string, { value: string }>(), blockedPractice: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => cookieJar }));
vi.mock("./synthetic-server", () => ({
  hasSyntheticSession: (...args: unknown[]) => blockedPractice(...args),
  syntheticWorkspace: (...args: unknown[]) => blockedPractice(...args),
}));
vi.mock("./workspace-server", () => ({ workspaceApplication: (...args: unknown[]) => blockedPractice(...args) }));

import { closeIdentityApplication } from "./identity-server";

const origin = "https://pilot-boundary.invalid";
const secret = "fictional identity boundary signing fixture";
const credential = randomUUID();
const runtimePassword = randomUUID(), identityPassword = randomUUID();
const database = "jobguard_pilot_boundary";
const csrf = "fictional-boundary-csrf-token";
const tenantA = randomUUID(), tenantB = randomUUID(), jobA = randomUUID(), jobB = randomUUID();
const practiceJob = randomUUID(), contractorJob = randomUUID(), practiceSession = "s".repeat(43), memberSession = "m".repeat(43);
const member = randomUUID();
let storage: Server;
const objectVersionId = "fictional-version-1";
let admin: Pool, postgres: EmbeddedPostgres, directory: string, port: number;
const url = (user: string, db = database) => {
  const password = user === "jobguard_runtime" ? runtimePassword : user === "jobguard_identity" ? identityPassword : credential;
  return `postgresql://${user}:${password}@127.0.0.1:${port}/${db}`;
};
function configure(env: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
}
function request(tenantId = tenantA, jobId?: string, tenantHeader?: string) {
  const query = new URLSearchParams({ tenantId });
  if (jobId) query.set("jobId", jobId);
  return GET(new NextRequest(`${origin}/api/jobs?${query}`, {
    headers: { origin, "x-csrf-token": csrf, ...(tenantHeader ? { "x-tenant-id": tenantHeader } : {}) },
  }));
}

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "jobguard-pilot-boundary-"));
  port = await freePort(57200, 100);
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: credential, persistent: true,
    createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase(database);
  admin = new Pool({ connectionString: url("postgres") });
  await installAuditCommandWriterRoles(admin);
  await migrate(admin);
  await admin.query(`ALTER ROLE jobguard_runtime LOGIN PASSWORD '${runtimePassword}'`);
  await admin.query(`ALTER ROLE jobguard_identity LOGIN PASSWORD '${identityPassword}'`);

  const user = randomUUID(), account = randomUUID();
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [user]);
  await admin.query("INSERT INTO identity.user_email(email,user_id) VALUES('boundary@fictional.invalid',$1)", [user]);
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1),($2)", [tenantA, tenantB]);
  await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES ($1,$2,'Fictional account')", [account, tenantA]);
  await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES ($1,$2,$3,$4,'owner')", [member, tenantA, account, user]);
  await admin.query("INSERT INTO identity.membership_locator(user_id,tenant_id,membership_id) VALUES($1,$2,$3)", [user, tenantA, member]);
  for (const [environment, sessionToken] of [["pilot_no_charge", memberSession], ["synthetic_demo", practiceSession]]) {
    const digest = createHmac("sha256", secret).update(`session:${sessionToken}`).digest("hex");
    await admin.query("INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at) VALUES ($1,$2,$3,$4,$5,now()+interval '1 hour')", [randomUUID(),user,environment,digest,csrf]);
  }
  for (const [tenant, job, track, environment] of [
    [tenantA, jobA, "small_builder", "pilot_no_charge"],
    [tenantB, jobB, "small_builder", "pilot_no_charge"],
    [tenantA, practiceJob, "small_builder", "synthetic_demo"],
    [tenantA, contractorJob, "contractor", "synthetic_demo"],
  ]) {
    await admin.query("INSERT INTO app.job(tenant_id,id,title) VALUES($1,$2,'Fictional job')", [tenant,job]);
    await admin.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES($1,$2,$3,$4,'quote_activation')", [tenant,job,track,environment]);
  }
  const objects = new Map<string, { bytes: Buffer; type: string }>();
  storage = createServer(async (req, res) => {
    const target = new URL(req.url!, "http://127.0.0.1");
    if (!req.headers.authorization && !target.searchParams.has("X-Amz-Signature")) {
      res.writeHead(403).end();
      return;
    }
    if (target.searchParams.has("versioning")) {
      res.setHeader("Content-Type", "application/xml");
      res.end("<VersioningConfiguration><Status>Enabled</Status></VersioningConfiguration>");
      return;
    }
    if (req.method === "PUT") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const version = objects.has(`${target.pathname}/${objectVersionId}`) ? randomUUID() : objectVersionId;
      objects.set(`${target.pathname}/${version}`, { bytes: Buffer.concat(chunks), type: String(req.headers["content-type"]) });
      res.setHeader("x-amz-version-id", version);
      res.end();
      return;
    }
    const version = target.searchParams.get("versionId");
    const item = objects.get(`${target.pathname}/${version}`);
    if (!item || !version) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "x-amz-version-id": version, "Content-Type": item.type, "Content-Length": item.bytes.length });
    res.end(req.method === "HEAD" ? undefined : item.bytes);
  });
  await new Promise<void>(resolve => storage.listen(0, "127.0.0.1", resolve));
  const storageAddress = storage.address();
  if (!storageAddress || typeof storageAddress === "string") throw new Error("Missing fixture storage port");
  const bindings = {
    PILOT_RUNTIME_DATABASE_URL: url("jobguard_runtime"),
    IDENTITY_DATABASE_URL: url("jobguard_identity"),
    AUTH_CODE_SECRET: secret,
    AUTH_ALLOWED_ORIGIN: origin,
    PILOT_API_ORIGIN: "https://pilot-api-boundary.invalid",
    S3_ENDPOINT: `http://127.0.0.1:${storageAddress.port}`,
    S3_REGION: "fictional",
    S3_BUCKET: "jobguard-pilot-evidence",
    S3_ACCESS_KEY_ID: "fictional-pilot-access",
    S3_SECRET_ACCESS_KEY: "fictional-pilot-storage-secret",
  };
  const sha256 = Object.fromEntries(Object.entries(bindings).map(([key, value]) =>
    [key, createHash("sha256").update(value).digest("hex")]));
  configure({
    ...pilotApprovalFixture().env,
    JOBGUARD_HOSTING: "cloudflare", // Single-use runtime connections.
    ...bindings,
    JOBGUARD_PILOT_RESOURCES: JSON.stringify({ version: "pilot-resources.v1", sha256 }),
  });
}, 120_000);

afterAll(async () => {
  vi.unstubAllEnvs();
  await closeIdentityApplication();
  if (storage) await new Promise<void>(resolve => storage.close(() => resolve()));
  if (postgres) await closeTestDatabase(postgres, directory, admin);
});

it("lists only the verified member's pilot jobs through the Next route and gives no practice fallback", async () => {
  cookieJar.set(pilotSessionCookie, { value: memberSession });
  const result = await request();
  expect(result.status).toBe(200);
  expect(result.headers.get("Cache-Control")).toBe("no-store");
  expect(await result.json()).toMatchObject({ tenantId: tenantA, jobs: [{ id: jobA, tenantId: tenantA, pilotNoCharge: true }] });
  expect((await request(tenantA, jobA)).status).toBe(200);
  for (const foreignId of [jobB, practiceJob, contractorJob]) expect((await request(tenantA, foreignId)).status).toBe(404);
  expect((await request(tenantB)).status).toBe(403);
  expect((await request(tenantA, undefined, tenantB)).status).toBe(403);
  expect(blockedPractice).not.toHaveBeenCalled();
});

it("rejects practice cookies, synthetic persisted sessions, and privileged runtime configuration", async () => {
  cookieJar.set(pilotSessionCookie, { value: memberSession });
  cookieJar.set("jg_session", { value: practiceSession });
  expect((await request()).status).toBe(401);
  cookieJar.delete("jg_session");
  cookieJar.set(pilotSessionCookie, { value: practiceSession });
  expect((await request()).status).toBe(401);
  cookieJar.set(pilotSessionCookie, { value: memberSession });
  vi.stubEnv("PILOT_RUNTIME_DATABASE_URL", url("postgres"));
  expect((await request()).status).toBe(503);
  vi.stubEnv("PILOT_RUNTIME_DATABASE_URL", url("jobguard_runtime"));
  expect(blockedPractice).not.toHaveBeenCalled();
});

it("refuses the old cookie name even when its value is a current pilot session", async () => {
  cookieJar.set(pilotSessionCookie, { value: memberSession });
  cookieJar.set("jobguard_session", { value: memberSession });
  try { expect((await request()).status).toBe(401); }
  finally { cookieJar.delete("jobguard_session"); }
});

it.each(unavailablePilotApprovals)("refuses the request when PILOT-21 evidence is %s", async (_name, value) => {
  configure(unavailablePilotApproval(value));
  cookieJar.set(pilotSessionCookie, { value: memberSession });
  const result = await request();
  expect(result.status).toBe(403);
  expect(await result.json()).toEqual({ code: "PILOT_G1_CLOSED" });
  expect(blockedPractice).not.toHaveBeenCalled();
});

it("refuses a revoked membership at the same boundary", async () => {
  configure(pilotApprovalFixture().env);
  await admin.query("UPDATE app.membership SET revoked_at=now() WHERE tenant_id=$1 AND id=$2", [tenantA, member]);
  cookieJar.set(pilotSessionCookie, { value: memberSession });
  expect((await request()).status).toBe(403);
});

function pilotRequest(path: string, body?: unknown, tenant = tenantA) {
  return new NextRequest(`${origin}/api/${path}`, { method: body === undefined ? "GET" : "POST",
    headers: { ...(body === undefined ? {} : { origin, "content-type": "application/json" }),
      "x-csrf-token": csrf, "x-tenant-id": tenant },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function readOk(response: Response) {
  const body = await response.json();
  expect(response.ok, JSON.stringify(body)).toBe(true);
  return body;
}

it("captures, confirms and stages the exact pilot PDF and invitation through bound Next routes", async () => {
  configure(pilotApprovalFixture().env);
  await admin.query("UPDATE app.membership SET revoked_at=NULL WHERE id=$1", [member]);
  cookieJar.set(pilotSessionCookie, { value: memberSession });
  const capture = { contractVersion: "job_capture_v1", requested_tenant_id: tenantA, captureId: randomUUID(),
    source: { kind: "text", text: "JOB: Fictional shed\nITEM: Paint shed | 1 item | £100.00" },
    fixtureId: "deterministic-local-v1" };
  expect((await captureJob(pilotRequest("jobs/capture", { ...capture, requested_tenant_id: tenantB }))).status).toBe(403);
  const created = await readOk(await captureJob(pilotRequest("jobs/capture", capture)));
  expect(created.environment).toBe("pilot_no_charge");
  expect((await readOk(await captureJob(pilotRequest("jobs/capture", capture)))).jobId).toBe(created.jobId);
  expect((await readOk(await request())).jobs.map((job: { id: string }) => job.id)).toContain(created.jobId);
  const id: string = created.jobId;
  const route = { params: Promise.resolve({ id }) };
  const path = `jobs/${id}`;
  const review = { version: "proposal_review_v1", reviewId: created.reviewId, proposalId: created.proposalId, jobId: id, revision: 0,
    lines: created.proposal.lines.map((line: { id: string; scopeItemId: string; description: { value: string }; sourceExcerpt: string }) => ({
      id: line.id, scopeItemId: line.scopeItemId, description: line.description.value, quantity: "1", unit: "item", unitPricePence: 10000,
      room: "Shed", category: "Work", origin: "proposal", disposition: "accepted", dismissalReason: null,
      parentScopeItemIds: [], sourceExcerpt: line.sourceExcerpt,
    })),
    questions: created.proposal.questions.map(({ question }: { question: { value: string } }) => ({
      id: randomUUID(), question: question.value, blocking: true, disposition: "answered", answer: "Confirmed from the fixture",
    })),
  };
  await readOk(await saveReview(pilotRequest(`${path}/review`, { contractVersion: "proposal_review_command_v1", expectedRevision: 0, review }), route));
  const confirm = { contractVersion: "proposal_review_confirm_v1", commandId: randomUUID(), expectedRevision: 1 };
  expect((await confirmScope(pilotRequest(`${path}/confirm`, { ...confirm, expectedRevision: 2 }), route)).status).toBe(409);
  await readOk(await confirmScope(pilotRequest(`${path}/confirm`, confirm), route));
  await readOk(await saveProfile(pilotRequest("firm-profile", { version: "firm-profile.v1", tradingName: "Fictional Pilot Works",
    addressLines: ["1 Fixture Lane"], contactEmail: "builder@fictional.invalid", contactPhone: "" })));
  const recipient = "customer@fictional.invalid";
  await readOk(await saveParties(pilotRequest(`${path}/parties`, {
    version: "job-parties-command.v1", commandId: randomUUID(), action: "save_form",
    expectedJobRevision: 1, expectedBindingId: null, customer: { version: "customer.v1", name: "Fictional Customer", type: "business", email: recipient },
    customerRef: null, site: { version: "site.v1", addressLines: ["2 Fixture Lane"], town: "Fixturetown", postcode: "AA1 1AA" },
    savedSiteRevisionId: null, reuseSiteId: null, expectedReuseRevisionId: null, confirmSamePlace: false,
    payingPartyRevisionId: null, expectedPayerRevisionId: null, correct: false,
  }), route));
  const workspace = await readOk(await readQuote(pilotRequest(`${path}/quotes`), route));
  const draft = { contractVersion: "quote_draft_command_v1", draftId: randomUUID(), expectedRevision: 0,
    currency: "GBP", taxPolicyVersion: "candidate_m1_standard_v1", lines: workspace.scope.map((line: Record<string, unknown>) => ({
      ...line, id: randomUUID(), included: true, origin: "captured", exclusionReason: null, discountPercent: "0", taxTreatment: "standard_rate_20",
      rateProvenance: "entered", category: null, region: null,
    })) };
  await readOk(await saveQuote(pilotRequest(`${path}/quotes`, draft), route));
  const preview = (expectedRevision: number) => previewQuote(pilotRequest(`${path}/quotes/preview`, {
    version: "quote-preview-command.v1", recipient, expectedRevision,
  }), route);
  const first = await readOk(await preview(1));
  await readOk(await saveQuote(pilotRequest(`${path}/quotes`, { ...draft, expectedRevision: 1 }), route));
  const send = (view: { documentId: string; contentHash: string }) => ({
    version: "quote-send-command.v1", commandId: randomUUID(), documentId: view.documentId, contentHash: view.contentHash, recipient,
  });
  const issue = (body: unknown, routeArg = route, tenant = tenantA) => issueQuote(pilotRequest(`${path}/quotes/delivery`, body, tenant), routeArg);
  expect((await issue(send(first.view))).status).toBe(409);
  expect((await preview(1)).status).toBe(409);
  const second = await readOk(await preview(2));
  const approved = send(second.view);
  expect((await issue({ ...approved, contentHash: "0".repeat(64) })).status).toBe(409);
  expect((await issue({ ...approved, recipient: "other@fictional.invalid" })).status).toBe(409);
  expect((await issue(approved, { params: Promise.resolve({ id: jobB }) })).status).toBe(404);
  expect((await issue(approved, route, tenantB)).status).toBe(403);

  await admin.query("UPDATE app.membership SET role='read_only' WHERE id=$1", [member]);
  expect((await request()).status).toBe(200);
  expect((await issue(approved)).status).toBe(403);
  await admin.query("UPDATE app.membership SET role='owner' WHERE id=$1", [member]);
  const sessionDigest = createHmac("sha256", secret).update(`session:${memberSession}`).digest("hex");
  await admin.query("UPDATE identity.session SET revoked_at=now() WHERE token_digest=$1", [sessionDigest]);
  expect((await issue(approved)).status).toBe(401);
  await admin.query("UPDATE identity.session SET revoked_at=NULL WHERE token_digest=$1", [sessionDigest]);
  configure(unavailablePilotApproval(unavailablePilotApprovals[0]![1]));
  expect((await issue(approved)).status).toBe(403);
  configure(pilotApprovalFixture().env);

  const artifact = await readArtifact(pilotRequest(`${path}/quotes/artifacts/${approved.documentId}`),
    { params: Promise.resolve({ id, artifactId: approved.documentId }) });
  expect(artifact.ok).toBe(true);
  const bytes = Buffer.from(await artifact.arrayBuffer());
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(approved.contentHash);
  expect(bytes.toString()).toContain("You are invited to review this exact quote");
  expect(await readOk(await issue(approved))).toMatchObject({ status: "queued", invitation: {
    jobId: id, documentId: approved.documentId, contentHash: approved.contentHash, recipient, documentVersion: second.view.documentVersion,
  } });
  expect((await readOk(await issue(approved))).status).toBe("queued");
  const actions = (await admin.query(`SELECT o.immutable_content, o.content_hash, o.adapter, o.status, o.recipient, a.actor_membership_id
    FROM app.action_outbox o JOIN app.action_authorization a ON (a.tenant_id,a.id)=(o.tenant_id,o.authorization_id)
    WHERE o.tenant_id=$1 AND o.action_type='quote.send'`, [tenantA])).rows;
  expect(actions).toEqual([{ immutable_content: bytes.toString(), content_hash: approved.contentHash, adapter: "fake_quote_delivery",
    status: "pending", recipient: JSON.stringify([recipient]), actor_membership_id: member }]);
  const acceptancePath = `${path}/quotes/acceptance`;
  const offer = await readOk(await readAcceptance(pilotRequest(acceptancePath), route));
  expect(offer).toMatchObject({ jobId: id, acceptance: null, baselineDocumentId: null, offered: {
    documentId: approved.documentId, documentHash: approved.contentHash, documentVersion: second.view.documentVersion, totalPence: 12000,
  } });
  const accept = { version: "pilot-acceptance-fixture.v1", commandId: randomUUID(), expectedJobRevision: offer.jobRevision,
    documentId: approved.documentId, documentVersion: second.view.documentVersion, documentHash: approved.contentHash,
    acceptedAt: new Date().toISOString() };
  const sameTenant = { params: Promise.resolve({ id: jobA }) };
  expect((await recordAcceptance(pilotRequest(acceptancePath, accept), sameTenant)).status).toBe(409);
  expect((await recordAcceptance(pilotRequest(acceptancePath, accept), { params: Promise.resolve({ id: jobB }) })).status).toBe(404);
  expect((await recordAcceptance(pilotRequest(acceptancePath, accept, tenantB), route)).status).toBe(403);
  expect((await recordAcceptance(pilotRequest(acceptancePath, { ...accept, expectedJobRevision: offer.jobRevision - 1 }), route)).status).toBe(409);

  const accepted = await readOk(await recordAcceptance(pilotRequest(acceptancePath, accept), route));
  expect(accepted).toMatchObject({ jobId: id, status: "accepted", baselineDocumentId: null, acceptance: {
    documentId: accept.documentId, documentVersion: accept.documentVersion, documentHash: accept.documentHash, method: "fixture",
  } });
  expect(await readOk(await recordAcceptance(pilotRequest(acceptancePath, accept), route))).toEqual(accepted);
  const activationPath = `${path}/quotes/activation`;
  const start = { version: "pilot-switch-live.v1", commandId: randomUUID(), expectedJobRevision: accepted.jobRevision,
    documentId: accept.documentId, documentVersion: accept.documentVersion, documentHash: accept.documentHash };
  await admin.query("UPDATE app.membership SET role='read_only' WHERE id=$1", [member]);
  expect((await readAcceptance(pilotRequest(acceptancePath), route)).status).toBe(200);
  expect((await activateJob(pilotRequest(activationPath, start), route)).status).toBe(403);
  await admin.query("UPDATE app.membership SET role='owner' WHERE id=$1", [member]);
  await admin.query("UPDATE identity.session SET revoked_at=now() WHERE token_digest=$1", [sessionDigest]);
  expect((await activateJob(pilotRequest(activationPath, start), route)).status).toBe(401);
  await admin.query("UPDATE identity.session SET revoked_at=NULL WHERE token_digest=$1", [sessionDigest]);
  expect((await activateJob(pilotRequest(activationPath, { ...start, expectedJobRevision: offer.jobRevision }), route)).status).toBe(409);
  const activated = await readOk(await activateJob(pilotRequest(activationPath, start), route));
  expect(activated).toMatchObject({ jobId: id, status: "live", baselineDocumentId: accept.documentId });
  expect(await readOk(await activateJob(pilotRequest(activationPath, start), route))).toEqual(activated);

  const progressPath = `${path}/work-state`;
  const work = await readOk(await readProgress(pilotRequest(progressPath), route));
  const scopeItemId = work.scope[0].scopeItemId;
  expect((await readProgress(pilotRequest(progressPath), { params: Promise.resolve({ id: practiceJob }) })).status).toBe(404);
  cookieJar.set(pilotSessionCookie, { value: practiceSession });
  expect((await readProgress(pilotRequest(progressPath), route)).status).toBe(401);
  cookieJar.set(pilotSessionCookie, { value: memberSession });
  expect(work).toMatchObject({ jobId: id, scope: [{ scopeItemId, description: "Paint shed", stage: "not_started", revision: 0 }] });
  const progress = { version: "pilot-scope-progress.v1", scopeItemId, action: "start", expectedRevision: 0 };
  expect((await changeProgress(pilotRequest(progressPath, { ...progress, scopeItemId: randomUUID() }), route)).status).toBe(404);
  expect(await readOk(await changeProgress(pilotRequest(progressPath, progress), route))).toMatchObject({
    scope: [{ scopeItemId, stage: "in_progress", revision: 1 }],
  });
  expect((await changeProgress(pilotRequest(progressPath, progress), route)).status).toBe(409);

  const variationsPath = `${path}/variations`;
  const extra = { version: "pilot-log-extra.v1", commandId: randomUUID(), description: "Fictional extra coat" };
  expect(await readOk(await logExtra(pilotRequest(variationsPath, extra), route))).toEqual({ variationId: extra.commandId });
  expect(await readOk(await logExtra(pilotRequest(variationsPath, extra), route))).toEqual({ variationId: extra.commandId });
  expect(await readOk(await readExtras(pilotRequest(variationsPath), route))).toMatchObject({
    jobId: id, variations: [{ id: extra.commandId, description: extra.description, state: "draft" }],
  });

  const proofPath = `${path}/proof`;
  const photo = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/gV8AAAAASUVORK5CYII=", "base64");
  const begin = { version: "pilot-proof.v1", action: "begin", commandId: randomUUID(), scopeItemId,
    expectedSha256: createHash("sha256").update(photo).digest("hex"), byteLength: photo.length, contentType: "image/png" };
  const upload = await readOk(await saveProof(pilotRequest(proofPath, begin), route));
  expect(upload.uploadId).toBe(begin.commandId);
  expect(await readOk(await readProof(pilotRequest(proofPath), route))).toMatchObject({ evidence: [] });
  const complete = { ...progress, commandId: randomUUID(), expectedRevision: 1, action: "complete", evidenceId: upload.uploadId };
  expect((await changeProgress(pilotRequest(progressPath, complete), route)).status).toBe(422);
  expect((await fetch(upload.uploadUrl, { method: "PUT", headers: { "Content-Type": begin.contentType }, body: photo })).ok).toBe(true);
  const finalize = { version: "pilot-proof.v1", action: "finalize", commandId: randomUUID(), uploadId: upload.uploadId, objectVersionId };
  expect((await saveProof(pilotRequest(proofPath, finalize), sameTenant)).status).toBe(404);
  expect(await readOk(await saveProof(pilotRequest(proofPath, finalize), route))).toEqual({ evidenceId: upload.uploadId });
  expect(await readOk(await saveProof(pilotRequest(proofPath, finalize), route))).toEqual({ evidenceId: upload.uploadId });
  expect((await readProof(pilotRequest(`${proofPath}?evidenceId=${upload.uploadId}`), sameTenant)).status).toBe(404);
  const proof = await readOk(await readProof(pilotRequest(`${proofPath}?evidenceId=${upload.uploadId}`), route));
  const download = new URL(proof.downloadUrl);
  expect(download.searchParams.get("versionId")).toBe(objectVersionId);
  expect(download.pathname).toContain(`/pilot_no_charge/tenants/${tenantA}/uploads/${upload.uploadId}/original`);
  const unsigned = new URL(download.pathname, download.origin);
  unsigned.searchParams.set("versionId", objectVersionId);
  expect((await fetch(unsigned)).status).toBe(403);
  expect(Buffer.from(await (await fetch(download)).arrayBuffer())).toEqual(photo);
  expect((await changeProgress(pilotRequest(progressPath, { ...complete, expectedRevision: 0 }), route)).status).toBe(409);
  const completed = await readOk(await changeProgress(pilotRequest(progressPath, complete), route));
  expect(completed).toMatchObject({ scope: [{ scopeItemId, stage: "complete", revision: 2 }] });
  expect(await readOk(await changeProgress(pilotRequest(progressPath, complete), route))).toEqual(completed);
  const persisted = (await admin.query(`SELECT a.mode,a.accepted_document_hash,j.baseline_quote_version_id,
    (SELECT count(*)::int FROM app.synthetic_obligation WHERE job_id=$1) obligations,
    (SELECT count(*)::int FROM app.journal WHERE tenant_id=$2) journals
    FROM app.job_activation a JOIN app.job j ON (j.tenant_id,j.id)=(a.tenant_id,a.job_id) WHERE a.job_id=$1`, [id, tenantA])).rows;
  expect(persisted).toEqual([{ mode: "pilot_no_charge", accepted_document_hash: accept.documentHash,
    baseline_quote_version_id: accept.documentId, obligations: 0, journals: 0 }]);
  const accountPath = `${path}/final-account`;
  const lockPath = `${accountPath}/lock`;
  const checkPath = `${path}/final-check`;
  expect(await readOk(await readFinalCheck(pilotRequest(checkPath), route)))
    .toEqual({ state: "unlocked", items: [], message: null });
  expect((await readFinalCheck(pilotRequest(checkPath), { params: Promise.resolve({ id: practiceJob }) })).status).toBe(404);
  expect((await readFinalCheck(pilotRequest(checkPath), { params: Promise.resolve({ id: jobB }) })).status).toBe(404);
  await admin.query("UPDATE app.membership SET role='read_only' WHERE id=$1", [member]);
  try {
    expect((await readFinalCheck(pilotRequest(checkPath), route)).status).toBe(403);
    expect((await issuePilotInvoice(pilotRequest(`${path}/customer-invoices`, {}), route)).status).toBe(403);
  } finally { await admin.query("UPDATE app.membership SET role='owner' WHERE id=$1", [member]); }

  expect(await readOk(await readFinalAccount(pilotRequest(accountPath), route))).toMatchObject({
    jobId: id, termsApproved: false, lock: null, account: null,
  });
  const account = await readOk(await assembleFinalAccount(pilotRequest(accountPath, {
    version: "final-account.assemble.v1", commandId: randomUUID(), expectedRevision: 0,
  }), route));
  expect(account).toMatchObject({ account: { issueBlocked: false, totals: { total: { pence: 12000 } } } });
  const lockCommand = { version: "final-account.lock.v1", commandId: randomUUID(),
    finalAccountRevisionId: account.account.id, expectedRevision: account.account.revision,
    declarationVersion: "final_account_declaration.v1" };
  const refused = await lockFinalAccount(pilotRequest(lockPath, lockCommand), route);
  expect(refused.status).toBe(409);
  expect(await refused.json()).toEqual({ code: "TERMS_PENDING" });
  expect((await admin.query("SELECT id FROM app.final_account_lock WHERE job_id=$1", [id])).rows).toEqual([]);
  await admin.query("INSERT INTO app.pilot_final_check_terms_approval(tenant_id,version,approval_sha256) VALUES($1,$2,$3)",
    [tenantA, "pilot_final_check_terms.v1", createHash("sha256").update("fictional pilot terms approval").digest("hex")]);
  expect(await readOk(await recordScopeDisposition(pilotRequest(`${accountPath}/dispositions`, {
    version: "final-account.disposition.v1", commandId: randomUUID(), scopeItemId, disposition: "done",
  }), route))).toMatchObject({ scopeItemId, disposition: "done" });
  const locked = await readOk(await lockFinalAccount(pilotRequest(lockPath, lockCommand), route));
  expect(locked).toMatchObject({ jobId: id, lock: { id: expect.any(String) } });
  expect(await readOk(await readFinalAccount(pilotRequest(accountPath), route)))
    .toMatchObject({ termsApproved: true, lock: locked.lock });
  expect(await readOk(await lockFinalAccount(pilotRequest(lockPath, lockCommand), route))).toEqual(locked);
  const pending = await readFinalCheck(pilotRequest(checkPath), route);
  expect(pending.headers.get("Cache-Control")).toBe("no-store");
  expect(await readOk(pending)).toMatchObject({ state: "pending", lockId: locked.lock.id, items: [] });
  expect(await readOk(await readFinalCheckDisputes(pilotRequest(`${checkPath}/disputes`), route))).toEqual([]);
  const rejected = await confirmFinalCheckCatch(pilotRequest(`${checkPath}/catches`, {
    version: "final-check.catch.v1", commandId: randomUUID(), lockId: locked.lock.id, runId: randomUUID(),
    signalId: randomUUID(), expectedSignalRevision: 0,
  }), route);
  expect(rejected.ok).toBe(false);
  expect(await rejected.json()).toEqual({ code: "FINAL_CHECK_PENDING" });
  const invoice = await issuePilotInvoice(pilotRequest(`${path}/customer-invoices`, {}), route);
  expect(invoice.status).toBe(409);
  expect(await invoice.json()).toEqual({ code: "PILOT_INVOICE_POLICY_PENDING" });

  expect((await admin.query("SELECT onboarding_terms_version FROM app.final_account_lock WHERE job_id=$1", [id])).rows)
    .toEqual([{ onboarding_terms_version: "pilot_final_check_terms.v1" }]);
  expect(blockedPractice).not.toHaveBeenCalled();
}, 60_000);
