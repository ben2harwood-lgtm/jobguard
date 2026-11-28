import { PracticeAccess } from "../practice-access.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { jobStatuses } from "@jobguard/core";
import { CaptureRepository, DiscardDraftJob, ProposalReviewRepository, UserCommandDispatcher } from "@jobguard/db";
import { CaptureApplication } from "./capture.application.js";
import { captureWorkspaceResponseV1 } from "./contracts.js";

const jobId="d2000000-0000-4000-8000-000000000001";
type Captured=NonNullable<Awaited<ReturnType<CaptureRepository["readByJob"]>>>;
const fixture=(status:string)=>({capture_id:"d2000000-0000-4000-8000-000000000002",id:"d2000000-0000-4000-8000-000000000003",content_text:"Generated practice notes",proposal:{title:{value:"Fictional job"},questions:[]},lines:[],status}) as unknown as Captured;
beforeEach(()=>vi.spyOn(PracticeAccess.prototype,"job").mockResolvedValue({context:{tenantId:"11111111-1111-4111-8111-111111111111"}} as never));
afterEach(()=>vi.restoreAllMocks());
describe("capture workspace lifecycle projection",()=>{
 it.each([0, 2])("maps stale Discard revision %s to a typed conflict without changing its expected revision",async expectedRevision=>{
  const mutate=vi.spyOn(DiscardDraftJob.prototype,"mutate").mockRejectedValue(Object.assign(new Error("DISCARD_DRAFT_REFUSED"),{code:"22023"}));
  const dispatch=vi.spyOn(UserCommandDispatcher.prototype,"dispatch").mockImplementation(async (_context,command,handler)=>{
   const db={$client:{query:vi.fn().mockResolvedValue({rows:[{revision:expectedRevision+1}]})}};
   return handler.mutate(db as never,command as never);
  });
  await expect(new CaptureApplication({} as Pool).discard(jobId,{contractVersion:"draft_discard_v1",commandId:crypto.randomUUID(),expectedRevision}))
   .rejects.toMatchObject({code:"REVIEW_REVISION_CONFLICT"});
  expect(dispatch.mock.calls[0]![1]).toMatchObject({action:{aggregateRevision:expectedRevision}});
  expect(mutate).not.toHaveBeenCalled();
 });
 it("preserves the real database discard refusal at the current revision",async()=>{
  vi.spyOn(DiscardDraftJob.prototype,"mutate").mockRejectedValue(Object.assign(new Error("DISCARD_DRAFT_REFUSED"),{code:"22023"}));
  vi.spyOn(UserCommandDispatcher.prototype,"dispatch").mockImplementation(async (_context,command,handler)=>{
   const db={$client:{query:vi.fn().mockResolvedValue({rows:[{revision:1}]})}};
   return handler.mutate(db as never,command as never);
  });
  await expect(new CaptureApplication({} as Pool).discard(jobId,{contractVersion:"draft_discard_v1",commandId:crypto.randomUUID(),expectedRevision:1}))
   .rejects.toMatchObject({code:"DISCARD_DRAFT_REFUSED"});
 });
 it("still maps dispatcher serialization failures to a typed conflict",async()=>{
  vi.spyOn(UserCommandDispatcher.prototype,"dispatch").mockRejectedValue(Object.assign(new Error("stale revision"),{code:"40001"}));
  await expect(new CaptureApplication({} as Pool).discard(jobId,{contractVersion:"draft_discard_v1",commandId:crypto.randomUUID(),expectedRevision:0}))
   .rejects.toMatchObject({code:"REVIEW_REVISION_CONFLICT"});
 });
 it.each(jobStatuses)("preserves persisted %s instead of coercing it to draft",async status=>{
  vi.spyOn(CaptureRepository.prototype,"readByJob").mockResolvedValue(fixture(status));
  vi.spyOn(ProposalReviewRepository.prototype,"read").mockResolvedValue(null);
  const view=await new CaptureApplication({} as Pool).view(jobId);
  expect(view.status).toBe(status);
  expect(captureWorkspaceResponseV1.parse(view).status).toBe(status);
  expect(view.jobId).toBe(jobId);
 });
 it("rejects an unknown stored lifecycle instead of making editable draft state",async()=>{
  vi.spyOn(CaptureRepository.prototype,"readByJob").mockResolvedValue(fixture("unexpected_state"));
  vi.spyOn(ProposalReviewRepository.prototype,"read").mockResolvedValue(null);
  await expect(new CaptureApplication({} as Pool).view(jobId)).rejects.toThrow();
 });
 it("does not invent a workspace when no captured job exists",async()=>{
  vi.spyOn(CaptureRepository.prototype,"readByJob").mockResolvedValue(null);
  await expect(new CaptureApplication({} as Pool).view(jobId)).rejects.toMatchObject({code:"NOT_FOUND"});
 });
});
