import { localData, samePartition, MobileClientError, type LocalData, type Partition } from "./lifecycle-contracts";
import type { EncryptedStore } from "./store";
export interface NativeAuthority { assertCurrent(partition: Partition): Promise<void> }
/** One owner per partition, shared by native adapters. No read API is exposed to screens. */
export class WorkspaceDocument {
 #busy = false;
 #invalidated = false;
 invalidate() { this.#invalidated = true; }
 private assertActive() { if (this.#invalidated) throw new MobileClientError("MOBILE_DENIED"); }
 constructor(private readonly store: EncryptedStore, readonly partition: Partition) {
  if (store.encryption !== "sqlcipher") throw new MobileClientError("MOBILE_DENIED");
 }
 async transaction<T>(work: (data: LocalData, checkpoint: (data: LocalData) => Promise<void>) => Promise<{ data: LocalData; result: T }>): Promise<T> {
  this.assertActive();
  if (this.#busy) throw new MobileClientError("MOBILE_BUSY");
  this.#busy = true;
  try {
   const raw = await this.store.read();
   const current = localData.parse(JSON.parse(raw ?? "null"));
   if (current.metadata.localSchemaVersion !== 1 || !samePartition(current.metadata.partition, this.partition)) throw new Error("partition");
   const checkpoint = async (raw: LocalData) => {
    this.assertActive();
    const checked = localData.parse(raw);
    if (!samePartition(checked.metadata.partition, this.partition) || checked.metadata.localSchemaVersion !== 1) throw new Error("partition");
    await this.store.write(JSON.stringify(checked));
   };
   const next = await work(current, checkpoint), data = localData.parse(next.data);
   if (!samePartition(data.metadata.partition, this.partition) || data.metadata.localSchemaVersion !== 1) throw new Error("partition");
   this.assertActive();
   await this.store.write(JSON.stringify(data));
   return next.result;
  } catch (error) { if (error instanceof MobileClientError) throw error; throw new MobileClientError("MOBILE_RECOVERY_REQUIRED"); }
  finally { this.#busy = false; }
 }
}
