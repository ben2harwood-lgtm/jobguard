import { testTenantContext } from "./tenant-context-test-utils.js";
import { describe, expect, it } from "vitest";
import * as database from "../src/index.js";
import { runSyntheticRestoreRehearsal } from "../tools/synthetic-restore.mjs";
const fixtureDatabase = { ...database,
  verifiedTenantContextFromMembership: (membership: Parameters<typeof database.verifiedTenantContextFromMembership>[0]) =>
    testTenantContext(membership.tenantId, { membershipId: membership.membershipId }),
};

describe("disposable synthetic restore rehearsal", () => {
  it.each(["production", "pilot_no_charge", "provider_sandbox", "", undefined])("refuses non-synthetic explicit mode %s", async mode => {
    await expect(runSyntheticRestoreRehearsal({ environment: mode }, fixtureDatabase)).rejects.toThrow("SYNTHETIC_REHEARSAL_ONLY");
  });
  it.each([{ databaseUrl: "postgresql://example.invalid/existing" }, { directory: "/existing" }, null, []])("refuses connection/path/invalid options %j", async options => {
    await expect(runSyntheticRestoreRehearsal(options, fixtureDatabase)).rejects.toThrow("REHEARSAL_OPTIONS_REFUSED");
  });
  it("restores all rows/evidence/roles/audit and safely handles pending and unknown fake work", async () => {
    const receipt = await runSyntheticRestoreRehearsal({ environment: "synthetic_demo" }, fixtureDatabase);
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
    expect(receipt.outboundControl).toMatchObject({ sourceClaimsEnabled: true, restoredPausedBeforeRuntime: true, finalPaused: true,
      attemptsWhilePaused: 0, independentlyApprovedByFixtureOperator: true });
    expect(receipt.outboundControl.reconciliationReceipt).toMatch(/^[a-f0-9-]{36}$/);
    expect(receipt.notRun).toContain("Deployed restore, reconciliation and independently authorized unpause; fixture operators only");
    expect(receipt.productionRpoRto).toBe("NOT_ESTABLISHED");
  }, 120_000);
});
