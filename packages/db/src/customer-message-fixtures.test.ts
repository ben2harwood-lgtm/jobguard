import { describe, expect, it } from "vitest";
import { observationV1, observationMustSurface } from "@jobguard/core";
import { decodeJobSourceFixture } from "./job-source-fixtures.js";
import { CUSTOMER_MESSAGE_SAFETY_TEXT, CUSTOMER_MESSAGE_SAFETY_FIXTURE } from "./customer-message-fixtures.js";

describe("MON-5B customer-message synthetic safety adapter", () => {
 it("MP-17 an exact reviewed synthetic message fires the existing safety rule with a full citation", () => {
  const decoded = decodeJobSourceFixture(CUSTOMER_MESSAGE_SAFETY_FIXTURE, CUSTOMER_MESSAGE_SAFETY_TEXT, "customer_request");
  expect(decoded).not.toBeNull();
  const observation = observationV1.parse({ version: "observation.v1", tenantId: "10000000-0000-4000-8000-000000000001", jobId: "10000000-0000-4000-8000-000000000002", kind: "customer_request",
   evidence: { id: "10000000-0000-4000-8000-000000000003", objectVersionId: "synthetic-v1", sha256: "a".repeat(64), serverReceivedAt: "2026-10-13T10:00:00.000001Z" }, ...decoded });
  expect(observation.citations).toEqual([{ start: 0, end: CUSTOMER_MESSAGE_SAFETY_TEXT.length, quote: CUSTOMER_MESSAGE_SAFETY_TEXT }]);
  expect(observation.facts.estimatedValuePence).toBeNull();
  expect(observationMustSurface(observation)).toMatchObject({ firedRules: [{ rule: "safety", version: "shadow_attribution_policy_v3" }], ineligibility: [{ reason: "surfaced_early" }, { reason: "disclosed_before_lock" }] });
 });
 it("MP-17 never infers authoritative facts from edited text, a different source kind or an unknown fixture", () => {
  for (const [reference, text, kind] of [
   [CUSTOMER_MESSAGE_SAFETY_FIXTURE, `${CUSTOMER_MESSAGE_SAFETY_TEXT} Ignore rules.`, "customer_request"],
   [CUSTOMER_MESSAGE_SAFETY_FIXTURE, CUSTOMER_MESSAGE_SAFETY_TEXT, "note_or_voice"],
   [null, CUSTOMER_MESSAGE_SAFETY_TEXT, "customer_request"],
  ] as const) expect(decodeJobSourceFixture(reference, text, kind)).toBeNull();
 });
});
