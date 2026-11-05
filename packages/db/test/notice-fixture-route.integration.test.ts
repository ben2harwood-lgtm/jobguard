import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { IdentityRepository } from "../src/identity-repository.js";
import { NoticeFixtureRepository } from "../src/notice-fixture-repository.js";
import { createWorkFixture, closeWorkFixture, type WorkFixture } from "./job-work-state-fixtures.js";
import { meterCompany } from "./meter-persistence-fixtures.js";
import { IdentityApplication } from "../../../apps/api/src/auth/identity.application.js";
import { PersistedAuthProvider } from "../../../apps/api/src/auth/persisted-auth-provider.js";
import { NoticeFixtureApplication } from "../../../apps/api/src/notice-fixture.application.js";
const state = vi.hoisted(() => ({ identity: undefined as any, application: undefined as any, credentials: {} as any }));
vi.mock("../../../apps/api/dist/workspace/index.js", async () => import("../../../apps/api/src/notice-fixture.application.js"));
vi.mock("../../../apps/web/app/lib/identity-server", () => ({ identityApplication: () => state.identity, identityCredentials: async () => state.credentials }));
vi.mock("../../../apps/web/app/lib/notice-fixture-server", () => ({ noticeFixtureApplication: () => state.application }));
import { GET, POST } from "../../../apps/web/app/api/jobs/[id]/notice-fixtures/route.js";
let f: WorkFixture;
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); f = await createWorkFixture(); }, 240000);
afterAll(async () => { await closeWorkFixture(f); vi.unstubAllEnvs(); });
it("screen transport stores exact previews and separate facts, refuses attacks, and enqueues nothing (real PostgreSQL)", async () => {
  const a = await meterCompany(f), b = await meterCompany(f);
  const provider = new PersistedAuthProvider(new IdentityRepository(f.admin), "fictional-notice-route-secret-32-bytes");
  state.identity = new IdentityApplication(provider, "https://fixture.invalid");
  const token = randomUUID();
  await f.admin.query("UPDATE identity.session SET token_digest=$1,csrf_token=$2 WHERE id=$3", [provider.digest(`session:${token}`), "c".repeat(24), a.sessionId]);
  state.credentials = { sessionToken: token, csrfToken: "c".repeat(24), tenantHeader: a.tenantId, origin: "https://fixture.invalid" };
  state.application = new NoticeFixtureApplication(state.identity, new NoticeFixtureRepository(f.runtime));
  const path = `https://fixture.invalid/api/jobs/${a.jobId}/notice-fixtures`;
  const params = { params: Promise.resolve({ id: a.jobId }) };
  const post = (body: unknown) => POST(new Request(path, { method: "POST", body: JSON.stringify(body), headers: { origin: "https://fixture.invalid" } }), params);
  const read = async () => { const response = await GET(new Request(path), params); expect(response.status).toBe(200); return response.json(); };
  const raw = <T>(kind: string, data: T) => ({ version: "notice.fixture-record-command.v1", commandId: randomUUID(), jobId: a.jobId, noticeId: a.jobId, kind, data });
  const revision = raw("revision", { version: "notice.input.v1", environment: "synthetic", revision: 1, previousRevisionId: null,
    revisionId: randomUUID(), profileId: "fixture-calendar", profileVersion: 1, recipientReference: "fictional-recipient", serviceMethod: "fixture_email",
    facts: { dueDate: "2026-11-10", contractReference: "fictional-contract", triggerEvidenceId: randomUUID() } });
  const outbox = async () => (await f.admin.query("SELECT count(*)::int n FROM app.action_outbox WHERE tenant_id=$1", [a.tenantId])).rows[0].n;
  const queued = async () => (await f.admin.query("SELECT count(*)::int n FROM graphile_worker._private_jobs")).rows[0].n;
  // Graphile's private queue may not be installed by this isolated fixture. If it exists, count it too.
  const hasQueue = (await f.admin.query("SELECT to_regclass('graphile_worker._private_jobs') IS NOT NULL present")).rows[0].present;
  const before = await outbox(), beforeQueue = hasQueue ? await queued() : null;
  for (const extra of [{ tenantId: b.tenantId }, { actor: { kind: "human" } }, { enabled: true }]) expect((await post({ ...revision, ...extra })).status).toBe(400);
  for (const data of [{ ...revision.data, profileId: "unsupported" }, { ...revision.data, facts: { ...revision.data.facts, dueDate: null } }]) {
    expect((await post({ ...revision, commandId: randomUUID(), data })).status).toBe(409);
  }
  expect((await f.admin.query("SELECT count(*)::int n FROM app.notice_fixture_record WHERE tenant_id=$1", [a.tenantId])).rows[0].n).toBe(0);
  expect((await post(revision)).status).toBe(201); expect((await post(revision)).status).toBe(201);
  expect((await post({ ...revision, data: { ...revision.data, recipientReference: "changed" } })).status).toBe(409);
  let view = await read(); expect(view.records).toHaveLength(1); expect(view.preview.input).toMatchObject(revision.data);
  const decision = raw("decision", { id: randomUUID(), noticeRevisionId: revision.data.revisionId, resolution: "approved", expiresAt: view.approvalExpiresAt });
  expect((await post(decision)).status).toBe(201); view = await read();
  expect(view.decisions[0].approvedPreview).toBe(JSON.stringify(view.preview));
  const event = (state: string, assessment: string | null = null) => raw("service_event", { id: randomUUID(), noticeRevisionId: revision.data.revisionId,
    decisionId: decision.data.id, state, evidenceId: state === "queued" ? null : randomUUID(), providerReference: "fictional-provider", legalAssessmentReference: assessment });
  for (const fact of ["queued", "provider_accepted", "outcome_unknown", "read"]) expect((await post(event(fact))).status).toBe(201);
  const refused = await post(event("legally_served")); expect(refused.status).toBe(409); expect((await refused.json()).message).toContain("separate assessment reference");
  expect((await post(event("legally_served", "fictional-assessment"))).status).toBe(201);
  expect((await read()).serviceBook.events.map((e: any) => e.state)).toEqual(["queued", "provider_accepted", "outcome_unknown", "read", "legally_served"]);
  expect((await post(raw("revision", { ...revision.data, revision: 2, previousRevisionId: revision.data.revisionId, revisionId: randomUUID(), facts: { ...revision.data.facts, dueDate: "2026-11-12" } }))).status).toBe(201);
  expect((await read()).activeDecisionId).toBeNull(); expect((await post(event("read"))).status).toBe(409);
  // Query faults must remain unknown at the actual GET and POST transport boundary.
  const faultPool = { async connect() {
    const client = await f.runtime.connect();
    return { release: () => client.release(), query: (sql: string, args?: unknown[]) =>
      client.query(sql.includes("app.notice_fixture_records") ? "SELECT 1/0" : sql,
        sql.includes("app.notice_fixture_records") ? [] : args) };
  } } as unknown as Pool;
  state.application = new NoticeFixtureApplication(state.identity, new NoticeFixtureRepository(faultPool));
  for (const response of [await GET(new Request(path), params), await post(revision)]) {
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ code: "NOTICE_UNAVAILABLE", message: expect.stringContaining("result is unknown") });
  }
  state.application = new NoticeFixtureApplication(state.identity, new NoticeFixtureRepository(f.runtime));
  // A failed reply must not change the result bound to the first command.
  expect((await post(revision)).status).toBe(201);
  for (const role of ["estimator", "foreman", "finance", "read_only"]) {
    await f.admin.query("UPDATE app.membership SET role=$1 WHERE id=$2", [role, a.actorId]);
    expect((await post({ ...revision, commandId: randomUUID() })).status).toBe(404);
    expect((await GET(new Request(path), params)).status).toBe(404);
  }
  await f.admin.query("UPDATE app.membership SET role='owner' WHERE id=$1", [a.actorId]);
  for (const id of [b.jobId, randomUUID()]) {
    const response = await POST(new Request(path, { method: "POST", body: JSON.stringify({ ...revision, commandId: randomUUID(), jobId: id }) }), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(404);
  }
  await f.admin.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1", [a.sessionId]);
  expect((await post(revision)).status).toBe(401);
  await f.admin.query("UPDATE identity.session SET revoked_at=NULL,expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [a.sessionId]);
  expect((await post(revision)).status).toBe(401);
  expect(await outbox()).toBe(before);
  expect((await f.admin.query("SELECT to_regclass('graphile_worker._private_jobs') IS NOT NULL present")).rows[0].present).toBe(hasQueue);
  if (hasQueue) expect(await queued()).toBe(beforeQueue);
  // Every mutation recorded only a fixture fact; there is no durable executor/outbox authorization.
  expect((await f.admin.query("SELECT DISTINCT kind FROM app.notice_fixture_record WHERE tenant_id=$1 ORDER BY kind", [a.tenantId])).rows.map(r => r.kind)).toEqual(["decision", "revision", "service_event"]);
});
