import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeWorkFixture, createWorkFixture, type WorkFixture } from "./job-work-state-fixtures.js";

const tables = ["billing_allocation_run", "billing_application_event", "billing_export_batch", "billing_export_delivery", "billing_export_line", "billing_fact", "billing_line_match", "billing_quarantine", "billing_status_import", "contractor_receipt_line_allocation"];
const entryPoints = ["app.cb_authority(uuid,uuid,boolean)", "app.cb_begin(uuid,uuid,uuid,text,jsonb)", "app.cb_candidates(uuid,uuid,uuid)", "app.cb_complete(uuid,uuid,uuid,jsonb)", "app.cb_delivery(uuid,uuid,uuid,jsonb)", "app.cb_delivery_step(uuid,uuid,uuid,text,jsonb)", "app.cb_derive(uuid,uuid,uuid,text,text,text,jsonb)", "app.cb_export(uuid,uuid,uuid,jsonb,text,text)", "app.cb_ingest(uuid,uuid,uuid,jsonb)", "app.cb_inputs(uuid,uuid)"];

describe("ENT-6B actual PostgreSQL catalog boundary", () => {
  let f: WorkFixture;
  beforeAll(async () => { f = await createWorkFixture(); }, 300_000);
  afterAll(async () => { await closeWorkFixture(f); });

  it("E6-28 ENT6B-CATALOG-1 all billing money tables force tenant RLS and runtime receives SELECT only", async () => {
    const found = (await f.admin.query(`SELECT c.relname,pg_get_userbyid(c.relowner) owner,c.relrowsecurity,c.relforcerowsecurity
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relname=ANY($1::text[]) ORDER BY c.relname`, [tables])).rows;
    expect(found).toEqual(tables.map(relname => ({ relname, owner: "jobguard_migration", relrowsecurity: true, relforcerowsecurity: true })));
    for (const table of tables) {
      const relation = `app.${table}`;
      expect((await f.admin.query("SELECT has_table_privilege('jobguard_runtime',$1,'SELECT') read,has_table_privilege('jobguard_runtime',$1,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') write", [relation])).rows[0]).toEqual({ read: true, write: false });
      const columns = (await f.admin.query("SELECT a.attname FROM pg_attribute a WHERE a.attrelid=$1::regclass AND a.attnum>0 AND NOT a.attisdropped AND has_column_privilege('jobguard_runtime',a.attrelid,a.attnum,'INSERT,UPDATE,REFERENCES')", [relation])).rows;
      expect(columns, `${relation}: no column write grants`).toEqual([]);
      for (const role of ["jobguard_infrastructure", "jobguard_shadow", "jobguard_shadow_emergency_access"]) {
        expect((await f.admin.query("SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') allowed", [role, relation])).rows[0]!.allowed, `${role}: ${relation}`).toBe(false);
      }
      const policies = (await f.admin.query("SELECT polcmd,pg_get_expr(polqual,polrelid) qualification,pg_get_expr(polwithcheck,polrelid) check_expression FROM pg_policy WHERE polrelid=$1::regclass", [relation])).rows;
      expect(policies.some(policy => policy.polcmd === "*" && policy.qualification?.includes("tenant_id") && policy.check_expression?.includes("tenant_id")), `${relation}: reads and writes scoped`).toBe(true);
      expect((await f.admin.query("SELECT attnotnull FROM pg_attribute WHERE attrelid=$1::regclass AND attname='tenant_id'", [relation])).rows[0]!.attnotnull).toBe(true);
      const unique = (await f.admin.query("SELECT pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid=$1::regclass AND contype IN('p','u')", [relation])).rows;
      expect(unique.some(row => row.definition.includes("tenant_id")), `${relation}: tenant-qualified identity`).toBe(true);
      const immutable = (await f.admin.query(`SELECT p.proname,t.tgtype::int kind FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
        WHERE t.tgrelid=$1::regclass AND NOT t.tgisinternal AND t.tgenabled='O'`, [relation])).rows;
      expect(immutable.some(trigger => trigger.proname === "reject_immutable_commercial_mutation" && (trigger.kind & 2) !== 0 && (trigger.kind & 8) !== 0 && (trigger.kind & 16) !== 0), `${relation}: immutable update/delete trigger`).toBe(true);
    }
  });

  it("E6-28 ENT6B-CATALOG-2 checked routine entry points revoke PUBLIC and fix their owner and search path", async () => {
    const routines = (await f.admin.query(`SELECT p.oid::regprocedure::text signature,p.proname,p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) owner,
      EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') public_execute,
      has_function_privilege('jobguard_runtime',p.oid,'EXECUTE') runtime_execute
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND p.proname LIKE 'cb\\_%' ESCAPE '\\' ORDER BY signature`)).rows;
    expect(routines.length).toBeGreaterThan(0);
    expect(routines.filter(row => row.runtime_execute).map(row => row.signature)).toEqual(entryPoints);
    for (const routine of routines) {
      expect(routine.owner, routine.signature).toBe("jobguard_migration");
      expect(routine.public_execute, routine.signature).toBe(false);
      expect(routine.proconfig, routine.signature).toContain("search_path=pg_catalog");
      if (routine.runtime_execute) expect(routine.prosecdef, routine.signature).toBe(true);
    }
  });

  it("E6-28 ENT6B-CATALOG-3 runtime cannot mutate billing money tables or truncate them", async () => {
    for (const table of tables) {
      await expect(f.runtime.query(`INSERT INTO app.${table} DEFAULT VALUES`), table).rejects.toMatchObject({ code: "42501" });
      await expect(f.runtime.query(`UPDATE app.${table} SET tenant_id=tenant_id WHERE false`), table).rejects.toMatchObject({ code: "42501" });
      await expect(f.runtime.query(`DELETE FROM app.${table} WHERE false`), table).rejects.toMatchObject({ code: "42501" });
      await expect(f.runtime.query(`TRUNCATE app.${table}`), table).rejects.toMatchObject({ code: "42501" });
    }
    await expect(f.runtime.query("SELECT app.cb_unresolved(NULL::uuid,NULL::uuid)")).rejects.toMatchObject({ code: "42501" });
    await expect(f.runtime.query("SELECT app.cb_audit(NULL::uuid,NULL::uuid,NULL::text,NULL::uuid)")).rejects.toMatchObject({ code: "42501" });
  });

  it("E6-28 ENT6B-CATALOG-4 money references include tenant identity and stored exact allocation values are not floating point", async () => {
    const foreignKeys = (await f.admin.query(`SELECT r.relname,pg_get_constraintdef(c.oid) definition FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid
      WHERE c.contype='f' AND c.connamespace='app'::regnamespace AND r.relname=ANY($1::text[]) ORDER BY r.relname,c.conname`, [tables])).rows;
    expect(foreignKeys.length).toBeGreaterThan(0);
    for (const foreignKey of foreignKeys) expect(foreignKey.definition, foreignKey.relname).toMatch(/FOREIGN KEY \(tenant_id[,)]/);
    const allocations = (await f.admin.query("SELECT attname,format_type(atttypid,atttypmod) type FROM pg_attribute WHERE attrelid='app.contractor_receipt_line_allocation'::regclass AND attnum>0 AND NOT attisdropped")).rows;
    expect(allocations.filter(column => /numerator|denominator/.test(column.attname)).length).toBeGreaterThanOrEqual(2);
    for (const column of allocations.filter(column => /numerator|denominator/.test(column.attname))) expect(column.type).not.toMatch(/real|double precision/);
    expect(allocations.some(column => /rule/.test(column.attname))).toBe(true);
  });
});
