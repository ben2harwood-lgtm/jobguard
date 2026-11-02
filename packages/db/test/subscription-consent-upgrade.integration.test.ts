import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it } from "vitest";
import { MIGRATION_URLS, migrate } from "../src/migrate.js";
import { createWorkFixture, closeWorkFixture, type WorkFixture } from "./job-work-state-fixtures.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { command, meterCompany, readSubscription, terms } from "./subscription-persistence-fixtures.js";
let f: WorkFixture;
beforeAll(async()=>{f=await createWorkFixture(false);},60000);
afterAll(async()=>closeWorkFixture(f));
it("0336 preserves legacy approvals and replays while new approvals bind the displayed consent",async()=>{
 const own=MIGRATION_URLS.findIndex(url=>url.pathname.endsWith("0336_subscription_consent_text.sql"));
 expect(own).toBeGreaterThan(0);
 await f.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
 for(const url of MIGRATION_URLS.slice(0,own)) {
  await f.admin.query(await readFile(url,"utf8"));
  await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[url.pathname.split("/").at(-1)]);
 }
 await installLegacySyntheticPartyFixtures(f.admin);
 const a=await meterCompany(f),b=await meterCompany(f);
 const legacy=(company:typeof a)=>{
  const {version:_version,kind:_kind,contentHash:_hash,...selection}=terms(company,"Solo");
  const bound={tenantId:company.tenantId,...selection};
  const contentHash=createHash("sha256").update(JSON.stringify(Object.fromEntries(Object.entries(bound).sort(([x],[y])=>x<y?-1:x>y?1:0)))).digest("hex");
  return {version:"subscription-command.v1",kind:"accept",...selection,contentHash};
 };
 const legacyCommand=legacy(a),id=randomUUID();
 const accepted=await command(f,a,legacyCommand,id),before=await readSubscription(f,a);
 const metadata=async()=>(await f.admin.query("SELECT proowner,proacl::text,prosecdef,proconfig FROM pg_proc WHERE oid='app.mon2_command(uuid,text,uuid,jsonb)'::regprocedure")).rows;
 const privileges=await metadata();
 await migrate(f.admin);await migrate(f.admin);
 expect(await metadata()).toEqual(privileges);
 expect(await command(f,a,legacyCommand,id)).toEqual(accepted);
 expect(await readSubscription(f,a)).toEqual(before);
 await expect(command(f,b,legacy(b))).rejects.toThrow("SUBSCRIPTION_CONTENT_MISMATCH");
 const current=terms(b,"Solo"),freshId=randomUUID();
 const fresh=await command(f,b,current,freshId);
 expect(await command(f,b,current,freshId)).toEqual(fresh);
 expect((await readSubscription(f,b)).agreements).toHaveLength(1);
 await expect(command(f,b,{...current,plan:"Builder"},freshId)).rejects.toThrow("COMMAND_CONFLICT");
 await expect(command(f,a,current)).rejects.toThrow();
});
