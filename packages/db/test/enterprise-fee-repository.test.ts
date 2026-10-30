import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { expect, it, vi } from "vitest";
import { EnterpriseFeeRepository } from "../src/enterprise-fee-repository.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

// Service response tests only; PostgreSQL race and authorization proofs remain in integration suites.
const session = randomUUID(), tenant = testTenantContext(randomUUID());
const input = { version: "enterprise-fee-post-statement.v1", commandId: randomUUID(), statementId: randomUUID(), authorizationId: randomUUID() };
function fixture(result: unknown, postings: unknown[] = [], failure?: string) {
  const query = vi.fn(async (sql: string, _parameters?: unknown[]) => {
    if (sql.includes("app.ef_post_statement")) {
      if (failure) throw new Error(failure);
      return { rows: [{ result }] };
    }
    if (sql.includes("app.ef_read_postings")) return { rows: [{ result: postings }] };
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql) || sql.includes("set_config")) return { rows: [] };
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  const release = vi.fn();
  const repo = new EnterpriseFeeRepository({ connect: async () => ({ query, release }) } as unknown as Pool);
  return { repo, query, release };
}
it.each([0, 2])("fills an omitted replay count from %i authoritative journals in the same tenant transaction", async count => {
  const result = { statementId: input.statementId, replayed: true };
  const f = fixture(result, Array.from({ length: count }, () => ({ id: randomUUID() })));
  expect(await f.repo.postStatement(tenant, session, input)).toEqual({ ...result, journals: count });
  expect(f.query).toHaveBeenNthCalledWith(2, "SELECT set_config('app.tenant_id', $1, true)", [tenant.tenantId]);
  expect(f.query).toHaveBeenNthCalledWith(4, "SELECT app.ef_read_postings($1,$2) result", [session, input.statementId]);
  expect(f.query).toHaveBeenLastCalledWith("COMMIT");
  expect(f.release).toHaveBeenCalledOnce();
});
it.each([false, true])("preserves the database count when present (replayed=%s)", async replayed => {
  const result = { statementId: input.statementId, replayed, journals: 0 }, f = fixture(result);
  expect(await f.repo.postStatement(tenant, session, input)).toEqual(result);
  expect(f.query.mock.calls.some(([sql]) => sql.includes("app.ef_read_postings"))).toBe(false);
});
it("refuses invalid authority before any journal read and rolls back", async () => {
  const f = fixture(undefined, [], "STATEMENT_AUTHORITY_INVALID");
  await expect(f.repo.postStatement(tenant, session, input)).rejects.toMatchObject({ code: "STATEMENT_AUTHORITY_INVALID" });
  expect(f.query.mock.calls.some(([sql]) => sql.includes("app.ef_read_postings"))).toBe(false);
  expect(f.query).toHaveBeenLastCalledWith("ROLLBACK");
  expect(f.release).toHaveBeenCalledOnce();
});
