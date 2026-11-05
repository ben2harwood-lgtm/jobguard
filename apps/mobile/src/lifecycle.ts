import { z } from "zod";
import { evaluateMobileReadV1, mobileAuthPolicySpecimenV1, mobileReadLeaseV1 } from "@jobguard/core";
import { activeRecord, localData, mobileSession, samePartition, MobileClientError, type MobileSession,
 type Partition, type LocalData, type SecureVault, type PartitionResources, type MobileAuthProvider } from "./lifecycle-contracts";
import type { EncryptedStore } from "./store";
const activeKey = "jobguard.synthetic.active.v1";
const revoked = z.object({ version: z.literal("mobile-device-revoked.v1"), environment: z.literal("synthetic_demo") }).strict();
/** Synthetic only. Each process starts locked; a disconnected cold start cannot trust a saved clock. */
export class MobileClient {
 #session: MobileSession | null = null;
 #store: EncryptedStore | null = null;
 #busy = false;
 #ready = false;
 readonly #policy;
 readonly #provider: MobileAuthProvider;
 readonly #vault: SecureVault;
 readonly #resources: PartitionResources;
 readonly #options;
 constructor(provider: MobileAuthProvider, vault: SecureVault, resources: PartitionResources,
  options: { enabled: boolean; environment: string; policy: unknown; uuid(): string; deviceInstanceId: string;
   beforePartitionCleanup?(p: Partition): Promise<void>;
   clock(): { status: "trusted_fixture" | "unverified" | "anomaly"; nowMs: number }; partitionKey(p: Partition): Promise<string> }) {
  const policy = mobileAuthPolicySpecimenV1.safeParse(options.policy);
  if (!policy.success) throw new MobileClientError("MOBILE_DENIED");
  this.#policy = policy.data;
  this.#provider = provider; this.#vault = vault; this.#resources = resources; this.#options = Object.freeze({ ...options });
 }
 private async run<T>(work: () => Promise<T>): Promise<T> {
  if (!this.#options.enabled || this.#options.environment !== "synthetic_demo") throw new MobileClientError("MOBILE_DISABLED");
  if (this.#busy) throw new MobileClientError("MOBILE_BUSY");
  this.#busy = true;
  try { return await work(); }
  catch (error) {
   if (error instanceof MobileClientError) throw error;
   this.#ready = false;
   // Discard provider, driver, schema and vault errors; never expose raw credentials or content.
   throw new MobileClientError("MOBILE_RECOVERY_REQUIRED");
  } finally { this.#busy = false; }
 }
 private async credentialKey(p: Partition) { return `m32.session.${await this.#options.partitionKey(p)}`; }
 private parseSession(raw: unknown, tenant: string, previous?: Partition) {
  const session = mobileSession.parse(raw);
  if (session.partition.tenantId !== tenant || session.partition.deviceInstanceId !== this.#options.deviceInstanceId
   || (previous && !samePartition(session.partition, previous))
   || session.lease.expiresAtMs - session.lease.issuedAtMs > this.#policy.readLeaseDurationMs) throw new MobileClientError("MOBILE_DENIED");
  return session;
 }
 private async data(): Promise<LocalData> {
  if (!this.#store || !this.#session) throw new MobileClientError("MOBILE_DENIED");
  const raw = await this.#store.read();
  if (raw === null) throw new MobileClientError("MOBILE_RECOVERY_REQUIRED");
  const saved = localData.parse(JSON.parse(raw));
  if (saved.metadata.localSchemaVersion !== 1 || !samePartition(saved.metadata.partition, this.#session.partition)) throw new MobileClientError("MOBILE_DENIED");
  return saved;
 }
 private canRead() {
  const s = this.#session;
  if (!this.#ready || !s) throw new MobileClientError("MOBILE_DENIED");
  const result = evaluateMobileReadV1({ version: "mobile-read-evaluation.v1", policy: this.#policy, partition: s.partition,
   localMetadata: { version: "mobile-local-metadata.v1", partition: s.partition, localSchemaVersion: 1 }, lease: s.lease,
   authority: "valid", reconnectRequired: false, clock: this.#options.clock() });
  if (!result.canRead) { this.#ready = false; throw new MobileClientError("MOBILE_DENIED"); }
 }
 private async open(session: MobileSession, create: boolean) {
  this.#ready = false;
  const store = await this.#resources.open(session.partition, create);
  if (store.encryption !== "sqlcipher") { await store.close(); throw new MobileClientError("MOBILE_DENIED"); }
  this.#store = store; this.#session = session;
  try {
   if (create) {
    if (await store.read() !== null) throw new MobileClientError("MOBILE_RECOVERY_REQUIRED");
    await store.write(JSON.stringify(localData.parse({ version: "mobile-cache.v1", metadata: { version: "mobile-local-metadata.v1", partition: session.partition, localSchemaVersion: 1 }, notes: [], files: [], unsyncedWork: "none" })));
   } else await this.data();
   await this.#vault.set(await this.credentialKey(session.partition), JSON.stringify(session));
   await this.#vault.set(activeKey, JSON.stringify({ version: "mobile-active.v1", partition: session.partition, state: "active" }));
   this.#ready = true;
  } catch (error) { await store.close(); this.#store = null; throw error; }
 }
 exchange(tenantId: string) { return this.run(async () => {
  z.guid().parse(tenantId);
  if (await this.#vault.get(activeKey) !== null) throw new MobileClientError("MOBILE_DENIED");
  const session = this.parseSession(await this.#provider.exchange({ version: "mobile-exchange.v1", requestedTenantId: tenantId,
   commandId: this.#options.uuid(), deviceInstanceId: this.#options.deviceInstanceId }), tenantId);
  await this.open(session, true);
 }); }
 /** Restore SECURE metadata only. No database/file read until server reconnect succeeds. */
 resume() { return this.run(async () => {
  this.#ready = false; await this.#store?.close(); this.#store = null; this.#session = null;
  const raw = await this.#vault.get(activeKey); if (!raw) return;
  const active = activeRecord.parse(JSON.parse(raw));
  if (active.state !== "active") throw new MobileClientError("MOBILE_RECOVERY_REQUIRED");
  const rawSession = await this.#vault.get(await this.credentialKey(active.partition));
  const session = this.parseSession(JSON.parse(rawSession ?? "null"), active.partition.tenantId, active.partition);
  this.#session = session;
 }); }
 reconnect() { return this.run(async () => {
  this.#ready = false;
  const session = this.#session; if (!session) throw new MobileClientError("MOBILE_DENIED");
  const lease = mobileReadLeaseV1.parse(await this.#provider.reconnect({ version: "mobile-reconnect.v1", deviceInstanceId: session.partition.deviceInstanceId, access: session.access }, session.partition));
  if (!samePartition(lease.partition, session.partition) || lease.expiresAtMs - lease.issuedAtMs > this.#policy.readLeaseDurationMs) throw new MobileClientError("MOBILE_DENIED");
  await this.#store?.close(); this.#store = null;
  await this.open({ ...session, lease }, false);
 }); }
 refresh() { return this.run(async () => {
  this.#ready = false;
  const session = this.#session; if (!session) throw new MobileClientError("MOBILE_DENIED");
  // Consume locally BEFORE sending. A lost response must never trigger automatic refresh reuse.
  await this.#vault.remove(await this.credentialKey(session.partition)); this.#session = null;
  let response: unknown;
  try { response = await this.#provider.rotate({ version: "mobile-rotation.v1", commandId: this.#options.uuid(),
   deviceInstanceId: session.partition.deviceInstanceId, refresh: session.refresh }, session.partition); }
  finally { await this.#store?.close(); this.#store = null; }
  const next = this.parseSession(response, session.partition.tenantId, session.partition);
  await this.open(next, false);
 }); }
 read() { return this.run(async () => { this.canRead(); const data = await this.data(); this.canRead(); return structuredClone({ notes: data.notes, files: data.files }); }); }
 save(raw: unknown) { return this.run(async () => {
  this.canRead();
  const saved = await this.data();
  const data = localData.parse({ ...saved, ...z.object({ notes: localData.shape.notes, files: localData.shape.files, unsyncedWork: localData.shape.unsyncedWork }).strict().parse(raw) });
  this.canRead(); await this.#store!.write(JSON.stringify(data));
 }); }
 private async markCleanup(p: Partition) {
  this.#ready = false;
  await this.#vault.set(activeKey, JSON.stringify({ version: "mobile-active.v1", partition: p, state: "cleanup_required" }));
  await this.#options.beforePartitionCleanup?.(p);
  await this.#vault.remove(await this.credentialKey(p));
 }
 private async erase(p: Partition) {
  await this.#store?.close(); this.#store = null; this.#session = null;
  await this.#resources.destroy(p);
  await this.#vault.remove(activeKey);
 }
 logout() { return this.run(async () => {
  this.#ready = false;
  const raw = await this.#vault.get(activeKey); if (!raw) return;
  const p = activeRecord.parse(JSON.parse(raw)).partition;
  let unsynced: LocalData["unsyncedWork"] = "unknown";
  try { unsynced = (await this.data()).unsyncedWork; } catch { /* unknown never authorizes erasure */ }
  await this.markCleanup(p);
  try {
   const result = await this.#provider.deviceCommand({ version: "mobile-device-command.v1", commandId: this.#options.uuid(), deviceInstanceId: p.deviceInstanceId, requestedTenantId: p.tenantId, action: "logout" }, p);
   revoked.parse(result);
  } finally { await this.#store?.close(); this.#store = null; this.#session = null; }
  if (unsynced !== "none") throw new MobileClientError("MOBILE_UNSYNCED_POLICY_HOLD");
  await this.erase(p);
 }); }
 switchTenant(nextTenantId: string) { return this.run(async () => {
  this.#ready = false; z.guid().parse(nextTenantId);
  const session = this.#session; if (!session || nextTenantId === session.partition.tenantId) throw new MobileClientError("MOBILE_DENIED");
  const saved = await this.data();
  if (saved.unsyncedWork !== "none") throw new MobileClientError("MOBILE_UNSYNCED_POLICY_HOLD");
  // The server authorizes target membership before revoking the old family.
  const next = this.parseSession(await this.#provider.deviceCommand({ version: "mobile-device-command.v1", commandId: this.#options.uuid(), deviceInstanceId: session.partition.deviceInstanceId,
   requestedTenantId: session.partition.tenantId, action: "tenant_switch", nextTenantId }, session.partition), nextTenantId);
  if (next.partition.userId !== session.partition.userId) throw new MobileClientError("MOBILE_DENIED");
  await this.markCleanup(session.partition);
  await this.erase(session.partition);
  await this.open(next, true);
 }); }
 /** Process stop closes the handle and drops memory; persisted credentials remain in the secure vault. */
 close() { return this.run(async () => { this.#ready = false; await this.#store?.close(); this.#store = null; this.#session = null; }); }
}
