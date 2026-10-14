import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { expect, it, vi } from "vitest";
import { contractorPermits } from "@jobguard/core";
import { SorRepository } from "../src/sor-repository.js";
import type { AuthenticatedMembership } from "../src/tenant-context.js";

// Repository control-flow reproduction only. This adapter does not prove PostgreSQL permissions or RLS.
it("SoR listing refuses client approvers outside approval packs", async () => {
  const principal = { tenantId: randomUUID(), membershipId: randomUUID(), identityUserId: randomUUID() } as AuthenticatedMembership;
  // The unchanged conformance expectation at contractor.integration.test.ts:422 evaluates to true for this actor.
  const clientA = randomUUID();
  expect(contractorPermits([{ role: "client_approver", scope: { kind: "client", id: clientA } }], "contract.read", { tenantId: principal.tenantId, clientId: clientA })).toBe(true);
  const schedules = ["Fictional client A", "Fictional client B"].map(reference => ({
    id: randomUUID(), schedule_id: randomUUID(), schedule_reference: reference, reference,
    effective_from: "2026-01-01", item_count: 1, created_at: new Date("2026-01-01T00:00:00Z"),
  }));
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("FROM app.membership m")) return { rows: [{ track: "contractor", active: true, allowed: true, role: "client_approver" }] };
    // A's client-scoped, unrestricted contract.read grant passes the current existence check.
    if (sql.includes("app.contractor_allowed")) return { rows: [{ allowed: true }] };
    if (sql.includes("FROM app.sor_version v")) return { rows: schedules };
    if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK" || sql.startsWith("SELECT set_config")) return { rows: [] };
    throw new Error(`Unexpected test-adapter statement: ${sql}`);
  });
  const pool = { connect: async () => ({ query, release: vi.fn() }) } as unknown as Pool;
  await expect(new SorRepository(pool).list(principal)).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(query.mock.calls.some(([sql]) => sql.includes("FROM app.sor_version v"))).toBe(false);
});
