import { readFile } from "node:fs/promises";
import { currentCommandRegistryRows } from "./lp5-command-catalog.js";
import { afterAll, expect, it } from "vitest";
import { startBeforeMigration, applyMigration, snapshot, type Cluster } from "./contractor-entitlement-fixtures.js";
import { firstTrialFixture } from "./free-first-job-lifecycle-fixtures.js";
import { meterCompany, command, terms } from "./subscription-persistence-fixtures.js";
import { service, request, retainedExport } from "./plan-entitlement-lifecycle-fixtures.js";
import { applyUpgradeProofs, loadMigrationProofs } from "./migration-proof-loader.js";
import { laterEmptyTables } from "./later-empty-tables.js";
import { migrate } from "../src/index.js";
import type { WorkFixture } from "./job-work-state-fixtures.js";
let c: Cluster | undefined;
afterAll(async () => { await c?.close(); });
it("0556 preserves all populated tables and routine ACLs, installs only the adapter body, and replays harmlessly", async () => {
  process.env.JOBGUARD_ENV = "synthetic_demo";
  c = await startBeforeMigration("0556_mon8_job_track_and_trial.sql");
  const f = c as unknown as WorkFixture, trial = await firstTrialFixture(f), paid = await meterCompany(f);
  await command(f, paid, terms(paid)); await retainedExport(f, trial);
  const before = await snapshot(c.admin);
  const catalogue = async () => (await c!.admin.query(`SELECT n.nspname,p.proname,p.oid,p.proowner,p.proacl,p.prosecdef,p.proconfig,pg_get_function_identity_arguments(p.oid) args,
    CASE WHEN p.oid<>'app.mon8_company_feature(text,text,uuid)'::regprocedure THEN pg_get_functiondef(p.oid) END definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('app','identity','control_plane','audit_control','worm_control') AND p.prokind='f' ORDER BY p.oid`)).rows;
  const security = await catalogue();
  expect(await service(f, trial).check(request("final_check", trial.jobId))).toMatchObject({ executable: false });
  await applyMigration(c, "0556_mon8_job_track_and_trial.sql");
  expect(await snapshot(c.admin)).toEqual(before); expect(await catalogue()).toEqual(security);
  expect(await service(f, trial).require(request("final_check", trial.jobId))).toMatchObject({ executable: true });
  expect(await service(f, paid).require(request("invoices", paid.jobId))).toMatchObject({ executable: true });
  await migrate(c.admin); await migrate(c.admin);
  expect(await snapshot(c.admin)).toEqual({ ...before, ...laterEmptyTables, "app.command_type_registry": (await c.admin.query("SELECT jsonb_agg(value ORDER BY value::text) data FROM jsonb_array_elements($1::jsonb)", [JSON.stringify(currentCommandRegistryRows)])).rows[0].data });
  // Successor migrations have their own exact reviewed routine ACL additions.
  // Keep the 0556-only assertion above, and retain every predecessor definition.
  const live = await catalogue();
  // 0587 replaces only the payment-fee writer body; keep every mainline exception below.
  const paymentFeeWriterOid = (await c.admin.query("SELECT 'app.write_payment_fee(uuid,text,jsonb)'::regprocedure::oid oid")).rows[0].oid;
  const collectRecheck = await readFile(new URL("../migrations/0587_payment_fee_collect_recheck.sql", import.meta.url), "utf8");
  const paymentFeeWriterBody = collectRecheck.split("CREATE OR REPLACE FUNCTION app.write_payment_fee")[1]!.split("AS $$")[1]!.split("$$;")[0];
  // Ben's router ruling: the 0584 effective-session successor was renumbered to 0596 by stem only.
  // Only this exact routine may take its reviewed successor body; its complete definition header stays exact.
  const effectiveSessionOid = (await c.admin.query("SELECT 'app.lp6_session_authority(text,text,uuid)'::regprocedure::oid oid")).rows[0].oid;
  const effectiveSessionMigration = await readFile(new URL("../migrations/0596_lp6b_effective_session_actor.sql", import.meta.url), "utf8");
  const effectiveSessionBody = effectiveSessionMigration.split("AS $$")[1]!.split("$$;")[0];
  // 0567 changes only the checked settlement overload's expected approval hash.
  const settlementOid = (await c.admin.query("SELECT 'app.record_simulated_settlement(uuid,uuid,uuid,character varying,bigint,timestamp with time zone,uuid,uuid,uuid)'::regprocedure::oid oid")).rows[0].oid;
  const selfComparison = "(SELECT content_hash FROM app.action_authorization WHERE tenant_id=p_tenant AND id=p_authorization)";
  for (const prior of security) {
    const current = live.find(row => row.oid === prior.oid);
    // 0566 and 0573 extend exactly this dispatcher for managed recovery and supervisor queries.
    if (prior.nspname === "app" && prior.proname === "lp5_command_result" && prior.args === "p_command_id uuid, p_outcome jsonb") continue;
    // 0599_accounting_export_route_change changes only this checked synthetic dispatcher; dedicated route upgrade tests bind the body.
    if (prior.nspname === "app" && prior.proname === "accounting_export" &&
      prior.args === "t uuid, digest text, operation text, source text, v jsonb") {
      expect(current?.definition).not.toEqual(prior.definition);
    } else
    // 0583 replaces only this exact predecessor body; its dedicated upgrade proof checks the replacement.
    if (prior.nspname === "app" && prior.proname === "write_success_fee_v3" &&
      prior.args === "p_job uuid, p_session text, p_command jsonb, p_artifact jsonb") {
      expect(current?.definition).not.toEqual(prior.definition);
    } else if (prior.oid === effectiveSessionOid) {
      const predecessorParts = prior.definition.split("$function$");
      expect(predecessorParts).toHaveLength(3);
      expect(current?.definition).toEqual(`${predecessorParts[0]}$function$${effectiveSessionBody}$function$${predecessorParts[2]}`);
    } else if (prior.oid === paymentFeeWriterOid) {
      expect(current?.definition?.split("$function$")[1]).toEqual(paymentFeeWriterBody);
    } else if (prior.oid === settlementOid) {
      expect(prior.definition).toContain(selfComparison);
      expect(current?.definition).toEqual(prior.definition.replace(selfComparison, "payload"));
    } else {
      expect(current?.definition).toEqual(prior.definition);
    }
  }
  const privileges = (rows: typeof security) => rows.map(({ oid: _oid, definition: _definition, ...row }) => row)
    .sort((a,b) => a.nspname.localeCompare(b.nspname) || a.proname.localeCompare(b.proname) || a.args.localeCompare(b.args));
  const ownerOids = Object.fromEntries((await c.admin.query("SELECT rolname,oid FROM pg_roles")).rows.map(row => [row.rolname,row.oid]));
  const successors = loadMigrationProofs().proofs.filter(proof => proof.migration > "0556_mon8_job_track_and_trial.sql")
    .map(proof => ({ ...proof, upgrade: proof.upgrade.filter(change => change.section === "routines") }));
  // The historical fixture staged 0562 early. Strictly undo only that reviewed
  // fixture metadata, then replay EVERY successor below; no proof is skipped.
  // The inverse checks exact reviewed after-values before restoring before-values.
  const foundation = successors.find(proof => proof.migration === "0562_lp6a_request_binding.sql");
  expect(foundation).toBeDefined();
  expect(foundation!.upgrade).toHaveLength(6);
  expect(foundation!.upgrade.map(change => {
    if (change.section !== "routines" || change.after === null) throw new Error("Unexpected 0562 routine normalization record");
    return change.after.nspname + "." + change.after.proname + "(" + change.after.args + ")";
  }).sort()).toEqual([
    "app.bind_request(p_kind text, p_credential text, p_tenant uuid)",
    "app.current_actor()",
    "app.current_tenant()",
    "app.lp6_bound_request()",
    "app.lp6_session_authority(p_kind text, p_credential text, p_tenant uuid)",
    "identity.sso_session_memberships(u uuid, s uuid)",
  ].sort());
  const inverseFoundation = { ...foundation!, lp0: [], tenancy: [],
    upgrade: [...foundation!.upgrade].reverse().map(change => ({ ...change, before: change.after, after: change.before })) };
  const stagedBaseline = { rows: {}, routines: privileges(security), relations: [], policies: [] };
  // A changed security attribute in ANY staged routine must fail before normalization.
  for (const change of foundation!.upgrade) {
    if (change.section !== "routines" || change.after === null) throw new Error("Unexpected 0562 routine normalization record");
    const identity = change.after;
    const matches = (row: typeof stagedBaseline.routines[number]) => row.nspname === identity.nspname &&
      row.proname === identity.proname && row.args === identity.args;
    expect(stagedBaseline.routines.filter(matches)).toHaveLength(1);
    const tampered = { ...stagedBaseline, routines: stagedBaseline.routines.map(row =>
      matches(row) ? { ...row, prosecdef: !row.prosecdef } : row) };
    expect(() => applyUpgradeProofs(tampered, [inverseFoundation], ownerOids)).toThrow("before allowance mismatch");
  }
  const logicalPreFoundation = applyUpgradeProofs(stagedBaseline, [inverseFoundation], ownerOids);
  const expected = applyUpgradeProofs(logicalPreFoundation, successors, ownerOids);
  expect(privileges(live)).toEqual(privileges(expected.routines as typeof security));
}, 120000);
