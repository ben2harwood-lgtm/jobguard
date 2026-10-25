import { readFile } from "node:fs/promises";
import { randomUUID,createHash } from "node:crypto";
import { beforeAll,afterAll,it,expect } from "vitest";
import { MIGRATION_URLS,migrate } from "../src/migrate.js";
import { actor,tenant,member,createIntegrityFixture,seedIntegrityJob,reviewFor,transaction,migrationUrl,type IntegrityFixture } from "./commercial-integrity-v3-fixtures.js";
let f:IntegrityFixture;beforeAll(async()=>{f=await createIntegrityFixture(false);},120000);afterAll(async()=>{await f?.close();});
it("CI-P09 own-step upgrade preserves populated old receipt/history/column types; successors twice preserve new receipt",async()=>{
 const x=await seedIntegrityJob(f),old=randomUUID();
 await transaction(f.runtime,db=>db.query(`INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
 VALUES($1,$2,'commercial_integrity.review',$1::uuid::text,repeat('a',64),'succeeded','{"earlier":"v1"}',$3,clock_timestamp())`,[old,tenant,member]));
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

it("0227 applies with check_function_bodies enabled on SQL_ASCII",async()=>{
 const ascii=await createIntegrityFixture(false,"SQL_ASCII");
 try {
  expect((await ascii.admin.query("SHOW server_encoding")).rows[0].server_encoding).toBe("SQL_ASCII");
  await ascii.admin.query("SET check_function_bodies=on");
  await ascii.admin.query(await readFile(migrationUrl,"utf8"));
  expect((await ascii.admin.query("SELECT to_regprocedure('app.ch6_record_integrity_review(uuid,uuid,text,jsonb,jsonb)') IS NOT NULL installed")).rows[0].installed).toBe(true);
 }finally{await ascii.close();}
},120000);

it("0227 retains exactly the ECMAScript trim characters on UTF8",async()=>{
 const sql=await readFile(migrationUrl,"utf8");
 const encoded=sql.match(/btrim\(review->>'explanation',convert_from\(decode\('([0-9a-f]+)','hex'\),'UTF8'\)\)/)?.[1];
 expect(encoded).toBeDefined();
 const characters=Buffer.from(encoded!,"hex").toString("utf8");
 const points=[9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279];
 expect([...characters].map(c=>c.codePointAt(0))).toEqual(points);
 for(const point of [...points,133,6158,8203]){
  const input=String.fromCodePoint(point)+"explanation"+String.fromCodePoint(point);
  expect((await f.admin.query("SELECT btrim($1,convert_from(decode($2,'hex'),'UTF8')) value",[input,encoded])).rows[0].value).toBe(input.trim());
 }
});
