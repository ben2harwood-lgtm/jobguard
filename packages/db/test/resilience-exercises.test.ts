import { describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { compareObjectives, fakeDependencies, reconcileFakeProvider, replayFakeEffect, runResilienceExercises } from "../tools/resilience-exercises.mjs";

// Orchestration contract stub only. Real PostgreSQL restores are tested separately
// by resilience-exercises.integration.test.ts; fake key/provider I/O stays real here.
vi.mock("../tools/synthetic-restore.mjs", () => ({
  runSyntheticRestoreRehearsal: vi.fn(async () => ({
    result: "PASS", testStub: true,
    dependencyMeasurements: { database: { status: "exercised", recoveryMilliseconds: 1, dataLossMilliseconds: 0 } },
  })),
}));

const options = { version: "resilience-exercises.v1", outputDirectory: "/unused" };
describe("synthetic resilience exercise boundaries", () => {
  it.each(["postgresql://example.invalid/db", "postgresql://127.0.0.1.evil.invalid/db", "postgresql://127.0.0.1/db?host=remote", "file:///db", "invalid"])("refuses non-local database before touching fixtures: %s", async databaseUrl => {
    await expect(runResilienceExercises({ ...options, databaseUrl }, {})).rejects.toThrow("NON_LOCAL_DATABASE_REFUSED");
  });
  it("also refuses a supplied local database; creates its own disposable clusters only", async () => {
    await expect(runResilienceExercises({ ...options, databaseUrl: "postgresql://localhost/db" }, {})).rejects.toThrow("SUPPLIED_DATABASE_REFUSED");
  });
  it.each([0, -1, 1.5, 101])("rejects invalid repeat count %s", async runs => {
    await expect(runResilienceExercises({ ...options, runs }, {})).rejects.toThrow();
  });
  it("never reports pass without supplied approval evidence", () => {
    expect(compareObjectives({}, null)).toEqual({ status: "no approved objective" });
    expect(compareObjectives({}, { approval: null, dependencies: {} })).toEqual({ status: "no approved objective" });
  });
  it("reports misses and gaps rather than inventing measurements", () => {
    const result = compareObjectives({ database: { status: "exercised", recoveryMilliseconds: 11, dataLossMilliseconds: 0 }, sync: { status: "not exercised" } }, {
      approval: { decisionReference: "fictional-test-only", approvedBy: "fixture", approvedAt: "2000-01-01T00:00:00Z" },
      dependencies: { database: { recoveryMilliseconds: 10, dataLossMilliseconds: 0 }, sync: { recoveryMilliseconds: 10, dataLossMilliseconds: 0 } },
    });
    expect(result.status).toBe("incomplete or missed");
    expect(result.comparisons.database).toBe("objective missed");
    expect(result.comparisons.sync).toBe("not exercised");
    expect(result.comparisons.fakeKeys).toBe("no approved objective");
  });
  it("holds unknown or missing provider facts; reconciles terminal facts before replay", () => {
    const effect = { id: "fictional", kind: "collection", status: "outcome_unknown" };
    const provider = { effects: [], calls: { send: 0, collection: 1 } };
    expect(() => replayFakeEffect(effect, provider)).toThrow("RECONCILIATION_REQUIRED");
    expect(() => reconcileFakeProvider([effect], [])).toThrow("RECONCILIATION_REQUIRED");
    expect(() => reconcileFakeProvider([effect], [{ ...effect, kind: "send", status: "settled" }])).toThrow("RECONCILIATION_REQUIRED");
    expect(() => reconcileFakeProvider([effect], [{ ...effect, status: "executed" }])).toThrow("RECONCILIATION_REQUIRED");
    reconcileFakeProvider([effect], [{ ...effect, status: "settled" }]);
    replayFakeEffect(effect, provider);
    expect(provider.calls.collection).toBe(1);
  });
  it("writes separate versioned synthetic receipts and reads an unapproved objectives file", async () => {
    const root = await mkdtemp(join(tmpdir(), "resilience-wrapper-unit-"));
    try {
      const objectivesFile = join(root, "objectives.json");
      await writeFile(objectivesFile, JSON.stringify({ version: "resilience-objectives.v1", approval: null, dependencies: {} }));
      const paths = await runResilienceExercises({ ...options, outputDirectory: root, runs: 3, objectivesFile }, {});
      expect(new Set(paths).size).toBe(3);
      const receipts = await Promise.all(paths.map(async (path: string) => JSON.parse(await readFile(path, "utf8"))));
      expect(new Set(receipts.map(receipt => receipt.runId)).size).toBe(3);
      for (const receipt of receipts) {
        expect(receipt.version).toBe("jobguard-resilience-exercise-receipt.v1");
        expect(receipt.synthetic).toBe(true);
        expect(receipt.baseline.testStub).toBe(true);
        expect(receipt.objectiveResult.status).toBe("no approved objective");
        expect(receipt.noDuplicateEffects).toMatchObject({ sendCallsAfter: 1, collectionCallsAfter: 1 });
        expect(receipt.measurements.fakeKeys.recoveryMilliseconds).toBeGreaterThan(0);
        expect(receipt.measurements.sync).toMatchObject({ status: "not exercised" });
      }
      await expect(runResilienceExercises({ ...options, outputDirectory: root, objectivesFile: join(root, "missing.json") }, {})).rejects.toThrow();
      await writeFile(objectivesFile, JSON.stringify({ version: "resilience-objectives.v1", approval: true, dependencies: {} }));
      await expect(runResilienceExercises({ ...options, outputDirectory: root, objectivesFile }, {})).rejects.toThrow();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it("measures three separate fake key/provider restores with no duplicate effects", async () => {
    const root = await mkdtemp(join(tmpdir(), "resilience-unit-"));
    try {
      for (let run = 0; run < 3; run++) {
        const directory = await mkdtemp(join(root, "run-"));
        const result = await fakeDependencies(directory);
        expect(result.noDuplicateEffects).toMatchObject({ sendCallsBefore: 1, sendCallsAfter: 1, collectionCallsBefore: 1, collectionCallsAfter: 1, reconciledBeforeReplay: true });
        for (const measurement of Object.values(result.measurements)) {
          expect(measurement.recoveryMilliseconds).toBeGreaterThan(0);
          expect(measurement.dataLossMilliseconds).toBe(0);
        }
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
