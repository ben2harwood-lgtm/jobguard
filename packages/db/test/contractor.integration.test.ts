import { randomUUID, createHash } from "node:crypto";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { contractorPermissions, contractorRoles, contractorPermissionMatrix, referenceApprovalRulesV1, type ContractorCommand } from "@jobguard/core";
import { ContractorRepository, MIGRATION_URLS, migrate, withTenant, appendAuditBatch, type AuthenticatedMembership, verifiedTenantContextFromMembership } from "../src/index.js";
import { closeTestPools } from "./pool-test-utils.js";
let postgres:EmbeddedPostgres, admin:Pool,runtime:Pool,dir:string,repo:ContractorRepository;
const tables=['commercial_track_assignment','org_unit','team','client_organisation','client_contract','approval_rule_version','client_contract_version','contractor_member','role_grant','role_grant_revocation','contractor_membership_revocation','team_membership'];
const document={version:'client-contract.v1',reference:'FICTIONAL',startsOn:'2026-10-01',endsOn:null,sorVersionIds:[],tenderedAdjustment:{numerator:'-35',denominator:'1000'},photoRule:'required',vatCode:'synthetic-unreviewed',exportedNotBilledAlertDays:30};
beforeAll(async()=>{
 dir=await mkdtemp(join(tmpdir(),'jg-ent1-'));const port=58000+Math.floor(Math.random()*500);
 postgres=new EmbeddedPostgres({databaseDir:dir,port,user:'postgres',password:'synthetic',persistent:false,createPostgresUser:process.getuid?.()===0,initdbFlags:['--lc-messages=C'],onLog:()=>undefined});await postgres.initialise();await postgres.start();
 const control=new Pool({host:'127.0.0.1',port,user:'postgres',password:'synthetic',database:'postgres'});await control.query('CREATE DATABASE jobguard_synthetic_demo');await control.end();
 admin=new Pool({host:'127.0.0.1',port,user:'postgres',password:'synthetic',database:'jobguard_synthetic_demo'});
 // Upgrade the preceding supported schema, then rerun the tracked migrator (idempotence).
 await admin.query('CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT clock_timestamp())');
 for(const url of MIGRATION_URLS.slice(0,-1)){await admin.query(await readFile(url,'utf8'));await admin.query('INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)',[url.pathname.split('/').at(-1)]);}
 await migrate(admin);await migrate(admin);
 expect((await admin.query('SELECT count(*)::int n FROM public.jobguard_schema_migration')).rows[0].n).toBe(MIGRATION_URLS.length);
 await admin.query("CREATE ROLE ent1_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT jobguard_runtime TO ent1_login");
 runtime=new Pool({host:'127.0.0.1',port,user:'ent1_login',password:'synthetic',database:'jobguard_synthetic_demo',max:6});repo=new ContractorRepository(runtime);
},120000);
afterAll(async()=>{await closeTestPools(runtime,admin);await postgres?.stop();if(dir)await rm(dir,{recursive:true,force:true});});
const query=(p:AuthenticatedMembership,resource:'organisation'|'contracts'='organisation',id?:string)=>repo.query(p,{version:'contractor-query.v1',tenantId:p.tenantId,resource,...(id?{id}:{})});
// Earlier roles in these loops legitimately append immutable revisions of the same contract, so a reader must see exactly the persisted versions (not a hard-coded one).
const persistedVersions=async(contractId:string)=>(await admin.query<{n:number}>('SELECT count(*)::int n FROM app.client_contract_version WHERE contract_id=$1',[contractId])).rows[0]!.n;
// Expected organisation revision = persisted count of contractor command receipts (the definition the view reports). Reading it directly
// keeps the two hot conformance loops from building a full projection before every command; the view itself is still asserted elsewhere.
const revisionOf=async(p:AuthenticatedMembership)=>(await admin.query<{n:number}>("SELECT count(*)::int n FROM app.command_receipt WHERE tenant_id=$1 AND command_type LIKE 'contractor.%'",[p.tenantId])).rows[0]!.n;
async function setup(){const session=randomUUID();const p=await repo.startPractice(session);const v=await query(p);return {session,p,v};}
async function command(p:AuthenticatedMembership,fields:Record<string,unknown>){const v=await query(p);return repo.command(p,{version:'contractor-command.v1',environment:'synthetic_demo',commandId:randomUUID(),id:randomUUID(),expectedRevision:v.revision,...fields});}
async function fixtureMember(p:AuthenticatedMembership,role:string,kind:string,scopeId:string,clientId:string|null=null,contractId:string|null=null){
 const id=randomUUID();await command(p,{kind:'member.invite',id,role,email:`${id}@fictional.invalid`,scope:{kind,id:scopeId},clientId,contractId});
 const row=(await admin.query<{identity_user_id:string}>('SELECT identity_user_id FROM app.membership WHERE tenant_id=$1 AND id=$2',[p.tenantId,id])).rows[0]!;
 return {...p,membershipId:id,identityUserId:row.identity_user_id} as AuthenticatedMembership;
}
describe('ENT-1 PostgreSQL guarantees',()=>{
 it('generates one audited organisation for racing practice creation',async()=>{
  const session=randomUUID();const [a,b]=await Promise.all([repo.startPractice(session),repo.startPractice(session)]);expect(a).toEqual(b);
  expect((await admin.query('SELECT count(*)::int n FROM app.commercial_track_assignment WHERE tenant_id=$1',[a.tenantId])).rows[0].n).toBe(1);
  expect((await admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND event_type='commercial_track.assigned'",[a.tenantId])).rows[0].n).toBe(1);
 });
 it('catalogs FORCE RLS, migration ownership, exact grants and denial of direct writes for every new table',async()=>{
  const {p}=await setup();const ctx=verifiedTenantContextFromMembership(p);
  const rows=(await admin.query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relname=ANY($1::text[])`,[tables])).rows;
  expect(rows).toHaveLength(tables.length);expect(rows.every(r=>r.relrowsecurity&&r.relforcerowsecurity&&r.owner==='jobguard_migration')).toBe(true);
  for(const table of tables){
   for(const sql of [`UPDATE app.${table} SET tenant_id=tenant_id`,`DELETE FROM app.${table}`,`TRUNCATE app.${table}`,`INSERT INTO app.${table} DEFAULT VALUES`])await expect(withTenant(runtime,ctx,db=>db.$client.query(sql))).rejects.toMatchObject({code:'42501'});
   expect((await runtime.query(`SELECT * FROM app.${table}`)).rows).toEqual([]);
  }
  await expect(runtime.query('SET ROLE jobguard_migration')).rejects.toMatchObject({code:'42501'});
  expect((await runtime.query("SELECT has_function_privilege('app.assign_commercial_track(uuid,uuid,text,text,integer,text)','EXECUTE') allowed")).rows[0].allowed).toBe(false);
 });
 it('isolates two contractor tenants and one small-builder tenant, including scoped IDs and pooled context',async()=>{
  const a=await setup(),b=await setup(),s=await setup();
  const assignment=randomUUID();await withTenant(admin,verifiedTenantContextFromMembership(s.p),async db=>{
   await db.$client.query("SELECT app.assign_commercial_track($1,$2,'small_builder',$3,1,'operations:test')",[s.p.tenantId,assignment,`synthetic-agreement:${s.p.tenantId}`]);
   await appendAuditBatch(db,[{id:assignment,version:'audit.v1',actorRef:'operations:test',eventType:'commercial_track.assigned',subjectType:'tenant',subjectRef:s.p.tenantId,payload:{references:{environment:'synthetic_demo'}}}]);
  });
  await expect(query(s.p)).rejects.toMatchObject({code:'FORBIDDEN'});
  for(const target of [b.p.tenantId,s.p.tenantId,randomUUID()])await expect(repo.query(a.p,{version:'contractor-query.v1',tenantId:target,resource:'organisation'})).rejects.toMatchObject({code:'NOT_FOUND'});
  const branch=a.v.units.find(x=>x.kind==='branch')!.id, client=(await command(a.p,{kind:'client.create',branchId:branch,name:'Fictional A',clientType:'housing_association'})).id;
  const contract=randomUUID();await command(a.p,{kind:'contract.revise',clientId:client,contractId:contract,document,rules:referenceApprovalRulesV1});
  const surveyor=await fixtureMember(a.p,'surveyor','branch',branch);expect((await query(surveyor,'contracts',contract)).contracts).toHaveLength(1);
  const outsider=await fixtureMember(a.p,'surveyor','branch',(await command(a.p,{kind:'unit.create',unitKind:'branch',parentId:a.v.units.find(x=>x.kind==='region')!.id,name:'Fictional B'})).id);
  for(const id of [contract,randomUUID()])await expect(query(outsider,'contracts',id)).rejects.toMatchObject({code:'NOT_FOUND'});
  await withTenant(runtime,verifiedTenantContextFromMembership(a.p),async db=>{for(const table of tables)expect((await db.$client.query(`SELECT * FROM app.${table} WHERE tenant_id=$1`,[b.p.tenantId])).rows).toEqual([]);});
  expect((await runtime.query("SELECT nullif(current_setting('app.tenant_id',true),'') tenant")).rows[0].tenant).toBeNull();
 });
 it('enforces qualified hierarchy, team, membership and client keys in PostgreSQL',async()=>{
  const a=await setup(),b=await setup();const context=verifiedTenantContextFromMembership(a.p);
  const crossBranch=b.v.units.find(x=>x.kind==='branch')!.id,crossRegion=b.v.units.find(x=>x.kind==='region')!.id;
  const bClient=(await command(b.p,{kind:'client.create',branchId:crossBranch,name:'Fictional foreign',clientType:'insurer'})).id;
  const bGrant=b.v.grants[0]!.id;
  const attacks:Array<[string,unknown[]]>=[
   ["INSERT INTO app.org_unit VALUES($1,$2,'branch',$3,'region','Fictional attack')",[a.p.tenantId,randomUUID(),crossRegion]],
   ["INSERT INTO app.team(tenant_id,id,branch_id,name) VALUES($1,$2,$3,'Fictional attack')",[a.p.tenantId,randomUUID(),crossBranch]],
   ["INSERT INTO app.team(tenant_id,id,branch_id,name) VALUES($1,$2,$3,'Fictional wrong kind')",[a.p.tenantId,randomUUID(),a.v.units.find(x=>x.kind==='region')!.id]],
   ["INSERT INTO app.client_organisation(tenant_id,id,branch_id,name,client_type) VALUES($1,$2,$3,'Fictional attack','insurer')",[a.p.tenantId,randomUUID(),crossBranch]],
   ['INSERT INTO app.client_contract VALUES($1,$2,$3)',[a.p.tenantId,randomUUID(),bClient]],
   ["INSERT INTO app.contractor_member VALUES($1,$2,NULL,'foreign@fictional.invalid')",[a.p.tenantId,b.p.membershipId]],
   ["INSERT INTO app.role_grant VALUES($1,$2,$3,'operative','team',$4,NULL)",[a.p.tenantId,randomUUID(),b.p.membershipId,a.v.teams[0]!.id]],
   ['INSERT INTO app.role_grant_revocation VALUES($1,$2,$3)',[a.p.tenantId,randomUUID(),bGrant]],
   ['INSERT INTO app.contractor_membership_revocation VALUES($1,$2,$3)',[a.p.tenantId,randomUUID(),b.p.membershipId]],
   ['INSERT INTO app.team_membership VALUES($1,$2,$3,$4,1,true)',[a.p.tenantId,randomUUID(),a.p.membershipId,b.v.teams[0]!.id]],
  ];
  for(const [sql,values] of attacks)await expect(withTenant(admin,context,db=>db.$client.query(sql,values))).rejects.toMatchObject({code:'23503'});
  await expect(runtime.query('SELECT * FROM control_plane.contractor_practice_session')).rejects.toMatchObject({code:'42501'});
  await expect(repo.resolveSession(randomUUID())).rejects.toMatchObject({code:'UNAUTHENTICATED'});
 });
 it('honours M0-6 membership revocation and expiry and rejects non-member principals',async()=>{
  const {p,v}=await setup();const expired=await fixtureMember(p,'operative','team',v.teams[0]!.id),revoked=await fixtureMember(p,'operative','team',v.teams[0]!.id);
  await admin.query("UPDATE app.membership SET expires_at=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND id=$2",[p.tenantId,expired.membershipId]);
  await admin.query('UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2',[p.tenantId,revoked.membershipId]);
  const wrongTrack=await fixtureMember(p,'operative','team',v.teams[0]!.id);
  await admin.query("UPDATE app.membership SET role='foreman' WHERE tenant_id=$1 AND id=$2",[p.tenantId,wrongTrack.membershipId]);
  for(const member of [expired,revoked,wrongTrack,{...p,identityUserId:randomUUID()} as AuthenticatedMembership]){
   await expect(query(member,'contracts')).rejects.toMatchObject({code:'FORBIDDEN'});
   await expect(repo.command(member,{version:'contractor-command.v1',environment:'synthetic_demo',commandId:randomUUID(),id:randomUUID(),expectedRevision:2,kind:'team.create',branchId:v.teams[0]!.branch_id,name:'Fictional denied'})).rejects.toMatchObject({code:'FORBIDDEN'});
  }
 });
 it('conforms every persisted role × permission across own team, other team, branch and region',async()=>{
  const {p,v}=await setup();const branch=v.units.find(x=>x.kind==='branch')!.id, region=v.units.find(x=>x.kind==='region')!.id, own=v.teams[0]!.id;
  const otherTeam=(await command(p,{kind:'team.create',branchId:branch,name:'Fictional other team'})).id;
  const otherBranch=(await command(p,{kind:'unit.create',unitKind:'branch',parentId:region,name:'Fictional other branch'})).id;
  const otherBranchTeam=(await command(p,{kind:'team.create',branchId:otherBranch,name:'Fictional branch team'})).id;
  const otherRegion=(await command(p,{kind:'unit.create',unitKind:'region',parentId:p.tenantId,name:'Fictional other region'})).id;
  const distantBranch=(await command(p,{kind:'unit.create',unitKind:'branch',parentId:otherRegion,name:'Fictional distant branch'})).id;
  const distantTeam=(await command(p,{kind:'team.create',branchId:distantBranch,name:'Fictional distant team'})).id;
  const client=(await command(p,{kind:'client.create',branchId:branch,name:'Fictional client',clientType:'housing_association'})).id;
  for(const role of contractorRoles.filter(x=>x!=='owner')){
   const scope=role==='finance'?'tenant':role==='client_approver'?'client':'team';const id=scope==='tenant'?p.tenantId:scope==='client'?client:own;
   const member=await fixtureMember(p,role,scope,id,role==='client_approver'?client:null);
   for(const permission of contractorPermissions)expect((await withTenant(runtime,verifiedTenantContextFromMembership(member),db=>db.$client.query('SELECT app.contractor_allowed($1,$2,$3) allowed',[member.membershipId,permission,randomUUID()]))).rows[0].allowed).toBe(false);
   for(const permission of contractorPermissions)for(const [index,target]of[own,otherTeam,otherBranchTeam,distantTeam].entries()){
    const allowed=(await withTenant(runtime,verifiedTenantContextFromMembership(member),db=>db.$client.query<{allowed:boolean}>('SELECT app.contractor_allowed($1,$2,$3) allowed',[member.membershipId,permission,target]))).rows[0]!.allowed;
    expect(allowed,`${role} ${permission} scope ${index}`).toBe(role==='finance'?contractorPermissionMatrix.finance.includes(permission):role!=='client_approver'&&index===0&&contractorPermissionMatrix[role].includes(permission));
   }
   if(role==='operative'||role==='admin') for(const permission of ['extra.approve','extra.price','data.export','data.import','statement.read']){
    if(role==='admin'&&permission==='extra.price')continue;
    expect((await withTenant(runtime,verifiedTenantContextFromMembership(member),db=>db.$client.query('SELECT app.contractor_allowed($1,$2,$3) allowed',[member.membershipId,permission,own]))).rows[0].allowed).toBe(false);
   }
  }
  // Unit scopes include their descendants; moving outside the region denies.
  for(const scope of ['branch','region'] as const){const member=await fixtureMember(p,'surveyor',scope,scope==='branch'?branch:region);for(const [index,target]of[own,otherTeam,otherBranchTeam,distantTeam].entries())expect((await withTenant(runtime,verifiedTenantContextFromMembership(member),db=>db.$client.query('SELECT app.contractor_allowed($1,$2,$3) allowed',[member.membershipId,'job.read',target]))).rows[0].allowed).toBe(index<(scope==='branch'?2:3));}
 });
 it('covers every administration command and query for all roles; client invitation is bounded',async()=>{
  const {p,v}=await setup();const branch=v.units.find(x=>x.kind==='branch')!.id,region=v.units.find(x=>x.kind==='region')!.id,team=v.teams[0]!.id;
  const client=(await command(p,{kind:'client.create',branchId:branch,name:'Fictional client',clientType:'housing_association'})).id;
  const contract=randomUUID();await command(p,{kind:'contract.revise',clientId:client,contractId:contract,document,rules:referenceApprovalRulesV1});
  for(const role of contractorRoles){
   const actor=role==='owner'?p:await fixtureMember(p,role,role==='client_approver'?'client':'tenant',role==='client_approver'?client:p.tenantId,role==='client_approver'?client:null);
   const isAdmin=role==='owner'||role==='admin';
   if(isAdmin)await expect(query(actor)).resolves.toMatchObject({tenantId:p.tenantId});else await expect(query(actor)).rejects.toMatchObject({code:'NOT_FOUND'});
   const canRead=role!=='operative';if(canRead)expect((await query(actor,'contracts',contract)).contracts).toHaveLength(await persistedVersions(contract));else await expect(query(actor,'contracts',contract)).rejects.toMatchObject({code:'NOT_FOUND'});
   const target=await fixtureMember(p,'operative','team',team);
   const grant=(await query(p)).grants.find(x=>x.membership_id===target.membershipId)!;
   const operations:Record<string,unknown>[]=[
    {kind:'unit.create',unitKind:'branch',parentId:region,name:'Fictional branch'},
    {kind:'team.create',branchId:branch,name:'Fictional team'},
    {kind:'client.create',branchId:branch,name:'Fictional client',clientType:'insurer'},
    {kind:'member.invite',role:'client_approver',clientId:client,contractId:null,email:'client@fictional.invalid',scope:{kind:'client',id:client}},
    {kind:'grant.create',membershipId:target.membershipId,role:'read_only',scope:{kind:'team',id:team},contractId:null},
    {kind:'grant.revoke',grantId:grant.id},
    {kind:'team.move',membershipId:target.membershipId,fromTeamId:null,toTeamId:team},
    {kind:'membership.revoke',membershipId:target.membershipId},
    {kind:'contract.revise',clientId:client,contractId:contract,document,rules:referenceApprovalRulesV1},
   ];
   for(const operation of operations){
    const expected=isAdmin||(role==='commercial_manager'&&['member.invite','contract.revise'].includes(operation.kind as string));
    const rev=await revisionOf(p);
    const promise=repo.command(actor,{version:'contractor-command.v1',environment:'synthetic_demo',commandId:randomUUID(),id:randomUUID(),expectedRevision:rev,...operation});
    if(expected)await expect(promise).resolves.toMatchObject({environment:'synthetic_demo'});else await expect(promise).rejects.toMatchObject({code:'NOT_FOUND'});
   }
  }
 });
 it('runs the command and query conformance matrix in own/other team, branch and region',async()=>{
  const {p,v}=await setup();const ownBranch=v.teams[0]!.branch_id,ownRegion=v.units.find(x=>x.kind==='region')!.id;
  const otherTeam=(await command(p,{kind:'team.create',branchId:ownBranch,name:'Fictional other team'})).id;
  const otherBranch=(await command(p,{kind:'unit.create',unitKind:'branch',parentId:ownRegion,name:'Fictional other branch'})).id;
  const otherBranchTeam=(await command(p,{kind:'team.create',branchId:otherBranch,name:'Fictional other branch team'})).id;
  const otherRegion=(await command(p,{kind:'unit.create',unitKind:'region',parentId:p.tenantId,name:'Fictional other region'})).id;
  const farBranch=(await command(p,{kind:'unit.create',unitKind:'branch',parentId:otherRegion,name:'Fictional far branch'})).id;
  const farTeam=(await command(p,{kind:'team.create',branchId:farBranch,name:'Fictional far team'})).id;
  const targets=[] as Array<{team:string;branch:string;region:string;client:string;contract:string}>;
  for(const [team,branch,region]of[[v.teams[0]!.id,ownBranch,ownRegion],[otherTeam,ownBranch,ownRegion],[otherBranchTeam,otherBranch,ownRegion],[farTeam,farBranch,otherRegion]]){
   const client=(await command(p,{kind:'client.create',branchId:branch,name:'Fictional scoped client',clientType:'insurer'})).id,contract=randomUUID();
   await command(p,{kind:'contract.revise',clientId:client,contractId:contract,document,rules:referenceApprovalRulesV1});targets.push({team,branch,region,client,contract});
  }
  for(const role of contractorRoles){
   const scope=role==='finance'?'tenant':role==='client_approver'?'client':role==='operative'?'team':'region';
   const scopeId=scope==='tenant'?p.tenantId:scope==='client'?targets[0]!.client:scope==='team'?targets[0]!.team:ownRegion;
   // owner is the existing bootstrap principal; narrow it using explicit grants after minting a separate administrator.
   let actor:AuthenticatedMembership;
   if(role==='owner')actor=p;else actor=await fixtureMember(p,role,scope,scopeId,role==='client_approver'?scopeId:null);
   for(const [index,target]of targets.entries()){
    const inScope=role==='owner'||role==='finance'||(role==='client_approver'||role==='operative'?index===0:index<3);
    const readsContract=role!=='operative'&&inScope;
    if(readsContract)expect((await query(actor,'contracts',target.contract)).contracts).toHaveLength(await persistedVersions(target.contract));else await expect(query(actor,'contracts',target.contract)).rejects.toMatchObject({code:'NOT_FOUND'});
    const organisationRead=(role==='owner'||role==='admin')&&inScope;
    const orgRead=repo.query(actor,{version:'contractor-query.v1',tenantId:p.tenantId,resource:'organisation',id:target.team});
    if(organisationRead)await expect(orgRead).resolves.toMatchObject({tenantId:p.tenantId});else await expect(orgRead).rejects.toMatchObject({code:'NOT_FOUND'});
    const subject=await fixtureMember(p,'operative','team',target.team);const subjectGrant=(await query(p)).grants.find(x=>x.membership_id===subject.membershipId)!;
    const cases: Array<{fields:Record<string,unknown>;permission:string;allowedScope:boolean}>=[
     {fields:{kind:'unit.create',unitKind:'branch',parentId:target.region,name:'Fictional scoped branch'},permission:'organisation.manage',allowedScope:role==='owner'||target.region===ownRegion},
     {fields:{kind:'team.create',branchId:target.branch,name:'Fictional scoped team'},permission:'organisation.manage',allowedScope:inScope},
     {fields:{kind:'client.create',branchId:target.branch,name:'Fictional scoped client',clientType:'insurer'},permission:'organisation.manage',allowedScope:inScope},
     {fields:{kind:'member.invite',role:'client_approver',email:'scoped@fictional.invalid',clientId:target.client,contractId:null,scope:{kind:'client',id:target.client}},permission:'client.invite',allowedScope:inScope},
     {fields:{kind:'grant.create',membershipId:subject.membershipId,role:'read_only',scope:{kind:'team',id:target.team},contractId:null},permission:'organisation.manage',allowedScope:inScope},
     {fields:{kind:'grant.revoke',grantId:subjectGrant.id},permission:'organisation.manage',allowedScope:inScope},
     {fields:{kind:'team.move',membershipId:subject.membershipId,fromTeamId:null,toTeamId:target.team},permission:'organisation.manage',allowedScope:inScope},
     {fields:{kind:'membership.revoke',membershipId:subject.membershipId},permission:'organisation.manage',allowedScope:role==='owner'},
     {fields:{kind:'contract.revise',clientId:target.client,contractId:target.contract,document,rules:referenceApprovalRulesV1},permission:'contract.manage',allowedScope:inScope},
    ];
    for(const item of cases){
     const revision=await revisionOf(p);const promise=repo.command(actor,{version:'contractor-command.v1',environment:'synthetic_demo',commandId:randomUUID(),id:randomUUID(),expectedRevision:revision,...item.fields});
     const permitted=contractorPermissionMatrix[role].includes(item.permission as typeof contractorPermissions[number])&&item.allowedScope;
     if(permitted)await expect(promise).resolves.toMatchObject({environment:'synthetic_demo'});else await expect(promise).rejects.toMatchObject({code:'NOT_FOUND'});
    }
   }
  }
 },60000);
 it('does not let a scoped administrator probe or adopt an outside membership by ID',async()=>{
  const {p,v}=await setup();const branch=v.teams[0]!.branch_id,region=v.units.find(x=>x.kind==='region')!.id;
  const foreignBranch=(await command(p,{kind:'unit.create',unitKind:'branch',parentId:region,name:'Fictional other branch'})).id;
  const foreignTeam=(await command(p,{kind:'team.create',branchId:foreignBranch,name:'Fictional outside team'})).id;
  const scoped=await fixtureMember(p,'admin','branch',branch),outside=await fixtureMember(p,'operative','team',foreignTeam);
  for(const membershipId of [outside.membershipId,randomUUID()])for(const fields of [
   {kind:'grant.create',membershipId,role:'read_only',scope:{kind:'team',id:v.teams[0]!.id},contractId:null},
   {kind:'team.move',membershipId,fromTeamId:null,toTeamId:v.teams[0]!.id},
  ])await expect(repo.command(scoped,{version:'contractor-command.v1',environment:'synthetic_demo',commandId:randomUUID(),id:randomUUID(),expectedRevision:(await query(p)).revision,...fields})).rejects.toMatchObject({code:'NOT_FOUND'});
 });
 it('revokes on next request, moves teams atomically and audits the actor and exact command',async()=>{
  const {p,v}=await setup();const old=v.teams[0]!.id,newTeam=(await command(p,{kind:'team.create',branchId:v.teams[0]!.branch_id,name:'Fictional move'})).id;
  const member=await fixtureMember(p,'operative','team',old);
  const allowed=(target:string)=>withTenant(runtime,verifiedTenantContextFromMembership(member),db=>db.$client.query('SELECT app.contractor_allowed($1,$2,$3) allowed',[member.membershipId,'job.read',target]));
  expect((await allowed(old)).rows[0].allowed).toBe(true);
  await command(p,{kind:'team.move',membershipId:member.membershipId,fromTeamId:old,toTeamId:newTeam});expect((await allowed(old)).rows[0].allowed).toBe(false);expect((await allowed(newTeam)).rows[0].allowed).toBe(true);
  const grant=(await query(p)).grants.find(x=>x.membership_id===member.membershipId&&x.scope_id===newTeam)!;
  await command(p,{kind:'grant.revoke',grantId:grant.id});expect((await allowed(newTeam)).rows[0].allowed).toBe(false);
  await command(p,{kind:'membership.revoke',membershipId:member.membershipId});await expect(query(member,'contracts')).rejects.toMatchObject({code:'FORBIDDEN'});
  expect((await admin.query("SELECT actor_ref,payload FROM app.audit_event WHERE tenant_id=$1 AND event_type='contractor.team.move'",[p.tenantId])).rows[0].actor_ref).toBe(`membership:${p.membershipId}`);
  const ownerGrant=(await query(p)).grants.find(x=>x.membership_id===p.membershipId)!;await command(p,{kind:'grant.revoke',grantId:ownerGrant.id});await expect(command(p,{kind:'team.create',branchId:v.teams[0]!.branch_id,name:'Denied'})).rejects.toMatchObject({code:'NOT_FOUND'});
 });
 it('keeps client A apart from client B and all other permissions, with optional contract restriction',async()=>{
  const {p,v}=await setup(),branch=v.teams[0]!.branch_id;
  const a=(await command(p,{kind:'client.create',branchId:branch,name:'Fictional A',clientType:'insurer'})).id,b=(await command(p,{kind:'client.create',branchId:branch,name:'Fictional B',clientType:'insurer'})).id;
  const ca=randomUUID(),ca2=randomUUID(),cb=randomUUID();for(const [clientId,contractId]of[[a,ca],[a,ca2],[b,cb]])await command(p,{kind:'contract.revise',clientId,contractId,document,rules:referenceApprovalRulesV1});
  const approver=await fixtureMember(p,'client_approver','client',a,a,ca);
  expect((await query(approver,'contracts')).contracts.map(x=>x.contract_id)).toEqual([ca]);
  for(const id of [cb,ca2,randomUUID()])await expect(query(approver,'contracts',id)).rejects.toMatchObject({code:'NOT_FOUND'});
  for(const permission of ['job.read','statement.read','dashboard.read','resident.read','data.export','data.import'])expect((await withTenant(runtime,verifiedTenantContextFromMembership(approver),db=>db.$client.query('SELECT app.contractor_allowed($1,$2,$3) allowed',[approver.membershipId,permission,a]))).rows[0].allowed).toBe(false);
  await expect(command(p,{kind:'grant.create',membershipId:approver.membershipId,role:'admin',scope:{kind:'tenant',id:p.tenantId},contractId:null})).rejects.toMatchObject({code:'FORBIDDEN'});
  await expect(command(p,{kind:'grant.create',membershipId:approver.membershipId,role:'client_approver',scope:{kind:'client',id:b},contractId:null})).rejects.toMatchObject({code:'FORBIDDEN'});
 });
 it('serializes racing commands, replays identical payload, conflicts on changes and rolls back missing audit',async()=>{
  const {p,v}=await setup();const raw={version:'contractor-command.v1',environment:'synthetic_demo',commandId:randomUUID(),id:randomUUID(),expectedRevision:0,kind:'client.create',branchId:v.teams[0]!.branch_id,name:'Fictional race',clientType:'insurer'};
  const [first,again]=await Promise.all([repo.command(p,raw),repo.command(p,raw)]);expect(again).toEqual(first);
  await expect(repo.command(p,{...raw,name:'Changed'})).rejects.toMatchObject({code:'COMMAND_CONFLICT'});
  const races=await Promise.allSettled([repo.command(p,{...raw,commandId:randomUUID(),id:randomUUID(),expectedRevision:1}),repo.command(p,{...raw,commandId:randomUUID(),id:randomUUID(),expectedRevision:1})]);expect(races.filter(x=>x.status==='fulfilled')).toHaveLength(1);expect((races.find(x=>x.status==='rejected') as PromiseRejectedResult).reason.code).toBe('STALE_REVISION');
  const noAudit={...raw,commandId:randomUUID(),id:randomUUID(),expectedRevision:2};
  await expect(withTenant(runtime,verifiedTenantContextFromMembership(p),db=>db.$client.query('SELECT app.contractor_admin_command($1,$2::jsonb,$3)',[p.membershipId,JSON.stringify(noAudit),createHash('sha256').update('no audit').digest('hex')]))).rejects.toMatchObject({code:'23514'});
  expect((await query(p)).revision).toBe(2);expect((await query(p)).clients).toHaveLength(2);
  const assignments=(await admin.query('SELECT * FROM app.commercial_track_assignment WHERE tenant_id=$1',[p.tenantId])).rows;
  for(const role of ['owner','admin']){const actor=role==='owner'?p:await fixtureMember(p,'admin','tenant',p.tenantId);await expect(withTenant(runtime,verifiedTenantContextFromMembership(actor),db=>db.$client.query("SELECT app.assign_commercial_track($1,$2,'small_builder',$3,1,'tenant-admin')",[p.tenantId,randomUUID(),`synthetic-agreement:${p.tenantId}`]))).rejects.toMatchObject({code:'42501'});}
  expect(assignments).toHaveLength(1);
 });
 it('rejects wrong-client foreign keys, invalid rules and cross-track roles without partial effects',async()=>{
  const {p,v}=await setup();const client=(await command(p,{kind:'client.create',branchId:v.teams[0]!.branch_id,name:'Fictional',clientType:'insurer'})).id;
  const contract=randomUUID();await command(p,{kind:'contract.revise',clientId:client,contractId:contract,document,rules:referenceApprovalRulesV1});
  const original=(await query(p)).contracts[0]!;
  for(const table of ['client_contract_version','approval_rule_version'])await expect(withTenant(admin,verifiedTenantContextFromMembership(p),db=>db.$client.query(`UPDATE app.${table} SET document=document WHERE tenant_id=$1`,[p.tenantId]))).rejects.toMatchObject({code:'55000'});
  expect((await withTenant(runtime,verifiedTenantContextFromMembership(p),db=>db.$client.query('SELECT app.valid_approval_rules($1::jsonb) valid',[JSON.stringify({...referenceApprovalRulesV1,bands:[{upToPence:null,steps:[{role:'operative',timeLimitMinutes:0,escalationRole:'admin',alternateRoles:[]}]}]})]))).rows[0].valid).toBe(false);

  await expect(command(p,{kind:'contract.revise',clientId:client,contractId:contract,document,rules:{...referenceApprovalRulesV1,proceedLimit:{pence:0.5,currency:'GBP'}}})).rejects.toMatchObject({code:'INVALID_RULE_DOCUMENT'});
  await expect(command(p,{kind:'member.invite',role:'foreman',email:'bad@fictional.invalid',clientId:null,contractId:null,scope:{kind:'team',id:v.teams[0]!.id}})).rejects.toMatchObject({code:'INVALID_COMMAND'});
  await command(p,{kind:'contract.revise',clientId:client,contractId:contract,document:{...document,reference:'FICTIONAL-v2'},rules:referenceApprovalRulesV1});expect((await query(p)).contracts[0]).toEqual(original);
  const otherClient=(await command(p,{kind:'client.create',branchId:v.teams[0]!.branch_id,name:'Fictional other',clientType:'insurer'})).id;
  await expect(command(p,{kind:'contract.revise',clientId:otherClient,contractId:contract,document,rules:referenceApprovalRulesV1})).rejects.toMatchObject({code:'NOT_FOUND'});
  // Migration credential tests composite FKs themselves; runtime INSERT remains forbidden above.
  await expect(withTenant(admin,verifiedTenantContextFromMembership(p),db=>db.$client.query("INSERT INTO app.client_contract_version(tenant_id,id,client_id,contract_id,revision,document,rule_version_id) VALUES($1,$2,$3,$4,99,$5::jsonb,$6)",[p.tenantId,randomUUID(),otherClient,contract,JSON.stringify(document),original.rule_version_id]))).rejects.toMatchObject({code:'23503'});
  expect((await query(p)).contracts).toHaveLength(2);
  for(const table of ['decision','action_authorization','action_outbox','journal','customer_invoice'])expect((await admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1`,[p.tenantId])).rows[0].n).toBe(0);
 });
});
