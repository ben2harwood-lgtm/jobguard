import { z } from "zod";
import { operativeAssignedJobsViewV1, operativeOfflineExtraV1, planOperativeVisitV1, planOperativeExtraV1, offlineCaptureItemV1 } from "@jobguard/core";
import { MobileClientError, type Partition } from "./lifecycle-contracts";
import type { NativeDownloads } from "./download";
import type { DurableNativeQueue } from "./durable-queue";
export interface OperativeProofSource { verifiedPhoto(partition: Partition, jobId: string, evidenceId: string): Promise<unknown> }
export class NativeOperativeScreens {
 constructor(private readonly downloads: Pick<NativeDownloads, "pull" | "partition">,
  private readonly queue: Pick<DurableNativeQueue, "enqueueNote">, private readonly proof: OperativeProofSource) {}
 private async run<T>(online: boolean, work: () => Promise<T>) {
  if (!online) throw new MobileClientError("MOBILE_DENIED");
  try { return await work(); } catch { throw new MobileClientError("MOBILE_DENIED"); }
 }
 assigned(online: boolean) { return this.run(online, async () => operativeAssignedJobsViewV1(await this.downloads.pull())); }
 visit(input: { jobId: string; commandId: string; closeoutAnswer: "yes" | "no" | null }, online: boolean) {
  return this.run(online, async () => planOperativeVisitV1({ ...input, assigned: await this.downloads.pull(), online: true }));
 }
 extra(input: { jobId: string; draft: unknown; photoId: string | null; shownContentSha256: string | null }, online: boolean) {
  return this.run(online, async () => {
   const assigned = await this.downloads.pull();
   if (!assigned.jobs.some(row => row.jobId === input.jobId)) throw new Error("not assigned");
   if (!input.photoId) return { state: "held" as const, reason: "photo_not_verified" as const, recorded: false as const };
   z.guid().parse(input.photoId);
   const photo = offlineCaptureItemV1.parse(await this.proof.verifiedPhoto(this.downloads.partition, input.jobId, input.photoId));
   if (photo.uploadId !== input.photoId) throw new Error("photo binding");
   return planOperativeExtraV1({ assigned, jobId: input.jobId, draft: input.draft, photo,
    shownContentSha256: input.shownContentSha256, online: true });
  });
 }
 note(rawIntent: unknown, online: boolean, selectedJobId: string, expectedContent?: { note: string; description: string }) {
  return this.run(online, async () => {
   const view = operativeOfflineExtraV1(await this.downloads.pull(), rawIntent);
   if (view.intent.jobId !== selectedJobId) throw new Error("selected job mismatch");
   if (expectedContent && (view.intent.body.note !== expectedContent.note || view.intent.body.description !== expectedContent.description)) throw new Error("content binding");
   await this.queue.enqueueNote(view.intent); return view;
  });
 }
}
