/**
 * LP-0 grant freeze guard: test-only catalogue reader, fact model, strict reviewed-inventory boundary and comparator.
 *
 * Nothing here is exported from packages/db/src, imported by runtime code, or run at install time. The guard compares what
 * the fully migrated database really grants (read from the PostgreSQL catalogues, corroborated with PostgreSQL's own
 * has_*_privilege / pg_has_role answers) with a committed, independently reviewed inventory. The live catalogue is never
 * its own expected value, and anything that is not in the inventory is refused (default-deny).
 *
 * Deliberately NOT here (held under the Q2 ruling, LP0-13): detecting that a same-signature routine, helper or RLS policy
 * changed its protection while its ACLs did not. Routine and RLS protection facts are READ and RECORDED (see
 * readProtectionRecord) so reviewers can inspect them, but nothing in this module compares them.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { z } from "zod";
import { migrate, MIGRATION_URLS } from "../src/index.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";

export type Queryable = { query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }> };

// ---------------------------------------------------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------------------------------------------------

/** Schemas whose objects are inventoried. Everything that is not a PostgreSQL system schema is in scope. */
export const SYSTEM_SCHEMA_PATTERN = "^(pg_|information_schema$)";
export const APPLICATION_ROLE = "jobguard_runtime";
export const LP_CARDS = ["LP-1", "LP-2", "LP-3", "LP-4", "LP-5a", "LP-5b", "LP-5c", "LP-6a", "LP-6b", "LP-6c", "LP-6d", "LP-6e", "LP-7", "LP-8a", "LP-8b", "LP-9", "LP-10", "LP-11", "LP-12", "LP-13"] as const;
/** System routines an application login must never be able to execute. Recorded as facts only if they ARE executable. */
export const DANGEROUS_SYSTEM_ROUTINES = [
  "pg_read_file", "pg_read_binary_file", "pg_ls_dir", "pg_stat_file", "pg_ls_logdir", "pg_ls_waldir", "lo_import", "lo_export",
  "pg_terminate_backend", "pg_cancel_backend", "pg_reload_conf", "pg_rotate_logfile", "pg_switch_wal", "pg_promote",
  "pg_backup_start", "pg_create_restore_point", "pg_drop_replication_slot", "pg_create_physical_replication_slot",
] as const;

const TABLE_PRIVILEGES = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"] as const;
const SEQUENCE_PRIVILEGES = ["USAGE", "SELECT", "UPDATE"] as const;
const COLUMN_PRIVILEGES = ["SELECT", "INSERT", "UPDATE", "REFERENCES"] as const;

// ---------------------------------------------------------------------------------------------------------------------
// Catalogue model (what was read) and fact model (what is compared)
// ---------------------------------------------------------------------------------------------------------------------

export type AclEntry = { grantee: string; privilege: string; grantable: boolean };
export type RoleRow = { name: string; super: boolean; inherit: boolean; createrole: boolean; createdb: boolean; login: boolean; replication: boolean; bypassrls: boolean; connlimit: number; settings: string[] };
export type MembershipRow = { role: string; member: string; admin: boolean; inherit: boolean; set: boolean };
export type ReachRow = { from: string; to: string; inherit: boolean; set: boolean };
export type SchemaRow = { name: string; owner: string; acl: AclEntry[] };
export type ColumnAcl = { column: string; acl: AclEntry[] };
export type RelationRow = {
  schema: string; name: string; kind: "table" | "partitioned" | "view" | "matview" | "foreign" | "sequence"; owner: string;
  explicitAcl: boolean; acl: AclEntry[]; columns: ColumnAcl[]; options: string[]; rlsEnabled: boolean; rlsForced: boolean;
  definitionDigest: string | null; dependsOn: string[];
};
export type RoutineRow = {
  schema: string; name: string; kind: "function" | "procedure" | "aggregate" | "window"; args: string; owner: string; securityDefiner: boolean;
  config: string[]; explicitAcl: boolean; acl: AclEntry[]; returnsTrigger: boolean; extension: string | null; definitionDigest: string | null; source: string;
};
export type DatabaseRow = { name: string; owner: string; acl: AclEntry[] };
export type LanguageRow = { name: string; owner: string; acl: AclEntry[] };
export type DefaultAclRow = { creator: string; schema: string | null; objectType: string; acl: AclEntry[] };
export type EffectiveRow = { subject: string; cls: "rel" | "col" | "routine" | "schema" | "database" | "language"; object: string; privilege: string };
export type SystemRoutineRow = { identity: string; explicitAcl: boolean; runtimeCanExecute: boolean };
export type PolicyRow = { relation: string; name: string; permissive: boolean; command: string; roles: string[]; digest: string };
export type TriggerRow = { relation: string; name: string; routine: string; timing: string; events: string[]; enabled: string };

export type Catalogue = {
  server: string; database: string; subject: string;
  roles: RoleRow[]; memberships: MembershipRow[]; reach: ReachRow[]; schemas: SchemaRow[]; relations: RelationRow[]; routines: RoutineRow[];
  databases: DatabaseRow[]; languages: LanguageRow[]; defaults: DefaultAclRow[]; effective: EffectiveRow[]; systemRoutines: SystemRoutineRow[];
  policies: PolicyRow[]; triggers: TriggerRow[]; ownedCounts: Record<string, number>;
};

export type FactCategory = "acl" | "owner" | "role" | "member" | "reach" | "eff" | "default" | "view" | "sys";
export type Fact = {
  key: string; category: FactCategory; objectClass: string; object: string; column?: string; grantee?: string; privilege?: string;
  grantable?: boolean; route?: string; detail?: string;
};

const g = (grantable: boolean) => (grantable ? "G" : "-");
const rel = (schema: string, name: string) => `${schema}.${name}`;
export const routineIdentity = (r: Pick<RoutineRow, "schema" | "name" | "kind" | "args">) => `${r.kind}:${r.schema}.${r.name}(${r.args})`;

/** Stable key builders. Keys never contain OIDs. */
export const keys = {
  aclRel: (kind: string, object: string, grantee: string, privilege: string, grantable: boolean) => `acl|rel|${kind}|${object}|${grantee}|${privilege}|${g(grantable)}`,
  aclCol: (object: string, column: string, grantee: string, privilege: string, grantable: boolean) => `acl|col|${object}.${column}|${grantee}|${privilege}|${g(grantable)}`,
  aclRoutine: (identity: string, grantee: string, privilege: string, grantable: boolean) => `acl|routine|${identity}|${grantee}|${privilege}|${g(grantable)}`,
  aclSchema: (name: string, grantee: string, privilege: string, grantable: boolean) => `acl|schema|${name}|${grantee}|${privilege}|${g(grantable)}`,
  aclDatabase: (name: string, grantee: string, privilege: string, grantable: boolean) => `acl|database|${name}|${grantee}|${privilege}|${g(grantable)}`,
  aclLanguage: (name: string, grantee: string, privilege: string, grantable: boolean) => `acl|language|${name}|${grantee}|${privilege}|${g(grantable)}`,
  owner: (objectClass: string, object: string, role: string) => `owner|${objectClass}|${object}|${role}`,
  role: (r: RoleRow) => `role|${r.name}|super=${tf(r.super)},inherit=${tf(r.inherit)},createrole=${tf(r.createrole)},createdb=${tf(r.createdb)},login=${tf(r.login)},replication=${tf(r.replication)},bypassrls=${tf(r.bypassrls)},connlimit=${r.connlimit},settings=${[...r.settings].sort().join(";")}`,
  member: (m: MembershipRow) => `member|${m.role}|${m.member}|admin=${tf(m.admin)},inherit=${tf(m.inherit)},set=${tf(m.set)}`,
  reach: (from: string, to: string, how: "inherit" | "set") => `reach|${from}|${to}|${how}`,
  eff: (subject: string, cls: string, object: string, privilege: string) => `eff|${subject}|${cls}|${object}|${privilege}`,
  defaultExplicit: (creator: string, schema: string | null, objectType: string, grantee: string, privilege: string, grantable: boolean) => `default|explicit|${creator}|${schema ?? "*"}|${objectType}|${grantee}|${privilege}|${g(grantable)}`,
  defaultBuiltin: (objectType: string, grantee: string, privilege: string, grantable: boolean) => `default|builtin|${objectType}|${grantee}|${privilege}|${g(grantable)}`,
  view: (object: string, kind: string, options: string[], digest: string) => `view|${object}|${kind}|options=${[...options].sort().join(";")}|definition=${digest}`,
  viewDependency: (object: string, base: string) => `view|dependency|${object}|${base}`,
  sysDangerous: (identity: string) => `sys|dangerous|${identity}|EXECUTE`,
  sysManaged: (identity: string) => `sys|managed|${identity}|EXECUTE`,
};
const tf = (b: boolean) => (b ? "t" : "f");

// ---------------------------------------------------------------------------------------------------------------------
// Reading the catalogue
// ---------------------------------------------------------------------------------------------------------------------

const ACL_JSON = (aclExpr: string, defaultType: string, ownerExpr: string) => `(SELECT coalesce(json_agg(json_build_object(
  'grantee', CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END, 'privilege', a.privilege_type, 'grantable', a.is_grantable)
  ORDER BY (CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END), a.privilege_type), '[]'::json)
  FROM aclexplode(coalesce(${aclExpr}, acldefault(${defaultType}, ${ownerExpr}))) a)`;

const digest = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const RELKIND: Record<string, RelationRow["kind"]> = { r: "table", p: "partitioned", v: "view", m: "matview", f: "foreign", S: "sequence" };
const ROUTINEKIND: Record<string, RoutineRow["kind"]> = { f: "function", p: "procedure", a: "aggregate", w: "window" };

/** Reads everything the guard needs. `subject` is the application login whose effective privileges are corroborated. */
export async function readCatalogue(db: Queryable, subject: string = APPLICATION_ROLE): Promise<Catalogue> {
  const scope = `n.nspname !~ '${SYSTEM_SCHEMA_PATTERN}'`;
  const q = async (text: string, values?: unknown[]) => (await db.query(text, values)).rows;
  const subjectExists = (await q("SELECT 1 FROM pg_roles WHERE rolname=$1", [subject])).length > 0;

  const server = (await q("SELECT version() AS v"))[0]!.v as string;
  const database = (await q("SELECT current_database() AS d"))[0]!.d as string;

  const roles = (await q(`SELECT r.rolname AS name,r.rolsuper AS "super",r.rolinherit AS inherit,r.rolcreaterole AS createrole,r.rolcreatedb AS createdb,
      r.rolcanlogin AS login,r.rolreplication AS replication,r.rolbypassrls AS bypassrls,r.rolconnlimit AS connlimit,
      coalesce((SELECT array_agg(c ORDER BY c) FROM pg_db_role_setting s CROSS JOIN LATERAL unnest(s.setconfig) c WHERE s.setrole=r.oid),ARRAY[]::text[]) AS settings
    FROM pg_roles r WHERE r.rolname !~ '^pg_' ORDER BY r.rolname`)) as RoleRow[];

  const memberships = (await q(`SELECT pg_get_userbyid(m.roleid) AS role,pg_get_userbyid(m.member) AS member,m.admin_option AS admin,m.inherit_option AS inherit,m.set_option AS "set"
    FROM pg_auth_members m WHERE NOT (pg_get_userbyid(m.roleid) ~ '^pg_' AND pg_get_userbyid(m.member) ~ '^pg_') ORDER BY 1,2`)) as MembershipRow[];

  const reach = (await q(`SELECT s.rolname AS "from",t.rolname AS "to",pg_has_role(s.oid,t.oid,'USAGE') AS inherit,pg_has_role(s.oid,t.oid,'SET') AS "set"
    FROM pg_roles s CROSS JOIN pg_roles t WHERE s.oid<>t.oid AND s.rolname !~ '^pg_' AND NOT s.rolsuper
      AND (pg_has_role(s.oid,t.oid,'USAGE') OR pg_has_role(s.oid,t.oid,'SET')) ORDER BY 1,2`)) as ReachRow[];

  const schemas = (await q(`SELECT n.nspname AS name,pg_get_userbyid(n.nspowner) AS owner,${ACL_JSON("n.nspacl", "'n'", "n.nspowner")} AS acl
    FROM pg_namespace n WHERE ${scope} ORDER BY 1`)) as SchemaRow[];

  const relRows = await q(`SELECT n.nspname AS schema,c.relname AS name,c.relkind AS kind,pg_get_userbyid(c.relowner) AS owner,c.relacl IS NOT NULL AS "explicitAcl",
      ${ACL_JSON("c.relacl", "(CASE WHEN c.relkind='S' THEN 's' ELSE 'r' END)::\"char\"", "c.relowner")} AS acl,
      coalesce(c.reloptions,ARRAY[]::text[]) AS options,c.relrowsecurity AS "rlsEnabled",c.relforcerowsecurity AS "rlsForced",
      CASE WHEN c.relkind IN ('v','m') THEN encode(sha256(convert_to(pg_get_viewdef(c.oid,true),'UTF8')),'hex') END AS "definitionDigest",
      coalesce((SELECT array_agg(DISTINCT rn.nspname||'.'||rc.relname ORDER BY rn.nspname||'.'||rc.relname) FROM pg_rewrite rw
        JOIN pg_depend d ON d.objid=rw.oid AND d.classid='pg_rewrite'::regclass AND d.refclassid='pg_class'::regclass
        JOIN pg_class rc ON rc.oid=d.refobjid JOIN pg_namespace rn ON rn.oid=rc.relnamespace
        WHERE rw.ev_class=c.oid AND rc.oid<>c.oid),ARRAY[]::text[]) AS "dependsOn"
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE ${scope} AND c.relkind IN ('r','p','v','m','f','S') ORDER BY 1,2`);
  const columnRows = await q(`SELECT n.nspname AS schema,c.relname AS rel,a.attname AS column,
      (SELECT coalesce(json_agg(json_build_object('grantee',CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,'privilege',x.privilege_type,'grantable',x.is_grantable)
        ORDER BY (CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END),x.privilege_type),'[]'::json) FROM aclexplode(a.attacl) x) AS acl
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE ${scope} AND a.attacl IS NOT NULL AND a.attnum>0 AND NOT a.attisdropped ORDER BY 1,2,3`);
  const colsByRel = new Map<string, ColumnAcl[]>();
  for (const c of columnRows) (colsByRel.get(rel(c.schema, c.rel)) ?? colsByRel.set(rel(c.schema, c.rel), []).get(rel(c.schema, c.rel))!).push({ column: c.column, acl: c.acl });
  const relations: RelationRow[] = relRows.map(r => ({ ...r, kind: RELKIND[r.kind as string]!, columns: colsByRel.get(rel(r.schema, r.name)) ?? [] }));

  const routineRows = await q(`SELECT n.nspname AS schema,p.proname AS name,p.prokind AS kind,
      array_to_string(ARRAY(SELECT format_type(t,NULL) FROM unnest(p.proargtypes::oid[]) WITH ORDINALITY u(t,o) ORDER BY o),',') AS args,
      pg_get_userbyid(p.proowner) AS owner,p.prosecdef AS "securityDefiner",coalesce(p.proconfig,ARRAY[]::text[]) AS config,
      p.proacl IS NOT NULL AS "explicitAcl",${ACL_JSON("p.proacl", "'f'", "p.proowner")} AS acl,
      (p.prorettype='trigger'::regtype) AS "returnsTrigger",
      (SELECT e.extname FROM pg_depend d JOIN pg_extension e ON e.oid=d.refobjid WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e' LIMIT 1) AS extension,
      CASE WHEN p.prokind IN ('f','p','w') AND l.lanname IN ('plpgsql','sql') THEN encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') END AS "definitionDigest",
      CASE WHEN l.lanname IN ('plpgsql','sql') THEN p.prosrc ELSE '' END AS source
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
    WHERE ${scope} ORDER BY 1,2,4`);
  const routines: RoutineRow[] = routineRows.map(r => ({ ...r, kind: ROUTINEKIND[r.kind as string]! }));

  const databases = (await q(`SELECT d.datname AS name,pg_get_userbyid(d.datdba) AS owner,${ACL_JSON("d.datacl", "'d'", "d.datdba")} AS acl FROM pg_database d WHERE d.datname=current_database()`)) as DatabaseRow[];
  const languages = (await q(`SELECT l.lanname AS name,pg_get_userbyid(l.lanowner) AS owner,${ACL_JSON("l.lanacl", "'l'", "l.lanowner")} AS acl FROM pg_language l ORDER BY 1`)) as LanguageRow[];

  const OBJECT_TYPES: Record<string, string> = { r: "table", S: "sequence", f: "function", T: "type", n: "schema" };
  const defaults = (await q(`SELECT pg_get_userbyid(d.defaclrole) AS creator,(SELECT nspname FROM pg_namespace WHERE oid=d.defaclnamespace) AS schema,d.defaclobjtype AS "objectType",
      (SELECT coalesce(json_agg(json_build_object('grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable)
        ORDER BY (CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END),a.privilege_type),'[]'::json) FROM aclexplode(d.defaclacl) a) AS acl
    FROM pg_default_acl d ORDER BY 1,2,3`)).map(r => ({ ...r, objectType: OBJECT_TYPES[r.objectType as string] ?? (r.objectType as string) })) as DefaultAclRow[];

  let effective: EffectiveRow[] = [];
  if (subjectExists) {
    const eff = async (cls: EffectiveRow["cls"], text: string) => { for (const r of await q(text, [subject])) effective.push({ subject, cls, object: r.object, privilege: r.privilege }); };
    await eff("rel", `SELECT n.nspname||'.'||c.relname AS object,p.privilege FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      CROSS JOIN LATERAL unnest(CASE WHEN c.relkind='S' THEN ARRAY['USAGE','SELECT','UPDATE'] ELSE ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] END) p(privilege)
      WHERE ${scope} AND c.relkind IN ('r','p','v','m','f','S')
        AND (CASE WHEN c.relkind='S' THEN has_sequence_privilege($1,c.oid,p.privilege) ELSE has_table_privilege($1,c.oid,p.privilege) END) ORDER BY 1,2`);
    await eff("col", `SELECT n.nspname||'.'||c.relname||'.'||a.attname AS object,p.privilege FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) p(privilege)
      WHERE ${scope} AND c.relkind IN ('r','p','v','m','f') AND a.attnum>0 AND NOT a.attisdropped
        AND has_column_privilege($1,c.oid,a.attnum,p.privilege) AND NOT has_table_privilege($1,c.oid,p.privilege) ORDER BY 1,2`);
    await eff("routine", `SELECT (CASE p.prokind WHEN 'f' THEN 'function' WHEN 'p' THEN 'procedure' WHEN 'a' THEN 'aggregate' ELSE 'window' END)||':'||n.nspname||'.'||p.proname||'('||
        array_to_string(ARRAY(SELECT format_type(t,NULL) FROM unnest(p.proargtypes::oid[]) WITH ORDINALITY u(t,o) ORDER BY o),',')||')' AS object,'EXECUTE' AS privilege
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE ${scope} AND has_function_privilege($1,p.oid,'EXECUTE') ORDER BY 1`);
    await eff("schema", `SELECT n.nspname AS object,p.privilege FROM pg_namespace n CROSS JOIN unnest(ARRAY['USAGE','CREATE']) p(privilege)
      WHERE ${scope} AND has_schema_privilege($1,n.oid,p.privilege) ORDER BY 1,2`);
    await eff("database", `SELECT current_database() AS object,p.privilege FROM unnest(ARRAY['CONNECT','CREATE','TEMPORARY']) p(privilege) WHERE has_database_privilege($1,current_database(),p.privilege) ORDER BY 2`);
    await eff("language", `SELECT l.lanname AS object,'USAGE' AS privilege FROM pg_language l WHERE has_language_privilege($1,l.oid,'USAGE') ORDER BY 1`);
  }

  const sysRows = subjectExists
    ? await q(`SELECT n.nspname||'.'||p.proname||'('||array_to_string(ARRAY(SELECT format_type(t,NULL) FROM unnest(p.proargtypes::oid[]) WITH ORDINALITY u(t,o) ORDER BY o),',')||')' AS identity,
        p.proname AS name,p.proacl IS NOT NULL AS "explicitAcl",has_function_privilege($1,p.oid,'EXECUTE') AS "runtimeCanExecute"
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('pg_catalog','information_schema') ORDER BY 1`, [subject])
    : [];
  const dangerous = new Set<string>(DANGEROUS_SYSTEM_ROUTINES);
  const systemRoutines: SystemRoutineRow[] = sysRows
    .filter(r => r.runtimeCanExecute && (dangerous.has(r.name as string) || r.explicitAcl))
    .map(r => ({ identity: `${dangerous.has(r.name as string) ? "dangerous" : "managed"}:${r.identity}`, explicitAcl: r.explicitAcl, runtimeCanExecute: true }));

  const policies = (await q(`SELECT schemaname||'.'||tablename AS relation,policyname AS name,permissive='PERMISSIVE' AS permissive,cmd AS command,roles::text[] AS roles,
      encode(sha256(convert_to(coalesce(qual,'')||E'\\n'||coalesce(with_check,''),'UTF8')),'hex') AS digest FROM pg_policies WHERE schemaname !~ '${SYSTEM_SCHEMA_PATTERN}' ORDER BY 1,2`)) as PolicyRow[];
  const triggers = (await q(`SELECT n.nspname||'.'||c.relname AS relation,t.tgname AS name,pn.nspname||'.'||p.proname AS routine,
      CASE WHEN t.tgtype&2=2 THEN 'BEFORE' WHEN t.tgtype&64=64 THEN 'INSTEAD OF' ELSE 'AFTER' END AS timing,
      ARRAY(SELECT e FROM unnest(ARRAY[CASE WHEN t.tgtype&4=4 THEN 'INSERT' END,CASE WHEN t.tgtype&8=8 THEN 'DELETE' END,CASE WHEN t.tgtype&16=16 THEN 'UPDATE' END,CASE WHEN t.tgtype&32=32 THEN 'TRUNCATE' END]) e WHERE e IS NOT NULL) AS events,
      t.tgenabled::text AS enabled
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace
    WHERE NOT t.tgisinternal AND ${scope} ORDER BY 1,2`)) as TriggerRow[];

  const ownedCounts: Record<string, number> = {};
  for (const r of await q(`SELECT pg_get_userbyid(c.relowner) AS owner,count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${scope} AND c.relkind IN ('r','p','v','m','f','S') GROUP BY 1`)) ownedCounts[r.owner] = r.n;
  for (const r of await q(`SELECT pg_get_userbyid(p.proowner) AS owner,count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE ${scope} GROUP BY 1`)) ownedCounts[r.owner] = (ownedCounts[r.owner] ?? 0) + r.n;

  return { server, database, subject, roles, memberships, reach, schemas, relations, routines, databases, languages, defaults, effective, systemRoutines, policies, triggers, ownedCounts };
}

// ---------------------------------------------------------------------------------------------------------------------
// Fact derivation (pure)
// ---------------------------------------------------------------------------------------------------------------------

type Holder = { owner: string; acl: AclEntry[] };

/** Why a subject holds a privilege, derived from the ACLs read (PostgreSQL's own answer decides THAT it holds it). */
export function explainRoutes(cat: Catalogue, subject: string, holder: Holder, privilege: string): string[] {
  const routes: string[] = [];
  if (holder.owner === subject) routes.push("owner");
  if (holder.acl.some(a => a.grantee === subject && a.privilege === privilege)) routes.push("direct");
  if (holder.acl.some(a => a.grantee === "PUBLIC" && a.privilege === privilege)) routes.push("public");
  for (const r of cat.reach) {
    if (r.from !== subject || !r.inherit) continue;
    if (holder.owner === r.to) routes.push(`inherit-owner:${r.to}`);
    if (holder.acl.some(a => a.grantee === r.to && a.privilege === privilege)) routes.push(`inherit:${r.to}`);
  }
  return routes.length ? routes : ["unexplained"];
}

/** Does the capability need its own `eff` fact? Plain direct/PUBLIC grants are already compared as `acl` facts. */
const needsEffectiveFact = (routes: string[]) => routes.some(r => r !== "direct" && r !== "public");

export function deriveFacts(cat: Catalogue): Fact[] {
  const facts = new Map<string, Fact>();
  const add = (f: Fact) => { if (!facts.has(f.key)) facts.set(f.key, f); };
  const aclFacts = (objectClass: string, object: string, owner: string, acl: AclEntry[], make: (a: AclEntry) => string, column?: string) => {
    for (const a of acl) {
      if (a.grantee === owner) continue;
      add({ key: make(a), category: "acl", objectClass, object, ...(column ? { column } : {}), grantee: a.grantee, privilege: a.privilege, grantable: a.grantable, route: a.grantee === "PUBLIC" ? "public" : "direct" });
    }
  };

  // Roles, memberships and reachability.
  for (const r of cat.roles) add({ key: keys.role(r), category: "role", objectClass: "role", object: r.name, detail: r.login ? "login" : "nologin" });
  for (const m of cat.memberships) add({ key: keys.member(m), category: "member", objectClass: "membership", object: `${m.role}<-${m.member}`, grantee: m.member, route: m.set ? "set" : m.inherit ? "inherit" : "membership" });
  for (const r of cat.reach) {
    const owned = cat.ownedCounts[r.to] ?? 0;
    if (r.inherit) add({ key: keys.reach(r.from, r.to, "inherit"), category: "reach", objectClass: "role", object: r.to, grantee: r.from, route: "inherit", detail: `owns ${owned} inventoried objects` });
    if (r.set) add({ key: keys.reach(r.from, r.to, "set"), category: "reach", objectClass: "role", object: r.to, grantee: r.from, route: "set", detail: `owns ${owned} inventoried objects` });
  }

  // Schema, database, language ACLs and owners.
  for (const s of cat.schemas) {
    add({ key: keys.owner("schema", s.name, s.owner), category: "owner", objectClass: "schema", object: s.name, grantee: s.owner });
    aclFacts("schema", s.name, s.owner, s.acl, a => keys.aclSchema(s.name, a.grantee, a.privilege, a.grantable));
  }
  for (const d of cat.databases) {
    add({ key: keys.owner("database", d.name, d.owner), category: "owner", objectClass: "database", object: d.name, grantee: d.owner });
    aclFacts("database", d.name, d.owner, d.acl, a => keys.aclDatabase(d.name, a.grantee, a.privilege, a.grantable));
  }
  for (const l of cat.languages) aclFacts("language", l.name, l.owner, l.acl, a => keys.aclLanguage(l.name, a.grantee, a.privilege, a.grantable));

  // Relations (tables, views, sequences) and their column ACLs.
  const schemaOwner = new Map(cat.schemas.map(s => [s.name, s.owner]));
  const holders = new Map<string, Holder>();
  for (const r of cat.relations) {
    const object = rel(r.schema, r.name);
    holders.set(`rel|${object}`, { owner: r.owner, acl: r.acl });
    const nonOwner = r.acl.some(a => a.grantee !== r.owner) || r.columns.some(c => c.acl.some(a => a.grantee !== r.owner));
    if (nonOwner || r.owner !== schemaOwner.get(r.schema)) add({ key: keys.owner(`rel:${r.kind}`, object, r.owner), category: "owner", objectClass: `rel:${r.kind}`, object, grantee: r.owner });
    aclFacts(r.kind, object, r.owner, r.acl, a => keys.aclRel(r.kind, object, a.grantee, a.privilege, a.grantable));
    for (const c of r.columns) {
      holders.set(`col|${object}.${c.column}`, { owner: r.owner, acl: [...c.acl, ...r.acl] });
      aclFacts("column", object, r.owner, c.acl, a => keys.aclCol(object, c.column, a.grantee, a.privilege, a.grantable), c.column);
    }
    if (r.kind === "view" || r.kind === "matview") {
      add({ key: keys.view(object, r.kind, r.options, r.definitionDigest ?? "none"), category: "view", objectClass: r.kind, object, detail: `depends on ${r.dependsOn.join(", ") || "nothing"}` });
      for (const b of r.dependsOn) add({ key: keys.viewDependency(object, b), category: "view", objectClass: `${r.kind}-dependency`, object, detail: b });
    }
  }

  // Routines: every executable overload is its own identity.
  for (const r of cat.routines) {
    const id = routineIdentity(r);
    holders.set(`routine|${id}`, { owner: r.owner, acl: r.acl });
    const reachable = r.acl.some(a => a.grantee !== r.owner);
    if (reachable || r.owner !== schemaOwner.get(r.schema)) add({ key: keys.owner("routine", id, r.owner), category: "owner", objectClass: "routine", object: id, grantee: r.owner });
    aclFacts("routine", id, r.owner, r.acl, a => keys.aclRoutine(id, a.grantee, a.privilege, a.grantable));
  }
  for (const s of cat.schemas) holders.set(`schema|${s.name}`, { owner: s.owner, acl: s.acl });
  for (const d of cat.databases) holders.set(`database|${d.name}`, { owner: d.owner, acl: d.acl });
  for (const l of cat.languages) holders.set(`language|${l.name}`, { owner: l.owner, acl: l.acl });

  // Effective privileges of the application login, corroborated by PostgreSQL. Only routes beyond a plain ACL entry need a fact.
  for (const e of cat.effective) {
    const holder = holders.get(`${e.cls}|${e.object}`);
    const routes = holder ? explainRoutes(cat, e.subject, holder, e.privilege) : ["unexplained"];
    if (needsEffectiveFact(routes)) add({ key: keys.eff(e.subject, e.cls, e.object, e.privilege), category: "eff", objectClass: e.cls, object: e.object, grantee: e.subject, privilege: e.privilege, route: routes.join("+") });
  }

  // Explicit object-creator default privileges, and PostgreSQL's own built-in defaults (non-owner entries only).
  for (const d of cat.defaults) for (const a of d.acl) {
    if (a.grantee === d.creator) continue;
    add({ key: keys.defaultExplicit(d.creator, d.schema, d.objectType, a.grantee, a.privilege, a.grantable), category: "default", objectClass: d.objectType, object: `${d.creator}/${d.schema ?? "*"}`, grantee: a.grantee, privilege: a.privilege, grantable: a.grantable, route: "future-objects" });
  }
  for (const [objectType, grants] of Object.entries(BUILTIN_DEFAULTS)) for (const [grantee, privilege] of grants) {
    add({ key: keys.defaultBuiltin(objectType, grantee, privilege, false), category: "default", objectClass: objectType, object: "postgresql-builtin", grantee, privilege, route: "builtin-default" });
  }

  // System entry points reachable by the application login.
  for (const s of cat.systemRoutines) {
    const dangerous = s.identity.startsWith("dangerous:");
    const identity = s.identity.slice(s.identity.indexOf(":") + 1);
    add({ key: dangerous ? keys.sysDangerous(identity) : keys.sysManaged(identity), category: "sys", objectClass: "system-routine", object: identity, privilege: "EXECUTE", grantee: cat.subject });
  }
  return [...facts.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** PostgreSQL's built-in default ACL for each object class, non-owner entries (documentation of the future-object effect). */
export const BUILTIN_DEFAULTS: Record<string, [string, string][]> = {
  function: [["PUBLIC", "EXECUTE"]], type: [["PUBLIC", "USAGE"]], language: [["PUBLIC", "USAGE"]], database: [["PUBLIC", "CONNECT"], ["PUBLIC", "TEMPORARY"]],
  table: [], sequence: [], schema: [],
};

// ---------------------------------------------------------------------------------------------------------------------
// Recorded (NOT compared) routine and RLS protection facts. The comparison of these is held (Q2 / LP0-13).
// ---------------------------------------------------------------------------------------------------------------------

export type RoutineProtectionRecord = {
  identity: string; owner: string; securityDefiner: boolean; searchPath: string | null; returnsTrigger: boolean; extension: string | null;
  reachable: boolean; runtimeExecute: boolean; publicExecute: boolean; otherExecute: string[]; definitionSha256: string | null; staticWrites: string[]; staticCalls: string[];
};

const WRITE_RE = /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?)\s+((?:[a-z_]+)\.(?:[a-z_0-9]+))/gi;
const CALL_RE = /\b([a-z_]+\.[a-z_0-9]+)\s*\(/gi;

/** Source inspection only: these are hypotheses to be tested, never proof of harmlessness. */
export function staticScan(source: string, knownRoutines: Set<string>, knownRelations: Set<string>) {
  const stripped = source.replace(/--[^\n]*/g, " ");
  const writes = new Set<string>();
  for (const m of stripped.matchAll(WRITE_RE)) { const t = m[1]!.toLowerCase(); if (knownRelations.has(t)) writes.add(t); }
  const calls = new Set<string>();
  for (const m of stripped.matchAll(CALL_RE)) { const c = m[1]!.toLowerCase(); if (knownRoutines.has(c)) calls.add(c); }
  return { staticWrites: [...writes].sort(), staticCalls: [...calls].sort() };
}

export function readProtectionRecord(cat: Catalogue): { routines: RoutineProtectionRecord[]; rls: string[]; policies: string[]; triggers: string[] } {
  const known = new Set(cat.routines.map(r => `${r.schema}.${r.name}`));
  const rels = new Set(cat.relations.map(r => rel(r.schema, r.name)));
  const routines: RoutineProtectionRecord[] = [];
  for (const r of cat.routines) {
    const others = r.acl.filter(a => a.grantee !== r.owner && a.grantee !== "PUBLIC" && a.grantee !== cat.subject && a.privilege === "EXECUTE").map(a => a.grantee);
    const reachable = r.acl.some(a => a.grantee !== r.owner);
    const scan = staticScan(r.source, known, rels);
    const searchPath = r.config.find(c => c.startsWith("search_path=")) ?? null;
    routines.push({
      identity: routineIdentity(r), owner: r.owner, securityDefiner: r.securityDefiner, searchPath, returnsTrigger: r.returnsTrigger, extension: r.extension,
      reachable, runtimeExecute: r.acl.some(a => a.grantee === cat.subject && a.privilege === "EXECUTE"), publicExecute: r.acl.some(a => a.grantee === "PUBLIC" && a.privilege === "EXECUTE"),
      otherExecute: others.sort(), definitionSha256: r.definitionDigest, staticWrites: scan.staticWrites, staticCalls: scan.staticCalls.filter(c => c !== `${r.schema}.${r.name}`),
    });
  }
  const rls = cat.relations.filter(r => (r.kind === "table" || r.kind === "partitioned") && r.acl.some(a => a.grantee !== r.owner))
    .map(r => `${rel(r.schema, r.name)}|rls=${tf(r.rlsEnabled)}|forced=${tf(r.rlsForced)}`);
  const policies = cat.policies.map(p => `${p.relation}|${p.name}|${p.permissive ? "PERMISSIVE" : "RESTRICTIVE"}|${p.command}|${[...p.roles].sort().join(",")}|${p.digest.slice(0, 16)}`);
  const triggers = cat.triggers.map(t => `${t.relation}|${t.name}|${t.routine}|${t.timing} ${t.events.join("/")}|${t.enabled}`);
  return { routines, rls, policies, triggers };
}

// ---------------------------------------------------------------------------------------------------------------------
// Reviewed inventory: strict, versioned boundary
// ---------------------------------------------------------------------------------------------------------------------

const cardId = z.enum(LP_CARDS);
export const GROUP_KINDS = [
  "authority", "money", "audit", "evidence", "commitment", "membership", "identity", "working_data", "read_access", "helper", "trigger_function",
  "extension_utility", "role_posture", "role_path", "default_privilege", "schema_posture", "database_posture", "view", "system", "owner",
] as const;
/** Kinds that decide who may do what, or move money or trusted history: they must trace to an authority path and an LP card. */
export const AUTHORITY_KINDS: ReadonlySet<string> = new Set(["authority", "money", "audit", "evidence", "commitment", "membership", "identity"]);

const target = z.object({
  state: z.enum(["retain", "revoke", "replace_with_checked_routine", "restrict_to_owner", "rebind_at_card", "review_at_card"]),
  note: z.string().min(8),
}).strict();

const groupSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  title: z.string().min(3),
  kind: z.enum(GROUP_KINDS),
  status: z.enum(["existing_exception", "approved_current"]),
  target,
  cards: z.array(cardId),
  responsibilities: z.record(cardId, z.string().min(8)),
  downstream: z.string().min(8),
  path: z.string().optional(),
  alsoPaths: z.array(z.string()).optional(),
  sources: z.array(z.string().min(3)),
  tests: z.array(z.string().min(3)),
  gaps: z.array(z.string()),
}).strict();

const authorityPathSchema = z.object({
  id: z.string().regex(/^ap-[a-z0-9-]+$/),
  title: z.string().min(3),
  description: z.string().min(12),
  cards: z.array(cardId).min(1),
  responsibilities: z.record(cardId, z.string().min(8)),
  sources: z.array(z.string().min(3)).min(1),
  tests: z.array(z.string().min(3)).min(1),
  gaps: z.array(z.string()),
}).strict();

const routineRecordSchema = z.object({
  identity: z.string().min(3), owner: z.string(), securityDefiner: z.boolean(), searchPath: z.string().nullable(), returnsTrigger: z.boolean(), extension: z.string().nullable(),
  reachable: z.boolean(), runtimeExecute: z.boolean(), publicExecute: z.boolean(), otherExecute: z.array(z.string()), definitionSha256: z.string().nullable(),
  staticWrites: z.array(z.string()), staticCalls: z.array(z.string()),
}).strict();

export const inventorySchema = z.object({
  format: z.literal("lp-0-effective-privileges"),
  version: z.literal(1),
  base: z.object({
    landingBase: z.string().min(7), postgres: z.string().min(3), migrationCount: z.number().int().positive(), lastMigration: z.string().min(3),
    subject: z.string().min(3), profiles: z.array(z.string().min(3)).min(1), generatedBy: z.string().min(3),
  }).strict(),
  groups: z.array(groupSchema).min(1),
  entries: z.array(z.object({ key: z.string().min(5), group: z.string().min(1) }).strict()),
  authorityPaths: z.array(authorityPathSchema),
  targetState: z.array(z.object({ id: z.string().regex(/^ts-[a-z0-9-]+$/), statement: z.string().min(12), groups: z.array(z.string()), cards: z.array(cardId).min(1) }).strict()),
  recorded: z.object({
    note: z.string().min(12), routines: z.array(routineRecordSchema), rls: z.array(z.string()), policies: z.array(z.string()), triggers: z.array(z.string()),
  }).strict(),
  held: z.array(z.object({ id: z.string(), reason: z.string().min(12) }).strict()),
  gaps: z.array(z.string()),
}).strict();

export type Inventory = z.infer<typeof inventorySchema>;
export type InventoryGroup = Inventory["groups"][number];

export class InventoryError extends Error {
  constructor(readonly problems: string[]) { super(`reviewed inventory is invalid:\n- ${problems.join("\n- ")}`); }
}

/** Strict validation: malformed shape/version, duplicate or dangling records, and exceptions posing as target state are refused. */
export function parseInventory(raw: unknown): Inventory {
  if (raw === undefined || raw === null) throw new InventoryError(["inventory is missing"]);
  const parsed = inventorySchema.safeParse(raw);
  if (!parsed.success) throw new InventoryError(parsed.error.issues.map(i => `${i.path.join(".") || "(root)"}: ${i.message}`));
  const inv = parsed.data;
  const problems: string[] = [];
  const dupes = (items: string[], label: string) => { const seen = new Set<string>(); for (const i of items) { if (seen.has(i)) problems.push(`duplicate ${label}: ${i}`); seen.add(i); } };
  dupes(inv.groups.map(g => g.id), "group id");
  dupes(inv.entries.map(e => e.key), "entry key");
  dupes(inv.authorityPaths.map(p => p.id), "authority path id");
  dupes(inv.targetState.map(t => t.id), "target state id");
  const groups = new Map(inv.groups.map(g => [g.id, g]));
  const paths = new Map(inv.authorityPaths.map(p => [p.id, p]));
  for (const e of inv.entries) if (!groups.has(e.group)) problems.push(`entry ${e.key} refers to unknown group ${e.group}`);
  for (const g of inv.groups) {
    if (g.status === "existing_exception") {
      if (g.target.state === "retain") problems.push(`group ${g.id}: an existing exception cannot be its own target state (retain)`);
      if (!g.cards.length) problems.push(`group ${g.id}: an existing exception needs a closing LP card`);
    }
    if (g.status === "approved_current" && (g.target.state === "revoke" || g.target.state === "replace_with_checked_routine" || g.target.state === "restrict_to_owner")) {
      problems.push(`group ${g.id}: approved_current cannot carry a withdrawal target (${g.target.state}); record it as an existing exception`);
    }
    if (g.target.state !== "retain" && !g.cards.length) problems.push(`group ${g.id}: target ${g.target.state} needs an LP card`);
    if (g.cards.length > 1) for (const c of g.cards) if (!g.responsibilities[c]) problems.push(`group ${g.id}: card ${c} has no distinct responsibility`);
    for (const c of Object.keys(g.responsibilities)) if (!g.cards.includes(c as never)) problems.push(`group ${g.id}: responsibility for ${c} which is not one of its cards`);
    if (AUTHORITY_KINDS.has(g.kind)) {
      if (!g.cards.length) problems.push(`group ${g.id}: ${g.kind} group has no LP card`);
      if (!g.path || !paths.has(g.path)) problems.push(`group ${g.id}: ${g.kind} group has no known authority path (${g.path ?? "none"})`);
      if (!g.sources.length) problems.push(`group ${g.id}: ${g.kind} group has no source reference`);
      if (!g.tests.length) problems.push(`group ${g.id}: ${g.kind} group has no behavioural test reference`);
    } else if (g.path && !paths.has(g.path)) problems.push(`group ${g.id}: unknown authority path ${g.path}`);
    for (const extra of g.alsoPaths ?? []) if (!paths.has(extra)) problems.push(`group ${g.id}: unknown additional authority path ${extra}`);
  }
  for (const p of inv.authorityPaths) {
    if (p.cards.length > 1) for (const c of p.cards) if (!p.responsibilities[c]) problems.push(`path ${p.id}: card ${c} has no distinct responsibility`);
    for (const c of Object.keys(p.responsibilities)) if (!p.cards.includes(c as never)) problems.push(`path ${p.id}: responsibility for ${c} which is not one of its cards`);
  }
  for (const t of inv.targetState) for (const gid of t.groups) if (!groups.has(gid)) problems.push(`target state ${t.id} refers to unknown group ${gid}`);
  if (problems.length) throw new InventoryError(problems);
  return inv;
}

/** The final allowed state: ONLY capabilities whose reviewed target is to keep them. Existing exceptions are never in it. */
export function finalAllowedKeys(inv: Inventory): Set<string> {
  const groups = new Map(inv.groups.map(g => [g.id, g]));
  return new Set(inv.entries.filter(e => { const g = groups.get(e.group)!; return g.status === "approved_current" && g.target.state === "retain"; }).map(e => e.key));
}
export function existingExceptionKeys(inv: Inventory): Set<string> {
  const groups = new Map(inv.groups.map(g => [g.id, g]));
  return new Set(inv.entries.filter(e => groups.get(e.group)!.status === "existing_exception").map(e => e.key));
}

// ---------------------------------------------------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------------------------------------------------

export type DiagnosticCode =
  | "TABLE_GRANT_ADDED" | "COLUMN_GRANT_ADDED" | "PUBLIC_GRANT_ADDED" | "GRANT_OPTION_ADDED" | "SEQUENCE_GRANT_ADDED" | "DESTRUCTIVE_PRIVILEGE_ADDED"
  | "SCHEMA_PRIVILEGE_ADDED" | "DATABASE_PRIVILEGE_ADDED" | "LANGUAGE_PRIVILEGE_ADDED" | "ROUTINE_EXPOSED" | "ROLE_PATH_ADDED" | "ROLE_SET_PATH_ADDED"
  | "MEMBERSHIP_CHANGED" | "OWNER_CHANGED" | "ROLE_ATTRIBUTE_CHANGED" | "EFFECTIVE_PRIVILEGE_ADDED" | "DEFAULT_PRIVILEGE_ADDED" | "VIEW_CHANGED"
  | "SYSTEM_ROUTINE_EXPOSED";

export type Diagnostic = {
  code: DiagnosticCode; key: string; object: string; objectClass: string; column?: string; grantee?: string; privilege?: string; route?: string;
  change: "capability_added"; disposition: "unreviewed_addition"; downstream: string; cards: string[]; message: string;
};

export type Comparison = {
  ok: boolean; diagnostics: Diagnostic[]; /** In the inventory but no longer live: a reduction, accepted without widening anything. */ reductions: string[];
  matched: number; liveCount: number; inventoryCount: number;
};

export const DESTRUCTIVE = new Set(["TRUNCATE", "TRIGGER", "REFERENCES"]);

function codeFor(f: Fact): DiagnosticCode {
  switch (f.category) {
    case "acl":
      if (f.grantee === "PUBLIC") return "PUBLIC_GRANT_ADDED";
      if (f.grantable) return "GRANT_OPTION_ADDED";
      if (f.objectClass === "schema") return "SCHEMA_PRIVILEGE_ADDED";
      if (f.objectClass === "database") return "DATABASE_PRIVILEGE_ADDED";
      if (f.objectClass === "language") return "LANGUAGE_PRIVILEGE_ADDED";
      if (f.objectClass === "routine") return "ROUTINE_EXPOSED";
      if (f.objectClass === "sequence") return "SEQUENCE_GRANT_ADDED";
      if (f.privilege && DESTRUCTIVE.has(f.privilege)) return "DESTRUCTIVE_PRIVILEGE_ADDED";
      return f.objectClass === "column" ? "COLUMN_GRANT_ADDED" : "TABLE_GRANT_ADDED";
    case "owner": return "OWNER_CHANGED";
    case "role": return "ROLE_ATTRIBUTE_CHANGED";
    case "member": return "MEMBERSHIP_CHANGED";
    case "reach": return f.route === "set" ? "ROLE_SET_PATH_ADDED" : "ROLE_PATH_ADDED";
    case "eff": return "EFFECTIVE_PRIVILEGE_ADDED";
    case "default": return "DEFAULT_PRIVILEGE_ADDED";
    case "view": return "VIEW_CHANGED";
    case "sys": return "SYSTEM_ROUTINE_EXPOSED";
  }
}

export function describeFact(f: Fact): string {
  const who = f.grantee ? ` for ${f.grantee}` : "";
  const what = f.privilege ? ` ${f.privilege}` : "";
  const col = f.column ? ` column ${f.column}` : "";
  const how = f.route ? ` (route ${f.route})` : "";
  return `${f.category}:${f.objectClass} ${f.object}${col}${what}${who}${how}${f.detail ? ` [${f.detail}]` : ""}`;
}

export function compareInventory(inv: Inventory, live: Fact[]): Comparison {
  const reviewed = new Set(inv.entries.map(e => e.key));
  const liveKeys = new Set(live.map(f => f.key));
  const diagnostics: Diagnostic[] = [];
  let matched = 0;
  for (const f of live) {
    if (reviewed.has(f.key)) { matched++; continue; }
    diagnostics.push({
      code: codeFor(f), key: f.key, object: f.object, objectClass: f.objectClass, ...(f.column ? { column: f.column } : {}), ...(f.grantee ? { grantee: f.grantee } : {}),
      ...(f.privilege ? { privilege: f.privilege } : {}), ...(f.route ? { route: f.route } : {}), change: "capability_added", disposition: "unreviewed_addition",
      downstream: "unclassified: needs downstream classification and reviewed authorisation", cards: [], message: `new capability not in the reviewed inventory: ${describeFact(f)}`,
    });
  }
  const reductions = [...reviewed].filter(k => !liveKeys.has(k)).sort();
  return { ok: diagnostics.length === 0, diagnostics, reductions, matched, liveCount: live.length, inventoryCount: reviewed.size };
}

/** Per-fact disposition for reviewers: is each live capability an existing exception or an approved current capability. */
export function dispositions(inv: Inventory, live: Fact[]) {
  const groups = new Map(inv.groups.map(g => [g.id, g]));
  const byKey = new Map(inv.entries.map(e => [e.key, groups.get(e.group)!]));
  return live.map(f => { const g = byKey.get(f.key); return { key: f.key, disposition: g ? g.status : ("unreviewed_addition" as const), group: g?.id ?? null, kind: g?.kind ?? null, cards: g?.cards ?? [], target: g?.target.state ?? null }; });
}

/** Authority-path completeness: every group that decides authority/money/history is assigned to LP cards, a path, sources and tests. */
export function pathCompleteness(inv: Inventory, fileExists: (path: string) => boolean): string[] {
  const problems: string[] = [];
  const groupKinds = new Map(inv.groups.map(g => [g.id, g]));
  const used = new Set(inv.entries.map(e => e.group));
  for (const g of inv.groups) {
    if (!used.has(g.id)) problems.push(`group ${g.id} has no entries`);
    for (const t of g.tests) if (!fileExists(t)) problems.push(`group ${g.id}: test file not found: ${t}`);
    for (const s of g.sources) { const file = s.split(":")[0]!; if (!fileExists(file)) problems.push(`group ${g.id}: source file not found: ${file}`); }
  }
  for (const p of inv.authorityPaths) {
    for (const t of p.tests) if (!fileExists(t)) problems.push(`path ${p.id}: test file not found: ${t}`);
    for (const s of p.sources) { const file = s.split(":")[0]!; if (!fileExists(file)) problems.push(`path ${p.id}: source file not found: ${file}`); }
    if (!inv.groups.some(g => g.path === p.id || (g.alsoPaths ?? []).includes(p.id))) problems.push(`path ${p.id} is not used by any group`);
  }
  // A reachable routine that statically writes into a table of an authority-bearing group must itself belong to such a group.
  const tableGroup = new Map<string, InventoryGroup>();
  for (const e of inv.entries) {
    const m = /^acl\|rel\|table\|([^|]+)\|/.exec(e.key) ?? /^acl\|col\|([^|]+)\.[^.|]+\|/.exec(e.key);
    if (m) { const g = groupKinds.get(e.group)!; if (AUTHORITY_KINDS.has(g.kind)) tableGroup.set(m[1]!, g); }
  }
  const routineGroup = new Map<string, InventoryGroup>();
  for (const e of inv.entries) { const m = /^acl\|routine\|([^|]+)\|/.exec(e.key); if (m) routineGroup.set(m[1]!, groupKinds.get(e.group)!); }
  for (const r of inv.recorded.routines) {
    if (r.returnsTrigger) continue;
    const touched = r.staticWrites.filter(t => tableGroup.has(t));
    if (!touched.length) continue;
    const g = routineGroup.get(r.identity);
    if (g && !AUTHORITY_KINDS.has(g.kind) && g.kind !== "helper") problems.push(`routine ${r.identity} writes ${touched.join(", ")} but is classified ${g.kind}`);
    if (g && g.kind === "helper" && r.runtimeExecute && r.securityDefiner) problems.push(`routine ${r.identity} is a SECURITY DEFINER helper that writes ${touched.join(", ")} and runtime can execute it`);
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------------------------------
// Disposable-database harness (test-only). Owner setup, runtime access and catalogue inspection stay visibly separate.
// ---------------------------------------------------------------------------------------------------------------------

export const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
export const INVENTORY_PATH = join(REPO_ROOT, "docs/contracts/lp-0-effective-privileges-v1.json");
export const repoFileExists = (path: string) => existsSync(join(REPO_ROOT, path));
export const RUNTIME_TEST_PASSWORD = "synthetic-lp0-runtime-only";

/** Reads the committed reviewed inventory from disk. Missing or malformed files throw: there is no fallback. */
export async function loadReviewedInventory(): Promise<{ raw: unknown; inventory: Inventory }> {
  const raw = JSON.parse(await readFile(INVENTORY_PATH, "utf8")) as unknown;
  return { raw, inventory: parseInventory(raw) };
}

export type Lp0Database = {
  port: number; databaseName: string; admin: Pool; dir: string; migrationNames: string[];
  runtimeClient: () => Promise<import("pg").Client>; bootstrapRuntimeLogin: () => Promise<void>; stop: () => Promise<void>;
};

/** Starts disposable PostgreSQL 16, applies the COMPLETE migration registry once, and returns separate owner and runtime access. */
export async function startLp0Database(portBase: number): Promise<Lp0Database> {
  process.env.JOBGUARD_ENV = "synthetic_demo";
  const dir = await mkdtemp(join(tmpdir(), "jg-lp0-"));
  const port = await freePort(portBase, 300);
  const postgres = new EmbeddedPostgres({ databaseDir: dir, port, user: "postgres", password: "synthetic", persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start();
  const databaseName = "jobguard_synthetic_demo";
  const control = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic", database: "postgres" });
  await control.query(`CREATE DATABASE ${databaseName}`); await control.end();
  const admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic", database: databaseName, max: 4 });
  await migrate(admin);
  const { Client } = await import("pg");
  return {
    port, databaseName, admin, dir, migrationNames: MIGRATION_URLS.map(u => u.pathname.split("/").at(-1)!),
    // The synthetic-bootstrap posture of demo-bootstrap.ts: the real business role becomes LOGIN. Not a wrapper login.
    bootstrapRuntimeLogin: async () => { await admin.query(`ALTER ROLE ${APPLICATION_ROLE} LOGIN PASSWORD '${RUNTIME_TEST_PASSWORD}'`); },
    runtimeClient: async () => { const c = new Client({ host: "127.0.0.1", port, user: APPLICATION_ROLE, password: RUNTIME_TEST_PASSWORD, database: databaseName }); await c.connect(); return c; },
    stop: async () => { await closeTestPools(admin); await postgres.stop(); await rm(dir, { recursive: true, force: true }); },
  };
}

export const liveFacts = async (db: Queryable) => deriveFacts(await readCatalogue(db));
export const compareLive = async (inv: Inventory, db: Queryable) => compareInventory(inv, await liveFacts(db));
/** Compact view of diagnostics for assertions: code + object + privilege + grantee. */
export const brief = (c: Comparison) => c.diagnostics.map(d => `${d.code} ${d.object}${d.column ? "." + d.column : ""}${d.privilege ? " " + d.privilege : ""}${d.grantee ? " -> " + d.grantee : ""}`).sort();
