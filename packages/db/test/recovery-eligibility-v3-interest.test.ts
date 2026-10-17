// Repository behavior with adapter doubles; PostgreSQL guards are tested separately in CI.
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, expect, it, vi } from "vitest";
import type { TenantTransaction, VerifiedTenantContext } from "../src/tenant-context.js";

type Movement = { id: string; state: string; settled_before_opening: boolean; duplicate_held: boolean };
const { source, query } = vi.hoisted(() => {
 const source = { interest: null as Movement | null };
 return { source, query: vi.fn(async (sql: string) => {
  if (sql.includes("SELECT 1 FROM app.membership") || sql.includes("SELECT 1 FROM app.job")) return { rows: [{}], rowCount: 1 };
  if (sql.includes("SELECT case_type,revision,claim_pence")) return { rows: [{ case_type: "withheld_customer_payment", revision: 1, claim_pence: "300000" }] };
  if (sql.includes("e.movement_key='receipt-interest-120'")) return { rows: source.interest ? [source.interest] : [], rowCount: source.interest ? 1 : 0 };
  if (sql.includes("SELECT e.id,e.state")) return { rows: [{ id: "50000000-0000-4000-8000-000000000005", state: "settled", settled_before_opening: false, duplicate_held: false }] };
  if (sql.includes("to_regclass")) return { rows: [{ installed: false }] };
  if (sql.includes("RETURNING encode")) return { rows: [{ result_hash: "a".repeat(64) }] };
  return { rows: [], rowCount: 0 };
}) };
});
vi.mock("../src/tenant-context.js", () => ({ withTenant: async (_pool: Pool, _context: VerifiedTenantContext, work: (db: TenantTransaction) => Promise<unknown>) => work({ $client: { query } } as unknown as TenantTransaction) }));
vi.mock("../src/audit.js", () => ({ appendAuditBatch: async () => undefined }));
import { RecoveryEligibilityV3Repository } from "../src/recovery-eligibility-v3-repository.js";
afterEach(() => { source.interest = null; query.mockClear(); });

async function review() {
  const repo = new RecoveryEligibilityV3Repository({} as Pool, "synthetic_demo");
  return repo.review({ tenantId: randomUUID() } as VerifiedTenantContext, randomUUID(), {
    version: "recovery-eligibility-command.v3", action: "review", commandId: randomUUID(), caseId: randomUUID(), expectedCaseRevision: 1, expectedReviewRevision: 0, fixture: "F18",
  }, { membershipId: randomUUID(), identityUserId: randomUUID() }, "a".repeat(64));
}
it("F18 principal-only", async () => {
  const result = await review();
  expect(result.result.qualifyingPrincipal.pence).toBe(250000);
  expect(result.result.reason).toBe("Pending money cannot qualify");
  expect(result.result.lines.find(line => line.kind === "statutory_interest")).toMatchObject({ qualifyingPrincipal: { pence: 0, currency: "GBP" }, reason: "Pending money cannot qualify" });
});

it.each([
  ["pending", "pending", false, false, 250000, "Pending money cannot qualify"],
  ["duplicate held", "settled", false, true, 250000, "Pending money cannot qualify"],
  ["before opening", "settled", true, false, 250000, "Paid before you opened this case"],
  ["settled after opening", "settled", false, false, 262000, "Fixed statutory compensation is not part of the fee base"],
] as const)("F18 interest %s keeps component settlement separate", async (_label, state, settled_before_opening, duplicate_held, pence, reason) => {
  source.interest = { id: randomUUID(), state, settled_before_opening, duplicate_held };
  const { result } = await review();
  expect(result).toMatchObject({ qualifyingPrincipal: { pence, currency: "GBP" }, reason });
  expect(result.lines.find(line => line.kind === "principal")).toMatchObject({ qualifyingPrincipal: { pence: 250000 }, reason: null });
  expect(result.lines.find(line => line.kind === "fixed_compensation")).toMatchObject({ qualifyingPrincipal: { pence: 0 }, reason: "Fixed statutory compensation is not part of the fee base" });
  expect(result.lines.find(line => line.kind === "statutory_interest")?.qualifyingPrincipal.pence).toBe(pence === 262000 ? 12000 : 0);
});
