import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { jobStatuses } from "@jobguard/core";
import { CaptureRepository, ProposalReviewRepository } from "@jobguard/db";
import { CaptureApplication } from "./capture.application.js";
import { captureWorkspaceResponseV1 } from "./contracts.js";

const jobId="d2000000-0000-4000-8000-000000000001";
type Captured=NonNullable<Awaited<ReturnType<CaptureRepository["readByJob"]>>>;
const fixture=(status:string)=>({capture_id:"d2000000-0000-4000-8000-000000000002",id:"d2000000-0000-4000-8000-000000000003",content_text:"Generated practice notes",proposal:{title:{value:"Fictional job"},questions:[]},lines:[],status}) as unknown as Captured;
afterEach(()=>vi.restoreAllMocks());
describe("capture workspace lifecycle projection",()=>{
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
