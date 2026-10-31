import { afterAll,beforeAll,expect,it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { MIGRATION_URLS, migrate } from "../src/migrate.js";
import { own,startBeforeMigration,applyMigration,startSession,status,snapshot,predecessorCatalogue,unchanged,type Cluster } from "./contractor-entitlement-fixtures.js";
import { proofBefore, proofColumns, proofDifferences as keyedDifferences, rolledBack, scratchReplaceFunction } from "./upgrade-proof-utils.js";

/* An upgrade proof proves ITS OWN migration only: install everything before N, snapshot, apply N alone, compare; then apply everything after N and require success twice. Compare existing rows by named pre-existing columns after all migrations. Never assert that later migrations add no column or replace no function; the fingerprinted-table guard owns 'may never gain a column'. */
type KeyedProof = Awaited<ReturnType<typeof proofBefore>>;
type Facts = Map<string, bigint>;
type UnkeyedProof = { names: string[]; typed: Record<string,string>; facts: Facts };
type Structure = { names: string[]; typed: Record<string,string>; key: string[] };
type Proof = { keyed: KeyedProof; emptyKeyed: Record<string,Structure>; unkeyed: Record<string,UnkeyedProof>; tables: string[]; counts: Record<string,bigint> };
const preserved = { rows: [], types: [] };
const authoritySpine = ["control_plane.tenant", "identity.identity_user", "app.account", "app.membership", "control_plane.contractor_practice_session", "app.commercial_track_assignment", "app.extra_origin"];
const ident = (name: string) => `"${name.replaceAll('"', '""')}"`;
const tableIdent = (table: string) => {
 const parts=table.split(".");
 if(parts.length!==2 || parts.some(part=>!part)) throw new Error(`Schema-qualified table required: ${table}`);
 return parts.map(ident).join(".");
};
const requestTable="identity.request_window";
const syntheticDigest=()=>createHash("sha256").update(`mon8-fictional-request:${randomUUID()}`).digest("hex");
const requestSeeds=[syntheticDigest(),syntheticDigest()];
const seedTime="2001-02-03 04:05:06.123456+00";
// Every capture/comparison uses one pinned connection and transaction-local rendering,
// including keyed captures. No pool query can silently use a different session's settings.
async function rendered<T>(db: Pool | PoolClient, work: (client: PoolClient)=>Promise<T>): Promise<T> {
 if ("totalCount" in db) return rolledBack(db, client=>rendered(client,work));
 await db.query("SET LOCAL TimeZone='UTC'");
 await db.query("SET LOCAL DateStyle='ISO, YMD'");
 return work(db);
}
async function factRows(db: PoolClient, table: string, names: string[]): Promise<Facts> {
 const result=await db.query(`SELECT bytes COLLATE "C" AS bytes,count(*)::text AS multiplicity FROM (
  SELECT (SELECT row_to_json(s)::text FROM (SELECT ${names.map(name=>`t.${ident(name)}`).join(",")}) s) AS bytes
  FROM ${tableIdent(table)} t) facts GROUP BY bytes COLLATE "C" ORDER BY bytes COLLATE "C"`);
 return new Map(result.rows.map(row=>[row.bytes as string,BigInt(row.multiplicity as string)]));
}
// This proves observable named-column facts and multiplicities, not physical identity
// among identical duplicates. An indistinguishable replacement cannot be detected.
function factDifferences(before: Facts, current: Facts, exact=false): string[] {
 const differences:string[]=[];
 for(const [bytes,count] of before) {
  const now=current.get(bytes)??0n;
  if(exact ? now!==count : now<count) differences.push(`${bytes}: ${count} -> ${now}`);
 }
 if(exact) for(const [bytes,count] of current) if(!before.has(bytes)) differences.push(`${bytes}: 0 -> ${count}`);
 return differences;
}
async function primaryKey(db: PoolClient, table: string): Promise<string[]> {
 return (await db.query(`SELECT a.attname::text AS name FROM pg_index i
  JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey)
  WHERE i.indrelid=$1::regclass AND i.indisprimary ORDER BY array_position(i.indkey::int2[],a.attnum)`,[tableIdent(table)])).rows.map(row=>row.name as string);
}
// Complete, disjoint partition; row preservation is claimed only for nonempty data proofs.
// Empty keyed predecessors have structural evidence, never vacuous populated-row evidence.
function assertPartition(proof: Proof) {
 const represented=[...Object.keys(proof.keyed),...Object.keys(proof.emptyKeyed),...Object.keys(proof.unkeyed)];
 expect(represented.sort(),"complete pairwise-disjoint predecessor partition").toEqual([...proof.tables].sort());
 expect(Object.keys(proof.counts).sort(),"count for every discovered predecessor").toEqual([...proof.tables].sort());
 expect(Object.keys(proof.unkeyed),"STOP: unexpected unkeyed predecessor").toEqual([requestTable]);
 for(const [table,was] of Object.entries(proof.keyed)) {
  expect(proof.counts[table],`${table}: populated data proof`).toBeGreaterThan(0n);
  expect(BigInt(Object.keys(was.rows).length),`${table}: every original row`).toBe(proof.counts[table]);
 }
 for(const [table,was] of Object.entries(proof.emptyKeyed)) {
  expect(proof.counts[table],`${table}: genuinely empty structural baseline`).toBe(0n);
  expect(was.key.length,`${table}: actual primary-key shape`).toBeGreaterThan(0);
 }
 for(const [table,was] of Object.entries(proof.unkeyed))
  expect([...was.facts.values()].reduce((sum,n)=>sum+n,0n),`${table}: every observable fact`).toBe(proof.counts[table]);
 for(const table of authoritySpine) {
  expect(proof.keyed[table],`${table}: seeded authority spine must remain a data proof`).toBeDefined();
  expect(proof.counts[table],`${table}: seeded authority spine`).toBeGreaterThan(0n);
 }
}
async function capture(db: Pool | PoolClient): Promise<Proof> {
 return rendered(db,async client=>{
  const discovered=(await client.query(`SELECT schemaname,tablename,EXISTS(
   SELECT 1 FROM pg_index i WHERE i.indrelid=format('%I.%I',schemaname,tablename)::regclass AND i.indisprimary) AS keyed
   FROM pg_tables WHERE schemaname IN ('app','identity','control_plane','audit_control') ORDER BY 1,2`)).rows;
  const tables=discovered.map(t=>`${t.schemaname}.${t.tablename}`);
  const unkeyedTables=discovered.filter(t=>!t.keyed).map(t=>`${t.schemaname}.${t.tablename}`);
  // Explicit inspected exception only; every unexpected unkeyed table remains a STOP.
  expect(unkeyedTables,"STOP: unexpected unkeyed predecessor").toEqual([requestTable]);
  const counts: Record<string,bigint>={};
  for(const table of tables) counts[table]=BigInt((await client.query(`SELECT count(*)::text n FROM ${tableIdent(table)}`)).rows[0]!.n as string);
  const keyedTables=discovered.filter(t=>t.keyed).map(t=>`${t.schemaname}.${t.tablename}`);
  const keyed=await proofBefore(client,keyedTables.filter(table=>counts[table]!>0n));
  const emptyKeyed: Record<string,Structure>={};
  for(const table of keyedTables.filter(table=>counts[table]===0n)) {
   const columns=await proofColumns(client,table);
   emptyKeyed[table]={names:columns.map(column=>column.name),typed:Object.fromEntries(columns.map(column=>[column.name,column.type])),key:await primaryKey(client,table)};
  }
  const columns=await proofColumns(client,requestTable);
  const names=columns.map(column=>column.name);
  const facts=await factRows(client,requestTable,names);
  const unkeyed: Record<string,UnkeyedProof>={ [requestTable]: {names,typed:Object.fromEntries(columns.map(column=>[column.name,column.type])),facts} };
  const proof: Proof={keyed,emptyKeyed,unkeyed,tables,counts};
  assertPartition(proof);
  const seeded=[...facts].filter(([bytes])=>requestSeeds.some(digest=>bytes.includes(digest)));
  expect(seeded).toHaveLength(2);
  expect(seeded.map(([,count])=>count).sort()).toEqual([1n,2n]);
  expect(seeded.find(([bytes])=>bytes.includes(requestSeeds[0]!))?.[1]).toBe(2n);
  expect(seeded.find(([bytes])=>bytes.includes(requestSeeds[1]!))?.[1]).toBe(1n);
  expect(seeded.reduce((sum,[,count])=>sum+count,0n)).toBe(3n);
  for(const [bytes] of seeded) expect(bytes).toContain("2001-02-03T04:05:06.123456+00:00");
  return proof;
 });
}
async function proofDifferences(db: Pool | PoolClient, proof: Proof, exact=false) {
 return rendered(db,async client=>{
  const result=await keyedDifferences(client,proof.keyed);
  assertPartition(proof);
  for(const [table,was] of Object.entries(proof.emptyKeyed)) {
   const now=new Map((await proofColumns(client,table)).map(column=>[column.name,column.type]));
   for(const name of was.names) if(now.get(name)!==was.typed[name]) result.types.push(`${table}: ${name} ${was.typed[name]} -> ${now.get(name)??"(gone)"}`);
   const key=await primaryKey(client,table);
   if(JSON.stringify(key)!==JSON.stringify(was.key)) result.types.push(`${table}: primary key ${JSON.stringify(was.key)} -> ${JSON.stringify(key)}`);
  }
  for(const [table,was] of Object.entries(proof.unkeyed)) {
   const now=new Map((await proofColumns(client,table)).map(column=>[column.name,column.type]));
   for(const name of was.names) if(now.get(name)!==was.typed[name]) result.types.push(`${table}: ${name} ${was.typed[name]} -> ${now.get(name)??"(gone)"}`);
   if(was.names.some(name=>!now.has(name))) continue;
   result.rows.push(...factDifferences(was.facts,await factRows(client,table,was.names),exact).map(diff=>`${table} ${diff}`));
  }
  return result;
 });
}
let original: Proof;
let catalogue:Awaited<ReturnType<typeof predecessorCatalogue>>;
let c:Cluster;let previous:Awaited<ReturnType<typeof snapshot>>;
beforeAll(async()=>{process.env.JOBGUARD_ENV="synthetic_demo";c=await startBeforeMigration(own);await startSession(c);
 for(const digest of requestSeeds) expect(digest).toMatch(/^[0-9a-f]{64}$/);
 await c.admin.query("INSERT INTO identity.request_window(ip_digest,requested_at) VALUES($1,$3::timestamptz),($1,$3::timestamptz),($2,$3::timestamptz)",[...requestSeeds,seedTime]);
 previous=await snapshot(c.admin);original=await capture(c.admin);expect(original.tables).toEqual(Object.keys(previous));catalogue=await predecessorCatalogue(c.admin);await applyMigration(c,own);},120000);
afterAll(async()=>{await c?.close();});
it("own migration preserves populated predecessors",async()=>{expect(await snapshot(c.admin)).toEqual({...previous,"app.contractor_agreement_status_revision":[]});expect(await predecessorCatalogue(c.admin)).toEqual(catalogue);expect(await proofDifferences(c.admin,original,true)).toEqual(preserved);});
it("legacy origin fixtures acquire no agreement status",async()=>{expect((await c.admin.query("SELECT count(*)::int n FROM app.extra_origin")).rows[0].n).toBeGreaterThan(0);expect((await c.admin.query("SELECT * FROM app.contractor_agreement_status_revision")).rows).toEqual([]);});
it("runtime cannot manufacture or mutate status",async()=>{
 const f=await startSession(c);await status(c,f,"active");
 for(const sql of ["SELECT * FROM app.contractor_agreement_status_revision","INSERT INTO app.contractor_agreement_status_revision DEFAULT VALUES","UPDATE app.contractor_agreement_status_revision SET status='active'","DELETE FROM app.contractor_agreement_status_revision","TRUNCATE app.contractor_agreement_status_revision"])await unchanged(c,()=>expect(c.runtime.query(sql)).rejects.toMatchObject({code:"42501"}));
 for(const sql of ["UPDATE app.contractor_agreement_status_revision SET status='inactive'","DELETE FROM app.contractor_agreement_status_revision"])await unchanged(c,()=>expect(c.admin.query(sql)).rejects.toThrow("AGREEMENT_STATUS_IMMUTABLE"));
});
it("actual catalogs retain least privilege",async()=>{
 expect((await c.admin.query(`SELECT r.rolname owner,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE c.oid='app.contractor_agreement_status_revision'::regclass`)).rows).toEqual([{owner:"jobguard_migration",relrowsecurity:true,relforcerowsecurity:true}]);
 expect((await c.admin.query("SELECT polname FROM pg_policy WHERE polrelid='app.contractor_agreement_status_revision'::regclass")).rows).toEqual([{polname:"tenant_isolation"}]);
 expect((await c.admin.query("SELECT pg_get_constraintdef(oid) def FROM pg_constraint WHERE conrelid='app.contractor_agreement_status_revision'::regclass AND contype='f'")).rows.map(r=>r.def)).toContain("FOREIGN KEY (tenant_id, assignment_id) REFERENCES app.commercial_track_assignment(tenant_id, id)");
 for(const role of ["jobguard_runtime","jobguard_infrastructure"]){expect((await c.admin.query("SELECT has_table_privilege($1,'app.contractor_agreement_status_revision','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') allowed",[role])).rows[0].allowed).toBe(false);}
 const routines=(await c.admin.query(`SELECT p.proname,r.rolname owner,p.prosecdef,p.proconfig,has_function_privilege('jobguard_runtime',p.oid,'EXECUTE') runtime,has_function_privilege('jobguard_infrastructure',p.oid,'EXECUTE') infrastructure,EXISTS(SELECT 1 FROM aclexplode(p.proacl) WHERE grantee=0 AND privilege_type='EXECUTE') public FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname='app' AND p.proname IN('mon8_contractor_agreement_context','mon8_agreement_status_guard') ORDER BY p.proname`)).rows;
 expect(routines).toEqual([{proname:"mon8_agreement_status_guard",owner:"jobguard_migration",prosecdef:false,proconfig:["search_path=pg_catalog"],runtime:false,infrastructure:false,public:false},{proname:"mon8_contractor_agreement_context",owner:"jobguard_migration",prosecdef:true,proconfig:["search_path=pg_catalog"],runtime:true,infrastructure:false,public:false}]);
});
// Preserve the union of main's explicit empty successor expectations and the general proof.
const emptySuccessors=[
 "app.customer_portal_grant",
 "app.customer_portal_session",
 "app.meter_work_ledger",
 "app.trial_admission",
 "app.trial_business_verification",
 "app.trial_card_attempt",
 "app.trial_card_result",
 "app.trial_end_source",
 "app.trial_start",
 "app.trial_subscription_source",
 "app.job_import_v3",
 "app.payment_fee_command",
 "app.payment_fee_statement",
 "app.lp_job_insert_permit",
 "identity.oidc_assertion_use",
 "identity.oidc_request",
 ...[
 "evidence_pack_v3",
 "evidence_pack_v3_approval",
 "evidence_pack_v3_check",
 "evidence_pack_v3_request",
 "small_builder_demo_run",
 "small_builder_demo_receipt",
 "small_builder_demo_report",
 "stored_receipt_case_allocation",
 "stored_receipt_case_binding",
 "stored_receipt_case_command",
 "enterprise_duplicate_correction",
 "platform_enterprise_fee",
 "platform_enterprise_fee_line",

 "job_small_trip_event",
 "job_small_trip_observation",
 "meter_lifecycle_alert",
 "meter_lifecycle_computation",
 "meter_lifecycle_correction",
 "meter_lifecycle_day_ledger",
 "meter_lifecycle_place_binding",
 "meter_lifecycle_scope",
 "meter_lifecycle_source",
 "meter_lifecycle_source_ref",
 "enterprise_baseline_batch",
 "enterprise_baseline_team",
 "billing_allocation_run",
 "billing_application_event",
 "billing_export_batch",
 "billing_export_delivery",
 "billing_export_line",
 "billing_fact",
 "billing_line_match",
 "billing_quarantine",
 "billing_status_import",
 "contractor_receipt_line_allocation",
 "receipt_allocation_fact_command",
 "receipt_allocation_fact_line",
 "receipt_allocation_fact_review",
 "receipt_allocation_fact_revision",
 "receipt_allocation_fact_source",
 "enterprise_agreement_version",
 "enterprise_fee_contribution",
 "enterprise_fee_derivation",
 "enterprise_fee_statement",
 "enterprise_fee_statement_approval",
 "enterprise_fee_statement_dispute",
 "enterprise_fee_statement_section",
 "recovery_attribution_revision",
 "recovery_attribution_command",
 "recovery_attribution_reassessment",
 ...["final_check_manifest","final_check_manifest_source","shadow_final_check_completion","shadow_final_check_reveal_proof","shadow_final_check_run_binding","shadow_final_check_source_attempt","final_check_processing_source","final_check_disposition_binding","final_check_reveal_proof","final_check_run_binding","final_check_source_attempt"],
 ].map(table=>`app.${table}`),
];
it("repeat migration and later successors succeed",async()=>{
 // Include status rows produced by the authorization tests as well as every original predecessor.
 const before = await capture(c.admin);
 for (let pass=0;pass<2;pass++) {
  await migrate(c.admin);
  for(const table of emptySuccessors) expect((await c.admin.query(`SELECT * FROM ${tableIdent(table)}`)).rows,table).toEqual([]);
  expect(await proofDifferences(c.admin,original)).toEqual(preserved);
  expect(await proofDifferences(c.admin,before)).toEqual(preserved);
  expect((await c.admin.query("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows.map(r=>r.migration_name)).toEqual(MIGRATION_URLS.map(url=>url.pathname.split("/").at(-1)!));
 }
 // 0208/0209/0244 successor routines; catalogue order is schema, name, identity arguments.
 expect((await c.admin.query(`SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='app' AND p.proname IN ('mon1_admit_place','mon1_capture_small_trip','mon1_lifecycle_actor','mon1_lifecycle_capture','mon1_lifecycle_read','mon1_lifecycle_rebuild') ORDER BY 1,2,3`)).rows).toEqual([
 {nspname:"app",proname:"mon1_admit_place",args:"t uuid, j uuid, source_kind text, source_id uuid"},
 {nspname:"app",proname:"mon1_capture_small_trip",args:"t uuid, j uuid, source_kind text, source_id uuid"},
 {nspname:"app",proname:"mon1_lifecycle_actor",args:"t uuid, digest text, mutation boolean"},
 {nspname:"app",proname:"mon1_lifecycle_capture",args:"t uuid, digest text, command uuid, start_day date, expected integer"},
 {nspname:"app",proname:"mon1_lifecycle_read",args:"t uuid, digest text, computation uuid"},
 {nspname:"app",proname:"mon1_lifecycle_rebuild",args:"t uuid, digest text, p_source uuid"},
 ]);
 // 0236 successor routine follows 0208; preserve both additive catalogue expectations.
 expect((await c.admin.query("SELECT proname FROM pg_proc WHERE oid='app.mon3_read_eligibility(uuid,text,uuid)'::regprocedure")).rows).toEqual([{proname:"mon3_read_eligibility"}]);
});
it("negative controls detect changed prior rows grants and shapes",async()=>{
 const before=await snapshot(c.admin), prior=await predecessorCatalogue(c.admin), proof=await capture(c.admin);
 const db=await c.admin.connect();
 try {
  await db.query("BEGIN");await db.query("UPDATE app.account SET name='Negative control changed prior row'");
  expect(await snapshot(db)).not.toEqual(before);expect((await proofDifferences(db,proof)).rows).not.toEqual([]);await db.query("ROLLBACK");
  await db.query("BEGIN");await db.query("GRANT DELETE ON app.account TO jobguard_runtime");
  expect(await predecessorCatalogue(db)).not.toEqual(prior);await db.query("ROLLBACK");
  await db.query("BEGIN");await db.query("ALTER TABLE app.account ADD COLUMN mon8_negative_control text");
  expect(await predecessorCatalogue(db)).not.toEqual(prior);
  expect(await proofDifferences(db,proof)).toEqual(preserved);
 }finally{await db.query("ROLLBACK");db.release();}
 expect(await snapshot(c.admin)).toEqual(before);expect(await predecessorCatalogue(c.admin)).toEqual(prior);
});

it("same comparator detects original value, microsecond and full-type corruption",async()=>{
 const proof=await capture(c.admin);
 const identity=JSON.parse(Object.keys(proof.keyed["app.account"]!.rows)[0]!) as {id:string};
 for (const sql of [
  "UPDATE app.account SET name=name || ' damaged' WHERE id=$1",
  "UPDATE app.account SET updated_at=updated_at+interval '1 microsecond' WHERE id=$1",
 ]) await rolledBack(c.admin,async db=>{
  expect((await db.query(sql,[identity.id])).rowCount).toBe(1);
  const difference=await proofDifferences(db,proof);
  expect(difference.rows).toHaveLength(1);expect(difference.types).toEqual([]);
 });
 await rolledBack(c.admin,async db=>{
  await db.query("ALTER TABLE app.account ALTER COLUMN name TYPE varchar(201)");
  expect((await proofDifferences(db,proof)).types).toContain("app.account: name character varying(200) -> character varying(201)");
 });
 expect(await proofDifferences(c.admin,proof)).toEqual(preserved);
});
it("same comparator permits successor columns, rows, tables and routine replacement",async()=>{
 const proof=await capture(c.admin), prior=await predecessorCatalogue(c.admin);
 await rolledBack(c.admin,async db=>{
  await db.query("ALTER TABLE app.account ADD COLUMN mon8_successor_note text");
  expect(await proofDifferences(db,proof)).toEqual(preserved);
  expect(await predecessorCatalogue(db)).not.toEqual(prior);
 });
 await rolledBack(c.admin,async db=>{
  // Replace only the body comment of an existing harmless mutation-rejection function.
  expect(await scratchReplaceFunction(db,"app.reject_audit_mutation()")).toBe(true);
  expect(await proofDifferences(db,proof)).toEqual(preserved);
  expect(await predecessorCatalogue(db)).not.toEqual(prior);
 });
 await rolledBack(c.admin,async db=>{
  const tenant=(await db.query("SELECT tenant_id FROM app.account ORDER BY id LIMIT 1")).rows[0]!.tenant_id;
  expect((await db.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional successor builder')",[randomUUID(),tenant])).rowCount).toBe(1);
  expect(await proofDifferences(db,proof)).toEqual(preserved);
 });
 await rolledBack(c.admin,async db=>{
  await db.query("CREATE TABLE app.mon8_successor_scratch(id integer PRIMARY KEY, note text)");
  expect(await proofDifferences(db,proof)).toEqual(preserved);
  expect(await predecessorCatalogue(db)).not.toEqual(prior);
 });
 expect(await proofDifferences(c.admin,proof)).toEqual(preserved);
 expect(await predecessorCatalogue(c.admin)).toEqual(prior);
});
it("same comparator detects a missing original identity without deleting a row",async()=>{
 await rolledBack(c.admin,async db=>{
  await db.query("CREATE TABLE app.mon8_identity_scratch(id integer PRIMARY KEY, note text)");
  await db.query("INSERT INTO app.mon8_identity_scratch VALUES(1,'Fictional original')");
  const proof=await proofBefore(db,["app.mon8_identity_scratch"]);
  // Move the scratch PK: the original identity is absent, with no DELETE or production-row mutation.
  await db.query("UPDATE app.mon8_identity_scratch SET id=2 WHERE id=1");
  expect(await keyedDifferences(db,proof)).toEqual({rows:['app.mon8_identity_scratch {"id":1}: missing'],types:[]});
 });
});

it("fact multiset comparator detects duplicate loss and permits only successor additions",()=>{
 const facts=(...values:string[]):Facts=>{
  const counts:Facts=new Map();
  for(const value of values) counts.set(value,(counts.get(value)??0n)+1n);
  return counts;
 };
 const baseline=facts("A","A","B");
 for(const current of [facts("A","B"),facts(),facts("A","B","B")]) {
  expect(factDifferences(baseline,current)).not.toEqual([]);
  expect(factDifferences(baseline,current,true)).not.toEqual([]);
 }
 for(const current of [facts("A","A","B","C"),facts("A","A","A","B")]) {
  expect(factDifferences(baseline,current)).toEqual([]);
  expect(factDifferences(baseline,current,true)).not.toEqual([]);
 }
 expect(factDifferences(baseline,baseline,true)).toEqual([]);
 const huge=BigInt(Number.MAX_SAFE_INTEGER)+2n;
 expect(factDifferences(new Map([["A",huge]]),new Map([["A",huge-1n]]))).not.toEqual([]);
});
it("request-window same comparator detects changed observable facts and full timestamp type",async()=>{
 const proof=await capture(c.admin), before=await snapshot(c.admin), prior=await predecessorCatalogue(c.admin);
 for(const sql of [
  "UPDATE identity.request_window SET requested_at=requested_at+interval '1 microsecond' WHERE ip_digest=$1",
  "UPDATE identity.request_window SET ip_digest=$2 WHERE ip_digest=$1",
 ]) await rolledBack(c.admin,async db=>{
  expect((await db.query(sql,sql.includes("$2")?[requestSeeds[1],syntheticDigest()]:[requestSeeds[1]])).rowCount).toBe(1);
  const difference=await proofDifferences(db,proof);
  expect(difference.rows).toHaveLength(1);expect(difference.types).toEqual([]);
  expect((await proofDifferences(db,proof,true)).rows).not.toEqual([]);
 });
 await rolledBack(c.admin,async db=>{
  await db.query("ALTER TABLE identity.request_window ALTER COLUMN requested_at TYPE timestamptz(3)");
  expect((await proofDifferences(db,proof)).types).toContain("identity.request_window: requested_at timestamp with time zone -> timestamp(3) with time zone");
 });
 expect(await proofDifferences(c.admin,proof,true)).toEqual(preserved);
 expect(await snapshot(c.admin)).toEqual(before);expect(await predecessorCatalogue(c.admin)).toEqual(prior);
});
it("request-window successor additions pass while own-step facts and catalogue stay exact",async()=>{
 const proof=await capture(c.admin), before=await snapshot(c.admin), prior=await predecessorCatalogue(c.admin);
 for(const digest of [syntheticDigest(),requestSeeds[0]!]) await rolledBack(c.admin,async db=>{
  expect((await db.query("INSERT INTO identity.request_window(ip_digest,requested_at) VALUES($1,$2::timestamptz)",[digest,seedTime])).rowCount).toBe(1);
  expect(await proofDifferences(db,proof)).toEqual(preserved);
  expect((await proofDifferences(db,proof,true)).rows).toHaveLength(1);
  expect(await snapshot(db)).not.toEqual(before);
 });
 await rolledBack(c.admin,async db=>{
  await db.query("ALTER TABLE identity.request_window ADD COLUMN mon8_successor_note text");
  expect(await proofDifferences(db,proof)).toEqual(preserved);
  // Even exact observable facts ignore later columns; own-step catalogue may not.
  expect(await proofDifferences(db,proof,true)).toEqual(preserved);
  expect(await predecessorCatalogue(db)).not.toEqual(prior);
 });
 expect(await proofDifferences(c.admin,proof,true)).toEqual(preserved);
 expect(await snapshot(c.admin)).toEqual(before);expect(await predecessorCatalogue(c.admin)).toEqual(prior);
});

it("empty keyed predecessors have structural evidence while partition and spine guards fail closed",async()=>{
 await rolledBack(c.admin,async db=>{
  const table="app.mon8_empty_scratch";
  await db.query("CREATE TABLE app.mon8_empty_scratch(id integer PRIMARY KEY, note varchar(200))");
  const proof=await capture(db);
  expect(proof.counts[table]).toBe(0n);
  expect(proof.keyed[table]).toBeUndefined();
  expect(proof.emptyKeyed[table]).toEqual({names:["id","note"],typed:{id:"integer",note:"character varying(200)"},key:["id"]});
  // Removing an empty predecessor is still an incomplete proof, not an exclusion rule.
  const omitted={...proof,emptyKeyed:{...proof.emptyKeyed}};
  Reflect.deleteProperty(omitted.emptyKeyed,table);
  expect(()=>assertPartition(omitted)).toThrow("complete pairwise-disjoint predecessor partition");
  const overlapping={...proof,emptyKeyed:{...proof.emptyKeyed,"app.account":proof.keyed["app.account"]!}};
  expect(()=>assertPartition(overlapping)).toThrow("complete pairwise-disjoint predecessor partition");
  // Model a broken fixture with zero account rows: otherwise internally complete classification
  // must still fail the fixed populated-spine guard. No actual fixture rows are deleted.
  const account=proof.keyed["app.account"]!;
  const lost={...proof,keyed:{...proof.keyed},counts:{...proof.counts,"app.account":0n},emptyKeyed:{...proof.emptyKeyed,"app.account":{names:account.names,typed:account.typed,key:account.key}}};
  Reflect.deleteProperty(lost.keyed,"app.account");
  expect(()=>assertPartition(lost)).toThrow("seeded authority spine must remain a data proof");
  const incompleteRows={...proof,keyed:{...proof.keyed,"app.account":{...account,rows:{}}}};
  expect(()=>assertPartition(incompleteRows)).toThrow("every original row");
  await db.query("SAVEPOINT empty_type_control");
  await db.query("ALTER TABLE app.mon8_empty_scratch ALTER COLUMN note TYPE varchar(201)");
  expect((await proofDifferences(db,proof)).types).toEqual([`${table}: note character varying(200) -> character varying(201)`]);
  await db.query("ROLLBACK TO SAVEPOINT empty_type_control");
  await db.query("SAVEPOINT empty_key_control");
  await db.query("ALTER TABLE app.mon8_empty_scratch DROP CONSTRAINT mon8_empty_scratch_pkey");
  expect((await proofDifferences(db,proof)).types).toEqual([`${table}: primary key ["id"] -> []`]);
  await db.query("ROLLBACK TO SAVEPOINT empty_key_control");
  await db.query("INSERT INTO app.mon8_empty_scratch VALUES(1,'Fictional later row')");
  await db.query("ALTER TABLE app.mon8_empty_scratch ADD COLUMN later_note text");
  expect(await proofDifferences(db,proof)).toEqual(preserved);
 });
});
