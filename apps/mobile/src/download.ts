import { z } from "zod";
import { applySyncDeviceAnswerV1, beginSyncDeviceRequestV1, createSyncDeviceCacheV1, syncSubscriptionRequestV1, type SyncDeviceCacheV1, mobilePartitionV1 } from "@jobguard/core";
import { samePartition, MobileClientError, type Partition } from "./lifecycle-contracts";
import { WorkspaceDocument, type NativeAuthority } from "./workspace-document";
const binding = mobilePartitionV1; // Same full binding as the authenticated mobile partition.
const subscription = z.object({ partition: binding, generation: z.number().int().nonnegative().safe(), schemaVersion: z.literal(1), token: z.string().min(1).max(8192) }).strict();
/** Adapter supplies identity/generation from authenticated server context; never decoded client JWT claims. */
export interface NativeDownloadTransport extends NativeAuthority {
 subscribe(request: unknown, partition: Partition): Promise<unknown>;
 page(request: unknown): Promise<unknown>;
}
export class NativeDownloads {
 #subscription: z.infer<typeof subscription> | null = null;
 constructor(private readonly document: WorkspaceDocument, private readonly transport: NativeDownloadTransport) {}
 async pull() {
  try { await this.transport.assertCurrent(this.document.partition); } catch {
   this.#subscription = null;
   await this.document.transaction(async data => ({ data: { ...data, sync: null }, result: null }));
   throw new MobileClientError("MOBILE_DENIED");
  }
  return this.document.transaction(async (data, checkpoint) => {
   const p = this.document.partition;
   const request = syncSubscriptionRequestV1.parse({ version: "sync-subscription-request.v1", requestedTenantId: p.tenantId, profile: "contractor_assigned_jobs.v1" });
   let state: SyncDeviceCacheV1 = data.sync ?? createSyncDeviceCacheV1({ userId: p.userId, tenantId: p.tenantId, profile: request.profile, generation: 0, schemaVersion: 1 });
   if (state.userId !== p.userId || state.tenantId !== p.tenantId) throw new Error("scope");
   if (!this.#subscription) {
    const current = subscription.parse(await this.transport.subscribe(request, p));
    if (!samePartition(current.partition, p)) throw new Error("scope");
    this.#subscription = current;
    state = { ...state, subscribed: false, cursor: null, pending: null };
   }
   const pending = beginSyncDeviceRequestV1(state), current = this.#subscription;
   // Persist the exchange identity before network. A new process always subscribes again.
   await checkpoint({ ...data, sync: pending });
   const answer = await this.transport.page({ version: "sync-server-download.v1", request, token: current.token,
    afterJobId: pending.cursor, pageSize: 100, delivered: pending.rows.map(row => row.jobId) });
   const next = applySyncDeviceAnswerV1({ state: pending, receipt: { userId: p.userId, tenantId: p.tenantId, profile: request.profile,
    sequence: pending.sequence, generation: current.generation, schemaVersion: current.schemaVersion }, answer });
   if (!next.subscribed) this.#subscription = null;
   // Only freshly server-admitted rows are returned. There is deliberately no offline cache read method.
   return { data: { ...data, sync: next }, result: { version: "site-assigned-jobs.v1" as const, environment: "synthetic_demo" as const,
    realExternalActions: 0 as const, jobs: next.subscribed ? next.rows : [], truncated: next.cursor !== null } };
  });
 }
 offlineRead(): never { throw new Error("NATIVE_OFFLINE_READS_HELD_D08"); }
}
