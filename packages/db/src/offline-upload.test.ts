import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { reviewOfflineCommercialIntent } from "./offline-upload.js";
import type { VerifiedTenantContext } from "./tenant-context.js";
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("./tenant-context.js", () => ({ withTenant: (_pool: unknown, _context: unknown, work: (db: unknown) => unknown) => work({ $client: { query } }) }));
afterEach(() => vi.resetAllMocks());
it("commercial uploads compare server facts and can only request re-review; query stays tenant/member/job scoped", async () => {
 const context = { tenantId: randomUUID() } as VerifiedTenantContext, member = randomUUID(), job = randomUUID();
 const intent = { expectedRevision: 2, acceptedQuoteVersionId: null, authorizationId: randomUUID(), actionType: "send_quote", recipient: "fictional@example.invalid", contentHash: "a".repeat(64), amountPence: 100, currency: "GBP" as const, policyVersion: "synthetic.v1" };
 const row = { revision: 2, accepted_quote_version_id: null, authorization_id: intent.authorizationId, active: true, action_type: intent.actionType, recipient: intent.recipient, content_hash: intent.contentHash, amount_pence: "100", currency: "GBP", policy_version: intent.policyVersion, aggregate_revision: 2 };
 for (const [patch, expected] of [
  [{}, "ONLINE_REVIEW_REQUIRED"], [{ revision: 3 }, "STALE_REVISION"], [{ accepted_quote_version_id: randomUUID() }, "ACCEPTED_VERSION_CHANGED"],
  [{ active: false }, "APPROVAL_EXPIRED"], [{ authorization_id: null }, "APPROVAL_EXPIRED"], [{ amount_pence: "101" }, "STALE_PRICE"],
  [{ recipient: "changed@example.invalid" }, "AUTHORITY_CHANGED"], [{ content_hash: "b".repeat(64) }, "AUTHORITY_CHANGED"],
  [{ aggregate_revision: 3 }, "AUTHORITY_CHANGED"], [{ policy_version: "other" }, "AUTHORITY_CHANGED"],
 ] as const) {
  query.mockResolvedValueOnce({ rows: [{ ...row, ...patch }] });
  expect(await reviewOfflineCommercialIntent({} as Pool, context, member, job, intent)).toBe(expected);
 }
 query.mockResolvedValueOnce({ rows: [] });
 expect(await reviewOfflineCommercialIntent({} as Pool, context, member, job, intent)).toBe("PERMISSION_REVOKED");
 for (const [sql, params] of query.mock.calls) {
  expect(params).toEqual([context.tenantId, job, member, intent.authorizationId]);
  expect(sql).toContain("j.tenant_id=$1 AND j.id=$2"); expect(sql).toContain("m.revoked_at IS NULL");
  expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|shadow)\b/iu);
 }
});
