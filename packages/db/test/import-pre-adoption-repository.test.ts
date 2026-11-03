import { afterEach, describe, expect, it, vi } from "vitest";
import { ImportPreAdoptionRepository, importHistoryCommand, importedCatchCommand, importedCatchResult } from "../src/import-pre-adoption-repository.js";
import { scriptedImportPool, D, J, M } from "./job-import-v3-fixtures.js";

const E = "c5500000-0000-4000-8000-000000000009";
const command = { version: "import-history-command.v1", commandId: M, evidenceId: E };
const assessment = { version: "import-catch-command.v2", commandId: M, baselineId: M, evidenceId: E };
const result = { version: "import-catch-result.v1", catchId: M, jobId: J, evidenceId: E, fee: { pence: 0, currency: "GBP" },
  reason: "pre_adoption_evidence", explanation: "Evidence from before adoption is permanently excluded", environment: "synthetic_demo", realExternalActions: 0 };
afterEach(() => vi.unstubAllEnvs());
describe("CH-5 pre-adoption exclusion boundary", () => {
  it("rejects caller labels, money, foreign scope and unversioned commands", () => {
    for (const extra of [{ classification: "post_adoption_evidence" }, { feePence: 1 }, { tenantId: M }, { jobId: J }, { sourceOccurredAt: "2020-01-01" }])
      expect(importHistoryCommand.safeParse({ ...command, ...extra }).success).toBe(false);
    expect(importHistoryCommand.safeParse({ ...command, version: undefined }).success).toBe(false);
    for (const extra of [{ allocationPence: 1 }, { reversalId: M }, { feePence: 1 }, { finalAccountRevisionId: M }, { classification: "eligible" }])
      expect(importedCatchCommand.safeParse({ ...assessment, ...extra }).success).toBe(false);
    for (const change of [{ fee: { pence: 1, currency: "GBP" } }, { reason: "eligible" }, { realExternalActions: 1 }])
      expect(importedCatchResult.safeParse({ ...result, ...change }).success).toBe(false);
  });
  it("refuses non-synthetic mode before connecting", async () => {
    vi.stubEnv("JOBGUARD_ENV", "production"); const f = scriptedImportPool(), repo = new ImportPreAdoptionRepository(f.pool);
    await expect(repo.write(f.context, D, J, command)).rejects.toThrow("SYNTHETIC_MODE_REQUIRED");
    await expect(repo.assess(f.context, D, J, assessment)).rejects.toThrow("SYNTHETIC_MODE_REQUIRED");
    expect(f.query).not.toHaveBeenCalled();
  });
  it("loads a stored zero result, never positive proposal content; replays have no extra effects", async () => {
    vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); const f = scriptedImportPool(), original = f.query.getMockImplementation()!;
    f.query.mockImplementation(async (sql, values) => sql.includes("app.ch5_imported_catch") ? { rows: [{ result }], rowCount: 1 } : original(sql, values));
    const repo = new ImportPreAdoptionRepository(f.pool);
    expect(await repo.assess(f.context, D, J, assessment)).toEqual(result);
    expect(await repo.assess(f.context, D, J, assessment)).toEqual(result);
    expect(f.query.mock.calls.filter(([sql]) => sql.includes("app.ch5_imported_catch"))[0]?.[1]).toEqual([f.context.tenantId, J, D, M, E, M]);
    expect(f.query.mock.calls.some(([sql]) => /INSERT|UPDATE|shadow_|recovery_fee|allocation/u.test(sql))).toBe(false);
    f.query.mockImplementation(async (sql, values) => sql.includes("app.ch5_imported_catch") ? { rows: [{ result: { ...result, jobId: M } }], rowCount: 1 } : original(sql, values));
    await expect(repo.assess(f.context, D, J, assessment)).rejects.toThrow("IMPORT_HISTORY_BINDING_MISMATCH");
  });
  it("replayed writer does not append another audit event", async () => {
    vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); const f = scriptedImportPool(), original = f.query.getMockImplementation()!;
    f.query.mockImplementation(async (sql, values) => sql.includes("app.ch5_write_history") ? { rows: [{ result: { id: M, actorId: M, inserted: false } }], rowCount: 1 } : original(sql, values));
    expect(await new ImportPreAdoptionRepository(f.pool).write(f.context, D, J, command)).toEqual({ historyId: M, classification: "pre_adoption_evidence" });
    expect(f.query.mock.calls.some(([sql]) => /audit_head|INSERT/u.test(sql))).toBe(false);
  });
});
