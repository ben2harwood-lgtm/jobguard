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
  // 0567 changes only the checked settlement overload's expected approval hash.
  const settlementOid = (await c.admin.query("SELECT 'app.record_simulated_settlement(uuid,uuid,uuid,character varying,bigint,timestamp with time zone,uuid,uuid,uuid)'::regprocedure::oid oid")).rows[0].oid;
  const selfComparison = "(SELECT content_hash FROM app.action_authorization WHERE tenant_id=p_tenant AND id=p_authorization)";
  // ENT-5 changes only these exact routine bodies; preserve every predecessor check.
  const clientAuthority = await readFile(new URL("../migrations/1041_extra_client_send_authority.sql", import.meta.url), "utf8");
  const clientAttribution = await readFile(new URL("../migrations/1043_extra_customer_approval.sql", import.meta.url), "utf8");
  const replacements = (source: string) => [...source.matchAll(/changed:=replace\((?:original|changed),'((?:[^']|'')*)',\s*'((?:[^']|'')*)'\);/g)]
    .map(match => [match[1]!.replaceAll("''", "'"), match[2]!.replaceAll("''", "'")] as const);
  const authorityChanges = replacements(clientAuthority), attributionChanges = replacements(clientAttribution);
  expect(authorityChanges).toHaveLength(3); expect(attributionChanges).toHaveLength(1);
  const clientBodyChanges = new Map([
    ["app.xa_issue_link(p_job uuid, p_request uuid, p_command uuid, p_actor uuid, p_link uuid, p_approver uuid, p_recipient text, p_token_hash text, p_expires_at timestamp with time zone, p_authorization uuid, p_outbox uuid)", authorityChanges.slice(0, 2)],
    ["app.lp5b_contractor_permission(p_type text, p_actor uuid, p_job uuid, p_input jsonb)", authorityChanges.slice(2)],
    ["app.northside_capture_action()", attributionChanges],
  ]);
  // 1200 changes exactly the effective-state read and retains the latest mark writer.
  const relink = await readFile(new URL("../migrations/0622_extra_duplicate_relink.sql", import.meta.url), "utf8");
  const relinkBodies = Object.fromEntries(["xa_latest_kind", "xa_mark_duplicate"].map(name => [name,
    relink.split(`CREATE OR REPLACE FUNCTION app.${name}`)[1]!.split("AS $$")[1]!.split("$$;")[0]]));
  const finishSql = await readFile(new URL("../migrations/0620_contractor_job_finish.sql", import.meta.url), "utf8");
  const finishRoutineBodies = new Map([
    ["lp_command|p_session uuid, p_input jsonb, p_source_bytes bytea", "lp_command"],
    ["lp_read|p_session uuid, p_input jsonb", "lp_read"],
    ["lp_finish|p_session uuid, p_command uuid, p_result jsonb", "lp_finish"],
    ["lp_require_audit|", "lp_require_audit"],
    ["lp_receipt_immutable|", "lp_receipt_immutable"],
  ].map(([identity, name]) => [identity, finishSql.split(`CREATE OR REPLACE FUNCTION app.${name}(`)[1]!.split("AS $$")[1]!.split("$$;")[0]]));
  for (const prior of security) {
    const current = live.find(row => row.oid === prior.oid);
    // 0566, 0573 and 0606 extend exactly this dispatcher for managed recovery, supervisor queries and dark orders.
    if (prior.nspname === "app" && prior.proname === "lp5_command_result" && prior.args === "p_command_id uuid, p_outcome jsonb") continue;
    // 0599_accounting_export_route_change changes only this checked synthetic dispatcher; dedicated route upgrade tests bind the body.
    if (prior.nspname === "app" && prior.proname === "accounting_export" &&
      prior.args === "t uuid, digest text, operation text, source text, v jsonb") {
      expect(current?.definition).not.toEqual(prior.definition);
    } else
    // 0620 extends only these exact live-prompt bodies; preserve their full replacements.
    if (prior.nspname === "app" && finishRoutineBodies.has(`${prior.proname}|${prior.args}`)) {
      expect(current?.definition?.split("$function$")[1]).toEqual(finishRoutineBodies.get(`${prior.proname}|${prior.args}`));
    } else
    // 0615 extends the exact success-fee writer from 0583; retain its full latest body.
    if (prior.nspname === "app" && prior.proname === "write_success_fee_v3" &&
      prior.args === "p_job uuid, p_session text, p_command jsonb, p_artifact jsonb") {
      const sql = await readFile(new URL("../migrations/0615_success_fee_changed_proof.sql", import.meta.url), "utf8");
      const body = sql.split("CREATE OR REPLACE FUNCTION app.write_success_fee_v3")[1]!.split("AS $$")[1]!.split("$$;")[0];
      expect(current?.definition?.split("$function$")[1]).toEqual(body);
    } else if (prior.nspname === "app" && prior.proname === "payment_fee_current" &&
      prior.args === "t uuid, j uuid, s uuid, actor uuid") {
      const sql = await readFile(new URL("../migrations/0616_payment_fee_current_review.sql", import.meta.url), "utf8");
      expect(current?.definition?.split("$function$")[1]).toEqual(sql.split("AS $$")[1]!.split("$$;")[0]);
    } else if (prior.nspname === "app" && prior.proname === "adopt_invoiced_job_v3" &&
      prior.args === "t uuid, source_job uuid, d text, cmd uuid, auth uuid, approved jsonb, request_hash text") {
      const migration = await readFile(new URL("../migrations/0625_company_import_once.sql", import.meta.url), "utf8");
      const body = migration.split("CREATE OR REPLACE FUNCTION app.adopt_invoiced_job_v3")[1]!.split("AS $$")[1]!.split("$$;")[0];
      expect(current?.definition?.split("$function$")[1]).toEqual(body);
    } else if (prior.nspname === "app" && prior.proname === "dunning_workbench" &&
      prior.args === "t uuid, digest text, j uuid, operation text, v jsonb") {
      const migration = await readFile(new URL("../migrations/0628_dunning_owner_approval.sql", import.meta.url), "utf8");
      const body = migration.split("CREATE OR REPLACE FUNCTION app.dunning_workbench")[1]!.split("AS $$")[1]!.split("$$;")[0];
      expect(current?.definition?.split("$function$")[1]).toEqual(body);
    } else if (prior.nspname === "app" && (
      prior.proname === "xa_latest_kind" && prior.args === "p_tenant uuid, p_job uuid, p_variation uuid" ||
      prior.proname === "xa_mark_duplicate" && prior.args === "p_job uuid, p_duplicate uuid, p_canonical uuid, p_command uuid, p_actor uuid, p_link uuid")) {
      expect(current?.definition?.split("$function$")[1]).toEqual(relinkBodies[prior.proname]);
    } else if (prior.nspname === "app" && prior.proname === "cb_unresolved" && prior.args === "p_tenant uuid, p_job uuid") {
      const source = await readFile(new URL("../migrations/0623_extra_duplicate_disposition.sql", import.meta.url), "utf8");
      const body = source.split("CREATE OR REPLACE FUNCTION app.cb_unresolved")[1]!.split("AS $$")[1]!.split("$$;")[0];
      expect(current?.definition?.split("$function$")[1]).toEqual(body);
    } else if (prior.oid === paymentFeeWriterOid) {
      expect(current?.definition?.split("$function$")[1]).toEqual(paymentFeeWriterBody);
    } else if (prior.oid === settlementOid) {
      expect(prior.definition).toContain(selfComparison);
      expect(current?.definition).toEqual(prior.definition.replace(selfComparison, "payload"));
    } else if (clientBodyChanges.has(`${prior.nspname}.${prior.proname}(${prior.args})`)) {
      let expected = prior.definition!;
      for (const [before, after] of clientBodyChanges.get(`${prior.nspname}.${prior.proname}(${prior.args})`)!) {
        expect(expected).toContain(before);
        expected = expected.replaceAll(before, after);
      }
      expect(current?.definition).toEqual(expected);
    } else {
      expect(current?.definition).toEqual(prior.definition);
    }
  }
  const privileges = (rows: typeof security) => rows.map(({ oid: _oid, definition: _definition, ...row }) => row)
    .sort((a,b) => a.nspname.localeCompare(b.nspname) || a.proname.localeCompare(b.proname) || a.args.localeCompare(b.args));
  const ownerOids = Object.fromEntries((await c.admin.query("SELECT rolname,oid FROM pg_roles")).rows.map(row => [row.rolname,row.oid]));
  const successors = loadMigrationProofs().proofs.filter(proof => proof.migration > "0556_mon8_job_track_and_trial.sql")
    .map(proof => ({ ...proof, upgrade: proof.upgrade.filter(change => change.section === "routines") }));
  const expected = applyUpgradeProofs({ rows: {}, routines: privileges(security), relations: [], policies: [] }, successors, ownerOids);
  expect(privileges(live)).toEqual(privileges(expected.routines as typeof security));
}, 120000);
