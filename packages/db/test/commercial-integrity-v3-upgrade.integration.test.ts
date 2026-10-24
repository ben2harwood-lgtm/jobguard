import { readFile } from "node:fs/promises";
import { randomUUID,createHash } from "node:crypto";
import { beforeAll,afterAll,it,expect } from "vitest";
import { MIGRATION_URLS,migrate } from "../src/migrate.js";
import { actor,tenant,member,createIntegrityFixture,seedIntegrityJob,reviewFor,transaction,migrationUrl,type IntegrityFixture } from "./commercial-integrity-v3-fixtures.js";
let f:IntegrityFixture;beforeAll(async()=>{f=await createIntegrityFixture(false);},120000);afterAll(async()=>{await f?.close();});
it("CI-P09 own-step upgrade preserves populated old receipt/history/column types; successors twice preserve new receipt",async()=>{
 const x=await seedIntegrityJob(f),old=randomUUID();
 await transaction(f.runtime,db=>db.query(`INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
 VALUES($1,$2,'commercial_integrity.review',$1::text,repeat('a',64),'succeeded','{"earlier":"v1"}',$3,clock_timestamp())`,[old,tenant,member]));
 const query="SELECT command_id,tenant_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,created_at,completed_at FROM app.command_receipt ORDER BY tenant_id,command_id";
 const history=(await f.admin.query(query)).rows;
 const columnQuery="SELECT table_name,column_name,data_type,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='app' ORDER BY table_name,ordinal_position";
 const types=(await f.admin.query(columnQuery)).rows;
 const artifacts=(await f.admin.query("SELECT id,source_hash,pdf_sha256,encode(pdf_bytes,'hex') bytes FROM app.customer_invoice ORDER BY id")).rows;
 await f.admin.query(await readFile(migrationUrl,"utf8"));
 expect((await f.admin.query(query)).rows).toEqual(history);expect((await f.admin.query(columnQuery)).rows).toEqual(types);
 expect((await f.admin.query("SELECT id,source_hash,pdf_sha256,encode(pdf_bytes,'hex') bytes FROM app.customer_invoice ORDER BY id")).rows).toEqual(artifacts);
 const review=await reviewFor(f,x.job),result=await f.repo.review(f.auth.context,actor,f.auth.digest,x.job,review);
 await f.admin.query("CREATE TABLE IF NOT EXISTS public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
 for(const url of MIGRATION_URLS.filter(url=>url.pathname<=migrationUrl.pathname))await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1) ON CONFLICT DO NOTHING",[url.pathname.split('/').at(-1)]);
 const receiptQuery="SELECT command_id,tenant_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,created_at,completed_at FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2";
 const receipt=(await f.admin.query(receiptQuery,[tenant,review.commandId])).rows;
 const auditHash=createHash('sha256').update(JSON.stringify((await f.admin.query("SELECT id,sequence,event_hash,payload_hash FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence",[tenant])).rows)).digest('hex');
 await migrate(f.admin);await migrate(f.admin);
 expect((await f.admin.query(receiptQuery,[tenant,review.commandId])).rows).toEqual(receipt);
 expect(await f.repo.review(f.auth.context,actor,f.auth.digest,x.job,review)).toEqual(result);
 expect(createHash('sha256').update(JSON.stringify((await f.admin.query("SELECT id,sequence,event_hash,payload_hash FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence",[tenant])).rows)).digest('hex')).toBe(auditHash);
});
