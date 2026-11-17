import type { Pool } from "pg";
import { expect, it, vi } from "vitest";
import { snapshotRows as snapshot } from "./upgrade-proof-utils.js";

// Query-double checks for snapshot selection; real migration/zero-write proof runs in CI.
function fixture() {
  const tables: Record<string, unknown[]> = {
    "app.account": [{ id: "fictional-account", name: "Fictional builder" }],
    "app.customer_portal_grant": [],
    "app.customer_portal_session": [],
  };
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("FROM pg_tables")) return { rows: Object.keys(tables).map(name => {
      const [schemaname, tablename] = name.split(".");
      return { schemaname, tablename };
    }) };
    const relation = /FROM "([^"]+)"\."([^"]+)" t/u.exec(sql);
    const name = relation && `${relation[1]}.${relation[2]}`;
    if (!name || !(name in tables)) throw new Error("missing relation");
    return { rows: [{ data: structuredClone(tables[name]) }] };
  });
  return { tables, query, db: { query } as unknown as Pool };
}

it("compares the frozen table set after unrelated migrations add tables", async () => {
  const f = fixture(), before = await snapshot(f.db);
  f.tables["app.later_table"] = [];
  expect(await snapshot(f.db)).not.toEqual(before);
  f.query.mockClear();
  expect(await snapshot(f.db, Object.keys(before))).toEqual(before);
  expect(f.query).toHaveBeenCalledTimes(Object.keys(before).length);
  expect(f.query.mock.calls.some(([sql]) => sql.includes("pg_tables"))).toBe(false);
});

it.each(["changed", "inserted", "deleted", "grant", "session"])("still detects %s rows in tracked tables", async kind => {
  const f = fixture(), before = await snapshot(f.db);
  if (kind === "changed") f.tables["app.account"]![0] = { id: "fictional-account", name: "Changed" };
  if (kind === "inserted") f.tables["app.account"]!.push({ id: "unexpected-account" });
  if (kind === "deleted") f.tables["app.account"] = [];
  if (kind === "grant") f.tables["app.customer_portal_grant"]!.push({ id: "unexpected-grant" });
  if (kind === "session") f.tables["app.customer_portal_session"]!.push({ id: "unexpected-session" });
  expect(await snapshot(f.db, Object.keys(before))).not.toEqual(before);
});

it("fails if a tracked table disappears instead of filtering it out", async () => {
  const f = fixture(), before = await snapshot(f.db);
  delete f.tables["app.account"];
  await expect(snapshot(f.db, Object.keys(before))).rejects.toThrow("missing relation");
});
