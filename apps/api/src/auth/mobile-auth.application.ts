import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { mobileAccessV1, mobileAuthPolicySpecimenV1, mobileExchangeV1, mobilePartitionV1, mobileRefreshV1, type SyntheticMobileAuthStore, type MobileAuthStateV1 } from "@jobguard/core";
import { MemoryAuthProvider, type AuthPrincipal } from "./auth-provider.js";
import { resolveVerifiedTenantContext, type TenantRequestCredentials } from "./principal-bridge.js";

const command = z.guid();
const device = mobilePartitionV1.shape.deviceInstanceId;
const exchange = mobileExchangeV1.extend({ commandId: command, deviceInstanceId: device });
const refresh = z.object({ version: z.literal("mobile-rotation.v1"), commandId: command, deviceInstanceId: device, refresh: mobileRefreshV1 }).strict();
const access = z.object({ version: z.literal("mobile-reconnect.v1"), deviceInstanceId: device, access: mobileAccessV1 }).strict();
const lifecycle = z.object({ version: z.literal("mobile-device-command.v1"), commandId: command, deviceInstanceId: device, action: z.enum(["logout", "revoke", "tenant_switch"]), requestedTenantId: z.guid(), nextTenantId: z.guid().optional() }).strict().refine(x => (x.action === "tenant_switch") === (x.nextTenantId !== undefined));
type Policy = z.infer<typeof mobileAuthPolicySpecimenV1>;
type Reason = "logout" | "revoke" | "tenant_switch" | "reuse";
type DeviceRecord = MobileAuthStateV1["devices"][number][1];
type Family = Omit<MobileAuthStateV1["families"][number][1], "usedRefresh"> & { usedRefresh: Set<string> };
export class MobileServerError extends Error {
 constructor(readonly code: "MOBILE_DISABLED" | "MOBILE_INVALID_INPUT" | "MOBILE_DENIED" | "MOBILE_REPLAY" | "MOBILE_COMMAND_CONFLICT") { super(code); this.name = "MobileServerError"; }
}
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

/** DARK synthetic fake only. Not registered in Nest, web, sync or the principal bridge.
 * Auth.js is not installed. This seam deliberately accepts only the existing memory AuthProvider.
 * Optional synthetic persistence serializes state across instances. No live provider or production policy.
 */
export class SyntheticMobileAuthApplication {
 #devices = new Map<string, DeviceRecord>();
 #families = new Map<string, Family>();
 #commands = new Map<string, string>();
 #tail: Promise<unknown> = Promise.resolve();
 readonly #policy: Policy;
 readonly #source: MemoryAuthProvider;
 readonly #options: Readonly<{ environment?: string; enabled?: boolean; allowedOrigin: string; now: () => number; token?: () => string; uuid?: () => string; store?: SyntheticMobileAuthStore }>;
 constructor(
  source: MemoryAuthProvider,
  policy: unknown,
  options: { environment?: string; enabled?: boolean; allowedOrigin: string; now: () => number; token?: () => string; uuid?: () => string; store?: SyntheticMobileAuthStore },
 ) {
  this.#source = source;
  this.#options = Object.freeze({ ...options });
  const parsed = mobileAuthPolicySpecimenV1.safeParse(policy);
  if (!parsed.success) throw new MobileServerError("MOBILE_INVALID_INPUT");
  this.#policy = parsed.data;
 }

 exchange(raw: unknown, credentials: TenantRequestCredentials) {
  return this.run(async () => {
   const input = this.parse(exchange, raw);
   if (credentials.requestedTenantId !== input.requestedTenantId) throw new MobileServerError("MOBILE_DENIED");
   const principal = await this.authorize(credentials, input.requestedTenantId);
   const commit = this.claim(principal, input.commandId, input);
   const result = this.issue(principal, input.requestedTenantId, input.deviceInstanceId);
   commit();
   return result;
  });
 }

 rotate(raw: unknown, credentials: TenantRequestCredentials) {
  return this.run(async () => {
   const input = this.parse(refresh, raw);
   const principal = await this.authorize(credentials);
   const tokenDigest = digest(input.refresh.credential);
   const family = [...this.#families.values()].find(f => f.refreshDigest === tokenDigest || f.usedRefresh.has(tokenDigest));
   this.assertFamily(family, principal, credentials, input.deviceInstanceId);
   // Replays, including an identical command after a lost response, revoke the entire family.
   if (family.usedRefresh.has(tokenDigest)) { this.revokeFamily(family, "reuse"); throw new MobileServerError("MOBILE_DENIED"); }
   if (family.refreshExpiresAtMs <= this.time()) throw new MobileServerError("MOBILE_DENIED");
   const commit = this.claim(principal, input.commandId, input);
   const next = this.makePair();
   const now = this.time();
   this.replacePair(family, next, now);
   family.usedRefresh.add(tokenDigest);
   commit();
   return this.result(family, next);
  });
 }

 reconnect(raw: unknown, credentials: TenantRequestCredentials) {
  return this.run(async () => {
   const input = this.parse(access, raw);
   const principal = await this.authorize(credentials);
   const family = [...this.#families.values()].find(f => f.accessDigest === digest(input.access.credential));
   this.assertFamily(family, principal, credentials, input.deviceInstanceId);
   if (family.accessExpiresAtMs <= this.time()) throw new MobileServerError("MOBILE_DENIED");
   // Revalidate source session and membership on every reconnect before renewing a lease.
   this.renewLease(family, this.time());
   return this.lease(family);
  });
 }

 deviceCommand(raw: unknown, credentials: TenantRequestCredentials) {
  return this.run(async () => {
   const input = this.parse(lifecycle, raw);
   const principal = await this.authorize(credentials, input.requestedTenantId);
   if (credentials.requestedTenantId !== input.requestedTenantId || input.nextTenantId === input.requestedTenantId) throw new MobileServerError("MOBILE_DENIED");
   if (input.nextTenantId) await this.authorize(credentials, input.nextTenantId);
   const commit = this.claim(principal, input.commandId, input);
   // Logout/revoke creates a tombstone even if registration has not arrived yet.
   const key = this.deviceKey(principal.identityUserId, input.requestedTenantId, input.deviceInstanceId);
   if (input.action === "tenant_switch") {
    // Prepare the replacement before invalidating anything; failure leaves the old state intact.
    const pair = this.makePair();
    const next = this.issue(principal, input.nextTenantId!, input.deviceInstanceId, pair);
    this.revokeDevice(key, principal.identityUserId, input.requestedTenantId, input.deviceInstanceId, input.action);
    commit();
    return next;
   }
   for (const [deviceKey, record] of this.#devices) {
    if (record.userId === principal.identityUserId && record.deviceDigest === digest(input.deviceInstanceId))
     this.revokeDevice(deviceKey, record.userId, record.tenantId, input.deviceInstanceId, input.action);
   }
   // All-tenant tombstone also prevents exchange into a tenant not previously registered.
   this.revokeDevice(this.deviceKey(principal.identityUserId, "*", input.deviceInstanceId), principal.identityUserId, input.requestedTenantId, input.deviceInstanceId, input.action);
   this.revokeDevice(key, principal.identityUserId, input.requestedTenantId, input.deviceInstanceId, input.action);
   commit();
   return { version: "mobile-device-revoked.v1" as const, environment: "synthetic_demo" as const };
  });
 }

 /** Fixture inspection contains no bearer credentials, source secrets, email or free text. */
 fixtureRecords() {
  return this.run(async () => structuredClone({ devices: [...this.#devices.values()], families: [...this.#families.values()].map(f => ({ partition: f.partition, expiresAtMs: f.expiresAtMs, revokedAtMs: f.revokedAtMs, reason: f.reason, lease: this.lease(f) })) }));
 }

 private async run<T>(work: () => Promise<T>): Promise<T> {
  this.assertEnabled();
  // All state transitions, including async authority checks, serialize in this fake instance.
  const pending = this.#tail.then(async () => {
   if (!this.#options.store) return work();
   return this.#options.store.transaction<{ ok: true; value: T } | { ok: false; error: unknown }>(async state => {
    this.restore(state);
    // A denied refresh replay must COMMIT its family revocation before reporting denial.
    // Other failures restore their pre-command snapshot, avoiding partial issue/switch state.
    try { const value = await work(); return { state: this.snapshot(), result: { ok: true as const, value } }; }
    catch (error) {
     const revoked = [...this.#families.values()].filter(f => f.reason === "reuse" && f.revokedAtMs !== undefined);
     this.restore(state);
     for (const f of revoked) this.#families.set(f.partition.mobileSessionId, f);
     return { state: this.snapshot(), result: { ok: false as const, error } };
    }
   }).then(result => { if (!result.ok) throw result.error; return result.value; });
  });
  this.#tail = pending.catch(() => undefined);
  try { return await pending; }
  catch (error) { if (error instanceof MobileServerError) throw error; throw new MobileServerError("MOBILE_DENIED"); }
 }
 private snapshot(): MobileAuthStateV1 {
  return { version: "mobile-auth-state.v1", environment: "synthetic_demo", devices: [...this.#devices],
   families: [...this.#families].map(([id, f]) => [id, { ...f, usedRefresh: [...f.usedRefresh] }]), commands: [...this.#commands] };
 }
 private restore(state: MobileAuthStateV1) {
  this.#devices = new Map(state.devices.map(([id, d]) => [id, { ...d }]));
  this.#families = new Map(state.families.map(([id, f]) => [id, { ...f, partition: { ...f.partition }, usedRefresh: new Set(f.usedRefresh) }]));
  this.#commands = new Map(state.commands);
 }
 private assertEnabled() {
  if (this.#options.enabled !== true || this.#options.environment !== "synthetic_demo" || !(this.#source instanceof MemoryAuthProvider)) throw new MobileServerError("MOBILE_DISABLED");
 }
 private parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new MobileServerError("MOBILE_INVALID_INPUT");
  return parsed.data;
 }
 private async authorize(credentials: TenantRequestCredentials, tenantId = credentials.requestedTenantId): Promise<AuthPrincipal> {
  // Never silently override conflicting tenant selectors in the caller's envelope.
  if (!tenantId || (credentials.tenantHeader && credentials.tenantHeader !== credentials.requestedTenantId)) throw new MobileServerError("MOBILE_DENIED");
  const context = await resolveVerifiedTenantContext(this.#source, { ...credentials, requestedTenantId: tenantId, tenantHeader: undefined }, this.#options.allowedOrigin);
  if (context.tenantId !== tenantId) throw new MobileServerError("MOBILE_DENIED");
  const principal = await this.#source.authenticate(credentials.sessionToken!);
  if (!principal) throw new MobileServerError("MOBILE_DENIED");
  return principal;
 }
 private claim(principal: AuthPrincipal, id: string, input: unknown) {
  const key = `${principal.identityUserId}:${id}`, hash = digest(JSON.stringify(input)), prior = this.#commands.get(key);
  if (prior) throw new MobileServerError(prior === hash ? "MOBILE_REPLAY" : "MOBILE_COMMAND_CONFLICT");
  return () => { this.#commands.set(key, hash); };
 }
 private deviceKey(user: string, tenant: string, instance: string) { return `${user}:${tenant}:${digest(instance)}`; }
 private time() {
  const now = this.#options.now();
  if (!Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(now + this.#policy.sessionDurationMs)) throw new MobileServerError("MOBILE_DENIED");
  return now;
 }
 private uuid() { return z.guid().parse((this.#options.uuid ?? randomUUID)()); }
 private makePair() {
  const make = this.#options.token ?? (() => randomBytes(32).toString("base64url"));
  const pair = { access: this.parse(mobileAccessV1, { version: "mobile-access.v1", credential: make() }), refresh: this.parse(mobileRefreshV1, { version: "mobile-refresh.v1", credential: make() }) };
  const a = digest(pair.access.credential), r = digest(pair.refresh.credential);
  if (a === r || [...this.#families.values()].some(f => [f.accessDigest, f.refreshDigest, ...f.usedRefresh].some(d => d === a || d === r))) throw new MobileServerError("MOBILE_DENIED");
  return pair;
 }
 private issue(principal: AuthPrincipal, tenantId: string, instance: string, pair = this.makePair()) {
  const key = this.deviceKey(principal.identityUserId, tenantId, instance);
  if (this.#devices.get(key)?.revokedAtMs !== undefined || this.#devices.get(this.deviceKey(principal.identityUserId, "*", instance))?.revokedAtMs !== undefined) throw new MobileServerError("MOBILE_DENIED");
  const member = this.#source.fixtureMemberships().find(m => m.identityUserId === principal.identityUserId && m.tenantId === tenantId && m.revokedAt === undefined);
  if (!member) throw new MobileServerError("MOBILE_DENIED");
  const now = this.time();
  const family: Family = {
   partition: { userId: principal.identityUserId, tenantId, membershipId: member.id, mobileSessionId: this.uuid(), deviceInstanceId: instance },
   sourceSessionId: principal.sessionId, deviceKey: key, expiresAtMs: now + this.#policy.sessionDurationMs,
   accessDigest: "", accessExpiresAtMs: 0, refreshDigest: "", refreshExpiresAtMs: 0, usedRefresh: new Set(), leaseId: this.uuid(), leaseIssuedAtMs: now, leaseExpiresAtMs: 0,
  };
  if (this.#families.has(family.partition.mobileSessionId)) throw new MobileServerError("MOBILE_DENIED");
  this.replacePair(family, pair, now);
  this.#devices.set(key, { userId: principal.identityUserId, tenantId, deviceDigest: digest(instance) });
  this.#families.set(family.partition.mobileSessionId, family);
  return this.result(family, pair);
 }
 private replacePair(family: Family, pair: ReturnType<SyntheticMobileAuthApplication["makePair"]>, now: number) {
  this.renewLease(family, now);
  family.accessDigest = digest(pair.access.credential); family.refreshDigest = digest(pair.refresh.credential);
  family.accessExpiresAtMs = Math.min(now + this.#policy.accessDurationMs, family.expiresAtMs);
  family.refreshExpiresAtMs = Math.min(now + this.#policy.refreshDurationMs, family.expiresAtMs);
 }
 private renewLease(family: Family, now: number) {
  family.leaseId = this.uuid(); family.leaseIssuedAtMs = now;
  family.leaseExpiresAtMs = Math.min(now + this.#policy.readLeaseDurationMs, family.expiresAtMs);
 }
 private lease(f: Family) {
  return { version: "mobile-read-lease.v1" as const, environment: "synthetic_demo" as const, leaseId: f.leaseId, partition: { ...f.partition }, policyVersion: this.#policy.policyVersion, issuedAtMs: f.leaseIssuedAtMs, expiresAtMs: f.leaseExpiresAtMs };
 }
 private result(f: Family, pair: ReturnType<SyntheticMobileAuthApplication["makePair"]>) {
  return { version: "mobile-session.v1" as const, environment: "synthetic_demo" as const, ...pair, partition: { ...f.partition }, accessExpiresAtMs: f.accessExpiresAtMs, refreshExpiresAtMs: f.refreshExpiresAtMs, lease: this.lease(f) };
 }
 private assertFamily(f: Family | undefined, p: AuthPrincipal, credentials: TenantRequestCredentials, instance: string): asserts f is Family {
  if (!f || f.revokedAtMs !== undefined || f.expiresAtMs <= this.time() || f.sourceSessionId !== p.sessionId
   || f.partition.userId !== p.identityUserId || f.partition.tenantId !== credentials.requestedTenantId || f.partition.deviceInstanceId !== instance
   || this.#devices.get(f.deviceKey)?.revokedAtMs !== undefined) throw new MobileServerError("MOBILE_DENIED");
  const member = this.#source.fixtureMemberships().find(m => m.id === f.partition.membershipId && m.revokedAt === undefined);
  if (!member) throw new MobileServerError("MOBILE_DENIED");
 }
 private revokeFamily(f: Family, reason: Reason) { f.revokedAtMs = this.time(); f.reason = reason; f.leaseExpiresAtMs = Math.min(f.leaseExpiresAtMs, f.revokedAtMs); }
 private revokeDevice(key: string, userId: string, tenantId: string, instance: string, reason: Reason) {
  this.#devices.set(key, { userId, tenantId, deviceDigest: digest(instance), revokedAtMs: this.time(), reason });
  for (const f of this.#families.values()) if (f.deviceKey === key) this.revokeFamily(f, reason);
 }
}
