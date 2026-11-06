import { mobilePartitionV1 } from "@jobguard/core";
import { MobileClient } from "./lifecycle";
import { MobileClientError, samePartition, type Partition } from "./lifecycle-contracts";
import { NativeCoreLoopScreens, type NativeCoreSource } from "./core-loop-screens";
import { WorkspaceDocument } from "./workspace-document";
import type { EncryptedStore } from "./store";
import type { NativeWorkspaceBindings } from "./WorkspaceScreens";

type LifecycleInputs = ConstructorParameters<typeof MobileClient>;
export interface NativeCompositionInputs {
 partition: Partition; store: EncryptedStore; source: NativeCoreSource;
 online: boolean; authEpoch: number; uuid(): string;
 lifecycle: { provider: LifecycleInputs[0]; vault: LifecycleInputs[1]; resources: LifecycleInputs[2]; options: LifecycleInputs[3] };
}
// A cleaned partition remains reserved: re-enrolment must supply a new session partition.
const owners = new Set<string>();
/** Dark synthetic composition. The caller republishes binding after each authority transition. */
export class NativeComposition {
 readonly document: WorkspaceDocument;
 readonly client: MobileClient;
 readonly partition: Partition;
 #online: boolean;
 #authEpoch: number;
 #generation = 0;
 #active = true;
 constructor(private readonly inputs: NativeCompositionInputs) {
  this.partition = Object.freeze(mobilePartitionV1.parse(inputs.partition));
  const key = JSON.stringify([this.partition.userId, this.partition.tenantId, this.partition.membershipId,
   this.partition.mobileSessionId, this.partition.deviceInstanceId]);
  if (owners.has(key)) throw new MobileClientError("MOBILE_BUSY");
  this.#online = inputs.online; this.#authEpoch = inputs.authEpoch;
  this.document = new WorkspaceDocument(inputs.store, this.partition);
  const { provider, vault, resources, options } = inputs.lifecycle;
  this.client = new MobileClient(provider, vault, resources, { ...options, beforePartitionCleanup: async p => {
   if (!samePartition(p, this.partition)) throw new MobileClientError("MOBILE_DENIED");
   this.#active = false; this.#online = false; this.#generation++;
   this.document.invalidate();
   // Invalidate before a fallible downstream hook. Lifecycle keeps its durable cleanup marker on failure.
   await options.beforePartitionCleanup?.(p);
  } });
  owners.add(key);
 }
 updateAuthority(next: { online: boolean; authEpoch: number }) {
  if (!this.#active) throw new MobileClientError("MOBILE_DENIED");
  if (next.authEpoch !== this.#authEpoch || next.online !== this.#online) this.#generation++;
  this.#authEpoch = next.authEpoch; this.#online = next.online;
  return this.binding;
 }
 private assertCurrent(generation: number, partition: Partition) {
  if (!this.#active || !this.#online || generation !== this.#generation || !samePartition(partition, this.partition)) {
   throw new MobileClientError("MOBILE_DENIED");
  }
 }
 get binding(): NativeWorkspaceBindings {
  const generation = this.#generation;
  const source: NativeCoreSource = {
   assertCurrent: async p => {
    this.assertCurrent(generation, p);
    await this.inputs.source.assertCurrent(p);
    this.assertCurrent(generation, p);
   },
   load: async (screen, p) => {
    this.assertCurrent(generation, p);
    const reply = await this.inputs.source.load(screen, p);
    this.assertCurrent(generation, p);
    return reply;
   },
  };
  return { partition: this.partition, online: this.#active && this.#online, authorityGeneration: generation,
   uuid: this.inputs.uuid, core: new NativeCoreLoopScreens(this.partition, source, this.inputs.uuid) };
 }
}
