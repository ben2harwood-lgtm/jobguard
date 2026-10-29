import { expect, it } from "vitest";
import type { z } from "zod";
import type { ShadowProposal } from "./shadow-domain/types.js";
import { recoveryAttributionRevisionV1, qualifyingRecoverySourceV1, type RecoveryAttributionRevisionV1, type QualifyingRecoverySourceV1 } from "./recovery-attribution-persistence.js";
function rejectsUntrusted(ai: ShadowProposal, browser: Record<string, unknown>, raw: z.input<typeof recoveryAttributionRevisionV1>, source: z.input<typeof qualifyingRecoverySourceV1>, trusted: RecoveryAttributionRevisionV1) {
  // @ts-expect-error Detector output cannot be a server assessment.
  const a: RecoveryAttributionRevisionV1 = ai;
  // @ts-expect-error Browser JSON cannot be a current qualifying source.
  const b: QualifyingRecoverySourceV1 = browser;
  // @ts-expect-error Even structurally complete JSON lacks the parsed assessment brand.
  const c: RecoveryAttributionRevisionV1 = raw;
  // @ts-expect-error Even structurally complete source JSON lacks the parsed source brand.
  const d: QualifyingRecoverySourceV1 = source;
  // @ts-expect-error Nested facts remain immutable.
  trusted.facts.facts.evidence_received_before_lock.holds = true;
  return [a, b, c, d];
}
void rejectsUntrusted;
it("S6-01-C trusted envelopes have separate parsers; tsc verifies negative assignments", () => {
  expect(recoveryAttributionRevisionV1.safeParse({}).success).toBe(false);
  expect(qualifyingRecoverySourceV1.safeParse({}).success).toBe(false);
});
