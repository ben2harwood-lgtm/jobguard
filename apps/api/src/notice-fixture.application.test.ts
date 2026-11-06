import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NoticeFixtureRepository, NoticeFixtureRepositoryError } from "@jobguard/db";
import { ConstructionNoticeError } from "@jobguard/core";
import { NoticeFixtureApplication, noticeFixtureFailure } from "./notice-fixture.application.js";
const tenantId = randomUUID(), jobId = randomUUID(), actorId = randomUUID();
const credentials = { sessionToken: "s".repeat(32), csrfToken: "c".repeat(24), tenantHeader: tenantId, origin: "https://fixture.invalid" };
function fixture() {
  const membership = { id: actorId, identityUserId: actorId, tenantId, role: "owner", email: "owner@fictional.invalid" };
  const authenticate = vi.fn(async () => Object.defineProperty({ identityUserId: actorId, sessionId: randomUUID(), csrfToken: credentials.csrfToken }, "sessionCredential", { value: "a".repeat(64), enumerable: false }));
  const findMembership = vi.fn(async () => membership);
  const repository = { command: vi.fn(), read: vi.fn(async () => ({ preview: { exact: "server preview" }, decisions: [], records: [] })) };
  const identity = { allowedOrigin: credentials.origin, provider: { authenticate, findMembership, digest: vi.fn(() => "a".repeat(64)) } };
  const app = new NoticeFixtureApplication(identity as never, repository as never);
  return { app, identity, repository, membership, authenticate, findMembership };
}
beforeEach(() => vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"));
afterEach(() => vi.unstubAllEnvs());
it("passes context directly and derives the human actor only from the authenticated session", async () => {
  const x = fixture(), raw = { jobId, untouched: true };
  await x.app.command(credentials, jobId, raw);
  expect(x.repository.command).toHaveBeenCalledWith(expect.objectContaining({ tenantId }), { kind: "human", sessionDigest: "a".repeat(64) }, raw);
  expect(x.identity.provider.digest).toHaveBeenCalledWith(`session:${credentials.sessionToken}`);
  await expect(x.app.command(credentials, randomUUID(), raw)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(x.repository.command).toHaveBeenCalledTimes(1);
});
it("delegates strict input validation without adding trusted fields to the command", async () => {
  const x = fixture(), pool = { connect: vi.fn() };
  const app = new NoticeFixtureApplication(x.identity as never, new NoticeFixtureRepository(pool as never));
  for (const extra of [{ tenantId }, { actor: { kind: "human" } }, { enabled: true }]) {
    await expect(app.command(credentials, jobId, { version: "notice.fixture-record-command.v1", commandId: randomUUID(), jobId,
      noticeId: jobId, kind: "revision", data: {}, ...extra })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  }
  expect(pool.connect).not.toHaveBeenCalled();
});
it.each(["estimator", "foreman", "operative", "finance", "read_only"])("hides reads from %s just as command storage does", async role => {
  const x = fixture(); x.membership.role = role;
  await expect(x.app.read(credentials, jobId, jobId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(x.repository.read).not.toHaveBeenCalled();
});
it("returns the unchanged server preview, disabled reason and stale approval explanation", async () => {
  const x = fixture(), view = await x.app.read(credentials, jobId, jobId);
  expect(view.preview).toEqual({ exact: "server preview" });
  expect(view.activeDecisionId).toBeNull();
  expect(view.approvalMessage).toContain("Old, expired or changed previews cannot be used");
  expect(view.realNoticeRefusal).toContain("Real notice generation and sending are disabled");
});
it("maps typed failures without exposing unexpected error text", () => {
  expect(noticeFixtureFailure(new NoticeFixtureRepositoryError("NOT_FOUND")).status).toBe(404);
  expect(noticeFixtureFailure(new ConstructionNoticeError("REPLAY_CONFLICT", "private"))).toMatchObject({ status: 409, body: { code: "REPLAY_CONFLICT" } });
  expect(noticeFixtureFailure(new ConstructionNoticeError("INVALID_SERVICE_STATE", "private")).body.message).toContain("separate assessment reference");
  expect(JSON.stringify(noticeFixtureFailure(new Error("private")))).not.toContain("private");
});
it.each(["production", "pilot_no_charge", "test"])("hides all operations in %s", async environment => {
  const x = fixture(); vi.stubEnv("JOBGUARD_ENV", environment);
  await expect(x.app.read(credentials, jobId, jobId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(x.app.command(credentials, jobId, { jobId })).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(x.authenticate).not.toHaveBeenCalled();
});

it("marks only an exact unexpired approved server preview as usable", async () => {
  const x = fixture(), exact = { exact: "server preview" };
  const approved = { id: actorId, resolution: "approved", approvedPreview: JSON.stringify(exact),
    decidedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString() };
  for (const change of [{ approvedPreview: "changed facts" }, { resolution: "revoked" }, { resolution: "rejected" },
    { expiresAt: new Date(Date.now() - 1000).toISOString() }]) {
    x.repository.read.mockResolvedValue({ preview: exact, records: [], decisions: [{ ...approved, ...change }] } as never);
    expect((await x.app.read(credentials, jobId, jobId)).activeDecisionId).toBeNull();
  }
  x.repository.read.mockResolvedValue({ preview: exact, records: [], decisions: [approved] } as never);
  expect((await x.app.read(credentials, jobId, jobId)).activeDecisionId).toBe(actorId);
});

it("maps a repository outage to an unknown result and 503 without leaking details", () => {
  expect(noticeFixtureFailure(new NoticeFixtureRepositoryError("NOTICE_UNAVAILABLE"))).toEqual({
    status: 503, body: { version: "notice.fixture-error.v1", code: "NOTICE_UNAVAILABLE",
      message: "Practice notice records could not be loaded. The result is unknown. Refresh or retry the same saved command." },
  });
});
