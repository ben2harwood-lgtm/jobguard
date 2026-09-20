import { describe, expect, it } from "vitest";
import * as database from "../src/index.js";
import { runSyntheticRestoreRehearsal } from "../tools/synthetic-restore.mjs";

describe("disposable synthetic restore rehearsal", () => {
  it.each(["production", "pilot_no_charge", "provider_sandbox", "", undefined])("refuses non-synthetic explicit mode %s", async mode => {
    await expect(runSyntheticRestoreRehearsal({ environment: mode }, database)).rejects.toThrow("SYNTHETIC_REHEARSAL_ONLY");
  });
  it.each([{ databaseUrl: "postgresql://example.invalid/existing" }, { directory: "/existing" }, null, []])("refuses connection/path/invalid options %j", async options => {
    await expect(runSyntheticRestoreRehearsal(options, database)).rejects.toThrow("REHEARSAL_OPTIONS_REFUSED");
  });
  it("restores all rows/evidence/roles/audit and safely handles pending and unknown fake work", async () => {
    const receipt = await runSyntheticRestoreRehearsal({ environment: "synthetic_demo" }, database);
    expect(receipt.result).toBe("PASS");
    expect(receipt.checks).toHaveLength(12);
    expect(receipt.checks.every((check: { status: string }) => check.status === "PASS")).toBe(true);
    expect(receipt.backup.fileCount).toBeGreaterThan(100);
    expect(receipt.backup.manifestSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.tableCount).toBeGreaterThan(30);
    expect(receipt.fakeDeliveryCallsAfterRestore).toBe(1);
    expect(receipt.liveProviderCalls).toBe(0);
    expect(receipt.realDataUsed).toBe(false);
    expect(receipt.releaseDecision).toBe("NOT_AUTHORIZED");
    expect(receipt.notRun).toContain("Application-wide outbound kill switch and independently authorized unpause");
    expect(receipt.productionRpoRto).toBe("NOT_ESTABLISHED");
  }, 120_000);
});
