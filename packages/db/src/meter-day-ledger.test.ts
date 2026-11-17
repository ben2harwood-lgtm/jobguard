import { describe, expect, it, vi } from "vitest";
import type { TenantTransaction } from "./tenant-context.js";
import { persistMeterDayLedger } from "./meter-day-ledger.js";

describe("day-ledger internal input boundary", () => {
  it("refuses caller-supplied counts/tenants and malformed requests before SQL", async () => {
    const query = vi.fn(), tx = { $client: { query } } as unknown as TenantTransaction;
    for (const input of [null, {}, { version: "meter-day-ledger-write.v1", sourceId: "bad" },
      { version: "meter-day-ledger-write.v1", sourceId: "00000000-0000-4000-8000-000000000001", countedPlaces: 4 }]) {
      await expect(persistMeterDayLedger(tx, input)).rejects.toThrow("INVALID_METER_LIFECYCLE_INPUT");
    }
    expect(query).not.toHaveBeenCalled();
  });
  it("fails closed without a tenant context", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ tenant_id: null }] });
    await expect(persistMeterDayLedger({ $client: { query } } as unknown as TenantTransaction,
      { version: "meter-day-ledger-write.v1", sourceId: "00000000-0000-4000-8000-000000000001" })).rejects.toThrow("METER_FORBIDDEN");
    expect(query).toHaveBeenCalledTimes(1);
  });
});
