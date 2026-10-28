import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { TenantTransaction } from "./tenant-context.js";
import { claimCommandIdentity, WatchdogError } from "./watchdog.js";

const sourceKinds = {
  "app.job_diary_entry": "JobSource.diary",
  "app.customer_message_source": "JobSource.customer_message",
} as const;
type SourceTable = keyof typeof sourceKinds;
const spec = () => ({ tenantId: randomUUID(), commandId: randomUUID(), jobId: randomUUID(), kind: "readiness.record" as const, requestHash: "a".repeat(64) });

// Simulate the query boundary on old/current schemas. Real catalog parsing and
// command behavior remain covered by the PostgreSQL upgrade and replay suites.
function fixture(tables: SourceTable[]) {
  const present = new Set(tables), owned = new Set<SourceTable>();
  const legacy: Array<{ kind: string; job_id: string }> = [];
  const input = spec();
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("pg_catalog.to_regclass")) return { rows: [...present].map(name => ({ name })) };
    if (sql.includes("FROM app.planned_work_revision") || sql.startsWith("SELECT 'JobSource.")) {
      const rows = sql.includes("FROM app.planned_work_revision") ? [...legacy] : [];
      for (const table of Object.keys(sourceKinds) as SourceTable[]) if (sql.includes(`FROM ${table} `)) {
        if (!present.has(table)) throw new Error(`relation "${table}" does not exist`);
        if (owned.has(table)) rows.push({ kind: sourceKinds[table], job_id: input.jobId });
      }
      return { rows };
    }
    if (sql.startsWith("INSERT INTO app.watchdog_command_identity")) return { rowCount: 1, rows: [{ command_id: input.commandId }] };
    return { rows: [] };
  });
  const db = { $client: { query } } as unknown as TenantTransaction;
  return { db, input, present, owned, legacy, query };
}

describe("legacy command ownership across source-schema upgrades", () => {
  it.each(([[], ["app.job_diary_entry"], ["app.customer_message_source"], Object.keys(sourceKinds)] as SourceTable[][]).map(tables => ({ tables })))(
    "claims a fresh id with available source tables $tables", async ({ tables }) => {
      const f = fixture(tables);
      await expect(claimCommandIdentity(f.db, f.input)).resolves.toBe("new");
      expect(f.query).toHaveBeenCalledWith(expect.stringContaining("FROM app.planned_work_revision"), [f.input.tenantId, f.input.commandId]);
    },
  );
  it.each(Object.keys(sourceKinds) as SourceTable[])("refuses an id persisted in %s before inserting a claim", async table => {
    const f = fixture(Object.keys(sourceKinds) as SourceTable[]); f.owned.add(table);
    await expect(claimCommandIdentity(f.db, f.input)).rejects.toEqual(new WatchdogError("IDEMPOTENCY_CONFLICT"));
    expect(f.query.mock.calls.some(([sql]) => sql.startsWith("INSERT INTO"))).toBe(false);
  });
  it("keeps earlier cross-kind reservations on a schema with no source tables", async () => {
    const f = fixture([]); f.legacy.push({ kind: "proof.complete", job_id: f.input.jobId });
    await expect(claimCommandIdentity(f.db, f.input)).rejects.toEqual(new WatchdogError("IDEMPOTENCY_CONFLICT"));
  });
  it("rechecks table presence when the same connection observes an upgrade", async () => {
    const f = fixture([]);
    await expect(claimCommandIdentity(f.db, f.input)).resolves.toBe("new");
    f.present.add("app.job_diary_entry"); f.owned.add("app.job_diary_entry");
    await expect(claimCommandIdentity(f.db, { ...f.input, commandId: randomUUID() })).rejects.toEqual(new WatchdogError("IDEMPOTENCY_CONFLICT"));
  });
  it("propagates catalog errors instead of bypassing ownership checks", async () => {
    const f = fixture([]), error = new Error("catalog unavailable");
    f.query.mockImplementationOnce(async () => ({ rows: [] })).mockRejectedValueOnce(error);
    await expect(claimCommandIdentity(f.db, f.input)).rejects.toBe(error);
    expect(f.query.mock.calls.some(([sql]) => sql.startsWith("INSERT INTO"))).toBe(false);
  });
});
