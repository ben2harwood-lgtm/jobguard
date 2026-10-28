import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { expect, it, vi } from "vitest";
import { MeterTodayRepository } from "./meter-today-repository.js";
import { verifiedTenantContextFromMembership } from "./tenant-context.js";
const tenantId = randomUUID(), digest = "a".repeat(64);
const context = verifiedTenantContextFromMembership({ tenantId, identityUserId: randomUUID(), membershipId: randomUUID() } as Parameters<typeof verifiedTenantContextFromMembership>[0]);
const view = { version: "meter-today-read.v1", hypothetical: true, date: "2026-10-28", plan: "Builder", countedPlaces: 5, freeSmallPlaces: 0 };
function fixture(raw: unknown = view, error?: Error) {
  const query = vi.fn(async (sql: string, _values?: unknown[]) => {
    if (sql.includes("mon1_fresh_counted_meter_today")) { if (error) throw error; return { rows: [{ result: raw }] }; }
    return { rows: [] };
  });
  const release = vi.fn(), connect = vi.fn(async () => ({ query, release }));
  return { repository: new MeterTodayRepository({ connect } as unknown as Pool), query, release, connect };
}
it("reads only the authorized routine with tenant context and digest, committing and releasing", async () => {
  const f = fixture(); expect(await f.repository.read(context, digest)).toEqual(view);
  expect(f.query).toHaveBeenCalledWith("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
  expect(f.query).toHaveBeenCalledWith("SELECT app.mon1_fresh_counted_meter_today($1,$2) result", [tenantId, digest]);
  expect(f.query).toHaveBeenLastCalledWith("COMMIT"); expect(f.release).toHaveBeenCalledOnce();
});
it("rejects malformed persisted counts instead of displaying zero", async () => {
  for (const raw of [null, { ...view, countedPlaces: -1 }, { ...view, hypothetical: false }, { ...view, tenantId }]) {
    const f = fixture(raw); await expect(f.repository.read(context, digest)).rejects.toThrow("METER_PROJECTION_MISMATCH");
    expect(f.query).toHaveBeenLastCalledWith("ROLLBACK"); expect(f.release).toHaveBeenCalledOnce();
  }
});
it("refuses invalid digest before connecting and maps SQL denials without exposing details", async () => {
  const f = fixture(); await expect(f.repository.read(context, "bad")).rejects.toThrow("METER_FORBIDDEN"); expect(f.connect).not.toHaveBeenCalled();
  for (const [message, code] of [["METER_FORBIDDEN", "METER_FORBIDDEN"], ["METER_PROJECTION_MISMATCH", "METER_PROJECTION_MISMATCH"], ["private data", "METER_UNAVAILABLE"]]) {
    await expect(fixture(null, new Error(message)).repository.read(context, digest)).rejects.toThrow(code);
  }
});
