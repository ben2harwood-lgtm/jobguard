import { randomUUID } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { MIGRATION_URLS, migrate, issuePracticeSession, authenticatePracticeSession, practiceMaterialPool, RecoveryCaseRepository, RecoveryEligibilityV3Repository, PracticeFeedRepository, SupplierDocumentRepository, QuoteRepository, QuoteDocumentRepository, IssueQuoteMutation, RecordBuilderAcceptanceMutation, SwitchJobLiveV3Mutation, UserCommandDispatcher, withTenant } from "../src/index.js";
import { DEMO_TENANT_ID as T, DEMO_ACCOUNT_ID as A, DEMO_MEMBERSHIP_ID as M, DEMO_IDENTITY_USER_ID as U } from "../src/demo-seed.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { proofBefore, proofDifferences, rolledBack, scratchReplaceFunction } from "./upgrade-proof-utils.js";
let postgres:EmbeddedPostgres,admin:Pool,runtime:Pool;
const previousEnvironment=process.env.JOBGUARD_ENV;
beforeAll(async()=>{
 process.env.JOBGUARD_ENV='synthetic_demo';const directory=await mkdtemp(join(tmpdir(),'jg-pf1b-upgrade-')),port=await freePort(61900,100),value=randomUUID();
 postgres=new EmbeddedPostgres({databaseDir:directory,port,user:'postgres',password:value,persistent:true,createPostgresUser:process.getuid?.()===0,initdbFlags:['--lc-messages=C','--encoding=UTF8'],onLog:()=>undefined});await postgres.initialise();await postgres.start();
 admin=new Pool({host:'127.0.0.1',port,user:'postgres',database:'postgres',password:value});
 await admin.query(`CREATE ROLE pf1b_upgrade_login LOGIN PASSWORD '${value}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
 runtime=new Pool({host:'127.0.0.1',port,user:'pf1b_upgrade_login',database:'postgres',password:value});
});
afterAll(async()=>{await closeTestPools(runtime,admin);if(postgres)await postgres.stop();if(previousEnvironment===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=previousEnvironment;});
// Administrative setup supplies identity, parties and captured scope only. Commercial lifecycle
// uses the real quote, acceptance and no-charge switch-live command implementations.
const context = testTenantContext(T), actor = {membershipId:M,identityUserId:U};
async function seedIdentity(pool: Pool) {
  await pool.query("INSERT INTO control_plane.tenant(id) VALUES($1)",[T]);
  await pool.query("INSERT INTO identity.identity_user(id) VALUES($1)",[U]);
  await pool.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional PF1B builder')",[A,T]);
  await pool.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')",[M,T,A,U]);
  await installLegacySyntheticPartyFixtures(pool);
}
async function liveJob(admin:Pool,runtime:Pool,live=true) {
  const session = await issuePracticeSession(runtime), auth = await authenticatePracticeSession(runtime,session);
  const jobId = randomUUID(),scopeId=randomUUID(),scopeRevisionId=randomUUID();
  await admin.query("INSERT INTO app.job(id,tenant_id,title,practice_session_digest,practice_scenario) VALUES($1,$2,'Fictional INTERIM credit example',$3,'capture')",[jobId,T,auth.digest]);
  const scoped=practiceMaterialPool(runtime,auth.digest);
  if(live) {
    await withTenant(admin,context,async db=>{
      await db.$client.query("SELECT app.transition_job($1,$2,0,'quoting','start_quote')",[T,jobId]);
      await db.$client.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')",[scopeId,T,jobId]);
      await db.$client.query("INSERT INTO app.scope_revision(id,tenant_id,job_id,scope_item_id,revision,description,quantity_decimal,unit,unit_price_pence,total_pence) VALUES($1,$2,$3,$4,1,'Fictional baseline','1','item',100000,100000)",[scopeRevisionId,T,jobId,scopeId]);
    });
    const quote=await new QuoteRepository(scoped).saveDraft(context,{jobId,draftId:randomUUID(),expectedRevision:0,currency:'GBP',taxPolicyVersion:'candidate_m1_standard_v1',effectiveAt:new Date(),lines:[{id:randomUUID(),scopeItemId:scopeId,scopeRevisionId,description:'Fictional baseline',origin:'captured',included:true,exclusionReason:null,quantity:'1',unit:'item',unitRatePence:100000,discountPercent:'0',taxTreatment:'standard_rate_20',rateProvenance:'entered',category:'General',region:'London'}]});
    const documentId=randomUUID(), artifact=await new QuoteDocumentRepository(scoped).create(context,{jobId,documentId,quoteRevisionId:quote.id,objectVersionId:randomUUID(),document:{schemaVersion:'quote-document.v1',documentVersion:1,reference:'Q-PF1B',quoteRevisionId:quote.id,currency:'GBP',issuer:{name:'Fictional Builder',address:['1 Fictional Street'],email:'builder@example.invalid'},customer:{name:'Practice Customer',address:['14 Fictional Street'],email:'customer@example.invalid'},lines:[{scopeItemId:scopeId,description:'Fictional baseline',quantity:'1',unit:'item',netPence:100000}],exclusions:[],qualifications:['Synthetic only'],subtotalPence:100000,discountPence:0,netPence:100000,taxPence:20000,totalPence:120000}});
    const dispatcher=new UserCommandDispatcher(scoped),expiresAt=new Date(Date.now()+60000);
    await dispatcher.dispatch(context,{version:'command.v1',commandId:randomUUID(),commandType:'quote.issue',semanticKey:`issue:${documentId}`,actorMembershipId:M,subjectType:'quote_document',subjectRef:documentId,authorizationId:randomUUID(),action:{actionType:'quote.send',recipient:JSON.stringify(['customer@example.invalid']),contentHash:artifact.content_hash,aggregateRevision:1,amountPence:null,currency:null,policyVersion:'free-quote-send.v1',expiresAt}},new IssueQuoteMutation({tenantId:T,jobId,documentId,outboxActionId:randomUUID(),recipients:['customer@example.invalid'],immutableContent:new TextDecoder().decode(artifact.pdf)}));
    await dispatcher.dispatch(context,{version:'command.v1',commandId:randomUUID(),commandType:'quote.acceptance.attest',semanticKey:`accept:${documentId}`,actorMembershipId:M,subjectType:'quote_document',subjectRef:documentId,action:{actionType:'quote.acceptance.attest',recipient:'Practice Customer',contentHash:artifact.content_hash,aggregateRevision:1,amountPence:120000,currency:'GBP',policyVersion:'builder-attestation.v1',expiresAt}},new RecordBuilderAcceptanceMutation(T,{version:'quote-acceptance.v1',acceptanceId:randomUUID(),jobId,documentId,documentVersion:1,documentHash:artifact.content_hash,expectedJobRevision:1,acceptedTotalPence:120000,acceptedAt:new Date(),statedCustomerName:'Practice Customer',statedMethod:'email',evidenceId:null}));
    await dispatcher.dispatch(context,{version:'command.v1',commandId:randomUUID(),commandType:'job.switch_live',semanticKey:`live:${jobId}`,actorMembershipId:M,subjectType:'job',subjectRef:jobId,action:{actionType:'job.switch_live',recipient:null,contentHash:artifact.content_hash,aggregateRevision:1,amountPence:null,currency:null,policyVersion:'synthetic_demo_activation.v3',expiresAt}},new SwitchJobLiveV3Mutation(T,{version:'switch-live.v3',activationId:randomUUID(),termsId:randomUUID(),jobId,acceptedDocumentId:documentId,acceptedDocumentVersion:1,acceptedDocumentHash:artifact.content_hash,expectedJobRevision:2}));
  }
  return {jobId,session,auth,scoped};
}
const compared=['app.recovery_case','app.recovery_case_event','app.recovery_claim_revision','app.recovery_eligibility_revision','app.recovery_eligibility_v3_review','app.recovery_claim_line','app.supplier_document','app.supplier_document_version','app.supplier_document_intake','app.practice_feed_account','app.practice_feed_command','app.practice_feed_event','app.audit_event'];
let proof:Awaited<ReturnType<typeof proofBefore>>;
const names=MIGRATION_URLS.map(u=>basename(fileURLToPath(u))),position=names.indexOf('0187_practice_supplier_credit.sql');
const security=async(pool:Pool)=>({
 tables:(await pool.query("SELECT c.oid,c.relname,c.relowner,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relkind='r' AND c.relname NOT LIKE 'practice_supplier_credit_%' ORDER BY c.oid")).rows,
 policies:(await pool.query("SELECT p.oid,p.polrelid,p.polname,p.polcmd,p.polroles,p.polqual::text,p.polwithcheck::text FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE c.relname NOT LIKE 'practice_supplier_credit_%' ORDER BY p.oid")).rows,
 triggers:(await pool.query("SELECT t.oid,t.tgrelid,t.tgname,pg_get_triggerdef(t.oid) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal AND c.relname NOT LIKE 'practice_supplier_credit_%' ORDER BY t.oid")).rows,
 functions:(await pool.query("SELECT p.oid,p.proowner,p.proacl::text,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('app','control_plane','identity') AND p.prokind='f' AND p.proname NOT LIKE 'pf1b_%' AND p.proname NOT IN('guard_recovery_eligibility_v3','require_recovery_eligibility_v3_effect') ORDER BY p.oid")).rows,
});
it('PF1B-A26 A26_OwnMigrationUpgradeThenLaterMigrationsTwice',async()=>{
 expect(position).toBeGreaterThan(0);expect(names).toEqual([...names].sort());
 await admin.query('CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())');
 for(const url of MIGRATION_URLS.slice(0,position)){await admin.query(await readFile(url,'utf8'));await admin.query('INSERT INTO public.jobguard_schema_migration(migration_name)VALUES($1)',[basename(fileURLToPath(url))]);}
 await admin.query('GRANT jobguard_runtime TO pf1b_upgrade_login');await seedIdentity(admin);
 const f=await liveJob(admin,runtime),suppliers=new SupplierDocumentRepository(f.scoped);
 for(const [revision,fixtureId] of ['materials-B-invoice','materials-B-credit'].entries())await suppliers.intake(context,f.jobId,{version:'supplier-document-intake.v1',fixtureId:fixtureId as 'materials-B-invoice'|'materials-B-credit',channel:'picker',expectedRevision:revision});
 const cases=new RecoveryCaseRepository(f.scoped),c=await cases.command(context,f.jobId,{version:'recovery-case-command.v1',commandId:randomUUID(),action:'open',caseType:'merchant_overcharge',claimedNetPence:30000,counterparty:'Fictional supplier',book:'supplier_cost',sourceType:'supplier_documents',sourceRefs:['CR-MB-001'],expectedRevision:0},actor);
 await cases.eligibilityCommand(context,f.jobId,{version:'recovery-eligibility-command.v1',commandId:randomUUID(),action:'review',caseId:c.id,expectedCaseRevision:c.revision,scenario:'pending_money',evidenceRevision:1,policyVersion:'reference-d03.v1',policyRevision:1},actor);
 await new RecoveryEligibilityV3Repository(f.scoped,'synthetic_demo').review(context,f.jobId,{version:'recovery-eligibility-command.v3',action:'review',commandId:randomUUID(),caseId:c.id,fixture:'F15',expectedCaseRevision:c.revision,expectedReviewRevision:0},actor,f.auth.digest);
 const feed=new PracticeFeedRepository(runtime,'synthetic_demo');await feed.command(context,actor,f.auth.digest,f.jobId,{version:'practice-feed-command.v1',commandId:randomUUID(),action:'connect',expectedRevision:0});
 await feed.factsCommand(context,actor,f.auth.digest,f.jobId,{version:'practice-facts-command.v1',commandId:randomUUID(),action:'advance',movement:'supplier-payment-600',step:'settled',expectedRevision:1});
 proof=await proofBefore(admin,compared);for(const [table,before] of Object.entries(proof))expect(Object.keys(before.rows).length,`${table}: nonempty seed`).toBeGreaterThan(0);
 const beforeSecurity=await security(admin);
 const oldRoutines=(await admin.query("SELECT proname,pg_get_functiondef(oid) definition,proacl::text,proowner,prosecdef,proconfig FROM pg_proc WHERE oid IN('app.guard_recovery_eligibility_v3()'::regprocedure,'app.require_recovery_eligibility_v3_effect()'::regprocedure) ORDER BY proname")).rows;
 await admin.query(await readFile(MIGRATION_URLS[position]!,'utf8'));await admin.query('INSERT INTO public.jobguard_schema_migration(migration_name)VALUES($1)',[names[position]]);
 expect(await proofDifferences(admin,proof)).toEqual({rows:[],types:[]});expect(await security(admin)).toEqual(beforeSecurity);
 const newRoutines=(await admin.query("SELECT proname,pg_get_functiondef(oid) definition,proacl::text,proowner,prosecdef,proconfig FROM pg_proc WHERE oid IN('app.guard_recovery_eligibility_v3()'::regprocedure,'app.require_recovery_eligibility_v3_effect()'::regprocedure) ORDER BY proname")).rows;
 for(const [index,old] of oldRoutines.entries()){expect(newRoutines[index].definition).not.toBe(old.definition);expect({...newRoutines[index],definition:old.definition}).toEqual(old);}
 // An upgrade proof proves ITS OWN migration only: install everything before N, snapshot, apply N alone, compare; then apply everything after N and require success twice. Compare existing rows by named pre-existing columns after all migrations. Never assert that later migrations add no column or replace no function; the fingerprinted-table guard owns 'may never gain a column'.
 await migrate(admin);await migrate(admin);expect(await proofDifferences(admin,proof)).toEqual({rows:[],types:[]});
 expect((await admin.query('SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name')).rows.map(r=>r.migration_name)).toEqual(names);
});
it('PF1B-A26 A26_FreshInstall',async()=>{
 const database=`pf1b_fresh_${randomUUID().replaceAll('-','')}`;await admin.query(`CREATE DATABASE ${database}`);const pool=new Pool({...admin.options,database});
 try{await migrate(pool);await migrate(pool);expect((await pool.query("SELECT count(*)::int n FROM pg_class WHERE oid IN('app.practice_supplier_credit_case_binding'::regclass,'app.practice_supplier_credit_review_payment'::regclass)")).rows[0].n).toBe(2);}finally{await closeTestPools(pool);} // Scratch databases retained; no destructive cleanup.
});
it('PF1B-A27 A27_UpgradeProofControls',async()=>{
 expect(proof).toBeDefined();
 for(const [table,before] of Object.entries(proof)) {
   const time=table==='app.audit_event'?'occurred_at':'created_at',count=Object.keys(before.rows).length;
   expect(count).toBeGreaterThan(0);
   const changed=await rolledBack(admin,async db=>{await db.query('SET LOCAL session_replication_role=replica');await db.query(`UPDATE ${table} SET ${time}=${time}+interval '1 microsecond'`);return proofDifferences(db,proof);});
   expect(changed.rows.filter(r=>r.startsWith(`${table} `)&&r.endsWith(': changed'))).toHaveLength(count);expect(changed.types).toEqual([]);
   if(table==='app.recovery_claim_line')expect(await rolledBack(admin,async db=>{await db.query(`ALTER TABLE ${table} ADD COLUMN pf1b_control text`);return proofDifferences(db,proof);})).toEqual({rows:[],types:[]});
 }
 const retyped=await rolledBack(admin,async db=>{await db.query('ALTER TABLE app.recovery_claim_line ALTER COLUMN net_pence TYPE numeric(20,0)');return proofDifferences(db,proof);});
 expect(retyped.rows).toEqual([]);expect(retyped.types).toEqual(['app.recovery_claim_line: net_pence bigint -> numeric(20,0)']);
 const removed=await rolledBack(admin,async db=>{await db.query('SET LOCAL session_replication_role=replica');await db.query('DELETE FROM app.recovery_claim_line');return proofDifferences(db,proof);});expect(removed.rows.length).toBe(Object.keys(proof['app.recovery_claim_line']!.rows).length);expect(removed.rows.every(r=>r.endsWith(': missing'))).toBe(true);
 expect(await rolledBack(admin,async db=>{expect(await scratchReplaceFunction(db,'app.guard_recovery_eligibility_v3()')).toBe(true);return proofDifferences(db,proof);})).toEqual({rows:[],types:[]});
 expect(await rolledBack(admin,async db=>{await db.query('SET LOCAL session_replication_role=replica');expect((await db.query("INSERT INTO app.recovery_claim_line(id,tenant_id,job_id,case_id,review_id,kind,debtor_type,net_pence) SELECT $1,tenant_id,job_id,case_id,review_id,'fixed_compensation',debtor_type,1 FROM app.recovery_claim_line LIMIT 1",[randomUUID()])).rowCount).toBe(1);return proofDifferences(db,proof);})).toEqual({rows:[],types:[]});
 expect(await proofDifferences(admin,proof)).toEqual({rows:[],types:[]});
});
