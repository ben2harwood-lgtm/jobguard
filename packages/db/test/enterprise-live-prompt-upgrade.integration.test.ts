// Actual PostgreSQL own-step upgrade/rollback proofs. NOT RUN locally.
import { readFile } from "node:fs/promises";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { MIGRATION_URLS,migrate } from "../src/index.js";
import { cluster } from "./extra-fixtures.js";
let c:Awaited<ReturnType<typeof cluster>>;
const name="0191_enterprise_live_prompts.sql";
beforeAll(async()=>{
 c=await cluster(true);
 const applied=new Set((await c.admin.query("SELECT migration_name FROM public.jobguard_schema_migration")).rows.map(r=>r.migration_name));
 for(const url of MIGRATION_URLS){const n=url.pathname.split("/").at(-1)!;if(n>=name||applied.has(n))continue;await c.admin.query(await readFile(url,"utf8"));await c.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[n]);}
},120000);
afterAll(async()=>{await c?.close();});
describe.sequential("ENT-8A-P own-step upgrade",()=>{
 it("failed own-step upgrade rolls back all new objects and preserves prior rows and types",async()=>{
  const before=(await c.admin.query("SELECT row_to_json(o)::text row FROM app.extra_origin o ORDER BY tenant_id,variation_id")).rows;
  const definition=(await c.admin.query("SELECT pg_get_functiondef('app.ent4b_origin_provenance()'::regprocedure) definition")).rows;
  const sql=await readFile(new URL(`../migrations/${name}`,import.meta.url),"utf8");
  await expect(c.admin.query(sql.replace(/COMMIT;\s*$/u,"SELECT 1/0; COMMIT;"))).rejects.toBeDefined();await c.admin.query("ROLLBACK");
  expect((await c.admin.query("SELECT to_regclass('app.extra_prompt') relation")).rows).toEqual([{relation:null}]);
  expect((await c.admin.query("SELECT row_to_json(o)::text row FROM app.extra_origin o ORDER BY tenant_id,variation_id")).rows).toEqual(before);
  expect((await c.admin.query("SELECT pg_get_functiondef('app.ent4b_origin_provenance()'::regprocedure) definition")).rows).toEqual(definition);
 });
 it("own-step upgrade and later migrations twice preserve existing rows and column types",async()=>{
  const rows=(await c.admin.query("SELECT row_to_json(o)::text row FROM app.extra_origin o ORDER BY tenant_id,variation_id")).rows;
  const columns=(await c.admin.query("SELECT attname,atttypid,atttypmod FROM pg_attribute WHERE attrelid='app.extra_origin'::regclass AND attnum>0 ORDER BY attnum")).rows;
  await migrate(c.admin);await migrate(c.admin);
  expect((await c.admin.query("SELECT row_to_json(o)::text row FROM app.extra_origin o ORDER BY tenant_id,variation_id")).rows).toEqual(rows);
  expect((await c.admin.query("SELECT attname,atttypid,atttypmod FROM pg_attribute WHERE attrelid='app.extra_origin'::regclass AND attnum>0 ORDER BY attnum")).rows).toEqual(columns);
  expect((await c.admin.query("SELECT count(*)::int n FROM public.jobguard_schema_migration WHERE migration_name=$1",[name])).rows).toEqual([{n:1}]);
 },120000);
 it("forward fix can disable checked entrypoints without deleting immutable history",async()=>{
  const client=await c.admin.connect();
  try{await client.query("BEGIN");const before=(await client.query("SELECT count(*)::int n FROM app.extra_prompt")).rows;
   await client.query("REVOKE EXECUTE ON FUNCTION app.lp_command(uuid,jsonb,bytea),app.lp_visit_evaluate(uuid,uuid,uuid) FROM jobguard_runtime");
   expect((await client.query("SELECT has_function_privilege('jobguard_runtime','app.lp_command(uuid,jsonb,bytea)','EXECUTE') allowed")).rows).toEqual([{allowed:false}]);
   expect((await client.query("SELECT count(*)::int n FROM app.extra_prompt")).rows).toEqual(before);
  }finally{await client.query("ROLLBACK");client.release();}
 });
});
