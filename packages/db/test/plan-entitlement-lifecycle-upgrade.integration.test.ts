import { readFileSync } from "node:fs";
import { afterAll, expect, it } from "vitest";
import { startBeforeMigration, applyMigration, snapshot, type Cluster } from "./contractor-entitlement-fixtures.js";
import { firstTrialFixture } from "./free-first-job-lifecycle-fixtures.js";
import { meterCompany, command, terms } from "./subscription-persistence-fixtures.js";
import { service, request, retainedExport } from "./plan-entitlement-lifecycle-fixtures.js";
import { applyUpgradeProofs, loadMigrationProofs } from "./migration-proof-loader.js";
import { laterEmptyTables } from "./later-empty-tables.js";
import { migrate } from "../src/index.js";
import type { WorkFixture } from "./job-work-state-fixtures.js";
// LP-6c replacements are restricted to these exact overloads; LP-8a names its
// single pointer replacement explicitly below.
// All other predecessor bodies remain byte-for-byte protected below.
const lp6cSignatures = [
  "app.assert_financial_authorization(uuid,uuid,character varying,bigint,character,character)",
  "app.post_plan_obligation(uuid,uuid,uuid,uuid,bigint,character,character varying,character varying,character varying,character,uuid,uuid)",
  "app.post_plan_settlement(uuid,uuid,uuid,uuid,uuid,bigint,character,character varying,character varying,character,uuid,uuid)",
  "app.reverse_journal(uuid,uuid,uuid,character varying,character varying,character,uuid,uuid)",
  "app.record_builder_attested_acceptance(uuid,uuid,uuid,uuid,uuid,integer,character,bigint,integer,uuid,character varying,character varying,timestamp with time zone,uuid)",
  "app.record_quote_disposition(uuid,uuid,uuid,uuid,integer,character,integer,uuid,character varying,timestamp with time zone)",
  "app.switch_job_live(uuid,uuid,uuid,uuid,uuid,uuid,integer,character,integer,bigint,bigint,character varying,character varying,character varying,uuid,timestamp with time zone)",
  "app.record_simulated_settlement(uuid,uuid,uuid,character varying,bigint,timestamp with time zone)",
  "app.reserve_customer_invoice_number(uuid)",
  "app.issue_practice_customer_invoice(uuid,uuid,uuid,uuid,uuid,text,date)",
  "app.switch_job_live_v3(uuid,uuid,uuid,uuid,uuid,integer,character,integer,uuid,uuid,uuid)",
  "app.final_lock_require_owner(uuid,uuid)",
  "app.issue_lock_bound_customer_invoice(uuid,uuid,uuid,uuid,uuid,text,text,date,text)",
  "app.approve_recovery_case_terms(uuid,uuid,uuid,uuid,uuid,uuid,uuid)",
  "app.write_recovery_allocation(uuid,uuid,text,jsonb,jsonb)",
  "app.lock_recovery_payer_job(uuid,uuid,uuid)",
  "app.final_check_require_invoice_actor(uuid,uuid,uuid)",
  "app.assert_receipt_fact_scope(uuid,uuid,text)",
  "app.write_receipt_allocation_facts(uuid,uuid,text,jsonb,jsonb)",
  "app.lp3_authorize(uuid,uuid,uuid,uuid,text,text,text,text,text,integer,bigint,text,text,text,text,uuid,integer)",
  "app.switch_job_live(uuid,uuid,uuid,uuid,uuid,uuid,integer,character,integer,bigint,bigint,character varying,character varying,character varying,uuid,timestamp with time zone,uuid,uuid)",
  "app.record_simulated_settlement(uuid,uuid,uuid,character varying,bigint,timestamp with time zone,uuid,uuid,uuid)",
  "app.record_builder_attested_acceptance(uuid,uuid,uuid,uuid,uuid,integer,character,bigint,integer,uuid,character varying,character varying,timestamp with time zone,uuid,uuid,uuid)",
  "app.record_quote_disposition(uuid,uuid,uuid,uuid,integer,character,integer,uuid,character varying,timestamp with time zone,uuid,uuid)",
  "app.lp5_bind_effect(uuid,uuid,text,jsonb)",
  "app.begin_command(text,uuid,text,text,jsonb,jsonb,jsonb)",
  "app.complete_command(uuid,jsonb)",
  "app.mon1_company_actor(uuid,text)",
] as const;
const lp6cBodies = [...readFileSync(new URL("../migrations/0570_lp6c_money_binding.sql", import.meta.url), "utf8")
  .matchAll(/CREATE OR REPLACE FUNCTION app\.(\w+)\((.*?)\)\s*RETURNS\b.*?\bAS\s+(\$\w*\$)(.*?)\3\s*;/gis)];
let c: Cluster | undefined;
afterAll(async () => { await c?.close(); });
it("0556 preserves all populated tables and routine ACLs, installs only the adapter body, and replays harmlessly", async () => {
  process.env.JOBGUARD_ENV = "synthetic_demo";
  c = await startBeforeMigration("0556_mon8_job_track_and_trial.sql");
  const f = c as unknown as WorkFixture, trial = await firstTrialFixture(f), paid = await meterCompany(f);
  await command(f, paid, terms(paid)); await retainedExport(f, trial);
  const before = await snapshot(c.admin);
  const catalogue = async () => (await c!.admin.query(`SELECT n.nspname,p.proname,p.oid,p.proowner,p.proacl,p.prosecdef,p.proconfig,pg_get_function_arguments(p.oid) args,p.prosrc source,
    CASE WHEN p.oid<>'app.mon8_company_feature(text,text,uuid)'::regprocedure THEN pg_get_functiondef(p.oid) END definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('app','identity','control_plane','audit_control') AND p.prokind='f' ORDER BY p.oid`)).rows;
  const security = await catalogue();
  expect(await service(f, trial).check(request("final_check", trial.jobId))).toMatchObject({ executable: false });
  await applyMigration(c, "0556_mon8_job_track_and_trial.sql");
  expect(await snapshot(c.admin)).toEqual(before); expect(await catalogue()).toEqual(security);
  expect(await service(f, trial).require(request("final_check", trial.jobId))).toMatchObject({ executable: true });
  expect(await service(f, paid).require(request("invoices", paid.jobId))).toMatchObject({ executable: true });
  await migrate(c.admin); await migrate(c.admin);
  expect(await snapshot(c.admin)).toEqual({ ...before, ...laterEmptyTables });
  // Successor migrations have their own exact reviewed routine ACL additions.
  // Keep the 0556-only assertion above, and retain every predecessor definition.
  const live = await catalogue();
  expect(lp6cBodies).toHaveLength(lp6cSignatures.length);
  const replacements = new Map<number, string>();
  for (const [index, signature] of lp6cSignatures.entries()) {
    // Resolve only this named signature, never a name-only/wildcard allowance.
    const oid = (await c.admin.query("SELECT $1::regprocedure::oid oid", [signature])).rows[0].oid;
    const body = lp6cBodies[index]!;
    expect(signature.split("(")[0]).toBe(`app.${body[1]}`);
    replacements.set(oid, body[4]!);
  }
  // LP-8a replaces only this exact pointer routine; unrelated definitions stay pinned.
  const lp8aSql = readFileSync(new URL("../migrations/0795_lp8a_billing_revokes.sql", import.meta.url), "utf8");
  const lp8aBody = /CREATE OR REPLACE FUNCTION app\.advance_final_account_draft\([\s\S]*?AS \$\$([\s\S]*?)\$\$;/.exec(lp8aSql)?.[1];
  expect(lp8aBody).toBeDefined();
  const lp8aOid = (await c.admin.query("SELECT 'app.advance_final_account_draft(uuid,uuid,uuid,integer)'::regprocedure::oid oid")).rows[0].oid;
  replacements.set(lp8aOid, lp8aBody!);
  for (const prior of security) {
    const current = live.find(row => row.oid === prior.oid);
    const replacement = replacements.get(prior.oid);
    const expected = replacement === undefined || prior.definition === null
      ? prior.definition : prior.definition.replace(prior.source, replacement);
    expect(current?.definition, `${prior.nspname}.${prior.proname}(${prior.args})`).toEqual(expected);
    if (replacement !== undefined) expect(current?.source).toBe(replacement);
  }
  const privileges = (rows: typeof security) => rows.map(({ oid: _oid, definition: _definition, source: _source, ...row }) => row)
    .sort((a,b) => a.nspname.localeCompare(b.nspname) || a.proname.localeCompare(b.proname) || a.args.localeCompare(b.args));
  const ownerOids = Object.fromEntries((await c.admin.query("SELECT rolname,oid FROM pg_roles")).rows.map(row => [row.rolname,row.oid]));
  const successors = loadMigrationProofs().proofs.filter(proof => proof.migration > "0556_mon8_job_track_and_trial.sql")
    .map(proof => ({ ...proof, upgrade: proof.upgrade.filter(change => change.section === "routines") }));
  const expected = applyUpgradeProofs({ rows: {}, routines: privileges(security), relations: [], policies: [] }, successors, ownerOids);
  expect(privileges(live)).toEqual(privileges(expected.routines as typeof security));
}, 120000);
