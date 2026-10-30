import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it } from "vitest";
import { jobDoorsDatabase, transaction } from "./lp-job-doors-fixtures.js";
import { prepareActivationFixtureV3, DEMO_TENANT_ID as T, DEMO_MEMBERSHIP_ID as M, DEMO_ACCOUNT_ID as A, DEMO_IDENTITY_USER_ID as U } from "../src/demo-seed.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { migrate } from "../src/migrate.js";
import { proofBefore, proofDifferences, rolledBack } from "./upgrade-proof-utils.js";
const own="0382_lp3_activation_acceptance.sql",context=testTenantContext(T),environment=process.env.JOBGUARD_ENV;
let db:Awaited<ReturnType<typeof jobDoorsDatabase>>;
beforeAll(async()=>{
  process.env.JOBGUARD_ENV="synthetic_demo";db=await jobDoorsDatabase(true,own);
  await db.owner.query("INSERT INTO control_plane.tenant(id) VALUES($1)",[T]);
  await db.owner.query("INSERT INTO identity.identity_user(id) VALUES($1)",[U]);
  await db.owner.query("INSERT INTO app.account(tenant_id,id,name) VALUES($1,$2,'Fictional historical LP3 builder')",[T,A]);
  await db.owner.query("INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')",[T,M,A,U]);
},300_000);
afterAll(async()=>{await db?.close();if(environment===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=environment;});
it("0382 alone preserves populated v1 commercial history, then repeat migrate succeeds",async()=>{
  const job=await prepareActivationFixtureV3(db.owner,context,"Fictional before LP3",100100);
  const d=(await db.owner.query("SELECT j.revision,d.* FROM app.job j JOIN app.quote_document_version d ON(d.tenant_id,d.id)=(j.tenant_id,j.accepted_quote_version_id) WHERE j.tenant_id=$1 AND j.id=$2",[T,job])).rows[0];
  await transaction(db.owner,T,c=>c.query(`SELECT app.switch_job_live($1,$2,$3,$4,$5,$6,$7,$8,$9,100100,1502,'synthetic_demo','synthetic_demo_illustrative.v1','reference_fee_policy_v1',$10,clock_timestamp())`,[T,randomUUID(),randomUUID(),randomUUID(),job,d.id,d.document_version,d.content_hash,d.revision,M]));
  const tables=["app.job","app.quote_acceptance","app.acceptance_event","app.job_activation","app.cap_snapshot","app.synthetic_obligation"];
  const proof=await proofBefore(db.owner,tables);
  for(const [table,value] of Object.entries(proof))expect(Object.keys(value.rows).length,table).toBeGreaterThan(0);
  // Own migration, by itself, before checking the complete discovered registry.
  await db.owner.query(await readFile(new URL(`../migrations/${own}`,import.meta.url),"utf8"));
  await db.owner.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[own]);
  expect(await proofDifferences(db.owner,proof)).toEqual({rows:[],types:[]});
  await rolledBack(db.owner,async c=>{
    await c.query("SET LOCAL session_replication_role=replica");
    await c.query("UPDATE app.job_activation SET activated_at=activated_at+interval '1 microsecond' WHERE tenant_id=$1",[T]);
    expect((await proofDifferences(c,proof)).rows.length).toBeGreaterThan(0);
  });
  await migrate(db.owner);await migrate(db.owner);
  expect(await proofDifferences(db.owner,proof)).toEqual({rows:[],types:[]});
},120_000);
