import { z } from "zod";
import { applySyncDeviceAnswerV1, beginSyncDeviceRequestV1, createSyncDeviceCacheV1, syncSubscriptionRequestV1, mobilePartitionV1 } from "@jobguard/core";
import { samePartition, MobileClientError, type Partition } from "./lifecycle-contracts";
import { WorkspaceDocument, type NativeAuthority } from "./workspace-document";

const subscription = z.object({
 partition: mobilePartitionV1, generation: z.number().int().nonnegative().safe(),
 schemaVersion: z.literal(1), token: z.string().min(1).max(8192),
}).strict();

/** Adapter supplies identity/generation from authenticated server context. */
export interface NativeDownloadTransport extends NativeAuthority {
 subscribe(request: unknown, partition: Partition): Promise<unknown>;
 page(request: unknown): Promise<unknown>;
}

export class NativeDownloads {
 get partition() { return this.document.partition; }
 #subscription: z.infer<typeof subscription> | null = null;
 #refreshing = false;
 constructor(
  private readonly document: WorkspaceDocument,
  private readonly transport: NativeDownloadTransport,
  private readonly assertActive: () => void = () => {},
 ) {}

 disconnect() { this.#subscription = null; }

 /** Load the complete online projection. Interrupted exchanges remain checkpointed. */
 async refresh() {
  if (this.#refreshing) throw new MobileClientError("MOBILE_BUSY");
  this.#refreshing = true;
  try {
   let resubscribed = false;
   for (;;) {
    const result = await this.pull();
    if (!this.#subscription) {
     // The refused page has committed cleanup. Keep at most one automatic retry.
     if (resubscribed) throw new MobileClientError("MOBILE_DENIED");
     resubscribed = true;
    } else if (!result.truncated) {
     this.assertActive();
     return result;
    }
   }
  } finally { this.#refreshing = false; }
 }

 async pull() {
  this.assertActive();
  const p = this.partition;
  try { await this.transport.assertCurrent(p); }
  catch (error) {
   this.assertActive();
   if (error instanceof MobileClientError && error.code === "MOBILE_RECOVERY_REQUIRED") throw error;
   await this.clear();
   throw new MobileClientError("MOBILE_DENIED");
  }
  this.assertActive();

  try {
   return await this.document.transaction(async (data, checkpoint) => {
    this.assertActive();
    const request = syncSubscriptionRequestV1.parse({
     version: "sync-subscription-request.v1", requestedTenantId: p.tenantId, profile: "contractor_assigned_jobs.v1",
    });
    let state = data.sync ?? createSyncDeviceCacheV1({
     userId: p.userId, tenantId: p.tenantId, profile: request.profile, generation: 0, schemaVersion: 1,
    });
    if (state.userId !== p.userId || state.tenantId !== p.tenantId) throw new Error("scope");
    if (!this.#subscription) {
     const current = subscription.parse(await this.transport.subscribe(request, p));
     this.assertActive();
     if (!samePartition(current.partition, p)) throw new Error("scope");
     this.#subscription = current;
     // A renewed credential can only continue a persisted cursor under the same server generation.
     if (state.generation !== current.generation || state.schemaVersion !== current.schemaVersion) {
      state = { ...state, subscribed: false, cursor: null, pending: null };
     }
    }
    const pending = beginSyncDeviceRequestV1(state), current = this.#subscription;
    await checkpoint({ ...data, sync: pending });
    this.assertActive();
    const answer = await this.transport.page({
     version: "sync-server-download.v1", request, token: current.token,
     afterJobId: pending.cursor, pageSize: 100, delivered: pending.rows.map(row => row.jobId),
    });
    this.assertActive();
    const next = applySyncDeviceAnswerV1({
     state: pending, receipt: { userId: p.userId, tenantId: p.tenantId, profile: request.profile,
      sequence: pending.sequence, generation: current.generation, schemaVersion: current.schemaVersion }, answer,
    });
    if (!next.subscribed) this.disconnect();
    return { data: { ...data, sync: next }, result: {
     version: "site-assigned-jobs.v1" as const, environment: "synthetic_demo" as const,
     realExternalActions: 0 as const, jobs: next.subscribed ? next.rows : [], truncated: next.cursor !== null,
    } };
   });
  } catch (error) {
   if (error instanceof MobileClientError && error.code === "MOBILE_DENIED") {
    this.assertActive();
    await this.clear();
   }
   throw error;
  }
 }

 private async clear() {
  this.disconnect();
  await this.document.transaction(async data => ({ data: { ...data, sync: null }, result: null }));
 }

 offlineRead(): never { throw new Error("NATIVE_OFFLINE_READS_HELD_D08"); }
}
