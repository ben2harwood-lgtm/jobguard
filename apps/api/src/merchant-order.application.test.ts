import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, expect, it, vi } from "vitest";
import { MerchantOrderApplication } from "./merchant-order.application.js";
import { PracticeAccess } from "./practice-access.js";
import { verifiedTenantContextFromMembership, type AuthenticatedMembership } from "@jobguard/db";
const job = randomUUID(), revisionId = randomUUID(), actor = randomUUID();
const raw = { version: "merchant-order-screen.v1", revisionId, kind: "preview" };
function fixture() {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  const context = verifiedTenantContextFromMembership({ tenantId: randomUUID(), membershipId: actor, identityUserId: randomUUID() } as AuthenticatedMembership);
  const authorize = vi.spyOn(PracticeAccess.prototype, "job").mockResolvedValue({ context, membershipId: actor, identityUserId: randomUUID(), digest: "fixture" });
  const repo = { preview: vi.fn(), approve: vi.fn(), attestManual: vi.fn() };
  return { app: new MerchantOrderApplication({} as Pool, randomUUID(), repo), repo, context, authorize };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
it("uses the authenticated context and actor, retaining the exact reviewed facts on confirm/retry", async () => {
  const f = fixture();
  await f.app.execute(job, raw);
  expect(f.repo.preview).toHaveBeenCalledWith(f.context, { version: "merchant-order-scope.v1", jobId: job, revisionId });
  const input = { ...raw, kind: "approve", commandId: randomUUID(), contentHash: "a".repeat(64), recipient: "orders@fixture.invalid", amountPence: 25000, revision: 1, expiresAt: new Date(Date.now() + 300_000).toISOString() };
  await f.app.execute(job, input); await f.app.execute(job, input);
  for (const call of f.repo.approve.mock.calls) expect(call).toEqual([f.context, expect.objectContaining({ jobId: job, revisionId }), expect.objectContaining({
    commandId: input.commandId, actorMembershipId: actor, semanticKey: `merchant-order:${job}:${revisionId}`,
    action: expect.objectContaining({ contentHash: input.contentHash, recipient: input.recipient, amountPence: input.amountPence, aggregateRevision: 1 }),
  })]);
  expect(f.repo.approve.mock.calls[1]).toEqual(f.repo.approve.mock.calls[0]);
  expect(f.repo.preview).toHaveBeenCalledTimes(1);
});
it.each(["UNAUTHENTICATED", "NOT_FOUND"])("refuses %s before an order read or mutation", async code => {
  const f = fixture(); f.authorize.mockRejectedValue(new Error(code));
  for (const kind of ["preview", "approve", "manual"]) await expect(f.app.execute(job, { ...raw, kind })).rejects.toThrow(code);
  expect(f.repo.preview).not.toHaveBeenCalled(); expect(f.repo.approve).not.toHaveBeenCalled(); expect(f.repo.attestManual).not.toHaveBeenCalled();
});
it("rejects client-selected authority and all non-synthetic environments", async () => {
  const f = fixture();
  for (const extra of [{ actorMembershipId: randomUUID() }, { tenantId: randomUUID() }, { jobId: randomUUID() }])
    await expect(f.app.execute(job, { ...raw, ...extra })).rejects.toThrow();
  vi.stubEnv("JOBGUARD_ENV", "production");
  await expect(f.app.execute(job, raw)).rejects.toThrow("Practice only");
  expect(f.repo.preview).not.toHaveBeenCalled();
});
it("records manual placement through a separate authenticated fact", async () => {
  const f = fixture(), commandId = randomUUID();
  await f.app.execute(job, { ...raw, kind: "manual", commandId, supplierReference: "synthetic-example" });
  expect(f.repo.attestManual).toHaveBeenCalledWith(f.context, { version: "manual-order-attestation.v1", jobId: job, revisionId, commandId, supplierReference: "synthetic-example" }, actor);
  expect(f.repo.approve).not.toHaveBeenCalled();
});
