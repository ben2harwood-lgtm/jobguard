import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { approveVariation, priceVariation, candidateM1TaxPolicy, money } from "@jobguard/core";
import { FinalAccountLockRepository } from "../src/final-account-lock-repository.js";
import { FinalCheckCompletionRepository } from "../src/shadow-detection-repository.js";
import { FinalCheckRepository } from "../src/final-check-repository.js";
import { practiceMaterialPool } from "../src/practice-session.js";
import { PracticeInvoiceRepository } from "../src/practice-invoice-repository.js";
import { approvePricedVariation, insertPricedVariation } from "../src/variation-repository.js";
import { withTenant } from "../src/tenant-context.js";
import { availableFinalCheck, seedFinalCheckJob, FINAL_CHECK_ACTOR, type FinalCheckFixture } from "./final-check-fixture.js";
import { workTenant } from "./job-work-state-fixtures.js";

/** A real revealed, confirmed, priced and approved catch, issued as a supplementary
 * invoice after the immutable baseline lock. Both DB and browser proofs use it. */
export async function issueApprovedCatchInvoice(
 f: { admin: Pool; runtime: Pool }, net: number,
) {
 const login=`customer_catch_${randomUUID().replaceAll("-","")}`, credential=randomUUID();
 await f.admin.query(`CREATE ROLE ${login} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${credential}'; GRANT jobguard_shadow TO ${login}`);
 const database=(await f.admin.query("SELECT current_database() name")).rows[0].name;
 // pg parses connectionString after explicit fields. Replace its credentials too,
 // otherwise browser fixtures connect as the admin (which is also a runtime member).
 const connectionString=f.admin.options.connectionString ? new URL(f.admin.options.connectionString) : null;
 if(connectionString){connectionString.username=login;connectionString.password=credential;}
 const shadow=new Pool({...f.admin.options,...(connectionString?{connectionString:connectionString.href}:{}),database,user:login,password:credential,max:1});
 try {
  const fixture={...f,shadow} as FinalCheckFixture;
  const job=await seedFinalCheckJob(fixture);
  const a={...job,actorId:FINAL_CHECK_ACTOR,scopeId:job.scopeItemId};
  const account={...job,draftId:String((await f.admin.query("SELECT final_account_draft_id FROM app.final_account_revision WHERE tenant_id=$1 AND id=$2",[a.tenantId,a.revisionId])).rows[0].final_account_draft_id)};
  // Invoice issuance checks the job's practice principal as well as its owner.
  const invoicePool=practiceMaterialPool(f.runtime,a.digest);
  const locks=new FinalAccountLockRepository(invoicePool), repo=new FinalCheckRepository(f.runtime);
  const revealed=await availableFinalCheck(fixture,job);
  await new FinalCheckCompletionRepository(shadow).publish(a.workerContext,{version:"final-check-publication.v1",jobId:a.jobId,runId:revealed.runId,checkId:revealed.manifest.id});
  const invoices=new PracticeInvoiceRepository(invoicePool);
  const digest=a.digest;
  const confirmed=await repo.confirmCatch(a.context,a.jobId,digest,{version:"final-check.catch.v1",commandId:randomUUID(),
   lockId:revealed.lockId,runId:revealed.runId,signalId:revealed.signalId,expectedSignalRevision:1}) as {variationId:string};
  const v=(await f.admin.query("SELECT scope_item_id,description FROM app.variation WHERE tenant_id=$1 AND id=$2",[a.tenantId,confirmed.variationId])).rows[0];
  const proposal={version:"variation-proposal.v1" as const,id:confirmed.variationId,jobId:a.jobId,scopeItemId:v.scope_item_id,
   existingScopeItemId:null,lineageParentScopeItemId:null,captureKind:"text" as const,captureText:v.description,description:v.description,suggestion:null};
  const priced=priceVariation({id:randomUUID(),variationId:confirmed.variationId,previous:null,proposal,description:v.description,contentHash:"e".repeat(64),
   confirmed:{quantity:"1",unit:"item",unitRatePence:net,direction:"addition",confirmedByMembershipId:a.actorId,
    rateProvenance:{kind:"human_entered",sourceRef:"synthetic://builder-entered",sourceHash:"8".repeat(64),rateVersion:"builder-price-v1"}}});
  await withTenant(f.runtime,a.context,db=>insertPricedVariation(db,a.tenantId,priced));
  const approval=approveVariation({...priced,state:"priced"} as never,{id:randomUUID(),revisionId:priced.id,revision:priced.revision,
   contentHash:priced.contentHash,signedDeltaPence:priced.signedDeltaPence,method:"builder_attestation",actorMembershipId:a.actorId,evidenceId:null,approvedAt:new Date()});
  await withTenant(f.runtime,a.context,db=>approvePricedVariation(db,a.tenantId,confirmed.variationId,approval));
  await invoices.issue(a.context,{jobId:a.jobId,finalAccountRevisionId:account.revisionId,actorMembershipId:a.actorId,
   commandId:randomUUID(),recipient:"fictional@example.invalid",issuedOn:"2026-11-03"});
  const revision=randomUUID(),hash="b".repeat(64);
  // Fixture assembly preserves every baseline line and uses the real approval's
  // exact source/revision/identity; no made-up approval can pass this proof.
  await workTenant(f.admin,a.tenantId,async db=>{
   await db.query("INSERT INTO app.final_account_revision(id,tenant_id,job_id,final_account_draft_id,revision,previous_revision_id,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings) SELECT $1,tenant_id,job_id,final_account_draft_id,2,id,$2,baseline_quote_version_id,currency,tax_policy_version,net_pence+$3::bigint,tax_pence+$4::bigint,total_pence+$3::bigint+$4::bigint,false,findings FROM app.final_account_revision WHERE tenant_id=$5 AND id=$6",[revision,hash,net,candidateM1TaxPolicy.calculateGroup(money(net),"standard_rate_20").pence,a.tenantId,account.revisionId]);
   await db.query("INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,approval_id,description,net_pence,ordinal) SELECT gen_random_uuid(),tenant_id,job_id,$1,line_kind,source_id,scope_item_id,commercial_revision_id,approval_id,description,net_pence,ordinal FROM app.final_account_line WHERE tenant_id=$2 AND final_account_revision_id=$3",[revision,a.tenantId,account.revisionId]);
   await db.query("INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,approval_id,description,net_pence,ordinal) VALUES($1,$2,$3,$4,'variation',$5,$6,$5,$7,$8,$9,2)",[randomUUID(),a.tenantId,a.jobId,revision,priced.id,v.scope_item_id,approval.id,v.description,net]);
   await db.query("UPDATE app.final_account_draft SET revision=2,current_revision_id=$1 WHERE tenant_id=$2 AND id=$3",[revision,a.tenantId,account.draftId]);
  });
  const result=await locks.issueInvoice(a.context,{jobId:a.jobId,actorMembershipId:a.actorId,commandId:randomUUID(),
   finalAccountRevisionId:revision,expectedSourceHash:hash,invoiceKind:"supplementary",recipient:"fictional@example.invalid",issuedOn:"2026-11-04"});
  // The customer portal uses identity sessions, independently of the catch's
  // practice principal. Give this exact fixture actor an identity sponsor.
  const user=(await f.admin.query("SELECT identity_user_id FROM app.membership WHERE tenant_id=$1 AND id=$2",[a.tenantId,a.actorId])).rows[0].identity_user_id;
  await f.admin.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2) ON CONFLICT(user_id) DO NOTHING",[randomUUID()+"@practice.invalid",user]);
  await f.admin.query("INSERT INTO identity.membership_locator(user_id,tenant_id,membership_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[user,a.tenantId,a.actorId]);
  await f.admin.query("INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at) VALUES($1,$2,'synthetic_demo',$3,$4,clock_timestamp()+interval '1 hour')",[randomUUID(),user,a.digest,randomUUID()]);
  const invoice=(await invoices.list(a.context,a.jobId)).find(invoice=>invoice.id===result.invoiceId)!;
  return {a,invoice};
 } finally {await shadow.end();}
}
