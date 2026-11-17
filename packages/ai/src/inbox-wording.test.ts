import { describe, expect, it } from "vitest";
import { MAX_MONEY_PENCE, sha256 } from "@jobguard/core";
import { InboxWordingFixture, inboxWordingInputV1 } from "./inbox-wording.js";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const input = { version: "inbox-wording-input.v1", environment: "synthetic_demo", visibility: "builder_visible",
  tenantId: id(1), jobId: id(2), decisionId: id(3), amount: { pence: 32001, currency: "GBP" }, action: "review",
  facts: [{ sourceId: id(4), text: "Fictional invoice discrepancy: £320.01." }] };
const content = JSON.stringify(inboxWordingInputV1.parse(input));
const output = { version: "inbox-wording-output.v1", heading: "review_recorded_facts", sourceHash: sha256(content) };
const citations = [{ sourceId: id(3), start: 0, end: content.length }];
const fake = (value: unknown = output, spans = citations) => new InboxWordingFixture({ good: { output: value, citations: spans } });

describe("M2-7 dark wording fixture gate", () => {
  it("defaults off and preserves deterministic copy when the fixture is absent", async () => {
    expect(await fake().word(input, "missing")).toMatchObject({ mode: "deterministic", heading: "Recorded facts", reviewRequired: true });
    expect(await fake().word(input, "missing", { enabled: true })).toMatchObject({ mode: "deterministic" });
  });
  it("evaluates a cited, bound structured suggestion without changing a penny, fact or action", async () => {
    const result = await fake().word(input, "good", { enabled: true });
    expect(result).toMatchObject({ mode: "fixture_suggestion", heading: "Review recorded facts", amount: input.amount,
      action: input.action, facts: input.facts, reviewRequired: true,
      provenance: { provider: "recorded-fixture", deployment: "local-only", promptVersion: "inbox-wording.fixture.v1" } });
  });
  it("falls back for invented claims, changed money/action/facts, unknown heading, missing or foreign citations", async () => {
    for (const changed of [{ ...output, amount: { pence: 1 } }, { ...output, action: "send" },
      { ...output, facts: [] }, { ...output, heading: "Pay immediately" }, { ...output, claim: "private@example.invalid" },
      { ...output, sourceHash: "0".repeat(64) }]) {
      const result = await fake(changed).word(input, "good", { enabled: true });
      expect(result).toMatchObject({ mode: "deterministic", amount: input.amount, action: input.action, facts: input.facts });
      expect(JSON.stringify(result)).not.toContain("private@example.invalid");
    }
    for (const spans of [[], [{ ...citations[0]!, sourceId: id(9) }], [{ ...citations[0]!, end: 1 }]]) {
      expect(await fake(output, spans).word(input, "good", { enabled: true })).toMatchObject({ mode: "deterministic" });
    }
  });
  it("binds fixture to tenant/job/decision and immutable facts, rather than trusting caller IDs", async () => {
    for (const change of [{ tenantId: id(8) }, { jobId: id(8) }, { decisionId: id(8) }, { amount: { pence: 32000, currency: "GBP" } }]) {
      expect(await fake().word({ ...input, ...change }, "good", { enabled: true })).toMatchObject({ mode: "deterministic" });
    }
  });
  it("refuses live paths, shadow/pre-lock and locked/superseded bill inputs, with content-free errors", async () => {
    await expect(fake().word(input, "good", { enabled: true, provider: "live" })).rejects.toMatchObject({ code: "live_route_disabled" });
    for (const change of [{ environment: "production" }, { visibility: "shadow_pre_lock" },
      { lockedBillId: id(9) }, { finalAccountRevisionId: id(9) }, { secret: "private@example.invalid" }]) {
      await expect(fake().word({ ...input, ...change }, "good", { enabled: true })).rejects.toThrow(/^Invalid fictional inbox wording request$/);
    }
  });
  it("keeps exact zero/penny/cap amounts and refuses negative, fractional and over-cap amounts", async () => {
    for (const pence of [0, 1, MAX_MONEY_PENCE]) {
      expect(await fake().word({ ...input, amount: { pence, currency: "GBP" } }, "good")).toMatchObject({ amount: { pence } });
    }
    for (const pence of [-1, 0.5, MAX_MONEY_PENCE + 1]) {
      await expect(fake().word({ ...input, amount: { pence, currency: "GBP" } }, "good")).rejects.toMatchObject({ code: "invalid_request" });
    }
  });
});
