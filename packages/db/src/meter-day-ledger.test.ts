import { describe, expect, it, vi } from "vitest";
import { verifiedTenantContextForQueuedJob, type TenantTransaction } from "./tenant-context.js";
import { persistMeterDayLedger } from "./meter-day-ledger.js";

describe("day-ledger internal input boundary", () => {
  const context = verifiedTenantContextForQueuedJob("00000000-0000-4000-8000-000000000002");
  it("refuses caller-supplied counts/tenants and malformed requests before SQL", async () => {
    const query = vi.fn(), tx = { $client: { query } } as unknown as TenantTransaction;
    for (const input of [null, {}, { version: "meter-day-ledger-write.v1", sourceId: "bad" },
      { version: "meter-day-ledger-write.v1", sourceId: "00000000-0000-4000-8000-000000000001", countedPlaces: 4 }]) {
      await expect(persistMeterDayLedger(tx, context, input)).rejects.toThrow("INVALID_METER_LIFECYCLE_INPUT");
    }
    expect(query).not.toHaveBeenCalled();
  });
  it("fails closed when the database declines the source scope", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ bound: false }] });
    const sourceId = "00000000-0000-4000-8000-000000000001";
    await expect(persistMeterDayLedger({ $client: { query } } as unknown as TenantTransaction,
      context, { version: "meter-day-ledger-write.v1", sourceId })).rejects.toThrow("METER_FORBIDDEN");
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith("SELECT app.lp11_bind_meter_source($1,$2) AS bound", [context.tenantId, sourceId]);
  });
});
