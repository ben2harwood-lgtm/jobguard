import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, expect, it } from "vitest";
import { startBeforeMigration, applyMigration, type Cluster } from "./contractor-entitlement-fixtures.js";
import { proofBefore, proofDifferences } from "./upgrade-proof-utils.js";
import { applyUpgradeProofs, loadMigrationProofs } from "./migration-proof-loader.js";
import { snapshot } from "./contractor-entitlement-fixtures.js";
import { laterEmptyTables } from "./later-empty-tables.js";
import { currentCommandRegistryRows } from "./lp5-command-catalog.js";
import { migrate } from "../src/migrate.js";
import { applyUpgradeProofs, loadMigrationProofs } from "./migration-proof-loader.js";

const own = "0632_shadow_group_disclosure.sql";
let c: Cluster | undefined;
afterAll(async () => { await c?.close(); });
it("MIGFIX-7 preserves populated rows, types and privileges; changes only the two named routines and adds an ungranted trigger", async () => {
  process.env.JOBGUARD_ENV = "synthetic_demo";
  c = await startBeforeMigration(own);
  const tenant = randomUUID(), job = randomUUID(), survivor = randomUUID(), duplicate = randomUUID();
  await c.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenant]);
  await c.admin.query("INSERT INTO app.job(id,tenant_id,title,status) VALUES($1,$2,'Fictional MIGFIX-7 upgrade','live')", [job, tenant]);
  for (const id of [survivor, duplicate]) await c.admin.query(`INSERT INTO app.shadow_commercial_signal(tenant_id,job_id,id,work_id,signal_type,detector_kind,detector_version,evidence_cutoff_at,description,confidence_band)
    VALUES($1,$2,$3,$3,'possible_extra','deterministic','synthetic:m7',clock_timestamp(),'Fictional upgrade signal','low')`, [tenant, job, id]);
  await c.admin.query("UPDATE app.shadow_commercial_signal SET coalesced_into_signal_id=$2 WHERE id=$1", [duplicate, survivor]);
  const tables = ["app.job", "app.shadow_commercial_signal", "app.shadow_disclosure_event", "app.shadow_signal_ineligibility", "app.audit_event"];
  const rows = await proofBefore(c.admin, tables);
  expect(Object.keys(rows["app.shadow_commercial_signal"]!.rows)).toHaveLength(2);
  const catalog = async () => (await c!.admin.query(`SELECT n.nspname,c.relname,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity,
    (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid=c.oid) policies
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('app','identity','control_plane','audit_control') ORDER BY 1,2`)).rows;
  const routines = async () => (await c!.admin.query(`SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args,p.proowner,p.proacl,p.prosecdef,p.proconfig,pg_get_functiondef(p.oid) definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('app','identity','control_plane','audit_control') AND p.prokind='f' ORDER BY 1,2,3`)).rows;
  const policies = async () => (await c!.admin.query("SELECT * FROM pg_policies ORDER BY schemaname,tablename,policyname")).rows;
  const beforeCatalog = await catalog(), beforeRoutines = await routines(), beforePolicies = await policies();
  await applyMigration(c, own);
  expect(await proofDifferences(c.admin, rows)).toEqual({ rows: [], types: [] });
  expect(await catalog()).toEqual(beforeCatalog);
  const afterRoutines = await routines();
  const sql = await readFile(new URL(`../migrations/${own}`, import.meta.url), "utf8");
  for (const prior of beforeRoutines) {
    const now = afterRoutines.find(r => r.nspname === prior.nspname && r.proname === prior.proname && r.args === prior.args);
    if (prior.nspname === "app" && ["record_shadow_disclosure", "surface_shadow_signal_early"].includes(prior.proname)) {
      expect({ ...now, definition: prior.definition }).toEqual(prior);
      expect(now.definition.split("$function$")[1]).toBe(sql.split(`FUNCTION app.${prior.proname}(`)[1]!.split("AS $$")[1]!.split("$$;")[0]);
      expect(now.definition).not.toBe(prior.definition);
    } else expect(now).toEqual(prior);
  }
  expect(afterRoutines.length - beforeRoutines.length).toBe(1);
  const added = afterRoutines.find(r => r.proname === "propagate_shadow_group_disclosure");
  expect(added).toMatchObject({ proacl: "{jobguard_migration=X/jobguard_migration}", prosecdef: true, proconfig: ["search_path=pg_catalog, app"] });
  expect((await c.admin.query("SELECT to_regprocedure('app.complete_shadow_firing_post_lock(uuid,uuid,uuid,uuid,uuid,uuid,text,text,uuid,text,jsonb)') routine")).rows[0].routine).toBeNull();
  const beforeReplay = await snapshot(c.admin);
  await migrate(c.admin); await migrate(c.admin);
  const registry = (await c.admin.query("SELECT jsonb_agg(value ORDER BY value::text) data FROM jsonb_array_elements($1::jsonb)", [JSON.stringify(currentCommandRegistryRows)])).rows[0].data;
  expect(await snapshot(c.admin)).toEqual({ ...laterEmptyTables, ...beforeReplay, "app.command_type_registry": registry });
  expect(await proofDifferences(c.admin, rows)).toEqual({ rows: [], types: [] });
  // Successors add only their reviewed metadata; every replaced and added body is pinned below.
  const successors = loadMigrationProofs().proofs.filter(p => p.migration > own)
    .map(p => ({ ...p, upgrade: p.upgrade.filter(change => change.section !== "rows") }));
  const ownerOids = Object.fromEntries((await c.admin.query("SELECT rolname,oid FROM pg_roles")).rows.map(row => [row.rolname,row.oid]));
  const metadata = (entries: typeof afterRoutines) => entries.map(({ definition: _definition, ...row }) => row);
  const relationMetadata = (entries: typeof beforeCatalog) => entries.map(({ policies: _policies, ...row }) => row);
  const expected = applyUpgradeProofs({ rows: {}, routines: metadata(afterRoutines), relations: relationMetadata(beforeCatalog), policies: beforePolicies }, successors, ownerOids);
  const replayRoutines = await routines(), replayCatalog = await catalog();
  expect(metadata(replayRoutines)).toEqual(expected.routines);
  expect(relationMetadata(replayCatalog)).toEqual(expected.relations);
  expect(await policies()).toEqual(expected.policies);
  // Preserve all raw predecessor catalogue fields, including policy identities.
  for (const row of beforeCatalog) expect(replayCatalog).toContainEqual(row);
  const authority = await readFile(new URL("../migrations/0642_extra_client_send_authority.sql", import.meta.url), "utf8");
  const attribution = await readFile(new URL("../migrations/0644_extra_customer_approval.sql", import.meta.url), "utf8");
  const replacements = (source: string) => [...source.matchAll(/changed:=replace\((?:original|changed),'((?:[^']|'')*)',\s*'((?:[^']|'')*)'\);/g)]
    .map(match => [match[1]!.replaceAll("''", "'"), match[2]!.replaceAll("''", "'")] as const);
  const authorityChanges = replacements(authority), attributionChanges = replacements(attribution);
  expect(authorityChanges).toHaveLength(3); expect(attributionChanges).toHaveLength(1);
  const patches = new Map([
    ["app.xa_issue_link(p_job uuid, p_request uuid, p_command uuid, p_actor uuid, p_link uuid, p_approver uuid, p_recipient text, p_token_hash text, p_expires_at timestamp with time zone, p_authorization uuid, p_outbox uuid)", authorityChanges.slice(0, 2)],
    ["app.lp5b_contractor_permission(p_type text, p_actor uuid, p_job uuid, p_input jsonb)", authorityChanges.slice(2)],
    ["app.northside_capture_action()", attributionChanges],
  ]);
  // Exact existing replacements only; all their privileges and unrelated definitions remain frozen.
  const fullBodies = new Map<string, string>();
  for (const [identity, migration] of [
    ["app.lp6_session_authority(p_kind text, p_credential text, p_tenant uuid)", "0651_lp6b_effective_session_actor.sql"],
    ["app.demo_issue_customer_link(t uuid, j uuid, c uuid, session_digest text, link_digest text, content text)", "0650_demo_customer_link_reference.sql"],
    ["app.retention_records(t uuid, digest text, j uuid, cid uuid, v jsonb, expected text)", "0646_retention_timer_runtime_rules.sql"],
    ["app.notice_fixture_records(j uuid, n uuid, digest text, operation text, v jsonb)", "0647_notice_live_job_check.sql"],
    ["app.pay_now_fake_attempt(t uuid, digest text, j uuid, operation text, v jsonb)", "0648_pay_now_catch_statement.sql"],
    ["app.lp5_command_result(p_command_id uuid, p_outcome jsonb)", "0634_extra_proceed_statement.sql"],
    ["app.xa_approve(p_job uuid, p_request uuid, p_command uuid, p_actor uuid, p_step integer, p_hash text, p_net bigint, p_reject boolean, p_reason text)", "0635_extra_same_step.sql"],
    ["app.xa_withdraw(p_job uuid, p_variation uuid, p_command uuid, p_actor uuid, p_reason text)", "0636_extra_withdraw_roles.sql"],
    ["app.lp5b_contractor_permission(p_type text, p_actor uuid, p_job uuid, p_input jsonb)", "0636_extra_withdraw_roles.sql"],
    ["app.xa_requirement(p_rules jsonb, p_net bigint)", "0637_extra_working_day_wait.sql"],
    ["app.xa_escalate()", "0637_extra_working_day_wait.sql"],
    ["app.xa_queue(p_member uuid)", "0637_extra_working_day_wait.sql"],
    ["app.valid_approval_rules(d jsonb)", "0638_extra_rule_wait_schema.sql"],
    ["app.retention_records(t uuid, digest text, j uuid, cid uuid, v jsonb, expected text)", "0646_retention_timer_runtime_rules.sql"],
    ["app.notice_fixture_records(j uuid, n uuid, digest text, operation text, v jsonb)", "0647_notice_live_job_check.sql"],
    ["app.pay_now_fake_attempt(t uuid, digest text, j uuid, operation text, v jsonb)", "0648_pay_now_catch_statement.sql"],
  ]) {
    const source = await readFile(new URL(`../migrations/${migration}`, import.meta.url), "utf8");
    fullBodies.set(identity!, source.split(`FUNCTION ${identity!.split("(")[0]}(`)[1]!.split("AS $$")[1]!.split("$$;")[0]!);
  }
  const namedAdditions = [
    "connector_promotion", "order_attestation_actor", "platform_invoice_read",
    "retention_timer", "retention_timer_book", "xa_proceed", "xa_proceed_breaches",
    "xa_proceed_view", "xa_wait_deadline", "customer_practice_pay_now",
  ];
  for (const name of namedAdditions) {
    expect(replayRoutines.filter(row => row.proname === name)).toHaveLength(1);
    expect(afterRoutines.some(row => row.proname === name)).toBe(false);
  }
  for (const row of replayRoutines) {
    const identity = `${row.nspname}.${row.proname}(${row.args})`;
    const prior = afterRoutines.find(r => `${r.nspname}.${r.proname}(${r.args})` === identity);
    if (prior) {
      let definition = prior.definition;
      if (fullBodies.has(identity)) {
        const parts = definition.split("$function$");
        parts[1] = fullBodies.get(identity)!;
        definition = parts.join("$function$");
      }
      for (const [before, after] of patches.get(identity) ?? []) {
        expect(definition.split(before)).toHaveLength(2);
        definition = definition.replace(before, after);
      }
      expect(row.definition).toBe(definition);
    } else {
      // Metadata equality above binds the exact overload; each new body's source is unique.
      const source = successors.find(p => p.upgrade.some(change => change.section === "routines" && change.after?.nspname === row.nspname && change.after.proname === row.proname && change.after.args === row.args));
      expect(source).toBeDefined();
      const sql = await readFile(new URL(`../migrations/${source!.migration}`, import.meta.url), "utf8");
      const body = sql.split(`FUNCTION ${row.nspname}.${row.proname}(`)[1]!.split("AS $$")[1]!.split("$$;")[0];
      expect(row.definition.split("$function$")[1]).toBe(body);
    }
  }
}, 120_000);
