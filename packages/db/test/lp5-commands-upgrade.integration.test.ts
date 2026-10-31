import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { migrate } from "../src/migrate.js";
import { UserCommandDispatcher } from "../src/commands.js";
import { jobDoorsActor, jobDoorsDatabase } from "./lp-job-doors-fixtures.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
// The exact historical dispatcher codec; Date has no enumerable fields. Preserve
// its stored digest only for pre-cutover rows, never for new checked claims.
const legacyCanonical = (v: unknown): string => v === null || typeof v !== "object" ? JSON.stringify(v) : Array.isArray(v)
 ? `[${v.map(legacyCanonical).join(",")}]`
 : `{${Object.entries(v as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>`${JSON.stringify(k)}:${legacyCanonical(x)}`).join(",")}}`;

it("LP-5a preserves historical receipts and refuses stale processing claims without timeout takeover", async () => {
 const db=await jobDoorsDatabase(true,"0535_lp5a_commands.sql");
 try {
  const actor=await jobDoorsActor(db.owner),context=testTenantContext(actor.tenant);
  const make=()=>({version:"command.v1",commandId:randomUUID(),commandType:"job.switch_live",semanticKey:randomUUID(),actorMembershipId:actor.member,
   subjectType:"job",subjectRef:randomUUID(),action:{actionType:"job.switch_live",recipient:null,contentHash:"a".repeat(64),aggregateRevision:1,
    amountPence:null,currency:null,policyVersion:"synthetic_demo_activation.v3",expiresAt:new Date("2099-01-01T00:00:00Z")}});
  const completed=make(),processing=make();
  for(const [command,status] of [[completed,"succeeded"],[processing,"processing"]] as const){
   const {commandId:_id,...input}=command,hash=createHash("sha256").update(legacyCanonical(input)).digest("hex");
   await db.owner.query(`INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id,result,completed_at)
    VALUES($1,$2,$3,$4,$5,$6::varchar,$7,$8,CASE WHEN $6::varchar='succeeded' THEN clock_timestamp() END)`,
    [actor.tenant,command.commandId,command.commandType,command.semanticKey,hash,status,actor.member,status==='succeeded'?{historical:true}:null]);
  }
  const before=(await db.owner.query("SELECT row_to_json(r)::text data FROM app.command_receipt r WHERE tenant_id=$1 ORDER BY command_id",[actor.tenant])).rows;
  await migrate(db.owner);await migrate(db.owner);
  const dispatcher=new UserCommandDispatcher(db.runtime),handler={mutate:async()=>{throw new Error("must not resume or repeat a historical effect");}};
  await expect(dispatcher.dispatch(context,completed,handler)).resolves.toEqual({historical:true});
  await expect(dispatcher.dispatch(context,processing,handler)).rejects.toMatchObject({code:"COMMAND_CONFLICT"});
  expect((await db.owner.query("SELECT row_to_json(r)::text data FROM app.command_receipt r WHERE tenant_id=$1 ORDER BY command_id",[actor.tenant])).rows).toEqual(before);
  expect((await db.owner.query("SELECT count(*)::int n FROM app.command_lifecycle_claim")).rows[0].n).toBe(0);
  await db.owner.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",[actor.tenant,actor.member]);
  await expect(dispatcher.dispatch(context,completed,handler)).rejects.toMatchObject({code:"FORBIDDEN"});
 } finally {await db.close();}
},300_000);
