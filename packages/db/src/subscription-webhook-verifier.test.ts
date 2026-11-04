import { createHmac } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifySubscriptionWebhookV1 } from "./subscription-webhook-verifier.js";
import { SubscriptionStripeSandboxAdapter, signSubscriptionSandboxEvent } from "./subscription-stripe-sandbox-adapter.js";

const secret = "made-up-unit-test-secret-only";
const timestamp = 1800000000;
const clock = () => timestamp * 1000;
const body = Buffer.from('{"fictional":"£ test"}\n');
function header(raw = body, time = timestamp, key = secret) {
  const digest = createHmac("sha256", key).update(`${time}.`).update(raw).digest("hex");
  return `t=${time},v1=${digest}`;
}
afterEach(() => vi.unstubAllEnvs());

describe("MON-2B timestamped raw-byte verifier candidate (no provider evidence)", () => {
  it("accepts generated vectors and all v1 signature positions during rotation", () => {
    expect(() => verifySubscriptionWebhookV1(body, header(), secret, clock)).not.toThrow();
    for (const signatures of [`v1=${"0".repeat(64)},${header()}`, `${header()},v1=${"0".repeat(64)}`]) {
      expect(() => verifySubscriptionWebhookV1(body, `${signatures},v0=ignored`, secret, clock)).not.toThrow();
    }
    for (const offset of [-300, 300]) expect(() => verifySubscriptionWebhookV1(body, header(body, timestamp + offset), secret, clock)).not.toThrow();
  });
  it("refuses wrong secrets, altered bytes and JSON reserialization", () => {
    expect(() => verifySubscriptionWebhookV1(body, header(), "wrong-made-up-secret", clock)).toThrow("SUBSCRIPTION_WEBHOOK_REFUSED");
    for (const changed of [Buffer.concat([body, Buffer.from(" ")]), Buffer.from(JSON.stringify(JSON.parse(body.toString())))]) {
      expect(() => verifySubscriptionWebhookV1(changed, header(), secret, clock)).toThrow("SUBSCRIPTION_WEBHOOK_REFUSED");
    }
  });
  it.each([-301, 301])("refuses signed timestamps outside tolerance (%s seconds)", offset => {
    expect(() => verifySubscriptionWebhookV1(body, header(body, timestamp + offset), secret, clock)).toThrow("SUBSCRIPTION_WEBHOOK_REFUSED");
  });
  it.each([undefined, null, "", " "])("refuses absent secret %s", missing => {
    expect(() => verifySubscriptionWebhookV1(body, header(), missing, clock)).toThrow("SUBSCRIPTION_WEBHOOK_REFUSED");
  });
  it.each([undefined, null, "", "v1=" + "0".repeat(64), `t=${timestamp}`, `${header()},t=${timestamp}`,
    `t=NaN,v1=${"0".repeat(64)}`, `t=1800000000.0,v1=${"0".repeat(64)}`, `t=99999999999999999999,v1=${"0".repeat(64)}`,
    `${header()},v1=bad`, `t=${timestamp},v1=${"0".repeat(64)}`])("refuses missing or invalid signature header %s", value => {
    expect(() => verifySubscriptionWebhookV1(body, value, secret, clock)).toThrow("SUBSCRIPTION_WEBHOOK_REFUSED");
  });
  it.each([NaN, Infinity, -Infinity])("fails closed with an invalid clock %s", now => {
    expect(() => verifySubscriptionWebhookV1(body, header(), secret, () => now)).toThrow("SUBSCRIPTION_WEBHOOK_REFUSED");
  });
  it("verified replays through existing fake ingest keep one effect identity", async () => {
    vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
    const work = { version: "subscription-simulated-work.v1", environment: "synthetic_demo",
      workId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", statementId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      amountPence: 8900, contentHash: "a".repeat(64), currency: "GBP" };
    const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const adapter = new SubscriptionStripeSandboxAdapter({ version: "subscription-stripe-sandbox-binding.v1", tenantId, work, collectionBoundPence: 16900 });
    await adapter.execute(work);
    const envelope = signSubscriptionSandboxEvent({ version: "subscription-stripe-sandbox-event.v1", id: tenantId, livemode: false,
      tenantId, type: "payment_intent.succeeded", data: work });
    const bytes = Buffer.from(envelope.payload);
    const deliver = () => {
      verifySubscriptionWebhookV1(bytes, header(bytes), secret, clock);
      adapter.ingest(envelope);
    };
    deliver();
    const first = await adapter.reconcile(work);
    deliver();
    expect(await adapter.reconcile(work)).toEqual(first);
    expect(first).toMatchObject({ outcome: "settled", synthetic: true });
    vi.stubEnv("JOBGUARD_ENV", "production_billing");
    expect(() => adapter.ingest(envelope)).toThrow("SYNTHETIC_MODE_REQUIRED");
    await expect(adapter.execute(work)).rejects.toThrow("SYNTHETIC_MODE_REQUIRED");
    await expect(adapter.reconcile(work)).rejects.toThrow("SYNTHETIC_MODE_REQUIRED");
    expect(() => signSubscriptionSandboxEvent({})).toThrow("SYNTHETIC_MODE_REQUIRED");
  });
  it.each([undefined, "production_billing", "pilot_no_charge", "provider_sandbox"])("refuses public-string fake construction in %s", environment => {
    vi.stubEnv("JOBGUARD_ENV", environment);
    expect(() => new SubscriptionStripeSandboxAdapter({})).toThrow("SYNTHETIC_MODE_REQUIRED");
  });
  it("keeps the public-string fake out of application routes and the db barrel", () => {
    // Scan all application source, including route dependencies, to catch named, namespace,
    // dynamic and direct-file imports of the fake (not merely today's route filenames).
    function sources(directory: URL): string[] {
      return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const path = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
        if (entry.isDirectory()) return ["node_modules", ".next", "dist", ".git"].includes(entry.name) ? [] : sources(path);
        return /\.[cm]?[jt]sx?$/u.test(entry.name) ? [readFileSync(path, "utf8")] : [];
      });
    }
    for (const source of [...sources(new URL("../../../apps/", import.meta.url)), readFileSync(new URL("../src/index.ts", import.meta.url), "utf8")]) {
      expect(source).not.toMatch(/SubscriptionStripeSandboxAdapter|signSubscriptionSandboxEvent|subscription-stripe-sandbox-adapter/u);
    }
  });
});
