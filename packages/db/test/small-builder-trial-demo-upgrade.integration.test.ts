import { afterAll,beforeAll,expect,it } from "vitest";
import { startBeforeMigration,applyMigration } from "./contractor-practice-session-fixtures.js";
import type { Cluster } from "./extra-fixtures.js";
import type { WorkFixture } from "./job-work-state-fixtures.js";
import { meterCompany } from "./meter-persistence-fixtures.js";
import { proofBefore,proofDifferences } from "./upgrade-proof-utils.js";
import { migrate } from "../src/migrate.js";
const own="0394_small_builder_trial_demo.sql";let c:Cluster;
beforeAll(async()=>{c=await startBeforeMigration(own);},240000);afterAll(async()=>{await c?.close();});
it("0394 preserves populated predecessors and every installed routine; repeat migrations retain rows",async()=>{
 await meterCompany(c as unknown as WorkFixture);
 const before=await proofBefore(c.admin,["control_plane.tenant","identity.session","app.membership","app.job","app.trial_start","app.trial_identity_key_claim","app.subscription_agreement_revision","app.subscription_period","app.command_receipt","app.small_builder_demo_run","app.audit_event","app.journal"]);
 const routines=(await c.admin.query("SELECT oid,pg_get_functiondef(oid) definition,proacl::text FROM pg_proc WHERE pronamespace IN('app'::regnamespace,'identity'::regnamespace) AND prokind='f' ORDER BY oid")).rows;
 await applyMigration(c,own);expect(await proofDifferences(c.admin,before)).toEqual({rows:[],types:[]});
 expect((await c.admin.query("SELECT oid,pg_get_functiondef(oid) definition,proacl::text FROM pg_proc WHERE oid=ANY($1::oid[]) ORDER BY oid",[routines.map(r=>r.oid)])).rows).toEqual(routines);
 await migrate(c.admin);await migrate(c.admin);expect(await proofDifferences(c.admin,before)).toEqual({rows:[],types:[]});
},240000);
