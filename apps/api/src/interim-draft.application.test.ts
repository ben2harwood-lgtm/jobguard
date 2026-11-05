import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { InterimDraftRepositoryError } from "@jobguard/db";
import { reconcileInterimDraftBook } from "@jobguard/core";
import { InterimDraftApplication, interimDraftFailure } from "./interim-draft.application.js";
import type { IdentityApplication } from "./auth/identity.application.js";
import { AuthError } from "./auth/auth-provider.js";
const tenantId = randomUUID(), jobId = randomUUID();
afterEach(() => vi.unstubAllEnvs());
function fixture() {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  const book = { version: "interim.draft-book.v1" as const, environment: "synthetic" as const, tenantId, jobId, records: [] };
  const result = { book, rows: [], watermark: "SYNTHETIC DRAFT - NOT FOR ISSUE" as const,
    lineage: "fixture_lineage_not_authority" as const, reconciliation: reconcileInterimDraftBook(book) };
  const repository = { read: vi.fn().mockResolvedValue(result), command: vi.fn().mockResolvedValue(result) };
  const principal = { identityUserId: randomUUID(), sessionId: randomUUID(), csrfToken: "c".repeat(24) };
  const provider = { authenticate: vi.fn().mockResolvedValue(principal),
    findMembership: vi.fn().mockResolvedValue({ id: randomUUID(), tenantId, identityUserId: principal.identityUserId }),
    digest: vi.fn().mockReturnValue("a".repeat(64)) };
  const identity = { provider, allowedOrigin: "https://practice.invalid",
    session: vi.fn().mockResolvedValue({ csrfToken: "c".repeat(24), memberships: [{ tenantId }] }) };
  const app = new InterimDraftApplication(identity as unknown as IdentityApplication, repository);
  const credentials = { sessionToken: "s".repeat(32), origin: identity.allowedOrigin, csrfToken: "c".repeat(24), tenantHeader: randomUUID() };
  return { app, repository, provider, identity, credentials };
}
it("binds the session company directly and uses the digest, ignoring untrusted tenant selection", async () => {
  const f = fixture(), raw = { jobId };
  const view = await f.app.command(f.credentials, jobId, raw);
  expect(f.provider.findMembership).toHaveBeenCalledWith(expect.anything(), tenantId);
  expect(f.repository.command).toHaveBeenCalledWith(expect.objectContaining({ tenantId }), "a".repeat(64), raw);
  expect(f.provider.digest).toHaveBeenCalledWith(`session:${"s".repeat(32)}`);
  expect(view?.issueRefusal).toContain("D06/D02");
  expect(view?.issueBlockerMessages).toContain("Interim issue is disabled. Nothing can be issued, sent or posted.");
  await f.app.read({ sessionToken: "s".repeat(32) }, jobId);
  expect(f.repository.read).toHaveBeenCalledWith(expect.objectContaining({ tenantId }), jobId, "a".repeat(64));
});
it.each([undefined, "https://evil.invalid"])("refuses missing/foreign browser origin %s before persistence", async origin => {
  const f = fixture();
  await expect(f.app.command({ ...f.credentials, origin }, jobId, { jobId })).rejects.toMatchObject({ code: "ORIGIN_FORBIDDEN" });
  expect(f.repository.command).not.toHaveBeenCalled();
});
it("refuses wrong CSRF, revoked membership, expired sessions and URL substitution", async () => {
  const f = fixture();
  await expect(f.app.command({ ...f.credentials, csrfToken: "f".repeat(24) }, jobId, { jobId })).rejects.toMatchObject({ code: "ORIGIN_FORBIDDEN" });
  await expect(f.app.command(f.credentials, jobId, { jobId: randomUUID() })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  f.provider.findMembership.mockResolvedValueOnce(undefined);
  await expect(f.app.read(f.credentials, jobId)).rejects.toMatchObject({ code: "TENANT_FORBIDDEN" });
  f.identity.session.mockRejectedValueOnce(new AuthError("UNAUTHENTICATED"));
  await expect(f.app.read(f.credentials, jobId)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  expect(f.repository.command).not.toHaveBeenCalled(); expect(f.repository.read).not.toHaveBeenCalled();
});
it("passes strict commands unchanged and preserves repository refusal codes", async () => {
  const f = fixture(), raw = { jobId, actor: "forged", enabled: true };
  f.repository.command.mockRejectedValue(new InterimDraftRepositoryError("INVALID_INPUT"));
  await expect(f.app.command(f.credentials, jobId, raw)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(f.repository.command.mock.calls[0]?.[2]).toBe(raw);
  expect(interimDraftFailure(new InterimDraftRepositoryError("CONFLICT"))).toMatchObject({ status: 409, body: { code: "INTERIM_DRAFT_CONFLICT" } });
});
it.each(["production", "pilot_no_charge", ""])("returns not-found outside synthetic_demo: %s", async mode => {
  const f = fixture(); vi.stubEnv("JOBGUARD_ENV", mode);
  for (const work of [() => f.app.read(f.credentials, jobId), () => f.app.command(f.credentials, jobId, { jobId })]) {
    const error = await work().catch(error => error);
    expect(interimDraftFailure(error)).toMatchObject({ status: 404 });
  }
  expect(f.identity.session).not.toHaveBeenCalled(); expect(f.repository.read).not.toHaveBeenCalled();
});
