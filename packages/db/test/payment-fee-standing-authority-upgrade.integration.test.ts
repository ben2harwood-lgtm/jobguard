// CI only: populate the exact predecessor, then apply only 0614 and compare history.
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { beforeAll,afterAll,expect,it } from "vitest";
import { migrate,MIGRATION_URLS } from "../src/migrate.js";
import { PaymentFeeRepository } from "../src/payment-fee-repository.js";
import { SimulationFeeCollectionRepository } from "../src/simulation-fee-collection-repository.js";
import { SimulationFeeStatementRepository } from "../src/simulation-fee-statement-repository.js";
import { createFinalCheckFixture,closeFinalCheckFixture,type FinalCheckFixture } from "./final-check-fixture.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { catchFeeFixture } from "./success-fee-catch-fixture.js";
import { proofBefore,proofDifferences } from "./upgrade-proof-utils.js";
let f:FinalCheckFixture;
beforeAll(async()=>{f=await createFinalCheckFixture(false);},120000);
afterAll(async()=>{if(f)await closeFinalCheckFixture(f);});
it("0614 preserves existing approved statements, reservations, receipts and ledger rows; no historical consent is inferred",async()=>{
 const own=MIGRATION_URLS.findIndex(u=>u.pathname.endsWith("/0614_payment_fee_standing_authority.sql"));expect(own).toBeGreaterThan(0);
 await f.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
 for(const url of MIGRATION_URLS.slice(0,own)){
  const name=url.pathname.split("/").at(-1)!,sql=await readFile(url,"utf8");
  await f.admin.query(name.startsWith("0095_")?sql.replace("BEGIN;","BEGIN; SELECT set_config('app.deployment_mode','details_needed',true);"):sql);
  await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[name]);
 }
 for(const [pool,role] of [[f.runtime,"jobguard_runtime"],[f.shadow,"jobguard_shadow"]] as const){
  const login=(await pool.query("SELECT current_user name")).rows[0].name as string;
  await f.admin.query(`GRANT ${role} TO "${login.replaceAll('"','""')}"`);
 }
 await installLegacySyntheticPartyFixtures(f.admin);
 const x=await catchFeeFixture(f),review=await x.execute();
 await x.execute({version:"success-fee-command.v1",action:"approve",commandId:randomUUID(),expectedPostingRevision:0,reviewId:review.reviewId,statementHash:review.statementHash});
 const fees=new PaymentFeeRepository(f.runtime),receipt=await fees.command(x.context,x.jobId,x.auth.digest,{version:"payment-fee-command.v1",action:"prepare",commandId:randomUUID(),paymentId:x.paymentId});
 await fees.command(x.context,x.jobId,x.auth.digest,{version:"payment-fee-command.v1",action:"approve",commandId:randomUUID(),statementId:receipt.statementId,statementHash:receipt.statementHash});
 const statement=await new SimulationFeeStatementRepository(f.runtime).command(x.context,x.jobId,x.auth.digest,{version:"simulation-fee-statement-command.v1",action:"issue",commandId:randomUUID()});
 const collection=new SimulationFeeCollectionRepository(f.runtime),p={version:"simulation-fee-collection-command.v1",action:"collect",commandId:randomUUID(),statementId:statement.statementId,statementHash:statement.documentHash,amountPence:8000};
 const attempt=await collection.command(x.context,x.jobId,x.auth.digest,p);
 const tables=(await f.admin.query("SELECT schemaname||'.'||tablename name FROM pg_tables WHERE schemaname IN('app','identity','control_plane','audit_control') ORDER BY 1")).rows.map(r=>r.name as string);
 const before=await proofBefore(f.admin,tables);
 await f.admin.query(await readFile(MIGRATION_URLS[own]!,"utf8"));
 await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES('0614_payment_fee_standing_authority.sql')");
 expect(await proofDifferences(f.admin,before)).toEqual({rows:[],types:[]});
 expect((await fees.read(x.context,x.jobId,x.auth.digest)).standingAuthority).toBeNull();
 expect((await fees.read(x.context,x.jobId,x.auth.digest)).statements[0]).toEqual({statement:receipt,state:"approved"});
 expect(await collection.command(x.context,x.jobId,x.auth.digest,p)).toEqual({...attempt,replayed:true});
 await migrate(f.admin);await migrate(f.admin);
 expect(await proofDifferences(f.admin,before)).toEqual({rows:[],types:[]});
 expect((await f.admin.query("SELECT count(*)::int n FROM app.payment_fee_authority")).rows).toEqual([{n:0}]);
},120000);
