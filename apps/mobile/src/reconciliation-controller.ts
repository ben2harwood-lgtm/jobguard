import { coreLoopActionContextV1 } from "@jobguard/core";
import type { DurableNativeQueue, QueueChoice, SavedQueueIntent } from "./durable-queue";
import { MobileClientError, samePartition, type Partition } from "./lifecycle-contracts";
import type { NativeAuthority } from "./workspace-document";

export type QueueReviewFlow = "contractor_note" | "work_state" | "send_quote" | "issue_invoice" | "place_order";
type ReviewPurpose = "review_current_snapshot" | "check_server_result" | "restore_access";
export interface QueueReviewTarget {
 readonly flow: QueueReviewFlow;
 readonly jobId: string;
 readonly commandId: string;
 readonly purpose: ReviewPurpose;
}
export interface QueueReviewSource {
 /** Use the original as a selector and reload current facts at the authenticated owning boundary. */
 load(partition: Partition, target: QueueReviewTarget, original: SavedQueueIntent): Promise<{
  partition: Partition; target: QueueReviewTarget; context: unknown;
 }>;
 /** Navigate to the owning review with a read-only reference to the original intent. */
 open(review: QueueReview): void;
}
export interface QueueReview {
 readonly target: QueueReviewTarget;
 readonly original: SavedQueueIntent;
 readonly current: ReturnType<typeof coreLoopActionContextV1.parse>["current"];
}
export type QueueSelection =
 | { kind: "pending" | "retry" | "quarantined" }
 | { kind: "saved" | "review_unavailable"; original: SavedQueueIntent }
 | { kind: "review"; review: QueueReview };

export function reconciliationController(queue: DurableNativeQueue, partition: Partition, authority: NativeAuthority, source: QueueReviewSource) {
 return async (commandId: string | null, choice: QueueChoice): Promise<QueueSelection> => {
  const original = await queue.savedIntent(commandId, choice);
  if (!original) return { kind: "quarantined" };
  if (choice === "inspect_saved_intent") return { kind: "saved", original };
  if (choice === "keep_pending") return { kind: "pending" };
  if (choice === "wait_for_retry") return { kind: "retry" };

  const { upload } = original;
  const flow = upload.body.version === "offline-commercial-intent.v1" ? upload.body.actionType
   : upload.body.version === "job-work-state-command.v1" ? "work_state" : "contractor_note";
  const target: QueueReviewTarget = Object.freeze({ flow, jobId: upload.jobId, commandId: upload.commandId, purpose: choice });
  const reply = await source.load(partition, target, original).catch(() => null);
  await authority.assertCurrent(partition);
  if (!reply) return { kind: "review_unavailable", original };
  const context = coreLoopActionContextV1.parse(reply.context);
  if (!samePartition(reply.partition, partition) || reply.target.flow !== target.flow || reply.target.purpose !== target.purpose
   || reply.target.commandId !== target.commandId || reply.target.jobId !== target.jobId
   || !context.online || !context.authorized || context.refreshedConnectionId !== context.connectionId
   || context.current.jobId !== target.jobId || context.current.tenantId !== partition.tenantId) {
   throw new MobileClientError("MOBILE_DENIED");
  }
  const review = { target, original, current: context.current };
  source.open(review);
  return { kind: "review", review };
 };
}
