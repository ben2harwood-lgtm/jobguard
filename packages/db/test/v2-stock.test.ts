import { afterEach, describe, expect, it, vi } from "vitest";
import { stockCommandV1, stockPosition } from "../src/v2-stock-repository.js";
import type { Pool } from "pg";
import { StockApplication } from "../../../apps/api/src/workspace/stock.application.js";

const base = { version: "v2-stock-command.v1", action: "add_forecast", commandId: "00000000-0000-4000-8000-000000000001",
  deliveryId: "00000000-0000-4000-8000-000000000002", scopeItemId: "00000000-0000-4000-8000-000000000003",
  lineKey: "tiles", supplier: "Fictional Merchant", expectedVersion: 0, forecastDate: "2026-12-07", packsExpected: "5" };

describe("V2 stock position", () => {
  it("shows four of six available and two short from a partial receipt", () => {
    expect(stockPosition("1", "6", ["3"])).toEqual({ setAsidePacks: "1", receivedPacks: "3",
      availablePacks: "4", requiredPacks: "6", shortPacks: "2" });
  });
  it("counts no forecasts and keeps unknown requirements unknown", () => {
    expect(stockPosition("1", "6", [])).toMatchObject({ availablePacks: "1", shortPacks: "5" });
    expect(stockPosition("0", null, ["1"])).toMatchObject({ availablePacks: "1", requiredPacks: null, shortPacks: null });
  });
  it("aggregates actual receipts exactly and floors shortage at zero", () => {
    expect(stockPosition("999999999", "6", ["999999999", "999999999"])).toMatchObject({
      availablePacks: "2999999997", shortPacks: "0" });
  });
  it("accepts a versioned forecast", () => { expect(stockCommandV1.safeParse(base).success).toBe(true); });
  it.each([{ packsExpected: "0" }, { packsExpected: "1.5" }, { packsExpected: "-1" }, { packsExpected: "1000000000" },
    { packsExpected: 5 }, { forecastDate: "2026-02-30" }, { expectedVersion: -1 }, { supplier: "\0" },
    { tenantId: "00000000-0000-4000-8000-000000000009" }, { receivedByMembershipId: base.commandId }])(
    "refuses invalid or caller-owned authority fields %j", changes => {
      expect(stockCommandV1.safeParse({ ...base, ...changes }).success).toBe(false);
    });
  it.each(["0", "-1", "1.5", "01"])("refuses invalid received packs %s", packsReceived => {
    expect(stockCommandV1.safeParse({ version: base.version, commandId: base.commandId, deliveryId: base.deliveryId,
      action: "record_receipt", expectedVersion: 1, packsReceived }).success).toBe(false);
  });
});

afterEach(() => vi.unstubAllEnvs());
it.each(["pilot_no_charge", "production_billing", "provider_sandbox"])("refuses stock outside synthetic mode: %s", async mode => {
  vi.stubEnv("JOBGUARD_LOCAL_V2", "1");
  vi.stubEnv("JOBGUARD_ENV", mode);
  const connect = vi.fn();
  const app = new StockApplication({ connect } as unknown as Pool);
  await expect(app.read("unused", { version: "v2-stock-query.v1" })).rejects.toMatchObject({ code: "SYNTHETIC_MODE_REQUIRED" });
  await expect(app.execute("unused", {} as never)).rejects.toMatchObject({ code: "SYNTHETIC_MODE_REQUIRED" });
  expect(connect).not.toHaveBeenCalled();
});
it("leaves non-V2 synthetic behaviour untouched", async () => {
  vi.stubEnv("JOBGUARD_LOCAL_V2", "0");
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  const connect = vi.fn();
  const app = new StockApplication({ connect } as unknown as Pool);
  await expect(app.read("unused", { version: "v2-stock-query.v1" })).rejects.toMatchObject({ code: "SYNTHETIC_MODE_REQUIRED" });
  await expect(app.execute("unused", {} as never)).rejects.toMatchObject({ code: "SYNTHETIC_MODE_REQUIRED" });
  expect(connect).not.toHaveBeenCalled();
});
