import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { loadMigrationProofs } from "./migration-proof-loader.js";
import { extraProceedRegistryRow, currentCommandRegistryRows } from "./lp5-command-catalog.js";
const sql = readFileSync(new URL("../migrations/0987_extra_proceed_statement.sql", import.meta.url), "utf8");
const previous = readFileSync(new URL("../migrations/0573_site_supervisor_query.sql", import.meta.url), "utf8");
it("extends only the result adapter, preserving all previous branches byte for byte", () => {
 const body = (s: string) => s.slice(s.indexOf("CREATE OR REPLACE FUNCTION app.lp5_command_result"), s.lastIndexOf("COMMIT;")).trim();
 expect(body(sql).replace(/ WHEN 'extra_proceed' THEN[\s\S]*?(?= WHEN 'managed_recovery' THEN)/u, "")).toBe(body(previous));
});
it("registers the operational command, side-table proof and no commercial writer or fingerprinted columns", () => {
 expect(currentCommandRegistryRows.filter(row => row.command_type === "RecordExtraProceed")).toEqual([extraProceedRegistryRow]);
 expect(sql).toContain("('RecordExtraProceed','repository-command.v1','active_member','route_before_begin','extra_proceed','operational',NULL)");
 const writer = sql.split("CREATE FUNCTION app.xa_proceed(p_job")[1]!.split("END $$;")[0]!;
 expect(writer.match(/INSERT INTO app\.[a-z_]+/gu)).toEqual(["INSERT INTO app.extra_proceed_statement"]);
 expect(writer).not.toMatch(/UPDATE app\.|DELETE FROM app\.|app\.xa_(?:approve|price|open_request|resolve_decision|event)\(/u);
 expect(sql).not.toMatch(/ADD COLUMN|SET app\./u);
 const proof = loadMigrationProofs().proofs.find(p => p.migration === "0987_extra_proceed_statement.sql")!;
 expect(proof.tenancy).toEqual([{ relname: "extra_proceed_statement", before: null, after: { relrowsecurity: true, relforcerowsecurity: true, guarded: true, owner: "jobguard_migration" } }]);
});
