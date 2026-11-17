import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ContractorRepository, MIGRATION_URLS, migrate } from "../src/index.js";
import { startBeforeMigration, type Cluster } from "./contractor-practice-session-fixtures.js";
import * as proof from "./upgrade-proof-utils.js";

// An upgrade proof proves ITS OWN migration only: install everything before N, snapshot, apply N alone, compare;
// then apply everything after N and require success twice. Compare existing rows by named pre-existing columns after
// all migrations. Never assert that later migrations add no column or replace no function; the fingerprinted-table
// guard owns 'may never gain a column'.
const migrationName = "0150_membership_authority_fix.sql";
const ownUrl = new URL(`../migrations/${migrationName}`,import.meta.url);
const replaced = ["identity.current_memberships(uuid)","identity.invite_member(character,uuid,character varying,character varying)","identity.provision_verified_challenge(uuid)"];
const guard = "app.guard_membership_authority_update()";
const tables = ["control_plane.tenant","identity.identity_user","identity.user_email","identity.membership_locator","identity.invitation","identity.challenge","identity.session","identity.security_event","app.account","app.membership","app.contractor_member","app.contractor_membership_revocation","app.role_grant","app.command_receipt","app.audit_event"];
type Queryable = Pick<Pool|PoolClient,"query">;

// Supplementary source check owns only this migration; real privilege/serialization proofs below remain mandatory.
it("[MIGFIX-1-S1] own migration replaces the three identity routines with contractor-revocation exclusions and shared serialization",async()=>{
  const sql = await readFile(ownUrl,"utf8");
  expect(sql.match(/CREATE OR REPLACE FUNCTION identity\./gu)).toHaveLength(3);
  expect(sql.match(/NOT EXISTS\(SELECT 1 FROM app\.contractor_membership_revocation/gu)).toHaveLength(3);
  expect(sql.match(/pg_advisory_xact_lock\(hashtextextended\([^\n]+,54\)\)/gu)).toHaveLength(2);
  expect(sql).not.toMatch(/\bGRANT\b/u);
});

async function catalog(db: Queryable) {
  return {
    tables: (await db.query(`SELECT n.nspname||'.'||c.relname name,pg_get_userbyid(c.relowner) owner,c.relacl::text acl,c.relrowsecurity,c.relforcerowsecurity
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname IN('app','identity','control_plane','audit_control') ORDER BY 1`)).rows,
    columns: (await db.query(`SELECT n.nspname||'.'||c.relname table_name,a.attname,format_type(a.atttypid,a.atttypmod) full_type,a.attnotnull,a.attacl::text acl,pg_get_expr(d.adbin,d.adrelid) default_expression
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON(d.adrelid,d.adnum)=(a.attrelid,a.attnum)
      WHERE c.relkind='r' AND n.nspname IN('app','identity','control_plane','audit_control') AND a.attnum>0 AND NOT a.attisdropped ORDER BY 1,a.attnum`)).rows,
    policies: (await db.query("SELECT row_to_json(p)::text bytes FROM pg_policies p WHERE schemaname IN('app','identity','control_plane','audit_control') ORDER BY schemaname,tablename,policyname")).rows,
    constraints: (await db.query(`SELECT c.conrelid::regclass::text table_name,c.conname,pg_get_constraintdef(c.oid) definition,c.convalidated
      FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname IN('app','identity','control_plane','audit_control') ORDER BY 1,2`)).rows,
    triggers: (await db.query(`SELECT c.oid::regclass::text table_name,t.tgname,pg_get_triggerdef(t.oid) definition,t.tgenabled
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('app','identity','control_plane','audit_control') ORDER BY 1,2`)).rows,
    functions: (await db.query(`SELECT p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition,
      (SELECT row_to_json(x)::text FROM (SELECT p.prosecdef,p.proconfig,p.provolatile,p.proargtypes::text,p.prorettype::text,p.proretset,pg_get_userbyid(p.proowner) owner,p.proacl::text acl) x) attributes
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('app','identity','control_plane','audit_control') AND p.prokind='f' ORDER BY 1`)).rows,
  };
}

async function guardPosture(db: Queryable, afterLockdown = true) {
  expect((await db.query(`SELECT pg_get_userbyid(p.proowner) owner,p.prosecdef,p.proconfig,
    EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0) public_access,
    has_function_privilege('jobguard_runtime',p.oid,'EXECUTE') runtime_access,
    has_function_privilege('jobguard_identity',p.oid,'EXECUTE') identity_access,
    has_function_privilege('jobguard_infrastructure',p.oid,'EXECUTE') infrastructure_access
    FROM pg_proc p WHERE p.oid=$1::regprocedure`,[guard])).rows).toEqual([{owner:"jobguard_migration",prosecdef:false,proconfig:["search_path=pg_catalog"],public_access:false,runtime_access:false,identity_access:false,infrastructure_access:false}]);
  expect((await db.query(`SELECT t.tgname,t.tgtype::int,t.tgenabled,t.tgfoid::regprocedure::text routine
    FROM pg_trigger t WHERE t.tgrelid='app.membership'::regclass AND t.tgname='membership_authority_update_guard'`)).rows).toEqual([{tgname:"membership_authority_update_guard",tgtype:19,tgenabled:"O",routine:guard}]);
  // At 0150 alone the old table grant remains; after 0162 exactly created_at is retained for locks.
  expect((await db.query(`SELECT has_table_privilege('jobguard_runtime','app.membership','UPDATE') table_update,
    has_column_privilege('jobguard_runtime','app.membership','created_at','UPDATE WITH GRANT OPTION') update_grant_option,
    ARRAY(SELECT a.attname::text FROM pg_attribute a WHERE a.attrelid='app.membership'::regclass
      AND a.attnum>0 AND NOT a.attisdropped
      AND has_column_privilege('jobguard_runtime',a.attrelid,a.attnum,'UPDATE') ORDER BY a.attname) update_columns`)).rows)
    .toEqual([{table_update:!afterLockdown,update_grant_option:false,update_columns:afterLockdown?["created_at"]:
      ["account_id","created_at","expires_at","id","identity_user_id","revoked_at","role","tenant_id"]}]);
}
describe("MIGFIX-1 PostgreSQL own-step upgrade proof",()=>{
  let c: Cluster, before: Awaited<ReturnType<typeof proof.proofBefore>>, beforeCatalog: Awaited<ReturnType<typeof catalog>>;
  beforeAll(async()=>{
    c = await startBeforeMigration(migrationName);
    // Only a persisted practice principal is needed; no session-context bridge is used by this proof.
    const p = await new ContractorRepository(c.runtime).startPractice(randomUUID()), invitation = randomUUID(), address = `${randomUUID()}@fixture.invalid`;
    const account = (await c.admin.query("SELECT account_id FROM app.membership WHERE tenant_id=$1 AND id=$2",[p.tenantId,p.membershipId])).rows[0]!.account_id;
    await c.admin.query("INSERT INTO identity.user_email VALUES($1,$2)",[address,p.identityUserId]);
    await c.admin.query("INSERT INTO identity.membership_locator VALUES($1,$2,$3)",[p.identityUserId,p.tenantId,p.membershipId]);
    await c.admin.query("INSERT INTO identity.invitation(id,email,tenant_id,account_id,role,expires_at,issuer_user_id) VALUES($1,$2,$3,$4,'finance','2027-01-01 00:00:00.123456+00',$5)",[invitation,address,p.tenantId,account,p.identityUserId]);
    await c.admin.query("INSERT INTO identity.challenge(id,email,purpose,digest,requested_at,expires_at) VALUES($1,$2,'signup',$3,'2026-10-01 00:00:00.123456+00','2026-10-01 00:10:00.123456+00')",[randomUUID(),address,"a".repeat(64)]);
    await c.admin.query("INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at) VALUES($1,$2,'synthetic_demo',$3,$4,'2027-01-01 00:00:00.123456+00')",[randomUUID(),p.identityUserId,"b".repeat(64),randomUUID()]);
    await c.admin.query("INSERT INTO identity.security_event(id,event_type,subject_id,created_at) VALUES($1,'invitation.created',$2,'2026-10-01 00:00:00.123456+00')",[randomUUID(),invitation]);
    await new ContractorRepository(c.runtime).command(p,{version:"contractor-command.v1",environment:"synthetic_demo",kind:"membership.revoke",commandId:randomUUID(),id:randomUUID(),membershipId:p.membershipId,expectedRevision:0});
    before = await proof.proofBefore(c.admin,tables);
    for (const table of tables) expect(Object.keys(before[table]!.rows),`${table}: at least one pre-existing row`).not.toHaveLength(0);
    beforeCatalog = await catalog(c.admin);
  },120000);
  afterAll(async()=>{await c?.close();});

  it("[MIGFIX-1-U1] preceding schema, N alone, later migrations twice preserve named columns, full types, identities and microseconds",async()=>{
    const names = MIGRATION_URLS.map(url=>url.pathname.split("/").at(-1)!);
    const index = names.indexOf(migrationName); expect(index).toBeGreaterThan(0); expect(names).toEqual([...names].sort());
    expect((await c.admin.query("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows.map(row=>row.migration_name)).toEqual(names.slice(0,index));
    const client = await c.admin.connect();
    try {await client.query("SET ROLE jobguard_migration");await client.query(await readFile(ownUrl,"utf8"));}
    finally {await client.query("RESET ROLE");client.release();}
    await c.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[migrationName]);
    expect(await proof.proofDifferences(c.admin,before)).toEqual({rows:[],types:[]});
    const after = await catalog(c.admin);
    // Compare every pre-existing object unchanged; the one new guard/trigger is checked separately.
    for(const field of ["tables","columns","policies","constraints","triggers"] as const) expect(field==="triggers"?after[field].filter(row=>!(row.table_name==="app.membership" && row.tgname==="membership_authority_update_guard")):after[field],`${field} at N alone`).toEqual(beforeCatalog[field]);
    expect(after.functions.filter(row=>row.signature!==guard).map(row=>row.signature)).toEqual(beforeCatalog.functions.map(row=>row.signature));
    const changed: string[] = [];
    for (const previous of beforeCatalog.functions) {
      const current = after.functions.find(row=>row.signature===previous.signature)!;
      expect(current.attributes,`${previous.signature}: owner, grants, signature, configuration`).toBe(previous.attributes);
      if (current.definition!==previous.definition) changed.push(previous.signature);
    }
    expect(changed.sort()).toEqual([...replaced].sort());
    await guardPosture(c.admin, false);
    const member = (await c.admin.query("SELECT tenant_id,id FROM app.membership WHERE role='owner' ORDER BY tenant_id,id LIMIT 1")).rows[0]!;
    await proof.rolledBack(c.admin,async db=>{
      await db.query("SET LOCAL ROLE jobguard_runtime");
      await db.query("SELECT set_config('app.tenant_id',$1,true)",[member.tenant_id]);
      expect((await db.query("SELECT id FROM app.membership WHERE tenant_id=$1 AND id=$2 FOR SHARE",[member.tenant_id,member.id])).rows).toEqual([{id:member.id}]);
      await expect(db.query("UPDATE app.membership SET role='read_only' WHERE tenant_id=$1 AND id=$2",[member.tenant_id,member.id])).rejects.toMatchObject({code:"42501"});
    });
    for(const role of ["jobguard_migration","postgres"]) await proof.rolledBack(c.admin,async db=>{
      await db.query(`SET LOCAL ROLE ${role}`);
      await db.query("SELECT set_config('app.tenant_id',$1,true)",[member.tenant_id]);
      expect((await db.query("UPDATE app.membership SET role='read_only' WHERE tenant_id=$1 AND id=$2 RETURNING role",[member.tenant_id,member.id])).rows).toEqual([{role:"read_only"}]);
      expect((await db.query("UPDATE app.membership SET role='owner' WHERE tenant_id=$1 AND id=$2 RETURNING role",[member.tenant_id,member.id])).rows).toEqual([{role:"owner"}]);
    });
    await migrate(c.admin); await migrate(c.admin);
    expect(await proof.proofDifferences(c.admin,before)).toEqual({rows:[],types:[]});
    expect((await c.admin.query("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows.map(row=>row.migration_name)).toEqual(names);

    await proof.rolledBack(c.admin,async db=>{
      await db.query("UPDATE identity.security_event SET created_at=created_at+interval '1 microsecond'");
      await expect((async()=>expect(await proof.proofDifferences(db,before)).toEqual({rows:[],types:[]}))()).rejects.toThrow();
    });
    await proof.rolledBack(c.admin,async db=>{
      await db.query("ALTER TABLE app.account ALTER COLUMN name TYPE varchar(201)");
      const differences = await proof.proofDifferences(db,before); expect(differences.types).toHaveLength(1);
      await expect((async()=>expect(differences).toEqual({rows:[],types:[]}))()).rejects.toThrow();
    });
    await proof.rolledBack(c.admin,async db=>{
      await db.query("ALTER TABLE app.account ADD COLUMN migfix_nullable_control text");
      expect(await proof.scratchReplaceFunction(db,"identity.current_memberships(uuid)")).toBe(true);
      await db.query("INSERT INTO identity.security_event(id,event_type,subject_id) VALUES($1,'identity.verified',$2)",[randomUUID(),randomUUID()]);
      expect(await proof.proofDifferences(db,before)).toEqual({rows:[],types:[]});
    });
    await proof.rolledBack(c.admin,async db=>{
      await db.query("UPDATE identity.security_event SET id=gen_random_uuid()");
      await expect((async()=>expect(await proof.proofDifferences(db,before)).toEqual({rows:[],types:[]}))()).rejects.toThrow();
    });
    expect(await proof.proofDifferences(c.admin,before)).toEqual({rows:[],types:[]});
  },120000);

  it("[MIGFIX-1-U2] installed catalog preserves FORCE RLS, owner, narrow identity EXECUTE and schema restrictions",async()=>{
    await guardPosture(c.admin);
    const rows = (await c.admin.query("SELECT relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) owner FROM pg_class WHERE oid=ANY($1::regclass[])",[["app.membership","app.contractor_membership_revocation"]])).rows;
    expect(rows).toHaveLength(2); for(const row of rows)expect(row).toEqual({relrowsecurity:true,relforcerowsecurity:true,owner:"jobguard_migration"});
    for(const routine of replaced) {
      expect((await c.admin.query("SELECT has_function_privilege('jobguard_identity',$1,'EXECUTE') identity_allowed,has_function_privilege('jobguard_runtime',$1,'EXECUTE') runtime_allowed,has_function_privilege('jobguard_infrastructure',$1,'EXECUTE') infrastructure_allowed",[routine])).rows).toEqual([{identity_allowed:true,runtime_allowed:false,infrastructure_allowed:false}]);
    }
    expect((await c.admin.query("SELECT has_schema_privilege('jobguard_identity','app','USAGE') allowed")).rows).toEqual([{allowed:false}]);
  });

  it("[MIGFIX-1-U3] fresh install and repeated migrator apply the repair",async()=>{
    await c.admin.query("CREATE DATABASE migfix_fresh");
    const fresh = new Pool({...c.config,database:"migfix_fresh"});
    try {
      await migrate(fresh);await migrate(fresh);
      expect((await fresh.query("SELECT count(*)::int n FROM public.jobguard_schema_migration")).rows[0]!.n).toBe(MIGRATION_URLS.length);
      for(const signature of replaced)expect((await fresh.query("SELECT prosrc FROM pg_proc WHERE oid=$1::regprocedure",[signature])).rows[0]!.prosrc).toContain("app.contractor_membership_revocation");
      await guardPosture(fresh);
    } finally {await fresh.end();}
  },120000);
});
