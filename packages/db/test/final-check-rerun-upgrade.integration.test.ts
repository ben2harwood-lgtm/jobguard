import { verifiedTenantContextForQueuedJob } from "../src/tenant-context.js";
import {randomUUID} from 'node:crypto';
import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import {migrate} from '../src/migrate.js';
import {FinalCheckRepository} from '../src/final-check-repository.js';
import {FinalCheckCompletionRepository} from '../src/shadow-detection-repository.js';
import {createFinalCheckFixture,closeFinalCheckFixture,seedFinalCheckJob,insertFinalCheckEvidence,type FinalCheckFixture} from './final-check-fixture.js';
import {installLegacySyntheticPartyFixtures} from './pool-test-utils.js';
const own='0698_final_check_post_invoice_rerun.sql';let f:FinalCheckFixture;
beforeAll(async()=>{vi.stubEnv('JOBGUARD_ENV','synthetic_demo');f=await createFinalCheckFixture(false);
 await f.admin.query('CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())');
 // Install the exact predecessor schema with the ordinary migration runner.
 await f.admin.query('INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)',[own]);await migrate(f.admin);
 await f.admin.query('DELETE FROM public.jobguard_schema_migration WHERE migration_name=$1',[own]);
 await installLegacySyntheticPartyFixtures(f.admin);
 await f.admin.query('GRANT jobguard_runtime TO '+f.runtime.options.user);await f.admin.query('GRANT jobguard_shadow TO '+f.shadow.options.user);
},60000);
afterAll(async()=>{await closeFinalCheckFixture(f);vi.unstubAllEnvs();});
it('backfills populated history as attempt 1, preserves every prior column byte and all grants, and replays harmlessly',async()=>{
 const a=await seedFinalCheckJob(f);await insertFinalCheckEvidence(f,a);await a.lock();const repo=new FinalCheckRepository(f.shadow),m=await repo.begin(verifiedTenantContextForQueuedJob(a.tenantId),a.jobId),s=m.sources[0]!;
 await repo.record(verifiedTenantContextForQueuedJob(a.tenantId),a.jobId,m.id,s.id,randomUUID(),{version:'final-check.source-result.v1',inputHash:s.inputHash,status:'zero_result',failureCode:null,signalIds:[]});
 const r=await repo.reconcile(verifiedTenantContextForQueuedJob(a.tenantId),a.jobId,m.id,[]) as {runId:string};await new FinalCheckCompletionRepository(f.shadow).publish(verifiedTenantContextForQueuedJob(a.tenantId),{version:'final-check-publication.v1',jobId:a.jobId,runId:r.runId,checkId:m.id});
 const tables=['final_check_manifest','final_check_manifest_source','final_check_processing_source','final_check_source_attempt','final_check_run_binding','shadow_final_check_source_attempt','shadow_final_check_run_binding','shadow_final_check_completion','final_account_lock_check'];
 const cols:Record<string,string[]>={},before:Record<string,unknown>={};
 const rows=async(t:string)=>(await f.admin.query(`SELECT row_to_json(x)::text row FROM (SELECT ${cols[t]!.map(c=>'"'+c+'"').join(',')} FROM app.${t} WHERE tenant_id=$1 AND job_id=$2) x ORDER BY row_to_json(x)::text`,[a.tenantId,a.jobId])).rows;
 for(const t of tables){cols[t]=(await f.admin.query('SELECT attname FROM pg_attribute WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum',['app.'+t])).rows.map(x=>x.attname);before[t]=await rows(t);expect(before[t]).not.toEqual([]);}
 const grants=async()=>(await f.admin.query("SELECT n.nspname,c.relname,c.relacl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE (n.nspname='app' AND c.relname=ANY($1)) OR (n.nspname='infrastructure' AND c.relname='final_check_request') ORDER BY 1,2",[tables])).rows;
 const acl=await grants();await migrate(f.admin);await migrate(f.admin);expect(await grants()).toEqual(acl);
 for(const t of tables)expect(await rows(t),t).toEqual(before[t]);
 expect((await f.admin.query('SELECT attempt,predecessor_manifest_id,withdrawn_predecessor_source_ids FROM app.final_check_manifest WHERE id=$1',[m.id])).rows).toEqual([{attempt:1,predecessor_manifest_id:null,withdrawn_predecessor_source_ids:[]}]);
 expect((await f.admin.query('SELECT attempt,manifest_id FROM infrastructure.final_check_request WHERE job_id=$1',[a.jobId])).rows).toEqual([{attempt:1,manifest_id:m.id}]);
},60000);
