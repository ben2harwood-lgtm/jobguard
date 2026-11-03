import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  ConnectorInputError, PostgresConnectorIntake, SyntheticConnectorInbound, SYNTHETIC_CONNECTOR_PROFILE,
  type ConnectorInput, type ConnectorIntake, type ConnectorReceipt, type ConnectorSecretStore,
} from "./inbound.js";

const config = { CONNECTOR_CONFIG_VERSION: "connector-environment.v1", JOBGUARD_ENV: "synthetic_demo",
  CONNECTOR_ENDPOINT_KIND: "fake", CONNECTOR_ENDPOINT_REF: "fixture:inbound", CONNECTOR_CREDENTIAL_REF: "fixture:keyring" };
const now = 1_798_000_000_000;
const work: ConnectorInput = { version: "connector-input.v1", eventId: "fixture:event", kind: "work_order", subject: "fixture:order", revision: 1, document: "fixture:order_document" };
const bill: ConnectorInput = { version: "connector-input.v1", eventId: "fixture:bill", kind: "billing_status", subject: "fixture:invoice", revision: 1, status: "paid" };
const bindingId = "10000000-0000-4000-8000-000000000001";
const key = Buffer.alloc(32, 42), nextKey = Buffer.alloc(32, 43);
const encode = (input: unknown) => Buffer.from(JSON.stringify(input));
function sign(body: Uint8Array, channel = "webhook", timestamp = String(now / 1000), keyId = "current", secret = key) {
  return { version: "connector-signature.v1", keyId, timestamp,
    signature: createHmac("sha256", secret).update(`connector-signature.v1\n${channel}\n${keyId}\n${bindingId}\n${timestamp}\n`).update(body).digest("hex") };
}
// Deterministic adapter contract fake; PostgreSQL guarantees are tested separately in CI.
function fixture() {
  const rows = new Map<string, { input: string; receipt: ConnectorReceipt }>();
  const stage = vi.fn<ConnectorIntake["stage"]>(async (_binding, _token, input) => {
    const canonical = JSON.stringify(Object.entries(input).sort());
    const old = rows.get(input.eventId);
    if (old && old.input !== canonical) throw new Error("conflict");
    if (old) return old.receipt;
    const receipt: ConnectorReceipt = { version: "connector-receipt.v1", eventId: input.eventId, state: "staged", domainEffects: 0 };
    rows.set(input.eventId, { input: canonical, receipt }); return receipt;
  });
  const ring: Record<string, Uint8Array> = { current: key };
  const read = vi.fn<ConnectorSecretStore["read"]>(async () => ({ bindingId, databaseToken: "fixture-database-token-with-32-bytes", signingKeys: ring }));
  return { rows, stage, read, ring, inbound: new SyntheticConnectorInbound(config, { read }, { stage }, () => now) };
}
const refused = expect.objectContaining({ code: "CONNECTOR_INPUT_REFUSED" });
describe("ENT-13a dark inbound transport contracts", () => {
  it.each(["webhook", "api_push"] as const)("stages a signed %s work order and billing source fact, without domain effects", async channel => {
    const f = fixture();
    for (const input of [work, bill]) {
      const bytes = encode(input);
      expect(await f.inbound.receive(channel, sign(bytes, channel), bytes)).toEqual({ version: "connector-receipt.v1", eventId: input.eventId, state: "staged", domainEffects: 0 });
    }
    expect(f.rows.size).toBe(2);
    expect(f.read).toHaveBeenCalledWith("fixture:keyring");
  });
  it("duplicates across channels and reordered revisions preserve first receipts", async () => {
    const f = fixture(); const bytes = encode(work);
    const first = await f.inbound.receive("webhook", sign(bytes), bytes);
    expect(await f.inbound.receive("api_push", sign(bytes, "api_push"), bytes)).toEqual(first);
    const later = encode({ ...work, eventId: "fixture:later", revision: 3 });
    const earlier = encode({ ...work, eventId: "fixture:earlier", revision: 2 });
    await f.inbound.receive("webhook", sign(later), later);
    await f.inbound.receive("webhook", sign(earlier), earlier);
    const changed = encode({ ...work, document: "fixture:changed" });
    await expect(f.inbound.receive("webhook", sign(changed), changed)).rejects.toMatchObject(refused);
    expect(f.rows.size).toBe(3);
  });
  it.each([-301, 301, -99999, 99999])("refuses clock skew/replay %s seconds before storage or intake", async delta => {
    const f = fixture(), body = encode(work);
    await expect(f.inbound.receive("webhook", sign(body, "webhook", String(now / 1000 + delta)), body)).rejects.toMatchObject(refused);
    expect(f.read).not.toHaveBeenCalled(); expect(f.stage).not.toHaveBeenCalled();
  });
  it.each([-300, 300])("accepts the synthetic skew boundary %s", async delta => {
    const f = fixture(), body = encode(work);
    await expect(f.inbound.receive("webhook", sign(body, "webhook", String(now / 1000 + delta)), body)).resolves.toMatchObject({ state: "staged" });
  });
  it("refuses signatures for a different channel, bytes, timestamp, key, or bad digest", async () => {
    const f = fixture(), body = encode(work), good = sign(body);
    for (const headers of [sign(body, "api_push"), sign(encode(bill)), { ...good, signature: "0".repeat(64) },
      { ...good, timestamp: String(now / 1000 + 1) }, { ...good, keyId: "absent" }, { ...good, signature: "x" },
      { ...good, signature: good.signature + "\n" }, { ...good, timestamp: good.timestamp + "\n" }, { ...good, tenantId: "forged" }]) {
      await expect(f.inbound.receive("webhook", headers, body)).rejects.toMatchObject(refused);
    }
    expect(f.stage).not.toHaveBeenCalled();
  });
  it("binds the signature to the server-selected connector even when two bindings share a key", async () => {
    const f = fixture(), body = encode(work);
    f.read.mockResolvedValue({ bindingId: "20000000-0000-4000-8000-000000000002", databaseToken: "fixture-database-token-with-32-bytes", signingKeys: f.ring });
    await expect(f.inbound.receive("webhook", sign(body), body)).rejects.toMatchObject(refused);
    expect(f.stage).not.toHaveBeenCalled();
  });
  it("reconciles a committed intake with a lost acknowledgement by the same event identity", async () => {
    const f = fixture(), bytes = encode(work), normal = f.stage.getMockImplementation()!;
    f.stage.mockImplementationOnce(async (...args) => { await normal(...args); throw new Error("lost acknowledgement"); });
    await expect(f.inbound.receive("webhook", sign(bytes), bytes)).rejects.toMatchObject(refused);
    expect(f.rows.size).toBe(1);
    await expect(f.inbound.receive("webhook", sign(bytes), bytes)).resolves.toMatchObject({ state: "staged" });
    expect(f.rows.size).toBe(1);
  });
  it("refuses a request that expires while secret storage is awaited", async () => {
    const f = fixture(), body = encode(work); let clock = now;
    const inbound = new SyntheticConnectorInbound(config, { read: async ref => { clock += 301_000; return f.read(ref); } }, {stage:f.stage}, () => clock);
    await expect(inbound.receive("webhook", sign(body), body)).rejects.toMatchObject(refused);
    expect(f.stage).not.toHaveBeenCalled();
  });
  it("rotation reloads the keyring and rejects retired keys even for duplicates", async () => {
    const f = fixture(), body = encode(work);
    const first = await f.inbound.receive("webhook", sign(body), body);
    f.ring.next = nextKey;
    expect(await f.inbound.receive("webhook", sign(body, "webhook", undefined, "next", nextKey), body)).toEqual(first);
    delete f.ring.current;
    await expect(f.inbound.receive("webhook", sign(body), body)).rejects.toMatchObject(refused);
  });
  it.each([null, [], {}, { ...work, revision: 0 }, { ...work, revision: 1.5 }, { ...work, revision: 2147483648 },
    { ...work, tenantId: "other" }, { ...work, kind: "approve" }, { ...work, pricePence: 1 }, { ...work, origin: "site" },
    { ...bill, amountPence: 1_000_000_000_001 }, { ...bill, allocations: [] }, { ...bill, lockedBillId: "fixture:bill" },
    { ...bill, statementId: "fixture:statement" }, { ...bill, shadowSignal: "fixture:hidden" },
    { ...bill, subject: "https://example.invalid" }, { ...work, document: "fixture:x\n" }, { ...bill, status: "refunded" },
  ])("refuses malformed or authority-bearing input %#", async input => {
    const f = fixture(), bytes = encode(input);
    await expect(f.inbound.receive("webhook", sign(bytes), bytes)).rejects.toMatchObject(refused);
    expect(f.stage).not.toHaveBeenCalled();
  });
  it("refuses oversized, invalid JSON and invalid UTF-8 without retaining their contents", async () => {
    const f = fixture();
    for (const bytes of [Buffer.alloc(SYNTHETIC_CONNECTOR_PROFILE.maxBytes + 1, 65), Buffer.from("{"), Buffer.from([0xff])]) {
      await expect(f.inbound.receive("webhook", sign(bytes), bytes)).rejects.toMatchObject(refused);
    }
    expect(f.stage).not.toHaveBeenCalled();
  });
  it("records reversal facts without allocating or modifying paid facts", async () => {
    const f = fixture(), paid = encode(bill), reversed = encode({ ...bill, status: "reversed", eventId: "fixture:reversal", revision: 2 });
    await f.inbound.receive("webhook", sign(paid), paid);
    await f.inbound.receive("webhook", sign(reversed), reversed);
    expect(f.rows.size).toBe(2); expect(f.rows.get(bill.eventId)?.input).toContain('paid');
    expect([...f.rows.values()].every(r => r.receipt.domainEffects === 0)).toBe(true);
  });
  it("refuses production and real endpoints even with synthetic keys", () => {
    const f = fixture();
    for (const raw of [{ ...config, JOBGUARD_ENV: "production" }, { ...config, CONNECTOR_ENDPOINT_KIND: "https" },
      { ...config, CONNECTOR_ENDPOINT_REF: "https://example.invalid" }, { ...config, enabled: true }]) {
      expect(() => new SyntheticConnectorInbound(raw, { read: f.read }, { stage: f.stage })).toThrow();
    }
  });
  it("copies signed bytes before awaiting secret retrieval", async () => {
    const f = fixture(), bytes = encode(work), signature = sign(bytes);
    const pending = f.inbound.receive("webhook", signature, bytes); bytes.fill(0);
    await expect(pending).resolves.toMatchObject({ eventId: work.eventId });
  });
  it("redacts store and SQL failures and rejects invalid adapter responses", async () => {
    const bytes = encode(work), sensitive = "secret-source-body-token";
    const adapter = new PostgresConnectorIntake({ query: vi.fn().mockRejectedValue(new Error(sensitive)) });
    await expect(adapter.stage("fixture", sensitive, work)).rejects.toEqual(new ConnectorInputError());
    const inbound = new SyntheticConnectorInbound(config, { read: async () => { throw new Error(sensitive); } }, fixture(), () => now);
    await expect(inbound.receive("webhook", sign(bytes), bytes)).rejects.toEqual(new ConnectorInputError());
    const f = fixture(); f.stage.mockResolvedValue({ secret: sensitive } as unknown as ConnectorReceipt);
    await expect(f.inbound.receive("webhook", sign(bytes), bytes)).rejects.toEqual(new ConnectorInputError());
  });
});
