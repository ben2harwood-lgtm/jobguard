// CI PostgreSQL upgrade proof: preserve populated business rows and exact predecessor routine ACLs.
import { afterAll, expect, it, vi } from "vitest";
import { startBeforeMigration, applyMigration, snapshot, type Cluster } from "./contractor-entitlement-fixtures.js";
import { chainWorld, submitted } from "./extra-approval-chain-fixtures.js";
import { abandonedSiteVisitRegistryRow, duplicateDispositionLifecycleRegistryRow } from "./lp5-command-catalog.js";
import { migrate } from "../src/index.js";
let c: Cluster | undefined;
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });
it("0905 upgrades populated approval requests without changing any earlier row, column or privilege, and reruns harmlessly", async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 c = await startBeforeMigration("0634_extra_proceed_statement.sql");
 const w = await chainWorld(c); await submitted(c, w, 150000);
 const before = await snapshot(c.admin);
 const catalogue = async () => (await c!.admin.query(`SELECT p.oid,n.nspname,p.proname,p.proowner,p.proacl,p.prosecdef,p.proconfig,
  pg_get_function_identity_arguments(p.oid) args,pg_get_functiondef(p.oid) definition
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('app','identity','control_plane','audit_control') AND p.prokind='f' ORDER BY p.oid`)).rows;
 const prior = await catalogue();
 const columns = async () => (await c!.admin.query(`SELECT n.nspname,c.relname,a.attname,format_type(a.atttypid,a.atttypmod) type,a.attnotnull
  FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='app' AND c.relkind='r' AND c.relname<>'extra_proceed_statement' AND a.attnum>0 AND NOT a.attisdropped ORDER BY 1,2,a.attnum`)).rows;
 const previousColumns = await columns();
 await applyMigration(c, "0634_extra_proceed_statement.sql");
 const after = await snapshot(c.admin);
 expect({ ...after, "app.command_type_registry": before["app.command_type_registry"] }).toEqual({ ...before, "app.extra_proceed_statement": [] });
 const previousRegistry = before["app.command_type_registry"] as unknown[], registry = after["app.command_type_registry"] as unknown[];
 expect(registry).toEqual(expect.arrayContaining(previousRegistry));
 expect(registry.length).toBe(previousRegistry.length + 1);
 expect(await columns()).toEqual(previousColumns);
 const live = await catalogue();
 for (const old of prior) {
  const current = live.find(r => r.oid === old.oid);
  if (old.nspname === 'app' && old.proname === 'lp5_command_result' && old.args === 'p_command_id uuid, p_outcome jsonb') {
   expect({ ...current, definition: old.definition }).toEqual(old);
   expect(current.definition.replace(/ WHEN 'extra_proceed' THEN[\s\S]*?(?= WHEN 'managed_recovery' THEN)/u, '')).toEqual(old.definition);
  } else expect(current).toEqual(old);
 }
 // On replay 0639 (batch-41) and 0641 (batch-42) add only empty tables, and 0642 (Q10) moves IssueClientApproval
 // from the owner rule to the contractor rule. WALK-2 adds only an empty blank-practice session table;
 // LS-93 (0719) adds only an empty commercial_grant_use table and REAL-FIRM-PROFILE only an empty firm_profile table. Every other row still compares exactly.
 // 0722 adds CloseAbandonedSiteVisit and 0807 adds the ResolveDuplicateCandidates lifecycle row; every other row still compares exactly.
 const replayedRegistryRows = (after["app.command_type_registry"] as { command_type: string; permission_rule: string }[]).map(row =>
  row.command_type === "IssueClientApproval" && row.permission_rule === "owner" ? { ...row, permission_rule: "contractor" } : row);
 const replayedRegistry = (await c.admin.query("SELECT jsonb_agg(value ORDER BY value::text) data FROM jsonb_array_elements($1::jsonb)",
  [JSON.stringify([...replayedRegistryRows, abandonedSiteVisitRegistryRow, duplicateDispositionLifecycleRegistryRow])])).rows[0].data;
 await migrate(c.admin); await migrate(c.admin); expect(await snapshot(c.admin)).toEqual({ ...after, "app.connector_promotion": [], "control_plane.blank_practice_session": [],
  "app.extra_client_command_session": [], "app.extra_client_session": [], "app.extra_client_signin": [], "app.extra_pack_artifact": [], "app.commercial_grant_use": [], "app.firm_profile": [], "app.command_type_registry": replayedRegistry });
}, 240_000);
