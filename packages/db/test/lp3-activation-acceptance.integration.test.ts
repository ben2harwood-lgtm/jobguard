import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SwitchJobLiveMutation, RecordSimulatedSettlementMutation, SwitchJobLiveV3Mutation } from "../src/activation-repository.js";
import { RecordBuilderAcceptanceMutation, RecordQuoteDispositionMutation } from "../src/acceptance-repository.js";
import { UserCommandDispatcher, type ConsequentialCommand } from "../src/commands.js";
import { lp3MutationHash } from "../src/lp3-operation.js";
import { prepareActivationFixtureV3, DEMO_TENANT_ID as T, DEMO_MEMBERSHIP_ID as M, DEMO_ACCOUNT_ID as A, DEMO_IDENTITY_USER_ID as U } from "../src/demo-seed.js";
import { jobDoorsDatabase, transaction } from "./lp-job-doors-fixtures.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

const context=testTenantContext(T), at=new Date("2026-10-01T12:00:00.123Z");
let db:Awaited<ReturnType<typeof jobDoorsDatabase>>;
const originalEnvironment=process.env.JOBGUARD_ENV;
beforeAll(async()=>{
  process.env.JOBGUARD_ENV="synthetic_demo";
  db=await jobDoorsDatabase(true);
  await db.owner.query("INSERT INTO control_plane.tenant(id) VALUES($1)",[T]);
  await db.owner.query("INSERT INTO identity.identity_user(id) VALUES($1)",[U]);
  await db.owner.query("INSERT INTO app.account(tenant_id,id,name) VALUES($1,$2,'Fictional LP3 builder')",[T,A]);
  await db.owner.query("INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')",[T,M,A,U]);
},300_000);
afterAll(async()=>{await db?.close();if(originalEnvironment===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=originalEnvironment;});
async function fixture(){
  const job=await prepareActivationFixtureV3(db.owner,context,`Fictional LP3 ${randomUUID()}`,100100);
  const d=(await db.owner.query(`SELECT j.revision,d.id,d.document_version,d.content_hash FROM app.job j
    JOIN app.quote_document_version d ON(d.tenant_id,d.job_id,d.id)=(j.tenant_id,j.id,j.accepted_quote_version_id) WHERE j.tenant_id=$1 AND j.id=$2`,[T,job])).rows[0];
  const input={version:"switch-live.v1",activationId:randomUUID(),capSnapshotId:randomUUID(),syntheticObligationId:randomUUID(),jobId:job,
    acceptedDocumentId:d.id,acceptedDocumentVersion:d.document_version,acceptedDocumentHash:d.content_hash,expectedJobRevision:d.revision,
    acceptedNetValuePence:100100,recoveryCapPence:1502,mode:"synthetic_demo",activationTermsVersion:"synthetic_demo_illustrative.v1",feePolicyVersion:"reference_fee_policy_v1",activatedAt:at};
  const command:ConsequentialCommand={version:"command.v1",commandId:randomUUID(),commandType:"job.switch_live",semanticKey:`lp3:${job}`,actorMembershipId:M,
    subjectType:"job",subjectRef:job,action:{actionType:"job.switch_live",recipient:null,contentHash:d.content_hash,aggregateRevision:d.document_version,
      amountPence:7900,currency:"GBP",policyVersion:"synthetic_demo_illustrative.v1",expiresAt:new Date("2099-01-01")}};
  return {job,d,input,command,mutation:new SwitchJobLiveMutation(T,"synthetic_demo",input)};
}
async function counts(){
  const result:Record<string,number>={};
  for(const table of ["job_activation","cap_snapshot","synthetic_obligation","simulated_settlement_event","activation_acceptance_operation_use","command_receipt","action_authorization","audit_event","journal"])
    result[table]=(await db.owner.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1`,[T])).rows[0].n;
  return result;
}
function args(f:Awaited<ReturnType<typeof fixture>>,c:ConsequentialCommand):unknown[]{const i=f.input;return[T,i.activationId,i.capSnapshotId,i.syntheticObligationId,i.jobId,i.acceptedDocumentId,i.acceptedDocumentVersion,i.acceptedDocumentHash,i.expectedJobRevision,i.acceptedNetValuePence,i.recoveryCapPence,i.mode,i.activationTermsVersion,i.feePolicyVersion,M,i.activatedAt,c.commandId,c.authorizationId];}
const call="SELECT * FROM app.switch_job_live($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)";

describe("LP-3 actual runtime attack and compatibility checks",()=>{
  it.each(["tenant","actor","job","command","authorization","document","version","hash","price","cap","terms","payload","revision","revoked","expired","receipt-status","authorization-price","authorization-policy"])("refuses changed %s atomically",async attack=>{
    const f=await fixture(),before=await counts();
    await expect(new UserCommandDispatcher(db.runtime).dispatch(context,{...f.command,action:{...f.command.action,expiresAt:attack==="expired"?new Date(Date.now()+100):f.command.action.expiresAt,amountPence:attack==="authorization-price"?7901:7900,policyVersion:attack==="authorization-policy"?"wrong-terms":f.command.action.policyVersion}},{
      inputHash:c=>f.mutation.inputHash(c),
      async mutate(database,c){
        const values=args(f,c);
        const indexes:Record<string,number>={tenant:0,actor:14,job:4,command:16,authorization:17,document:5};
        if(attack in indexes)values[indexes[attack]!]=randomUUID();
        if(attack==="version")values[6]=2;
        if(attack==="hash")values[7]="b".repeat(64);
        if(attack==="price")values[9]=100101;
        if(attack==="cap")values[10]=1503;
        if(attack==="terms")values[12]="pilot_no_charge.v1";
        if(attack==="payload")values[15]=new Date(at.getTime()+1);
        if(attack==="revision")values[8]=999;
        if(attack==="revoked")await database.$client.query("UPDATE app.action_authorization SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",[T,c.authorizationId]);
        if(attack==="expired")await database.$client.query("SELECT pg_sleep(0.2)");
        if(attack==="receipt-status")await database.$client.query("UPDATE app.command_receipt SET status='succeeded',result='{}',completed_at=clock_timestamp() WHERE tenant_id=$1 AND command_id=$2",[T,c.commandId]);
        return (await database.$client.query(call,values)).rows[0];
      },
    // Expiry is checked again inside the locked operation, using wall clock.
    })).rejects.toBeTruthy();
    expect(await counts()).toEqual(before);
  });
  it("races duplicate v1 commands, rejects changed payload and consumes approval once",async()=>{
    const f=await fixture(),dispatcher=new UserCommandDispatcher(db.runtime);
    const results=await Promise.all([dispatcher.dispatch(context,f.command,f.mutation),dispatcher.dispatch(context,f.command,f.mutation)]);
    expect(results[0]).toEqual(results[1]);
    expect((await db.owner.query("SELECT count(*)::int n FROM app.activation_acceptance_operation_use WHERE tenant_id=$1 AND command_id=$2",[T,f.command.commandId])).rows[0].n).toBe(1);
    await expect(dispatcher.dispatch(context,f.command,new SwitchJobLiveMutation(T,"synthetic_demo",{...f.input,activatedAt:new Date(at.getTime()+1)}))).rejects.toMatchObject({code:"COMMAND_CONFLICT"});
    const settlement={version:"simulated-settlement.v1",settlementId:randomUUID(),obligationId:f.input.syntheticObligationId,providerEventId:randomUUID(),amountPence:7900,currency:"GBP",simulatedAt:at};
    const command:ConsequentialCommand={...f.command,commandId:randomUUID(),semanticKey:`settle:${settlement.obligationId}`,commandType:"synthetic.settlement",subjectType:"synthetic_obligation",subjectRef:settlement.obligationId,
      action:{...f.command.action,actionType:"synthetic_obligation.simulate_settlement",policyVersion:"synthetic_demo_illustrative.v1"}};
    const mutation=new RecordSimulatedSettlementMutation(T,"synthetic_demo",settlement);
    await dispatcher.dispatch(context,command,mutation);
    await expect(dispatcher.dispatch(context,{...command,commandId:randomUUID(),semanticKey:`second:${randomUUID()}`},new RecordSimulatedSettlementMutation(T,"synthetic_demo",{...settlement,settlementId:randomUUID(),providerEventId:randomUUID()}))).rejects.toMatchObject({code:"22023"});
    expect((await db.owner.query("SELECT count(*)::int n FROM app.simulated_settlement_event WHERE tenant_id=$1 AND obligation_id=$2",[T,settlement.obligationId])).rows[0].n).toBe(1);
  });
  it("rejects a consumed authorization even while its receipt remains processing",async()=>{
    const f=await fixture();
    await new UserCommandDispatcher(db.runtime).dispatch(context,f.command,{
      inputHash:c=>f.mutation.inputHash(c),
      async mutate(database,c){
        const result=await f.mutation.mutate(database,c);
        await database.$client.query("SAVEPOINT replay");
        await expect(database.$client.query(call,args(f,c))).rejects.toMatchObject({code:"42501"});
        await database.$client.query("ROLLBACK TO SAVEPOINT replay");return result;
      },
    });
  });
  it("retains cancellation/reacceptance rules and refuses reversal after activation",async()=>{
    const f=await fixture(),dispatcher=new UserCommandDispatcher(db.runtime);
    const disposition={version:"quote-disposition.v1",eventId:randomUUID(),jobId:f.job,documentId:f.d.id,documentVersion:f.d.document_version,documentHash:f.d.content_hash,expectedJobRevision:f.d.revision,kind:"acceptance_cancelled",occurredAt:at};
    const cancel:ConsequentialCommand={...f.command,commandId:randomUUID(),semanticKey:`cancel:${f.job}`,commandType:"quote.acceptance_cancelled",subjectType:"quote_document",subjectRef:f.d.id,
      action:{...f.command.action,actionType:"quote.acceptance_cancelled",amountPence:null,currency:null,policyVersion:"quote-disposition.v1"}};
    await dispatcher.dispatch(context,cancel,new RecordQuoteDispositionMutation(T,disposition));
    const input={version:"quote-acceptance.v1",acceptanceId:randomUUID(),jobId:f.job,documentId:f.d.id,documentVersion:f.d.document_version,documentHash:f.d.content_hash,expectedJobRevision:f.d.revision+1,acceptedTotalPence:120120,statedCustomerName:"Fictional 🧱 Café",statedMethod:"email",acceptedAt:at,evidenceId:null};
    const accept:ConsequentialCommand={...cancel,commandId:randomUUID(),semanticKey:`accept:${f.job}`,commandType:"quote.acceptance.attest",action:{...cancel.action,actionType:"quote.acceptance.attest",recipient:input.statedCustomerName,amountPence:120120,currency:"GBP",policyVersion:"builder-attestation.v1"}};
    await dispatcher.dispatch(context,accept,new RecordBuilderAcceptanceMutation(T,input));
    await dispatcher.dispatch(context,{...f.command,commandId:randomUUID()},new SwitchJobLiveMutation(T,"synthetic_demo",{...f.input,expectedJobRevision:f.d.revision+2}));
    const before=await counts();
    await expect(dispatcher.dispatch(context,{...cancel,commandId:randomUUID(),semanticKey:`late:${f.job}`},new RecordQuoteDispositionMutation(T,{...disposition,eventId:randomUUID(),expectedJobRevision:f.d.revision+3}))).rejects.toMatchObject({code:"22023"});
    expect(await counts()).toEqual(before);
  });
  it("expires after a job lock wait, including inside a long transaction",async()=>{
    const f=await fixture(),lock=await db.owner.connect();
    await lock.query("BEGIN");await lock.query("SELECT id FROM app.job WHERE tenant_id=$1 AND id=$2 FOR UPDATE",[T,f.job]);
    let waiting=false;
    const pending=new UserCommandDispatcher(db.runtime).dispatch(context,{...f.command,action:{...f.command.action,expiresAt:new Date(Date.now()+500)}},{
      inputHash:c=>f.mutation.inputHash(c),
      async mutate(database,c){waiting=true;return f.mutation.mutate(database,c);},
    });
    // Attach the rejection observer before releasing the blocking lock.
    const refused=expect(pending).rejects.toMatchObject({code:"42501"});
    try{for(let n=0;n<100&&!waiting;n++)await new Promise(resolve=>setTimeout(resolve,5));
      expect(waiting).toBe(true);await lock.query("SELECT pg_sleep(0.6)");
    }finally{await lock.query("ROLLBACK");lock.release();}
    await refused;
    const before=await counts();
    await expect(new UserCommandDispatcher(db.runtime).dispatch(context,{...f.command,action:{...f.command.action,expiresAt:new Date(Date.now()+100)}},{
      inputHash:c=>f.mutation.inputHash(c),async mutate(database,c){await database.$client.query("SELECT pg_sleep(0.2)");return f.mutation.mutate(database,c);},
    })).rejects.toMatchObject({code:"42501"});
    expect(await counts()).toEqual(before);
  });
  it("rechecks active membership before returning a successful receipt replay",async()=>{
    const f=await fixture(),dispatcher=new UserCommandDispatcher(db.runtime);
    await dispatcher.dispatch(context,f.command,f.mutation);
    await db.owner.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",[T,M]);
    const before=await counts();
    try{await expect(dispatcher.dispatch(context,f.command,f.mutation)).rejects.toMatchObject({code:"FORBIDDEN"});}
    finally{await db.owner.query("UPDATE app.membership SET revoked_at=NULL WHERE tenant_id=$1 AND id=$2",[T,M]);}
    expect(await counts()).toEqual(before);
  });
  it("refuses locked-bill references and alien evidence without changing commercial history",async()=>{
    const f=await fixture();
    // Owner-connected fault fixture: an existing final lock is never made mutable.
    await transaction(db.owner,T,async c=>{
      await c.query("SET LOCAL session_replication_role=replica");
      await c.query(`INSERT INTO app.final_account_lock(tenant_id,job_id,id,final_account_revision_id,baseline_quote_version_id,
        capture_register_hash,line_set_hash,scope_disposition_hash,snapshot_digest,snapshot,declaration,declaration_version,
        onboarding_terms_version,locking_membership_id,locked_at,command_id,audit_event_id)
        VALUES($1,$2,$3,$4,$5,$6,$6,$6,$6,'{}','I''ve reviewed the work and extras on this job and this is my complete final account.',
        'final_account_declaration.v1','synthetic_final_check_terms.v1',$7,clock_timestamp(),$8,$9)`,
        [T,f.job,randomUUID(),randomUUID(),f.d.id,"a".repeat(64),M,randomUUID(),randomUUID()]);
    });
    const before=await counts(),locked=(await db.owner.query("SELECT row_to_json(t)::text value FROM app.final_account_lock t WHERE tenant_id=$1 AND job_id=$2",[T,f.job])).rows;
    const input={version:"quote-disposition.v1",eventId:randomUUID(),jobId:f.job,documentId:f.d.id,documentVersion:f.d.document_version,documentHash:f.d.content_hash,expectedJobRevision:f.d.revision,kind:"acceptance_cancelled",occurredAt:at};
    const command:ConsequentialCommand={...f.command,commandType:"quote.acceptance_cancelled",subjectType:"quote_document",subjectRef:f.d.id,
      action:{...f.command.action,actionType:"quote.acceptance_cancelled",amountPence:null,currency:null,policyVersion:"quote-disposition.v1"}};
    await expect(new UserCommandDispatcher(db.runtime).dispatch(context,command,new RecordQuoteDispositionMutation(T,input))).rejects.toMatchObject({code:"22023",message:"final account locked"});
    expect((await db.owner.query("SELECT row_to_json(t)::text value FROM app.final_account_lock t WHERE tenant_id=$1 AND job_id=$2",[T,f.job])).rows).toEqual(locked);
    const acceptance={version:"quote-acceptance.v1",acceptanceId:randomUUID(),jobId:f.job,documentId:f.d.id,documentVersion:f.d.document_version,documentHash:f.d.content_hash,expectedJobRevision:f.d.revision,acceptedTotalPence:120120,statedCustomerName:"Fictional customer",statedMethod:"email",acceptedAt:at,evidenceId:randomUUID()};
    await expect(new UserCommandDispatcher(db.runtime).dispatch(context,{...command,commandType:"quote.acceptance.attest",action:{...command.action,actionType:"quote.acceptance.attest",recipient:acceptance.statedCustomerName,amountPence:120120,currency:"GBP",policyVersion:"builder-attestation.v1"}},new RecordBuilderAcceptanceMutation(T,acceptance))).rejects.toMatchObject({code:"22023",message:"invalid acceptance evidence"});
    expect(await counts()).toEqual(before);
  });
  it("keeps current v3 activation working alongside the hardened v1 route",async()=>{
    const f=await fixture();
    await new UserCommandDispatcher(db.runtime).dispatch(context,{...f.command,action:{...f.command.action,amountPence:null,currency:null,policyVersion:"synthetic_demo_activation.v3"}},
      new SwitchJobLiveV3Mutation(T,{version:"switch-live.v3",activationId:randomUUID(),termsId:randomUUID(),jobId:f.job,acceptedDocumentId:f.d.id,acceptedDocumentVersion:f.d.document_version,acceptedDocumentHash:f.d.content_hash,expectedJobRevision:f.d.revision}));
    expect((await db.owner.query("SELECT fee_policy_version,recovery_cap_pence FROM app.job WHERE tenant_id=$1 AND id=$2",[T,f.job])).rows[0]).toEqual({fee_policy_version:"reference_fee_policy_v3",recovery_cap_pence:null});
  });
  it("rolls the business effect and consumption back after mutation failure",async()=>{
    const f=await fixture(),before=await counts();
    await expect(new UserCommandDispatcher(db.runtime).dispatch(context,f.command,{inputHash:c=>f.mutation.inputHash(c),async mutate(database,c){await f.mutation.mutate(database,c);throw new Error("FICTIONAL_FAILURE");}})).rejects.toThrow("FICTIONAL_FAILURE");
    expect(await counts()).toEqual(before);
    await new UserCommandDispatcher(db.runtime).dispatch(context,f.command,f.mutation);
  });
  it("uses an independent SQL codec and refuses hidden use rows across tenants",async()=>{
    const f=await fixture();
    await transaction(db.runtime,T,async c=>{
      const result=(await c.query(`SELECT app.lp3_input_hash(ARRAY['not reachable'])`)).rows;
      expect(result).toHaveLength(1);
    }).catch(error=>expect(error).toMatchObject({code:"42501"}));
    await new UserCommandDispatcher(db.runtime).dispatch(context,f.command,f.mutation);
    expect(await transaction(db.runtime,randomUUID(),async c=>(await c.query("SELECT * FROM app.activation_acceptance_operation_use")).rows)).toEqual([]);
    const i=f.input;
    const sql=(await db.owner.query(`SELECT app.lp3_input_hash(ARRAY['lp3-input.v1','job.switch_live',$1::uuid::text,$2::uuid::text,$3::uuid::text,
      $4::uuid::text,$5::integer::text,$6,$7::integer::text,$8::bigint::text,$9::bigint::text,$10,$11,$12,'7900','GBP',NULL,
      to_char($13::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')]) hash`,
      [T,M,f.job,i.acceptedDocumentId,i.acceptedDocumentVersion,i.acceptedDocumentHash,i.expectedJobRevision,i.acceptedNetValuePence,i.recoveryCapPence,i.mode,i.activationTermsVersion,i.feePolicyVersion,i.activatedAt])).rows[0];
    expect(sql.hash).toBe(lp3MutationHash(T,M,f.input));
  });
});
