import { expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as database from "../src/index.js";
import { runResilienceExercises } from "../tools/resilience-exercises.mjs";

it("writes three distinct receipts from actual disposable PostgreSQL restores", async () => {
  const directory = await mkdtemp(join(tmpdir(), "resilience-integration-"));
  try {
    const paths = await runResilienceExercises({ version: "resilience-exercises.v1", runs: 3, outputDirectory: directory }, database);
    expect(new Set(paths).size).toBe(3);
    const receipts = await Promise.all(paths.map(async (path: string) => JSON.parse(await readFile(path, "utf8"))));
    expect(new Set(receipts.map(receipt => receipt.runId)).size).toBe(3);
    for (const receipt of receipts) {
      expect(receipt.version).toBe("jobguard-resilience-exercise-receipt.v1");
      expect(receipt.synthetic).toBe(true);
      expect(receipt.objectiveResult.status).toBe("no approved objective");
      expect(receipt.baseline.result).toBe("PASS");
      expect(receipt.baseline.fakeDeliveryCallsAfterRestore).toBe(1);
      expect(receipt.baseline.outboundControl.finalPaused).toBe(true);
      expect(receipt.noDuplicateEffects).toMatchObject({ sendCallsAfter: 1, collectionCallsAfter: 1, reconciledBeforeReplay: true });
      for (const name of ["database", "evidenceVersions", "auditCheckpoint", "fakeKeys", "fakeProvider"]) {
        expect(receipt.measurements[name].recoveryMilliseconds).toBeGreaterThan(0);
        expect(receipt.measurements[name].dataLossMilliseconds).toBe(0);
      }
      expect(receipt.measurements.sync.status).toBe("not exercised");
      expect(receipt.measurements.externalAuditAnchors.status).toBe("not exercised");
      expect(receipt.releaseDecision).toBe("NOT_AUTHORIZED");
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 360_000);
