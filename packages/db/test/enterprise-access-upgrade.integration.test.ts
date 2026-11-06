/** Exact upgrade/catalogue proof; later routine, policy and table ACL changes are scoped below. */
import { readFile } from 'node:fs/promises';
import { afterAll, expect, it } from 'vitest';
import { createScimHarness, fixture, person, canonicalRows, type ScimHarness } from './scim-fixtures.js';
import { migrate, MIGRATION_URLS } from '../src/migrate.js';
import { predecessorCatalogue } from './contractor-entitlement-fixtures.js';
type Relation = { nspname:string; relname:string; relacl:unknown; [key:string]:unknown };
function expectRelationsUnchanged(before:Relation[],after:Relation[],laterAcl:Set<string>) {
 for(const row of before){
  if(!laterAcl.has(`${row.nspname}.${row.relname}`)){expect(after).toContainEqual(row);continue;}
  const {relacl:_a,...kept}=row;
  expect(after.map(({relacl:_x,...r})=>r)).toContainEqual(kept);
 }
}
type Policy = { schemaname:string; tablename:string; policyname:string; qual:string|null; with_check:string|null; [key:string]:unknown };
// Exact replacement predicates pinned by 0629_scheduled_readiness_hardening.proof.json.
const readinessPredicate="(tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)";
function expectPoliciesUnchanged(before:Policy[],after:Policy[]) {
 for(const row of before){
  const name=`${row.schemaname}.${row.tablename}.${row.policyname}`;
  const expected=name==='app.scheduled_readiness_plan.tenant_isolation'
   || name==='app.scheduled_readiness_proposal.tenant_isolation'
   ? {...row,qual:readinessPredicate,with_check:readinessPredicate} : row;
  expect(after).toContainEqual(expected);
 }
}
it('policy comparison pins only the two 0629 replacements and rejects all other policy changes',async()=>{
 const proof=JSON.parse(await readFile(new URL('./migration-proofs/0629_scheduled_readiness_hardening.proof.json',import.meta.url),'utf8'));
 const replacements=proof.upgrade.filter((entry:{section:string})=>entry.section==='policies');
 expect(replacements.map((entry:{after:Policy})=>`${entry.after.schemaname}.${entry.after.tablename}.${entry.after.policyname}`)).toEqual([
  'app.scheduled_readiness_plan.tenant_isolation','app.scheduled_readiness_proposal.tenant_isolation',
 ]);
 for(const {before,after} of replacements as {before:Policy;after:Policy}[]){
  expectPoliciesUnchanged([before],[after]);
  expect(()=>expectPoliciesUnchanged([before],[before])).toThrow();
  for(const field of ['qual','with_check'])
   expect(()=>expectPoliciesUnchanged([before],[{...after,[field]:'true'}])).toThrow();
  for(const [field,value] of Object.entries({schemaname:'identity',tablename:'other_table',policyname:'other_policy',permissive:'RESTRICTIVE',roles:'{public}',cmd:'SELECT'}))
   expect(()=>expectPoliciesUnchanged([before],[{...after,[field]:value}])).toThrow();
  // Neither another table/schema nor another policy on a named table gets an exception.
  for(const identity of [{tablename:'other_table'},{schemaname:'identity'},{policyname:'other_policy'}]){
   const original={...before,...identity};
   expectPoliciesUnchanged([original],[original]);
   for(const field of ['qual','with_check'])
    expect(()=>expectPoliciesUnchanged([original],[{...original,[field]:readinessPredicate}])).toThrow();
  }
 }
});
it('ACL comparison permits only named-table permissions and rejects column changes or unnamed-table grants',()=>{
 const named={nspname:'app',relname:'fee_reservation_archive',relacl:['runtime=ar'],columns:[{attname:'id'}],constraints:[],relowner:1};
 const unnamed={...named,relname:'other_table'};
 const before=[named,unnamed],laterAcl=new Set(['app.fee_reservation_archive']);
 const tightened={...named,relacl:['runtime=r']};
 expectRelationsUnchanged(before,[tightened,unnamed],laterAcl);
 expect(()=>expectRelationsUnchanged(before,[{...tightened,columns:[...named.columns,{attname:'stray'}]},unnamed],laterAcl)).toThrow();
 expect(()=>expectRelationsUnchanged(before,[tightened,{...unnamed,relacl:['runtime=arw']}],laterAcl)).toThrow();
});
let h:ScimHarness|undefined;
afterAll(async()=>{await h?.close();});
it('emergency_dual_owner/scim2_machine preserve populated identity state, installed routines and old ACLs; new capabilities start empty and default OFF',async()=>{
 h=await createScimHarness('ent10-rest-upgrade-','0612_emergency_dual_owner.sql');
 const f=await fixture(h);await person(f,'finance');
 const tables=['identity.session','identity.sso_subject','identity.sso_emergency_window','identity.sso_required_event','app.membership','app.role_grant'];
 const before=await Promise.all(tables.map(t=>canonicalRows(h!,t))),catalogue=await predecessorCatalogue(h.admin);
 await migrate(h.admin);await migrate(h.admin);
 expect(await Promise.all(tables.map(t=>canonicalRows(h!,t)))).toEqual(before);
 const after=await predecessorCatalogue(h.admin);
 // Later migrations pin their own replacement bodies; owner, ACL, security and settings must still match.
 const boundary=MIGRATION_URLS.findIndex(u=>u.pathname.endsWith('/0613_scim2_machine.sql'));
 expect(boundary).toBeGreaterThanOrEqual(0);
 const later=new Set<string>();
 for(const url of MIGRATION_URLS.slice(boundary+1))
  for(const m of (await readFile(url,'utf8')).matchAll(/CREATE OR REPLACE FUNCTION ([a-z_]+)\.([a-z0-9_]+)\(/gu))later.add(`${m[1]}.${m[2]}`);
 // 0642 and 0644 re-create these exact bodies by text replacement; plan-entitlement-lifecycle-upgrade pins each body.
 for(const name of ['app.xa_issue_link','app.lp5b_contractor_permission','app.northside_capture_action'])later.add(name);
 // A later GRANT/REVOKE on a predecessor table may change its ACL only; that migration's proof and LP-0 pin it.
 const laterAcl=new Set<string>();
 for(const url of MIGRATION_URLS.slice(boundary+1))
  for(const m of (await readFile(url,'utf8')).matchAll(/\b(?:GRANT|REVOKE)\b[^;]*?\bON\s+(?:TABLE\s+)?((?:[a-z_]+\.[a-z0-9_]+)(?:\s*,\s*[a-z_]+\.[a-z0-9_]+)*)\s+(?:TO|FROM)\b/gu))
   for(const name of m[1]!.split(','))laterAcl.add(name.trim());
 expectPoliciesUnchanged(catalogue.policies,after.policies);
 // 0631 (MIGFIX-6) adds exactly one validated CHECK to app.landing_allocation; nothing else on that table may change.
 const added='landing_allocation_eligible_within_gross';
 const isLanding=(r:Relation)=>r.nspname==='app'&&r.relname==='landing_allocation';
 type Con={name:string;definition:string};
 expect((after.relations.find(isLanding)!.constraints as Con[]).filter(c=>c.name===added)).toEqual([{name:added,definition:'CHECK ((eligible_net_pence <= gross_pence))'}]);
 const afterRelations=after.relations.map((r:Relation)=>isLanding(r)?{...r,constraints:(r.constraints as Con[]).filter(c=>c.name!==added)}:r);
 expectRelationsUnchanged(catalogue.relations,afterRelations,laterAcl);
 for(const row of catalogue.routines){
  if(!later.has(`${row.nspname}.${row.proname}`)){expect(after.routines).toContainEqual(row);continue;}
  const {definition:_d,...kept}=row;
  expect(after.routines.map(({definition:_x,...r}:typeof row)=>r)).toContainEqual(kept);
 }
 for(const table of ['emergency_request','emergency_approval','emergency_session','emergency_action','scim2_binding','scim2_resource','scim2_receipt']) {
  expect(await canonicalRows(h,'identity.'+table)).toEqual([]);
  expect((await h.admin.query("SELECT relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) owner FROM pg_class WHERE oid=$1::regclass",['identity.'+table])).rows[0]).toEqual({relrowsecurity:true,relforcerowsecurity:true,owner:'jobguard_migration'});
  expect((await h.admin.query("SELECT has_table_privilege('jobguard_runtime',$1,'SELECT,INSERT,UPDATE,DELETE') allowed",['identity.'+table])).rows[0].allowed).toBe(false);
 }
 expect((await h.admin.query("SELECT rolcanlogin,rolsuper,rolbypassrls FROM pg_roles WHERE rolname='jobguard_scim'")).rows[0]).toEqual({rolcanlogin:false,rolsuper:false,rolbypassrls:false});
},120000);
