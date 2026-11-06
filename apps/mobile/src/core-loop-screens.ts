import { acceptanceIntentViewV1, coreLoopActionAvailabilityV1, coreLoopActionContextV1, finalAccountPreviewViewV1,
 inboxViewV1, invoicePreviewViewV1, jobListViewV1, paymentRecordViewV1, proofViewV1, quotePreviewViewV1,
 variationsViewV1, walkReviewViewV1, type CoreLoopActionV1 } from "@jobguard/core";
import { MobileClientError, samePartition, type Partition } from "./lifecycle-contracts";
import type { NativeAuthority } from "./workspace-document";
export const nativeCoreScreens = ["walk_review", "job_list", "quote_preview", "acceptance_intent", "inbox", "proof", "variations", "final_account_preview", "invoice_preview", "payment_record"] as const;
export type NativeCoreScreen = typeof nativeCoreScreens[number];
type Inputs = {
 walk_review: Parameters<typeof walkReviewViewV1>[0]; job_list: Parameters<typeof jobListViewV1>[0];
 quote_preview: Parameters<typeof quotePreviewViewV1>[0]; acceptance_intent: Parameters<typeof acceptanceIntentViewV1>[0];
 inbox: { items: unknown; jobId: string }; proof: { requirement: Parameters<typeof proofViewV1>[0]; candidate: Parameters<typeof proofViewV1>[1]; permission: Parameters<typeof proofViewV1>[2] };
 variations: Parameters<typeof variationsViewV1>[0]; final_account_preview: Parameters<typeof finalAccountPreviewViewV1>[0];
 invoice_preview: Parameters<typeof invoicePreviewViewV1>[0]; payment_record: { invoice: unknown; localIntent: Parameters<typeof paymentRecordViewV1>[1] };
};
export type NativeScreenRequest = { [K in NativeCoreScreen]: { screen: K; input: Inputs[K] } }[NativeCoreScreen];
export function sharedNativeView(request: NativeScreenRequest, tenantId: string) {
 switch (request.screen) {
  case "walk_review": return walkReviewViewV1(request.input);
  case "job_list": return jobListViewV1(request.input, tenantId);
  case "quote_preview": return quotePreviewViewV1(request.input);
  case "acceptance_intent": return acceptanceIntentViewV1(request.input);
  case "inbox": return inboxViewV1(request.input.items, request.input.jobId);
  case "proof": return proofViewV1(request.input.requirement, request.input.candidate, request.input.permission);
  case "variations": return variationsViewV1(request.input);
  case "final_account_preview": return finalAccountPreviewViewV1(request.input);
  case "invoice_preview": return invoicePreviewViewV1(request.input);
  case "payment_record": return paymentRecordViewV1(request.input.invoice, request.input.localIntent);
  default: throw new MobileClientError("MOBILE_DENIED");
 }
}
export type NativeSharedView = ReturnType<typeof sharedNativeView>;
export interface NativeCoreSource extends NativeAuthority {
 /** Owning online API adapter authenticates/authorizes each exact tenant/job/subject and validates its response. */
 load(screen: NativeCoreScreen, partition: Partition): Promise<{ partition: Partition; context: unknown; request: NativeScreenRequest }>;
}
export class NativeCoreLoopScreens {
 constructor(readonly partition: Partition, private readonly source: NativeCoreSource, private readonly uuid: () => string) {}
 async load(screen: NativeCoreScreen) {
  try {
   await this.source.assertCurrent(this.partition);
   const raw = await this.source.load(screen, this.partition);
   if (!samePartition(raw.partition, this.partition) || raw.request.screen !== screen) throw new Error("binding");
   const supplied = coreLoopActionContextV1.parse(raw.context);
   if (!supplied.authorized || !supplied.online || supplied.current.tenantId !== this.partition.tenantId) throw new Error("authority");
   // Never restore a prior person review, even for an unchanged snapshot after reconnect.
   const connectionId = this.uuid();
   const context = coreLoopActionContextV1.parse({ ...supplied, connectionId, refreshedConnectionId: connectionId, review: null });
   const request = raw.request.screen === "acceptance_intent" ? { ...raw.request, input: context } : raw.request;
   return { partition: this.partition, context, view: sharedNativeView(request, this.partition.tenantId) };
  } catch { throw new MobileClientError("MOBILE_DENIED"); }
 }
}
export type LoadedCoreScreen = Awaited<ReturnType<NativeCoreLoopScreens["load"]>>;
/** A person navigation gesture only; the owning server workflow must revalidate before executing. */
export function nativeReviewChoice(screen: LoadedCoreScreen, action: CoreLoopActionV1, online: boolean) {
 if (!online || !screen.view.actions.some(row => row.action === action)) throw new MobileClientError("MOBILE_DENIED");
 const context = coreLoopActionContextV1.parse(screen.context);
 const availability = coreLoopActionAvailabilityV1(action, context);
 if (availability.state === "blocked") throw new MobileClientError("MOBILE_DENIED");
 return { action, mode: availability.mode, snapshot: context.current, requiresOwningOnlineReview: true as const, executed: false as const };
}
