import type { Pool } from "pg";
import { z } from "zod";
import { EnterpriseLivePromptPersistenceError, materialsIssueV1, completionObservationV1, evaluateLivePromptsV1, confirmPromptV1, dismissPromptV1, promptListV1, promptDetailV1 } from "@jobguard/core";
import { contractorSessionContext } from "./contractor-session-context.js";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";
import { appendAuditBatch, type AuditEventInput } from "./audit.js";
import { readEnterpriseCompletionFindings, readStoredCompletionPhoto } from "./enterprise-live-prompt-source-reader.js";
const endInput = z.object({version:z.literal("end-check.v1"),commandId:z.string().uuid(),jobId:z.string().uuid(),agreementVersionId:z.string().uuid().optional(),completionEventId:z.string().uuid().optional(),visitId:z.string().uuid().optional()}).strict();
type Result = Record<string,unknown>;
export type EnterprisePromptItem = {id:string;jobId:string;promptHash:string;rule:"a"|"b"|"c"|"d";ruleVersion:string;surfacedAt:string;resolution:string|null};
export type EnterprisePromptPage = {items:EnterprisePromptItem[];nextCursor:string|null};
const itemSchema = z.object({id:z.string().uuid(),jobId:z.string().uuid(),promptHash:z.string().regex(/^[a-f0-9]{64}$/u),rule:z.enum(["a","b","c","d"]),ruleVersion:z.string(),surfacedAt:z.string(),resolution:z.string().nullable()});
const pageSchema = z.object({items:z.array(itemSchema),nextCursor:z.string().uuid().nullable()});
function failure(error:unknown):never {
 if(error instanceof EnterpriseLivePromptPersistenceError)throw error;
 const message=(error as {message?:string}).message;
 const codes=["INVALID_PROMPT_COMMAND","EXTRA_FORBIDDEN","JOB_NOT_LIVE","PROMPT_CONFLICT","PROMPT_ORIGIN_HELD","PROMPT_SOURCE_INVALID","PROMPT_AMBIGUOUS","PROMPT_END_CHECK_HELD","PROMPT_PRACTICE_ONLY"] as const;
 const code=codes.find(c=>c===message);if(code)throw new EnterpriseLivePromptPersistenceError(code);
 if(message==="MODE_FORBIDDEN")throw new EnterpriseLivePromptPersistenceError("PROMPT_PRACTICE_ONLY");
 if((error as {code?:string}).code==="23505")throw new EnterpriseLivePromptPersistenceError("PROMPT_CONFLICT");
 throw error;
}
/** Synthetic session-bound boundary. No caller-selected tenant, actor, role, fee or settlement fields. */
export class EnterpriseLivePromptRepository {
 constructor(private readonly pool:Pool) {}
 private parse(schema:{safeParse:(input:unknown)=>{success:boolean;data?:unknown}},raw:unknown):unknown {const parsed=schema.safeParse(raw);if(!parsed.success)throw new EnterpriseLivePromptPersistenceError("INVALID_PROMPT_COMMAND");return parsed.data;}
 private async read(sessionId:string,input:unknown):Promise<Result>{
  try {const context:VerifiedTenantContext=await contractorSessionContext(this.pool,sessionId);
   return await withTenant(this.pool,context,async db=>(await db.$client.query<{result:Result}>("SELECT app.lp_read($1,$2::jsonb) result",[sessionId,JSON.stringify(input)])).rows[0]!.result);
  }catch(error){failure(error);}
 }
 private async write(sessionId:string,raw:unknown):Promise<Result>{
  const input=z.object({version:z.string(),jobId:z.string().uuid(),commandId:z.string().uuid()}).passthrough().parse(raw);
  try {const context:VerifiedTenantContext=await contractorSessionContext(this.pool,sessionId);
   return await withTenant(this.pool,context,async db=>{
    let sourceBytes:Buffer|null=null;
    if(input.version==="completion-observation.v1" && (input.locator as {kind?:string}|undefined)?.kind==="photo_tag") {
     const source=z.object({jobId:z.string().uuid(),evidenceId:z.string().uuid(),sha256:z.string(),objectVersion:z.string()}).parse(input);
     sourceBytes=await readStoredCompletionPhoto(db,sessionId,source);
    }
    const output=(await db.$client.query<{value:{replay:boolean;result:Result;audits:AuditEventInput[]}}>("SELECT app.lp_command($1,$2::jsonb,$3::bytea) value",[sessionId,JSON.stringify(input),sourceBytes])).rows[0]!.value;
    if(output.replay)return output.result;
    if(input.version==="completion-observation.v1"||input.version==="evaluate-live-prompts.v1"){
     // Rule (a) is rerun from stored bytes, tags/locators and the bound order, never a supplied snapshot.
     // SQL independently enforces the persisted result; disagreement rolls back the entire command.
     const findings=await readEnterpriseCompletionFindings(db,sessionId,input.jobId);
     for(const finding of findings){
      const projection=(await db.$client.query<{value:Result}>("SELECT app.lp_read($1,$2::jsonb) value",[sessionId,JSON.stringify({version:"live-prompt-detail.v1",jobId:input.jobId,promptId:await this.promptId(db,sessionId,input.jobId,finding.observationId)})])).rows[0]!.value;
      if(projection.rule!=="a")throw new EnterpriseLivePromptPersistenceError("PROMPT_SOURCE_INVALID");
     }
    }
    await appendAuditBatch(db,output.audits);
    await db.$client.query("SELECT app.lp_finish($1,$2,$3::jsonb)",[sessionId,input.commandId,JSON.stringify(output.result)]);
    return output.result;
   });
  }catch(error){failure(error);}
 }
 private async promptId(db:import("./tenant-context.js").TenantTransaction,session:string,job:string,observation:string):Promise<string>{
  return (await db.$client.query<{id:string}>("SELECT app.lp_observation_prompt($1,$2,$3) id",[session,job,observation])).rows[0]!.id;
 }
 async list(sessionId:string,raw:unknown):Promise<EnterprisePromptPage>{return pageSchema.parse(await this.read(sessionId,this.parse(promptListV1,raw)));}
 detail(sessionId:string,raw:unknown){return this.read(sessionId,this.parse(promptDetailV1,raw));}
 importMaterials(sessionId:string,raw:unknown){return this.write(sessionId,this.parse(materialsIssueV1,raw));}
 registerObservation(sessionId:string,raw:unknown){return this.write(sessionId,this.parse(completionObservationV1,raw));}
 evaluate(sessionId:string,raw:unknown){return this.write(sessionId,this.parse(evaluateLivePromptsV1,raw));}
 confirm(sessionId:string,raw:unknown){return this.write(sessionId,this.parse(confirmPromptV1,raw));}
 dismiss(sessionId:string,raw:unknown){return this.write(sessionId,this.parse(dismissPromptV1,raw));}
 endCheck(sessionId:string,raw:unknown){return this.write(sessionId,this.parse(endInput,raw));}
}
