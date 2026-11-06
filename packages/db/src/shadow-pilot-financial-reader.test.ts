import type { Pool } from "pg";
import { afterEach, expect, it, vi } from "vitest";
import { shadowPilotFinancialHash, type ShadowPilotFinancialRecord } from "@jobguard/core";
import { ShadowPilotFinancialReader } from "./shadow-pilot-financial-reader.js";
import { verifiedTenantContextFromMembership } from "./tenant-context.js";

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const binding = { tenantId: id(1), jobId: id(2), lockId: id(3) };
const context = verifiedTenantContextFromMembership({
  identityUserId: id(7), membershipId: id(8), tenantId: binding.tenantId,
} as Parameters<typeof verifiedTenantContextFromMembership>[0]);
const access = { ...binding, environment: "synthetic_demo", audience: "synthetic_researcher" };
const input = {
  version: "shadow-pilot-report-input.v1", environment: "synthetic_demo",
  immutableObservationSetRef: "synthetic:observations",
  measurement: {
    version: "shadow-pilot-measurement.v1", environment: "synthetic_demo", ...binding,
    snapshotRef: "synthetic:snapshot", immutableRecordSetRef: "synthetic:records",
    captures: [], lockedLineIds: [], signals: [], receipts: [], allocations: [], mustSurface: [], subscriptionScenario: null,
  },
  reveal: null, fairness: null, harm: null,
};
function fixture(sources: ShadowPilotFinancialRecord["sources"] = []) {
  const record = { version: "shadow-pilot-financial-record.v1" as const, tenantId: binding.tenantId,
    jobIds: [binding.jobId], sources };
  const reader = new ShadowPilotFinancialReader({} as Pool);
  const read = vi.spyOn(reader, "read").mockResolvedValue({ ...record, sourceHash: shadowPilotFinancialHash(record) });
  return { reader, read, report: (raw: unknown = input, caller = access) => reader.report(context, [binding.jobId], raw, caller) };
}
afterEach(() => vi.restoreAllMocks());

it("names each validated stored financial row only at the offline research boundary", async () => {
  const sources: ShadowPilotFinancialRecord["sources"] = [
    { kind: "accruals", table: "success_fee_journal", jobId: binding.jobId, rowId: id(4), rowHash: "a".repeat(64) },
    { kind: "invoices", table: "platform_fee_statement", jobId: binding.jobId, rowId: id(5), rowHash: "b".repeat(64) },
    { kind: "collections", table: "platform_fee_attempt", jobId: binding.jobId, rowId: id(6), rowHash: "c".repeat(64) },
  ];
  for (let count = 1; count <= sources.length; count++) {
    const f = fixture(sources.slice(0, count));
    const error = await f.report().catch((error: unknown) => error);
    expect(error).toMatchObject({ name: "ShadowPilotReportError", code: "INVALID_PILOT_REPORT", financialSources: sources.slice(0, count) });
    for (const source of sources.slice(0, count)) expect((error as Error).message).toContain(source.rowId);
    expect(f.read).toHaveBeenCalledWith(context, [binding.jobId]);
  }
});

it("keeps clean reports and generic validation refusals intact", async () => {
  const f = fixture();
  expect((await f.report()).effects).toEqual({ accruals: 0, invoices: 0, collections: 0 });
  await expect(f.report({ ...input, unexpected: true })).rejects.toMatchObject({ message: "INVALID_PILOT_REPORT", financialSources: [] });
});

it("rejects unauthorized access and caller financial assertions before reading private books", async () => {
  const f = fixture();
  for (const caller of [{ ...access, audience: "builder" }, { ...access, tenantId: id(99) }, { ...access, environment: "production" }])
    await expect(f.report(input, caller)).rejects.toMatchObject({ message: "INVALID_PILOT_REPORT", financialSources: [] });
  for (const field of ["financialEffects", "financialRecord"])
    await expect(f.report({ ...input, [field]: {} })).rejects.toMatchObject({ message: "INVALID_PILOT_REPORT", financialSources: [] });
  expect(f.read).not.toHaveBeenCalled();
});
