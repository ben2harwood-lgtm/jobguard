import { z } from "zod";
import { trialDemoCommandV1 } from "@jobguard/core";
const uuid=z.string().uuid();
const card=z.object({version:z.literal("trial-screen-command.v1"),kind:z.enum(["request_card","simulate_card"]),commandId:uuid}).strict();
const activation=z.object({version:z.literal("trial-switch-live.v1"),commandId:uuid,acceptedDocumentId:uuid,acceptedDocumentVersion:z.number().int().positive().max(2147483647),acceptedDocumentHash:z.string().regex(/^[a-f0-9]{64}$/u),expectedJobRevision:z.number().int().nonnegative().max(2147483647)}).strict();
const intent=z.object({path:z.string(),body:z.unknown()}).strict().superRefine((value,ctx)=>{
 const valid=value.path==="/api/small-builder-demo/trial"?trialDemoCommandV1.safeParse(value.body).success:
  /^\/api\/jobs\/[a-f0-9-]{36}\/trial$/iu.test(value.path)?card.safeParse(value.body).success:
  /^\/api\/jobs\/[a-f0-9-]{36}\/quotes\/activation$/iu.test(value.path)?activation.safeParse(value.body).success:false;
 if(!valid)ctx.addIssue({code:"custom",message:"Invalid saved trial intent"});
});
export type TrialIntent=z.infer<typeof intent>;
export function parseTrialIntent(value:unknown):TrialIntent{return intent.parse(value);}
export function readTrialIntent(value:string|null):TrialIntent|null{
 if(value===null)return null;
 return parseTrialIntent(JSON.parse(value));
}
