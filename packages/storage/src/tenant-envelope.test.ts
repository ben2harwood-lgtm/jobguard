import { describe, expect, it, vi, afterEach } from "vitest";
import { assertSyntheticRoute, SyntheticTenantEnvelopeStore, TenantEnvelopeError, type EnvelopeBinding, type SyntheticTenantRoute } from "./tenant-envelope.js";
import { InMemoryTenantKms } from "./tenant-kms-fake.js";

const binding: EnvelopeBinding = { version: 1, tenantId: "synthetic-a", jobId: "synthetic-job-a",
  objectId: "synthetic-photo", objectVersionId: "synthetic-version-a", field: "evidence-metadata" };
const route: SyntheticTenantRoute = { version: 1, tenantId: binding.tenantId, jobId: binding.jobId,
  destinationTenantId: binding.tenantId, destinationJobId: binding.jobId, topology: "shared_rls", channel: "repository" };
const metadata = { version: 1, classification: "synthetic-fixture", label: "practice-photo" } as const;
function setup() {
  const kms = new InMemoryTenantKms();
  kms.rotate(binding.tenantId);
  kms.rotate("synthetic-b");
  const store = new SyntheticTenantEnvelopeStore(kms, true);
  const envelope = store.encrypt(route, binding, metadata);
  return { kms, store, envelope };
}
afterEach(() => vi.unstubAllEnvs());

describe("M5-8 dark tenant envelopes", () => {
  it("defaults off and refuses all production operations even when explicitly enabled", () => {
    const { kms, store, envelope } = setup();
    expect(() => new SyntheticTenantEnvelopeStore(kms).encrypt(route, binding, metadata)).toThrow(TenantEnvelopeError);
    vi.stubEnv("NODE_ENV", "production");
    expect(() => store.encrypt(route, binding, metadata)).toThrow(TenantEnvelopeError);
    expect(() => store.decrypt(route, binding, envelope)).toThrow(TenantEnvelopeError);
    expect(() => store.rewrap(route, binding, envelope)).toThrow(TenantEnvelopeError);
    expect(() => kms.wrap(binding.tenantId, Buffer.alloc(32), "fixture")).toThrow(TenantEnvelopeError);
  });

  it("defaults routing to shared RLS and rejects unimplemented isolation topologies", () => {
    const { topology: _topology, ...defaultRoute } = route;
    expect(assertSyntheticRoute(defaultRoute, binding).topology).toBe("shared_rls");
    for (const topology of ["schema_per_tenant", "database_per_tenant"]) {
      expect(() => assertSyntheticRoute({ ...route, topology }, binding)).toThrow(TenantEnvelopeError);
    }
  });

  it("leaves the original usable when rotation migration fails before replacement", () => {
    const { kms, store, envelope } = setup();
    const original = JSON.stringify(envelope);
    kms.rotate(binding.tenantId);
    const deniedWrap = new SyntheticTenantEnvelopeStore({
      unwrap: (...args) => kms.unwrap(...args),
      wrap: () => { throw new Error("synthetic denied wrap"); },
    }, true);
    expect(() => deniedWrap.rewrap(route, binding, envelope)).toThrow(TenantEnvelopeError);
    expect(JSON.stringify(envelope)).toBe(original);
    expect(store.decrypt(route, binding, envelope)).toEqual(metadata);
    const forwardFix = store.rewrap(route, binding, envelope);
    expect(store.decrypt(route, binding, forwardFix)).toEqual(metadata);
    // Revocation before use is also final for a newly encrypted record.
    kms.revoke(binding.tenantId, 2);
    expect(() => store.encrypt(route, binding, metadata)).toThrow(TenantEnvelopeError);
    expect(() => store.decrypt(route, binding, forwardFix)).toThrow(TenantEnvelopeError);
    expect(store.decrypt(route, binding, envelope)).toEqual(metadata);
  });

  it("encrypts only versioned synthetic evidence metadata, without plaintext in the record", () => {
    const { store, envelope } = setup();
    expect(store.decrypt(route, binding, JSON.parse(JSON.stringify(envelope)))).toEqual(metadata);
    expect(envelope.wrappedKey.keyVersion).toBe(1);
    expect(JSON.stringify(envelope)).not.toContain(metadata.label);
    expect(() => store.encrypt(route, binding, { ...metadata, freeText: "private" })).toThrow(TenantEnvelopeError);
    expect(() => store.encrypt(route, { ...binding, tenantId: "real-tenant" }, metadata)).toThrow(TenantEnvelopeError);
  });

  it("rotates, re-wraps without changing ciphertext and retains readable rollback/backup copies", () => {
    const { kms, store, envelope } = setup();
    const backup = JSON.stringify(envelope);
    expect(kms.rotate(binding.tenantId)).toBe(2);
    const next = store.rewrap(route, binding, envelope);
    expect(next.wrappedKey.keyVersion).toBe(2);
    expect(next.ciphertext).toEqual(envelope.ciphertext);
    expect(JSON.stringify(envelope)).toBe(backup);
    expect(store.decrypt({ ...route, channel: "restore" }, binding, JSON.parse(backup))).toEqual(metadata);
    expect(store.decrypt(route, binding, next)).toEqual(metadata);
    expect(store.decrypt(route, binding, store.rewrap(route, binding, next))).toEqual(metadata);
    kms.revoke(binding.tenantId, 1);
    expect(() => store.decrypt(route, binding, envelope)).toThrow(TenantEnvelopeError);
    expect(store.decrypt(route, binding, next)).toEqual(metadata);
  });

  it("fails closed on denied, missing, wrong and revoked keys, including warm/replayed reads", () => {
    const { kms, store, envelope } = setup();
    expect(store.decrypt(route, binding, envelope)).toEqual(metadata);
    kms.deny(binding.tenantId);
    expect(() => store.decrypt(route, binding, envelope)).toThrow(TenantEnvelopeError);
    expect(() => store.rewrap(route, binding, envelope)).toThrow(TenantEnvelopeError);
    kms.deny(binding.tenantId, false);
    expect(store.decrypt(route, binding, envelope)).toEqual(metadata);
    expect(() => new SyntheticTenantEnvelopeStore(new InMemoryTenantKms(), true).decrypt(route, binding, envelope)).toThrow(TenantEnvelopeError);
    kms.rotate(binding.tenantId);
    expect(() => store.decrypt(route, binding, { ...envelope, wrappedKey: { ...envelope.wrappedKey, keyVersion: 2 } })).toThrow(TenantEnvelopeError);
    kms.revoke(binding.tenantId, 1);
    kms.revoke(binding.tenantId, 1); // Cancellation replay, including before a later read.
    expect(() => store.decrypt(route, binding, envelope)).toThrow(TenantEnvelopeError);
  });

  it.each(["repository", "cache", "worker", "sync", "export", "restore"] as const)("binds %s source/destination to tenant and job under shared RLS", channel => {
    const { store, envelope } = setup();
    const r = { ...route, channel };
    expect(store.decrypt(r, binding, envelope)).toEqual(metadata);
    for (const change of [{ tenantId: "synthetic-b" }, { destinationTenantId: "synthetic-b" },
      { jobId: "synthetic-job-b" }, { destinationJobId: "synthetic-job-b" }, { topology: "database_per_tenant" }]) {
      expect(() => store.decrypt({ ...r, ...change }, binding, envelope)).toThrow(TenantEnvelopeError);
      expect(() => store.rewrap({ ...r, ...change }, binding, envelope)).toThrow(TenantEnvelopeError);
      expect(() => store.encrypt({ ...r, ...change }, binding, metadata)).toThrow(TenantEnvelopeError);
    }
    const otherBinding = { ...binding, tenantId: "synthetic-b" };
    const otherRoute = { ...r, tenantId: "synthetic-b", destinationTenantId: "synthetic-b" };
    expect(() => store.decrypt(otherRoute, otherBinding, envelope)).toThrow(TenantEnvelopeError);
    // Even rewriting all visible routing metadata cannot make a foreign key work.
    expect(() => store.decrypt(otherRoute, otherBinding, { ...envelope, binding: otherBinding })).toThrow(TenantEnvelopeError);
    const other = store.encrypt(otherRoute, otherBinding, metadata);
    expect(() => store.decrypt(r, binding, { ...envelope, wrappedKey: other.wrappedKey })).toThrow(TenantEnvelopeError);
  });

  it.each(["jobId", "objectId", "objectVersionId"] as const)("authenticates %s against same-tenant relocation", field => {
    const { store, envelope } = setup();
    const altered = { ...binding, [field]: "synthetic-other" };
    const r = field === "jobId" ? { ...route, jobId: altered.jobId, destinationJobId: altered.jobId } : route;
    expect(() => store.decrypt(r, altered, { ...envelope, binding: altered })).toThrow(TenantEnvelopeError);
  });

  it("detects tampering, bounds input, and emits no secret, input, cause or provider details", () => {
    const { store, envelope } = setup();
    for (const value of [null, { ...envelope, version: 2 },
      { ...envelope, ciphertext: { ...envelope.ciphertext, bytes: "00" } },
      { ...envelope, ciphertext: { ...envelope.ciphertext, bytes: "aa".repeat(20000) } }]) {
      expect(() => store.decrypt(route, binding, value)).toThrow(TenantEnvelopeError);
    }
    const evil = new SyntheticTenantEnvelopeStore({
      wrap: () => { throw new Error("provider secret personal-data"); },
      unwrap: () => { throw new Error("provider secret personal-data"); },
    }, true);
    try { evil.decrypt(route, binding, envelope); expect.fail("must refuse"); }
    catch (error) {
      expect(error).toBeInstanceOf(TenantEnvelopeError);
      expect(String(error)).not.toMatch(/provider|secret|personal-data/u);
      expect((error as Error).cause).toBeUndefined();
    }
  });

  it("allows duplicate stateless encrypt/decrypt requests without shared key or mutation", () => {
    const { store, envelope } = setup();
    const second = store.encrypt(route, binding, metadata);
    expect(second.ciphertext).not.toEqual(envelope.ciphertext);
    expect(second.wrappedKey).not.toEqual(envelope.wrappedKey);
    expect(store.decrypt(route, binding, second)).toEqual(metadata);
    expect(store.decrypt(route, binding, envelope)).toEqual(metadata);
    const changed = { ...metadata, label: "practice-note" };
    expect(store.decrypt(route, binding, store.encrypt(route, binding, changed))).toEqual(changed);
    // No command id, fee, allocation, locked bill or authoritative write exists in this slice.
  });
});
