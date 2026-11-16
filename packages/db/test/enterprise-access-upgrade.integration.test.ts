/** Exact upgrade/catalogue proof; later routine, policy and table ACL changes are scoped below. */
import { readFile } from 'node:fs/promises';
import { afterAll, expect, it } from 'vitest';
import { createScimHarness, fixture, person, canonicalRows, type ScimHarness } from './scim-fixtures.js';
import { migrate, MIGRATION_URLS } from '../src/migrate.js';
import { predecessorCatalogue } from './contractor-entitlement-fixtures.js';
type Relation = { nspname:string; relname:string; relacl:unknown; [key:string]:unknown };
function expectRelationsUnchanged(before:Relation[],after:Relation[],laterAcl:Set<string>) {
 // 0733 adds only these quote bindings; retain every other predecessor attribute.
 after=after.map(row=>row.nspname==='app'&&row.relname==='customer_portal_grant'?{...row,
  columns:(row.columns as {attname:string}[]).filter(c=>!['quote_document_id','quote_document_version','quote_document_hash'].includes(c.attname)),
  constraints:(row.constraints as {name:string}[]).filter(c=>!['customer_portal_grant_quote_complete','customer_portal_grant_quote_document_fk'].includes(c.name)),
 }:row);
 for(const row of before){
  if(!laterAcl.has(`${row.nspname}.${row.relname}`)){expect(after).toContainEqual(row);continue;}
  // A later GRANT/REVOKE may also be column-level (0740 REVOKE UPDATE(revoked_at) ON app.action_authorization),
  // which moves that column's attacl only; every other column field stays exact.
  const aclFree=({relacl:_x,...r}:Relation)=>({...r,...(Array.isArray(r.columns)?{columns:(r.columns as Record<string,unknown>[]).map(({attacl:_c,...col})=>col)}:{})});
  expect(after.map(aclFree)).toContainEqual(aclFree(row));
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
 // Column-level ACL: allowed only on a named table, and only the attacl field.
 expectRelationsUnchanged(before,[{...tightened,columns:[{attname:'id',attacl:['runtime=w']}]},unnamed],laterAcl);
 expect(()=>expectRelationsUnchanged(before,[tightened,{...unnamed,columns:[{attname:'id',attacl:['runtime=w']}]}],laterAcl)).toThrow();
 expect(()=>expectRelationsUnchanged(before,[{...tightened,columns:[{attname:'renamed',attacl:['runtime=w']}]},unnamed],laterAcl)).toThrow();
});
type RoutineAcl = { nspname: string; proname: string; args: string; proacl: string | null };
function lp6cRoutineAcl(row: RoutineAcl) {
 const identity=`${row.nspname}.${row.proname}(${row.args})`;
 const grants = identity==='app.bind_request(p_kind text, p_credential text, p_tenant uuid)'
   ? ['jobguard_migration']
   : ['app.current_actor()', 'app.current_tenant()'].includes(identity)
     ? ['jobguard_migration', 'jobguard_command_writer'] : [];
 if (!grants.length) return row.proacl;
 if (row.proacl===null) throw new Error('LP-6c predecessor must have an explicit ACL');
 const entries = row.proacl.slice(1,-1).split(',');
 for(const role of grants) {
  const entry=`${role}=X/jobguard_binding_owner`;
  if(!entries.includes(entry)) entries.push(entry);
 }
 return `{${entries.join(',')}}`;
}
it('1217 LP-6c permits only its exact three named function grants',()=>{
 const base={nspname:'app',proname:'current_actor',args:'',proacl:'{jobguard_binding_owner=X/jobguard_binding_owner,jobguard_runtime=X/jobguard_binding_owner}'};
 expect(lp6cRoutineAcl(base)).toBe('{jobguard_binding_owner=X/jobguard_binding_owner,jobguard_runtime=X/jobguard_binding_owner,jobguard_migration=X/jobguard_binding_owner,jobguard_command_writer=X/jobguard_binding_owner}');
 expect(lp6cRoutineAcl({...base,proname:'current_tenant'})).toBe(lp6cRoutineAcl(base));
 expect(lp6cRoutineAcl({...base,proname:'bind_request',args:'p_kind text, p_credential text, p_tenant uuid'})).toBe('{jobguard_binding_owner=X/jobguard_binding_owner,jobguard_runtime=X/jobguard_binding_owner,jobguard_migration=X/jobguard_binding_owner}');
 for(const other of [{proname:'other'}, {nspname:'identity'}, {args:'unexpected uuid'}])
  expect(lp6cRoutineAcl({...base,...other})).toBe(base.proacl);
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
 const delegationSql=await readFile(new URL('../migrations/0724_lp6c_customer_portal_delegation.sql',import.meta.url),'utf8');
 const delegationProof=JSON.parse(await readFile(new URL('./migration-proofs/0724_lp6c_customer_portal_delegation.proof.json',import.meta.url),'utf8'));
 // Pin the exact new scope shape while retaining every raw predecessor attribute.
 const isBinding=(r:Relation)=>r.nspname==='control_plane'&&r.relname==='request_binding';
 type Column={attname:string;attnum:number;attnotnull:boolean;[key:string]:unknown};
 const bindingBefore=catalogue.relations.find(isBinding)!;
 const bindingAfter=after.relations.find(isBinding)!;
 const bindingColumns=bindingBefore.columns as Column[];
 const uuidColumn=bindingColumns.find(c=>c.attname==='tenant_id')!;
 const textColumn=bindingColumns.find(c=>c.attname==='credential_kind')!;
 expect(bindingAfter.columns).toEqual([...bindingColumns,
  {...uuidColumn,attname:'scope_job_id',attnum:8,attnotnull:false},
  {...textColumn,attname:'scope_command_type',attnum:9,attnotnull:false}]);
 const bindingChecks=bindingBefore.constraints as {name:string;definition:string}[];
 expect(bindingAfter.constraints).toEqual([
  {name:'request_binding_credential_kind_check',definition:"CHECK ((credential_kind = ANY (ARRAY['real'::text, 'practice'::text, 'contractor_practice'::text, 'customer_portal_delegated'::text])))"},
  {name:'request_binding_delegated_scope_check',definition:"CHECK (((NOT ((scope_job_id IS NOT NULL) IS DISTINCT FROM (NOT (credential_kind IS DISTINCT FROM 'customer_portal_delegated'::text)))) AND (NOT ((scope_command_type IS NOT NULL) IS DISTINCT FROM (NOT (credential_kind IS DISTINCT FROM 'customer_portal_delegated'::text))))))"},
  bindingChecks.find(c=>c.name==='request_binding_pkey')!]);
 // Later migrations pin their own replacement bodies; owner, ACL, security and settings must still match.
 const boundary=MIGRATION_URLS.findIndex(u=>u.pathname.endsWith('/0613_scim2_machine.sql'));
 expect(boundary).toBeGreaterThanOrEqual(0);
 const later=new Set<string>();
 for(const url of MIGRATION_URLS.slice(boundary+1))
  for(const m of (await readFile(url,'utf8')).matchAll(/CREATE OR REPLACE FUNCTION ([a-z_]+)\.([a-z0-9_]+)\(/gu))later.add(`${m[1]}.${m[2]}`);
 // 0642 and 0644 re-create these exact bodies by text replacement; plan-entitlement-lifecycle-upgrade pins each body.
 for(const name of ['app.xa_issue_link','app.lp5b_contractor_permission','app.northside_capture_action'])later.add(name);
 // 0667 inserts the practice-owner guard into lock_final_account by text replacement; migfix-7 and plan-entitlement pin the body.
 later.add('app.lock_final_account');
 // 0736 patches only the practice-proof cancellation body; migfix-7 and plan-entitlement pin both exact replacements.
 later.add('app.ch4_capture_site_source');
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
 // LATER-SAFETY-66 replaces exactly one identity.security_event CHECK to add 'session.revoked'; nothing else on that table may change.
 const kinds='security_event_event_type_check';
 const isSecurityEvent=(r:Relation)=>r.nspname==='identity'&&r.relname==='security_event';
 const kindsCheck=(list:string[])=>`CHECK (((event_type)::text = ANY ((ARRAY[${list.map(k=>`'${k}'::character varying`).join(', ')}])::text[])))`;
 const oldKinds=['challenge.requested','session.issued','identity.verified','invitation.created'];
 expect((catalogue.relations.find(isSecurityEvent)!.constraints as Con[]).filter(c=>c.name===kinds)).toEqual([{name:kinds,definition:kindsCheck(oldKinds)}]);
 expect((after.relations.find(isSecurityEvent)!.constraints as Con[]).filter(c=>c.name===kinds)).toEqual([{name:kinds,definition:kindsCheck([...oldKinds,'session.revoked'])}]);
 const withoutKinds=(r:Relation)=>isSecurityEvent(r)?{...r,constraints:(r.constraints as Con[]).filter(c=>c.name!==kinds)}:r;
 // 0669 (LATER-SAFETY-119) only adds 'paid' to job_baseline_shape's imported v3 status list; nothing else on app.job may change.
 const isJob=(r:Relation)=>r.nspname==='app'&&r.relname==='job',shape='job_baseline_shape';
 const priorShape=(catalogue.relations.find(isJob)!.constraints as Con[]).find(c=>c.name===shape)!;
 const nextShape=(after.relations.find(isJob)!.constraints as Con[]).find(c=>c.name===shape)!;
 expect(nextShape.definition).not.toBe(priorShape.definition);
 expect(nextShape.definition.replace(/, 'paid'::[a-z ]+(?=\])/,'')).toBe(priorShape.definition);
 // 0702 (LATER-SAFETY-139) only drops NOT NULL from app.synthetic_evidence_original.scope_item_id; nothing else on that table may change.
 const isOriginal=(r:Relation)=>r.nspname==='app'&&r.relname==='synthetic_evidence_original';
 type Col={attname:string;attnotnull:boolean};
 const originalScope=(rs:Relation[])=>(rs.find(isOriginal)!.columns as Col[]).find(c=>c.attname==='scope_item_id')!;
 expect(originalScope(catalogue.relations).attnotnull).toBe(true);
 expect(originalScope(after.relations).attnotnull).toBe(false);
 // 0698 adds only the append-only attempt identity, its predecessor snapshot and the replacement unique key.
 const isManifest=(r:Relation)=>r.nspname==='app'&&r.relname==='final_check_manifest';
 const oldManifest=catalogue.relations.find(isManifest)!,newManifest=after.relations.find(isManifest)!;
 const attemptColumns=['attempt','predecessor_manifest_id','withdrawn_predecessor_source_ids'];
 expect((await h.admin.query(`SELECT a.attname name,format_type(a.atttypid,a.atttypmod) type,a.attnotnull not_null,
  pg_get_expr(d.adbin,d.adrelid) default_expr FROM pg_attribute a LEFT JOIN pg_attrdef d ON(d.adrelid,d.adnum)=(a.attrelid,a.attnum)
  WHERE a.attrelid='app.final_check_manifest'::regclass AND a.attname=ANY($1) ORDER BY a.attnum`,[attemptColumns])).rows).toEqual([
  {name:'attempt',type:'integer',not_null:true,default_expr:'1'},
  {name:'predecessor_manifest_id',type:'uuid',not_null:false,default_expr:null},
  {name:'withdrawn_predecessor_source_ids',type:'uuid[]',not_null:true,default_expr:"'{}'::uuid[]"},
 ]);
 const attemptConstraints=[
  {name:'final_check_attempt_chain',definition:'CHECK ((((attempt = 1) AND (predecessor_manifest_id IS NULL) AND (cardinality(withdrawn_predecessor_source_ids) = 0)) OR ((attempt > 1) AND (predecessor_manifest_id IS NOT NULL) AND (cardinality(withdrawn_predecessor_source_ids) > 0))))'},
  {name:'final_check_attempt_predecessor',definition:'FOREIGN KEY (tenant_id, job_id, predecessor_manifest_id) REFERENCES app.final_check_manifest(tenant_id, job_id, id)'},
  {name:'final_check_manifest_attempt_check',definition:'CHECK ((attempt > 0))'},
  {name:'final_check_manifest_lock_attempt',definition:'UNIQUE (tenant_id, job_id, lock_id, attempt)'},
 ];
 const attemptNames=new Set(attemptConstraints.map(c=>c.name));
 expect((newManifest.constraints as Con[]).filter(c=>attemptNames.has(c.name))).toEqual(attemptConstraints);
 const oldLockKey=(oldManifest.constraints as Con[]).find(c=>c.name==='final_check_manifest_tenant_id_job_id_lock_id_key')!;
 expect(oldLockKey).toBeDefined();
 expect((newManifest.constraints as Con[]).some(c=>c.name===oldLockKey.name)).toBe(false);
 const normalizedManifest={...newManifest,
  columns:(newManifest.columns as {attname:string}[]).filter(c=>!attemptColumns.includes(c.attname)),
  constraints:[...(newManifest.constraints as Con[]).filter(c=>!attemptNames.has(c.name)),oldLockKey].sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0),
 };
 // 0734 adds only its named receipt guards; pin both triggers to its proof and
 // remove only the deferred trigger's exact constraint from the predecessor comparison.
 const proofStatement=JSON.parse(await readFile(new URL('./migration-proofs/0734_job_proof_statement.proof.json',import.meta.url),'utf8'));
 expect(proofStatement.lp0.filter((entry:{section:string;after:unknown})=>entry.section==='triggers'&&typeof entry.after==='string'&&entry.after.startsWith('app.command_receipt|')).map((entry:{after:string})=>entry.after)).toEqual([
  'app.command_receipt|proof_statement_receipt_guard|app.guard_job_proof_receipt|BEFORE INSERT/DELETE/UPDATE|O',
  'app.command_receipt|proof_statement_receipt_complete|app.require_completed_job_proof_statement|AFTER INSERT/UPDATE|O',
 ]);
 expect((await h.admin.query(`SELECT t.tgname name,n.nspname||'.'||p.proname routine,t.tgtype type,
  t.tgenabled enabled,t.tgdeferrable deferrable,t.tginitdeferred deferred
  FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE t.tgrelid='app.command_receipt'::regclass AND t.tgname=ANY($1) ORDER BY t.tgname`,
  [['proof_statement_receipt_guard','proof_statement_receipt_complete']])).rows).toEqual([
  {name:'proof_statement_receipt_complete',routine:'app.require_completed_job_proof_statement',type:21,enabled:'O',deferrable:true,deferred:true},
  {name:'proof_statement_receipt_guard',routine:'app.guard_job_proof_receipt',type:31,enabled:'O',deferrable:false,deferred:false},
 ]);
 const isReceipt=(r:Relation)=>r.nspname==='app'&&r.relname==='command_receipt';
 const receiptConstraints=after.relations.find(isReceipt)!.constraints as Con[];
 expect(receiptConstraints.filter(c=>c.name==='proof_statement_receipt_complete')).toEqual([
  {name:'proof_statement_receipt_complete',definition:'TRIGGER DEFERRABLE INITIALLY DEFERRED'},
 ]);
 // 0734 also admits only 'proof.statement' to the watchdog identity namespace and adds
 // its deferred identity guard there; pin both, then compare everything else unchanged.
 const isIdentity=(r:Relation)=>r.nspname==='app'&&r.relname==='watchdog_command_identity',identityCheck='watchdog_command_identity_command_type_check';
 const priorIdentityCheck=(catalogue.relations.find(isIdentity)!.constraints as Con[]).find(c=>c.name===identityCheck)!;
 const identityConstraints=after.relations.find(isIdentity)!.constraints as Con[];
 expect(priorIdentityCheck.definition.startsWith('CHECK (')&&priorIdentityCheck.definition.endsWith(')')).toBe(true);
 expect(identityConstraints.find(c=>c.name===identityCheck)!.definition).toBe(`CHECK ((${priorIdentityCheck.definition.slice(7,-1)} OR (command_type = 'proof.statement'::text)))`);
 expect(identityConstraints.filter(c=>c.name==='proof_statement_identity_complete')).toEqual([
  {name:'proof_statement_identity_complete',definition:'TRIGGER DEFERRABLE INITIALLY DEFERRED'},
 ]);
 expect(proofStatement.lp0.filter((entry:{section:string;after:unknown})=>entry.section==='triggers'&&typeof entry.after==='string'&&entry.after.startsWith('app.watchdog_command_identity|')).map((entry:{after:string})=>entry.after)).toEqual([
  'app.watchdog_command_identity|proof_statement_identity_complete|app.require_completed_job_proof_statement|AFTER INSERT|O',
 ]);
 // 0735 adds only the nullable per-firm practice_session_digest column and its practice-session foreign key.
 const isTerms=(r:Relation)=>r.nspname==='app'&&r.relname==='final_check_terms_acceptance';
 const termsKey='final_check_terms_acceptance_practice_session_digest_fkey';
 expect((await h.admin.query(`SELECT a.attname name,format_type(a.atttypid,a.atttypmod) type,a.attnotnull not_null,a.atthasdef has_default
  FROM pg_attribute a WHERE a.attrelid='app.final_check_terms_acceptance'::regclass AND a.attname='practice_session_digest'`)).rows).toEqual([
  {name:'practice_session_digest',type:'character(64)',not_null:false,has_default:false},
 ]);
 expect((after.relations.find(isTerms)!.constraints as Con[]).filter(c=>c.name===termsKey)).toEqual([
  {name:termsKey,definition:'FOREIGN KEY (practice_session_digest) REFERENCES control_plane.practice_session(token_digest)'},
 ]);
 const normalizedTerms=(r:Relation)=>({...r,columns:(r.columns as {attname:string}[]).filter(c=>c.attname!=='practice_session_digest'),
  constraints:(r.constraints as Con[]).filter(c=>c.name!==termsKey)});
 const afterRelations=after.relations.map((r:Relation)=>isTerms(r)?normalizedTerms(r):isLanding(r)?{...r,constraints:(r.constraints as Con[]).filter(c=>c.name!==added)}
  :isJob(r)?{...r,constraints:(r.constraints as Con[]).map(c=>c.name===shape?priorShape:c)}:isBinding(r)?{...r,columns:bindingBefore.columns,constraints:bindingBefore.constraints}:isManifest(r)?normalizedManifest
  :isOriginal(r)?{...r,columns:(r.columns as Col[]).map(c=>c.attname==='scope_item_id'?{...c,attnotnull:true}:c)}
  :isReceipt(r)?{...r,constraints:receiptConstraints.filter(c=>c.name!=='proof_statement_receipt_complete')}
  :isIdentity(r)?{...r,constraints:identityConstraints.filter(c=>c.name!=='proof_statement_identity_complete').map(c=>c.name===identityCheck?priorIdentityCheck:c)}:r).map(withoutKinds);
 expectRelationsUnchanged(catalogue.relations.map(withoutKinds),afterRelations,laterAcl);
 // 0672 lets its migration-owned pack writer read the sealed request binding; only that ACL entry is added.
 const bindingReaders=new Set(['app.current_actor','app.current_tenant']);
 for(const row of catalogue.routines){
  const expected={...row,proacl:lp6cRoutineAcl(row)};
  if(row.nspname==='identity'&&row.proname==='customer_portal_use') {
   const change=delegationProof.upgrade.find((entry:{section:string;after?:{nspname:string;proname:string}})=>entry.section==='routines'&&entry.after?.nspname==='identity'&&entry.after.proname==='customer_portal_use');
   expect(row.proacl).toBe(change.before.proacl);
   expected.proacl=change.after.proacl;
  }
  if(bindingReaders.has(`${row.nspname}.${row.proname}`)){
   const added=after.routines.find((r:typeof row)=>r.nspname===row.nspname&&r.proname===row.proname&&r.args===row.args);
   const declaration=`CREATE OR REPLACE FUNCTION app.${row.proname}() RETURNS uuid`;
   const body=delegationSql.slice(delegationSql.indexOf(declaration)).match(/AS \$\$([\s\S]*?)\$\$;/u)?.[1];
   expect(body).toBeDefined();
   expect(added!.definition.match(/AS \$function\$([\s\S]*?)\$function\$/u)?.[1]?.trim()).toBe(body!.trim());
   // Only the reviewed latest body changes; all owner/ACL/security/settings stay exact.
   expect(added).toEqual({...expected,definition:added!.definition});
   continue;
  }
  if(!later.has(`${row.nspname}.${row.proname}`)){expect(after.routines).toContainEqual(expected);continue;}
  const {definition:_d,...kept}=expected;
  expect(after.routines.map(({definition:_x,...r}:typeof row)=>r)).toContainEqual(kept);
 }
 for(const table of ['emergency_request','emergency_approval','emergency_session','emergency_action','scim2_binding','scim2_resource','scim2_receipt']) {
  expect(await canonicalRows(h,'identity.'+table)).toEqual([]);
  expect((await h.admin.query("SELECT relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) owner FROM pg_class WHERE oid=$1::regclass",['identity.'+table])).rows[0]).toEqual({relrowsecurity:true,relforcerowsecurity:true,owner:'jobguard_migration'});
  expect((await h.admin.query("SELECT has_table_privilege('jobguard_runtime',$1,'SELECT,INSERT,UPDATE,DELETE') allowed",['identity.'+table])).rows[0].allowed).toBe(false);
 }
 expect((await h.admin.query("SELECT rolcanlogin,rolsuper,rolbypassrls FROM pg_roles WHERE rolname='jobguard_scim'")).rows[0]).toEqual({rolcanlogin:false,rolsuper:false,rolbypassrls:false});
},120000);
