import { expect, it } from "vitest";
import { assertWorkStateTransition, assertCompletedWorkResultOpen, jobWorkStateCommandV1, classifySiteSource } from "./job-work-state.js";
const id="10000000-0000-4000-8000-000000000001";
const other="10000000-0000-4000-8000-000000000002";
const base={version:"job-work-state-command.v1",commandId:id,expectedRevision:0};
it("strict actions reject actor tenant time and policy injection",()=>{
 const commands=[{...base,action:"finish"},{...base,action:"resume"},{...base,action:"cancel_finish",markerId:id},{...base,action:"close",reason:"other",note:"Requested"},{...base,action:"reopen",closeEventId:id}];
 for(const command of commands) {
  expect(jobWorkStateCommandV1.safeParse(command).success).toBe(true);
  for(const key of ["actor","tenantId","factAt","policy"]) expect(jobWorkStateCommandV1.safeParse({...command,[key]:id}).success).toBe(false);
 }
});
it("cancel binds outstanding marker",()=>{
 expect(()=>assertWorkStateTransition({...base,action:"cancel_finish",markerId:id},{finishedMarkerId:other,closedEventId:null})).toThrow("INVALID_WORK_STATE_INPUT");
 expect(()=>assertWorkStateTransition({...base,action:"cancel_finish",markerId:id},{finishedMarkerId:id,closedEventId:null})).not.toThrow();
});
it("close requires reason and note",()=>{
 expect(jobWorkStateCommandV1.safeParse({...base,action:"close",reason:"other",note:"  "}).success).toBe(false);
 expect(jobWorkStateCommandV1.safeParse({...base,action:"close",reason:"other",note:"Stop requested"}).success).toBe(true);
});
it("reopen binds current close",()=>{
 expect(()=>assertWorkStateTransition({...base,action:"reopen",closeEventId:id},{finishedMarkerId:null,closedEventId:other})).toThrow();
 expect(()=>assertWorkStateTransition({...base,action:"reopen",closeEventId:id},{finishedMarkerId:null,closedEventId:id})).not.toThrow();
});
it("completed result requires open state",()=>{
 expect(()=>assertCompletedWorkResultOpen(id)).toThrow("JOB_WORK_CLOSED");
 expect(()=>assertCompletedWorkResultOpen(null)).not.toThrow();
});
it("non-activity classes never restart",()=>{
 for(const kind of ["message","billing","final_review","jobguard_catch","order"]) expect(classifySiteSource({version:"job-site-source.v1",kind}).activity).toBe(false);
});
