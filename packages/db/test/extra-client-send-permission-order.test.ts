import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, expect, it, vi } from "vitest";
import { ExtraApprovalRepository } from "../src/extra-approval-chain-repository.js";
import { UserCommandDispatcher } from "../src/commands.js";
import type { AuthenticatedMembership } from "../src/tenant-context.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

afterEach(() => vi.restoreAllMocks());

it("refuses before reading the request or dispatching when scoped send authority is absent", async () => {
  const tenantId = randomUUID(), membershipId = randomUUID(), jobId = randomUUID();
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("app.xa_covers")) return { rows: [{ allowed: false }] };
    return { rows: [] };
  });
  const release = vi.fn(), connect = vi.fn(async () => ({ query, release }));
  const dispatch = vi.spyOn(UserCommandDispatcher.prototype, "dispatch");
  const repo = new ExtraApprovalRepository({ connect } as unknown as Pool);
  await expect(repo.issueClientApproval(testTenantContext(tenantId, { membershipId }),
    { tenantId, membershipId, identityUserId: randomUUID() } as AuthenticatedMembership, {
      version: "issue-client-approval.v1", commandId: randomUUID(), jobId, requestId: randomUUID(),
      approverMembershipId: randomUUID(), recipient: "fictional@fictional.invalid",
      linkToken: "a".repeat(43), expiresAt: new Date(Date.now() + 3600_000),
    })).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  expect(query).toHaveBeenCalledWith(
    "SELECT app.xa_covers($1,ARRAY['surveyor','commercial_manager'],$2,'job.read') IS NOT NULL AS allowed",
    [membershipId, jobId]);
  expect(query.mock.calls.some(([sql]) => sql.includes("FROM app.extra_approval_request"))).toBe(false);
  expect(dispatch).not.toHaveBeenCalled();
  expect(connect).toHaveBeenCalledOnce();
  expect(query).toHaveBeenLastCalledWith("ROLLBACK");
  expect(release).toHaveBeenCalledOnce();
});
