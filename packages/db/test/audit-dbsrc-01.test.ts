import type { Pool } from "pg";
import { beforeEach, expect, it, vi } from "vitest";
import { UserCommandDispatcher } from "../src/commands.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

vi.mock("../src/audit.js", () => ({ appendAuditBatch: vi.fn().mockResolvedValue([]) }));
import { appendAuditBatch } from "../src/audit.js";

const tenantId = "81000000-0000-4000-8000-000000000001";
const memberId = "81000000-0000-4000-8000-000000000004";
const decisionId = "81000000-0000-4000-8000-000000000006";
beforeEach(() => vi.clearAllMocks());

// Scripted SQL adapter: exercises the real dispatcher and withTenant rollback path.
// PostgreSQL expiry semantics and durable row counts are covered by the companion integration suite.
it("dismissDecision refuses membership that expired after authentication", async () => {
  const context = testTenantContext(tenantId);
  const queries: string[] = [];
  const release = vi.fn();
  const query = vi.fn(async (sql: string) => {
    queries.push(sql);
    if (sql.includes("FROM app.membership")) {
      // The synthetic owner has expired since the context was obtained.
      const checksExpiry = /expires_at\s*>\s*clock_timestamp\(\)/u.test(sql);
      return { rows: checksExpiry ? [] : [{ "?column?": 1 }], rowCount: checksExpiry ? 0 : 1 };
    }
    if (sql.includes("FROM app.job_finding")) return { rows: [{ id: decisionId }], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  });
  const pool = { connect: async () => ({ query, release }) } as unknown as Pool;
  await expect(new UserCommandDispatcher(pool).dismissDecision(context, {
    version: "decision-resolution-command.v1",
    commandId: "81000000-0000-4000-8000-000000000011",
    semanticKey: "audit-dbsrc-01:expired-owner",
    actorMembershipId: memberId, decisionId, findingFingerprint: "a".repeat(64),
    resolution: "dismissed", expectedSnapshotRevision: 12,
  })).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(queries.some(sql => sql.includes("INSERT INTO app.decision_resolution"))).toBe(false);
  expect(appendAuditBatch).not.toHaveBeenCalled();
  expect(queries.at(-1)).toBe("ROLLBACK");
  expect(queries).not.toContain("COMMIT");
  expect(release).toHaveBeenCalledOnce();
});
