import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { MIGRATION_URLS } from "./migrate.js";

// Source/registry check only; actual privilege refusal and the supported reader
// are exercised in the PostgreSQL grant-freeze, upgrade and meter-today suites.
it("discovers the forward-only legacy reader revoke without changing routine bodies or other grants", () => {
  const urls = MIGRATION_URLS.filter(url => url.pathname.endsWith("/0399_meter_reader_revoke.sql"));
  expect(urls).toHaveLength(1);
  const sql = readFileSync(urls[0]!, "utf8").replace(/--[^\n]*/gu, "").trim();
  expect(sql.split(";").map(statement => statement.trim()).filter(Boolean)).toEqual([
    "BEGIN",
    "REVOKE EXECUTE ON FUNCTION app.mon1_counted_meter_today(uuid,text) FROM jobguard_runtime",
    "COMMIT",
  ]);
});
