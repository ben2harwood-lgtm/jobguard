import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, expect, it } from "vitest";
import { startBeforeMigration, applyMigration, type Cluster } from "./contractor-entitlement-fixtures.js";
import { proofBefore, proofDifferences } from "./upgrade-proof-utils.js";
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
  const beforeCatalog = await catalog(), beforeRoutines = await routines();
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
  await migrate(c.admin); await migrate(c.admin);
  expect(await proofDifferences(c.admin, rows)).toEqual({ rows: [], types: [] });
  // Pin MON-6's read and batch-41's two new routines after replay; existing bodies and privileges stay exact.
  const proofs = loadMigrationProofs().proofs.filter(p => ["0633_customer_practice_pay_now_read.sql", "0639_connector_promotion.sql", "0640_platform_invoice_read.sql"].includes(p.migration));
  expect(proofs).toHaveLength(3);
  const additions = proofs.flatMap(p => p.upgrade.filter(e => e.section === "routines").map(e => ({ migration: p.migration, row: e.after! })));
  const key = (r: { nspname: string; proname: string; args: string }) => `${r.nspname}.${r.proname}(${r.args})`;
  expect(additions.map(e => key(e.row as Parameters<typeof key>[0])).sort()).toEqual([
    "app.connector_promotion(p_session uuid, p_namespace text, p_event text, p_command uuid, p_result jsonb)",
    "app.platform_invoice_read(t uuid, digest text)",
    "identity.customer_practice_pay_now(t uuid, j uuid, c uuid, digest text)",
  ]);
  const replayRoutines = await routines();
  for (const { migration, row } of additions) {
    const identity = row as Parameters<typeof key>[0];
    const matches = replayRoutines.filter(r => key(r) === key(identity));
    expect(matches).toHaveLength(1);
    const source = await readFile(new URL(`../migrations/${migration}`, import.meta.url), "utf8");
    expect(matches[0]!.definition.split("$function$")[1]).toBe(source.split(`FUNCTION ${identity.nspname}.${identity.proname}(`)[1]!.split("AS $$")[1]!.split("$$;")[0]);
  }
  const owners = Object.fromEntries((await c.admin.query("SELECT rolname,oid FROM pg_roles")).rows.map(r => [r.rolname, r.oid]));
  const metadata = (rs: typeof replayRoutines) => rs.map(({ definition: _definition, ...r }) => r);
  const expected = applyUpgradeProofs({ rows: {}, routines: metadata(afterRoutines), relations: [], policies: [] }, proofs, owners);
  expect(metadata(replayRoutines)).toEqual(expected.routines);
  const addedKeys = new Set(additions.map(e => key(e.row as Parameters<typeof key>[0])));
  expect(replayRoutines.filter(r => !addedKeys.has(key(r)))).toEqual(afterRoutines);
  const finalCatalog = await catalog();
  const addedRelations = new Set(["connector_promotion", "connector_promotion_pkey", "connector_promotion_tenant_id_command_id_key"]);
  expect(finalCatalog.filter(r => r.nspname !== "app" || !addedRelations.has(r.relname))).toEqual(beforeCatalog);
  expect(finalCatalog.filter(r => r.nspname === "app" && addedRelations.has(r.relname)).map(({ policies: _policies, ...r }) => r)).toEqual(expected.relations);
  expect((await c.admin.query("SELECT * FROM pg_policies WHERE schemaname='app' AND tablename='connector_promotion' ORDER BY policyname")).rows).toEqual(expected.policies);
}, 120_000);
