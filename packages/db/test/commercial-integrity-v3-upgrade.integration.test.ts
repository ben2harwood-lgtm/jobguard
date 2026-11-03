import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { freePort, closeTestPools } from "./pool-test-utils.js";
import { randomUUID,createHash } from "node:crypto";
import { beforeAll,afterAll,it,expect } from "vitest";
import { MIGRATION_URLS,migrate } from "../src/migrate.js";
import { actor,tenant,member,createIntegrityFixture,seedIntegrityJob,reviewFor,transaction,migrationUrl,type IntegrityFixture } from "./commercial-integrity-v3-fixtures.js";
const trimPoints=[9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279];
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
 const {withTenant}=await import("../src/tenant-context.js"),{readCommercialIntegrityV3OrdinaryFacts}=await import("../src/commercial-integrity-v3-sources.js");
 const {evaluateCommercialIntegrityV3,canonicalCommercialIntegritySnapshot}=await import("@jobguard/core");
 const snapshot=await withTenant(f.runtime,f.auth.context,async db=>{
  const times=(await db.$client.query(`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') now,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') start FROM app.job WHERE tenant_id=$1 AND id=$2`,[tenant,x.job])).rows[0];
  const ordinaryFacts=await readCommercialIntegrityV3OrdinaryFacts(db,{tenantId:tenant,jobId:x.job,digest:f.auth.digest,actor},times.now);
  const end=[times.start,...ordinaryFacts.activity.map(a=>a.source.recordedAt)].sort().at(-1)!;
  return evaluateCommercialIntegrityV3({version:"commercial-integrity-input.v3",environment:"synthetic_demo",tenantId:tenant,jobId:x.job,scopeId:f.auth.digest,evaluatedAt:times.now,profile:{version:"synthetic_fixture.persisted-activity.v3",ruleVersion:"persisted-activity.1",window:{start:times.start,end}},phase:"pre_lock",ordinaryFacts}).findings[0]!;
 });
 const review={version:"commercial-integrity-review.v3",commandId:randomUUID(),findingKey:snapshot.key,findingSnapshotHash:createHash('sha256').update(canonicalCommercialIntegritySnapshot(snapshot.sourceSnapshot)).digest('hex'),outcome:"dismissed_false_positive",explanation:"Historical 0330 source review."};
 const result=(await transaction(f.runtime,db=>db.query("SELECT app.ch6_record_integrity_review($1,$2,$3,$4::jsonb,$5::jsonb) result",[tenant,x.job,f.auth.digest,JSON.stringify(review),JSON.stringify(snapshot.sourceSnapshot)]))).rows[0].result;
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

it("0330 applies with check_function_bodies enabled on SQL_ASCII",async()=>{
 // Installation only: practice-session issuance uses UTF8 normalization and is unrelated to 0330.
 const dir=await mkdtemp(join(tmpdir(),"ch6-p-ascii-")),port=await freePort(59200,300),password=randomUUID();
 const pg=new EmbeddedPostgres({databaseDir:dir,port,user:"postgres",password,persistent:false,createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C","--encoding=SQL_ASCII"]});
 const admin=new Pool({host:"127.0.0.1",port,user:"postgres",password,database:"postgres",max:1});
 try {
  await pg.initialise();await pg.start();
  expect((await admin.query("SHOW server_encoding")).rows[0].server_encoding).toBe("SQL_ASCII");
  await admin.query("SET check_function_bodies=on");
  for(const url of MIGRATION_URLS.filter(url=>url.pathname<migrationUrl.pathname))await admin.query(await readFile(url,"utf8"));
  expect((await admin.query("SHOW check_function_bodies")).rows[0].check_function_bodies).toBe("on");
  await admin.query(await readFile(migrationUrl,"utf8"));
  expect((await admin.query("SELECT to_regprocedure('app.ch6_record_integrity_review(uuid,uuid,text,jsonb,jsonb)') IS NOT NULL installed")).rows[0].installed).toBe(true);
  const definition=(await admin.query("SELECT pg_get_functiondef('app.ch6_record_integrity_review(uuid,uuid,text,jsonb,jsonb)'::regprocedure) definition")).rows[0].definition as string;
  const trimExpression=definition.match(/btrim\(review->>'explanation',(convert_from\(decode\('[0-9a-f]+','hex'\),'UTF8'\))\)/)?.[1];
  expect(trimExpression).toBeDefined();
  // SQL_ASCII counts bytes; the driver decodes the returned UTF8 bytes into the actual trim characters.
  const characters=(await admin.query(`SELECT ${trimExpression} characters`)).rows[0].characters as string;
  expect([...characters].map(c=>c.codePointAt(0))).toEqual(trimPoints);
 }finally{await closeTestPools(admin);await pg.stop();await rm(dir,{recursive:true,force:true});}
},120000);

it("0330 retains exactly the ECMAScript trim characters on UTF8",async()=>{
 const sql=await readFile(migrationUrl,"utf8");
 const encoded=sql.match(/btrim\(review->>'explanation',convert_from\(decode\('([0-9a-f]+)','hex'\),'UTF8'\)\)/)?.[1];
 expect(encoded).toBeDefined();
 const characters=Buffer.from(encoded!,"hex").toString("utf8");
 const points=trimPoints;
 expect([...characters].map(c=>c.codePointAt(0))).toEqual(points);
 for(const point of [...points,133,6158,8203]){
  const input=String.fromCodePoint(point)+"explanation"+String.fromCodePoint(point);
  expect((await f.admin.query("SELECT btrim($1,convert_from(decode($2,'hex'),'UTF8')) value",[input,encoded])).rows[0].value).toBe(input.trim());
 }
});
