import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { EmailDeliveryStore, type EmailDeliveryPorts } from "./email-delivery.store.js";
import { EmailForwardingConnector } from "./email-forwarding.connector.js";
import { ShadowDetectionWorker, type ShadowWorkerPorts } from "./shadow-detection.worker.js";
vi.mock("node:crypto", async importOriginal => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, createHash: vi.fn(actual.createHash) };
});
const { testTenantContext } = await import(new URL("../../../packages/db/test/tenant-context-test-utils.ts", import.meta.url).href);
const tenantId = "10000000-0000-4000-8000-000000000001", jobId = "10000000-0000-4000-8000-000000000002";
const messageId = "10000000-0000-4000-8000-000000000003", otherId = "10000000-0000-4000-8000-000000000004";
const context = testTenantContext(tenantId), text = "Please fit an outside tap.";
const config = { version: "email-forwarding-config.v1", environment: "synthetic_demo", transport: "fixture", enabled: true };
const bytes = Buffer.from(`Content-Type: text/plain\r\n\r\n${text}`);
const input = () => ({ version: "email-delivery.v1", messageId, alias: "fixture-job", bytes: Buffer.from(bytes) });
const digest = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), "sv7b-store-"));
  const ports: EmailDeliveryPorts = { resolveAlias: vi.fn(async () => ({ tenantId, jobId })), authorizeJob: vi.fn(async () => true),
    // Deliberately a fixture decoder, not a MIME parser or provider test.
    parseMime: vi.fn(async (raw: Uint8Array) => {
      if (!Buffer.from(raw).equals(bytes)) throw new Error("Unreadable fixture");
      return { version: "email-mime.v1", text, parts: [] };
    }) };
  return { directory, ports, store: new EmailDeliveryStore(directory, ports, config, () => "2026-10-29T07:00:00Z") };
}
describe("SV-7B durable DARK email delivery", () => {
  it("persists exact original, hash, receive time and immutable version across instances", async () => {
    const { store, directory, ports } = await setup();
    const receipt = await store.receive(input());
    expect(receipt).toMatchObject({ byteLength: bytes.length, rawSha256: digest(bytes), objectVersionId: `sha256:${digest(bytes)}`, serverReceivedAt: "2026-10-29T07:00:00Z", quarantine: [] });
    expect(Buffer.from(receipt.rawBase64, "base64")).toEqual(bytes);
    receipt.quarantine.push("unreadable");
    const restarted = new EmailDeliveryStore(directory, ports, config);
    const replay = await restarted.receive(input());
    expect(replay.quarantine).toEqual([]);
    expect(replay.serverReceivedAt).toBe("2026-10-29T07:00:00Z");
    expect(await readdir(directory)).toEqual([`${messageId}.json`]);
    expect(ports.parseMime).toHaveBeenCalledTimes(1);
  });
  it("serializes concurrent deliveries to one immutable observation identity", async () => {
    const { store, directory, ports } = await setup();
    const second = new EmailDeliveryStore(directory, ports, config);
    const results = await Promise.all(Array.from({ length: 8 }, (_, n) => (n % 2 ? second : store).receive(input())));
    expect(results.every(r => JSON.stringify(r) === JSON.stringify(results[0]))).toBe(true);
    expect(await readdir(directory)).toEqual([`${messageId}.json`]);
  });
  it("refuses and durably flags byte or alias conflicts without replacing the original", async () => {
    const { store, directory } = await setup();
    const original = await store.receive(input());
    for (const change of [{ bytes: Buffer.from("different") }, { alias: "fixture-other" }]) {
      await expect(store.receive({ ...input(), ...change })).rejects.toThrow("EMAIL_DELIVERY_CONFLICT");
    }
    expect(await store.receive(input())).toEqual(original);
    const flags = (await readdir(directory)).filter(f => f.includes("conflict"));
    expect(flags).toHaveLength(2);
    for (const flag of flags) expect(await readFile(join(directory, flag), "utf8")).not.toContain("different");
  });
  it("rejects concurrent conflicting first deliveries and retains exactly the winning bytes", async () => {
    const { store, directory } = await setup();
    const attempts = await Promise.allSettled([store.receive(input()), store.receive({ ...input(), bytes: Buffer.from("conflicting fixture") })]);
    expect(attempts.filter(a => a.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter(a => a.status === "rejected")).toMatchObject([{ reason: { code: "EMAIL_DELIVERY_CONFLICT" } }]);
    const saved = JSON.parse(await readFile(join(directory, `${messageId}.json`), "utf8"));
    expect(saved.rawSha256).toBe(digest(Buffer.from(saved.rawBase64, "base64")));
    expect((await readdir(directory)).filter(f => f.includes("conflict"))).toHaveLength(1);
  });
  it("snapshots caller bytes before asynchronous parsing and rejects unsupported MIME output", async () => {
    const { store, ports } = await setup();
    const delivery = input(), pending = store.receive(delivery);
    delivery.bytes.fill(0);
    expect((await pending).rawSha256).toBe(digest(bytes));
    vi.mocked(ports.parseMime).mockResolvedValue({ version: "email-mime.v1", text, parts: [], hiddenSignalCount: 5 });
    const held = await store.receive({ ...input(), messageId: otherId });
    expect(held.quarantine).toEqual(["unreadable"]);
    expect(JSON.stringify(held)).not.toContain("hiddenSignalCount");
  });
  it("holds unknown aliases permanently, without parsing or guessing a job", async () => {
    const { store, ports } = await setup();
    vi.mocked(ports.resolveAlias).mockResolvedValue(null);
    expect(await store.receive(input())).toMatchObject({ binding: null, quarantine: ["unknown_alias"], text: null });
    expect(ports.parseMime).not.toHaveBeenCalled();
    vi.mocked(ports.resolveAlias).mockResolvedValue({ tenantId, jobId });
    expect((await store.receive(input())).quarantine).toEqual(["unknown_alias"]);
    expect(await store.readOriginal(context, jobId, messageId)).toBeNull();
  });
  it.each([
    ["oversized", { bytes: new Uint8Array(100_001) }],
    ["encrypted", { encrypted: true }],
    ["encrypted", { contentType: "application/pdf" }],
    ["executable", { filename: "note.exe" }],
    ["executable", { bytes: Buffer.from("MZscript"), filename: "note.txt" }],
    ["unreadable", { readable: false }],
    ["unreadable", { filename: "harmless.txt" }],
  ])("quarantines %s parts; no attachment is handed to the worker", async (reason, change) => {
    const { store, ports } = await setup();
    vi.mocked(ports.parseMime).mockResolvedValue({ version: "email-mime.v1", text,
      parts: [{ bytes: Buffer.from("fixture"), contentType: "text/plain", filename: "part.txt", encrypted: false, readable: true, ...change }] });
    const receipt = await store.receive(input());
    expect(receipt.quarantine).toContain(reason); expect(receipt.text).toBeNull();
    expect(await store.readOriginal(context, jobId, messageId)).toBeNull();
  });
  it("holds oversized originals before parsing, and redacts unreadable MIME errors", async () => {
    const { store, ports } = await setup();
    expect((await store.receive({ ...input(), bytes: new Uint8Array(1_000_001) })).quarantine).toEqual(["oversized"]);
    expect(ports.parseMime).not.toHaveBeenCalled();
    vi.mocked(ports.parseMime).mockRejectedValue(new Error("secret address shadow=7"));
    const r = await store.receive({ ...input(), messageId: otherId });
    expect(r.quarantine).toEqual(["unreadable"]); expect(JSON.stringify(r)).not.toContain("secret");
  });
  it("stores only metadata for oversized originals and preserves holds and replay conflicts across restarts", async () => {
    const { store, directory, ports } = await setup();
    const oversized = { ...input(), bytes: Buffer.alloc(1_000_001, "x") };
    const receipt = await store.receive(oversized);
    expect(receipt).toMatchObject({ rawBase64: "", rawSha256: digest(oversized.bytes),
      byteLength: oversized.bytes.length, quarantine: ["oversized"], text: null });
    const saved = await readFile(join(directory, `${messageId}.json`), "utf8");
    expect(JSON.parse(saved)).toEqual(receipt);
    expect(Buffer.byteLength(saved)).toBeLessThan(2_000);
    const restarted = new EmailDeliveryStore(directory, ports, config);
    expect(await restarted.receive(oversized)).toEqual(receipt);
    expect(await restarted.readOriginal(context, jobId, messageId)).toBeNull();
    for (const change of [{ bytes: Buffer.alloc(1_000_001, "y") }, { bytes }, { alias: "fixture-other" }]) {
      await expect(restarted.receive({ ...oversized, ...change })).rejects.toThrow("EMAIL_DELIVERY_CONFLICT");
    }
    expect(await readFile(join(directory, `${messageId}.json`), "utf8")).toBe(saved);
    expect(ports.parseMime).not.toHaveBeenCalled();
  });
  it("retains originals at the exact size limit and still validates and replays their bytes", async () => {
    const { store, directory, ports } = await setup();
    const atLimit = { ...input(), bytes: Buffer.alloc(1_000_000, "x") };
    vi.mocked(ports.parseMime).mockResolvedValue({ version: "email-mime.v1", text, parts: [] });
    const receipt = await store.receive(atLimit);
    expect(Buffer.from(receipt.rawBase64, "base64")).toEqual(atLimit.bytes);
    expect(receipt.quarantine).toEqual([]);
    expect(await new EmailDeliveryStore(directory, ports, config).receive(atLimit)).toEqual(receipt);
    expect(await store.readOriginal(context, jobId, messageId)).not.toBeNull();
    expect(ports.parseMime).toHaveBeenCalledTimes(1);
  });
  it("accepts the exact incoming byte cap as quarantined metadata and replays it across restarts", async () => {
    const { store, directory, ports } = await setup();
    const atCap = { ...input(), bytes: Buffer.alloc(2_000_000, "x") };
    const receipt = await store.receive(atCap);
    expect(receipt).toMatchObject({ rawBase64: "", rawSha256: digest(atCap.bytes),
      byteLength: 2_000_000, quarantine: ["oversized"], text: null });
    expect(await new EmailDeliveryStore(directory, ports, config).receive(atCap)).toEqual(receipt);
    expect(await readdir(directory)).toEqual([`${messageId}.json`]);
    expect(await store.readOriginal(context, jobId, messageId)).toBeNull();
    expect(ports.parseMime).not.toHaveBeenCalled();
  });
  it.each(["buffer", "uint8array"])("refuses a %s one byte over the incoming cap before hashing, parsing or recording anything", async kind => {
    const { store, directory, ports } = await setup();
    const oversized = kind === "buffer" ? Buffer.alloc(2_000_001) : new Uint8Array(2_000_001);
    vi.mocked(createHash).mockClear();
    await expect(store.receive({ ...input(), bytes: oversized })).rejects.toMatchObject({ code: "EMAIL_DELIVERY_TOO_LARGE" });
    expect(createHash).not.toHaveBeenCalled();
    expect(ports.resolveAlias).not.toHaveBeenCalled();
    expect(ports.parseMime).not.toHaveBeenCalled();
    expect(await readdir(directory)).toEqual([]);
  });
  it("refuses an over-cap replay without hashing, writing a conflict flag or changing the original", async () => {
    const { store, directory, ports } = await setup();
    await store.receive(input());
    const saved = await readFile(join(directory, `${messageId}.json`), "utf8");
    vi.mocked(createHash).mockClear();
    vi.mocked(ports.resolveAlias).mockClear();
    vi.mocked(ports.parseMime).mockClear();
    await expect(store.receive({ ...input(), bytes: Buffer.alloc(2_000_001) })).rejects.toMatchObject({ code: "EMAIL_DELIVERY_TOO_LARGE" });
    expect(createHash).not.toHaveBeenCalled();
    expect(ports.resolveAlias).not.toHaveBeenCalled();
    expect(ports.parseMime).not.toHaveBeenCalled();
    expect(await readFile(join(directory, `${messageId}.json`), "utf8")).toBe(saved);
    expect(await readdir(directory)).toEqual([`${messageId}.json`]);
  });
  it("refuses live configurations and injected authority, money, reversal and locked-bill fields", async () => {
    const { directory, ports, store } = await setup();
    for (const configuration of [undefined, { ...config, environment: "production_billing" }, { ...config, transport: "smtp" }, { ...config, enabled: false }]) {
      await expect(new EmailDeliveryStore(directory, ports, configuration).receive(input())).rejects.toThrow("EMAIL_DELIVERY_DISABLED");
    }
    for (const extra of [{ tenantId }, { jobId }, { amountPence: -1 }, { amountPence: 0 }, { amountPence: Number.MAX_SAFE_INTEGER },
      { allocationId: otherId }, { reverses: otherId }, { cancelled: true }, { lockedFinalAccountId: otherId }, { serverReceivedAt: "2020-01-01T00:00:00Z" }]) {
      await expect(store.receive({ ...input(), ...extra })).rejects.toThrow("INVALID_EMAIL_DELIVERY");
    }
    expect(ports.resolveAlias).not.toHaveBeenCalled();
  });
  it("rechecks authorization and rejects other tenants, wrong jobs and unsafe paths", async () => {
    const { store, ports } = await setup(); await store.receive(input());
    expect(await store.readOriginal(testTenantContext(otherId), jobId, messageId)).toBeNull();
    expect(await store.readOriginal(context, otherId, messageId)).toBeNull();
    expect(await store.readOriginal(context, jobId, "../secret")).toBeNull();
    vi.mocked(ports.authorizeJob).mockResolvedValue(false);
    expect(await store.readOriginal(context, jobId, messageId)).toBeNull();
  });
  it("hands durable receipts through the existing worker and keeps terms refusal before reads", async () => {
    const { store, ports } = await setup(); await store.receive(input());
    const connector = new EmailForwardingConnector(store, config);
    const workerPorts: ShadowWorkerPorts = { assertTermsRelation: vi.fn(async () => undefined), hasAcceptedTerms: vi.fn(async () => true),
      read: async c => ({ observations: await connector.read(c, { version: "email-forwarding-read.v1", jobId, deliveryId: messageId }), captures: [] }),
      propose: vi.fn(async () => ({ proposals: [] })), persist: vi.fn(async () => undefined) };
    const worker = new ShadowDetectionWorker(workerPorts, "synthetic_demo");
    await worker.execute(context, { version: "shadow-detection-task.v1", tenantId, jobId });
    expect(workerPorts.persist).toHaveBeenCalledWith(context, expect.objectContaining({ observations: [expect.objectContaining({ evidence: expect.objectContaining({ id: messageId }) })] }));
    vi.mocked(ports.authorizeJob).mockClear(); vi.mocked(workerPorts.persist).mockClear();
    vi.mocked(workerPorts.hasAcceptedTerms).mockResolvedValue(false);
    await expect(worker.execute(context, { version: "shadow-detection-task.v1", tenantId, jobId })).rejects.toThrow("SHADOW_TERMS_NOT_ACCEPTED");
    expect(ports.authorizeJob).not.toHaveBeenCalled(); expect(workerPorts.persist).not.toHaveBeenCalled();
  });
});
