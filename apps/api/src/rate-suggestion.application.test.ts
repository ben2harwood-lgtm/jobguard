import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import type { IdentityApplication } from "./auth/identity.application.js";
import { RateSuggestionApplication } from "./rate-suggestion.application.js";
const tenantId = randomUUID(), membershipId = randomUUID(), userId = randomUUID(), jobId = randomUUID();
function fixture() {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  const member = { id: membershipId, tenantId, identityUserId: userId, role: "owner", email: "fictional@example.invalid" };
  const provider = { authenticate: vi.fn(async () => ({ identityUserId: userId, sessionId: randomUUID(), csrfToken: "c".repeat(32) })),
    findMembership: vi.fn(async () => member), digest: vi.fn(() => "d".repeat(64)) };
  const identity = { provider, allowedOrigin: "https://practice.invalid", session: vi.fn(async () => ({ csrfToken: "c".repeat(32), memberships: [member] })) };
  const repository = { readAcceptances: vi.fn(async () => []), read: vi.fn(), accept: vi.fn() };
  return { identity, repository, application: new RateSuggestionApplication(identity as unknown as IdentityApplication, repository) };
}
afterEach(() => vi.unstubAllEnvs());
it("binds session membership and checks job authority before baseline or acceptance", async () => {
  const f = fixture(), token = "s".repeat(40), query = { version: "rate-query.v1" };
  const screen = await f.application.read(token, jobId, query);
  expect(screen.csrfToken).toBe("c".repeat(32));
  expect(f.repository.readAcceptances).toHaveBeenCalledWith(expect.objectContaining({ tenantId }), { kind: "human", sessionDigest: "d".repeat(64) }, jobId);
  expect(f.repository.read).toHaveBeenCalledWith(expect.objectContaining({ tenantId }), query);
  const command = { jobId };
  await f.application.accept(token, jobId, command);
  expect(f.repository.accept).toHaveBeenCalledWith(expect.objectContaining({ tenantId }), { kind: "human", sessionDigest: "d".repeat(64) }, command);
  expect(f.identity.provider.digest).toHaveBeenCalledWith(`session:${token}`);
});
it("foreign/uncovered jobs cannot expose baseline data or write", async () => {
  const f = fixture(); f.repository.readAcceptances.mockRejectedValue(new Error("NOT_FOUND"));
  await expect(f.application.read("s".repeat(40), jobId, {})).rejects.toThrow("NOT_FOUND");
  await expect(f.application.accept("s".repeat(40), jobId, { jobId })).rejects.toThrow("NOT_FOUND");
  expect(f.repository.read).not.toHaveBeenCalled(); expect(f.repository.accept).not.toHaveBeenCalled();
});
it("refuses a different URL job and non-practice use", async () => {
  const f = fixture();
  await expect(f.application.accept("s".repeat(40), jobId, { jobId: randomUUID() })).rejects.toThrow("INVALID_ACCEPTANCE");
  vi.stubEnv("JOBGUARD_ENV", "pilot_no_charge");
  await expect(f.application.read("s".repeat(40), jobId)).rejects.toThrow("SYNTHETIC_ONLY");
  expect(f.repository.accept).not.toHaveBeenCalled();
});
it("refuses absent and ambiguous memberships", async () => {
  const f = fixture();
  f.identity.session.mockResolvedValue({ csrfToken: "c".repeat(32), memberships: [] });
  await expect(f.application.read("s".repeat(40), jobId)).rejects.toThrow("FORBIDDEN");
  const member = { id: membershipId, tenantId, identityUserId: userId, role: "owner", email: "fictional@example.invalid" };
  f.identity.session.mockResolvedValue({ csrfToken: "c".repeat(32), memberships: [member, member] });
  await expect(f.application.read("s".repeat(40), jobId)).rejects.toThrow("FORBIDDEN");
  expect(f.repository.readAcceptances).not.toHaveBeenCalled();
});
