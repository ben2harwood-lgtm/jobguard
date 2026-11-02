import { describe, expect, it } from "vitest";
import { calculateMaterialsExcess, calculateVisitExcess, calculateCloseoutFinding, matchPromptIdentity } from "./enterprise-live-prompt-persistence.js";
const line = { workIdentity: "brick", unit: "each", quantity: "10" };
const fact = { sourceId: "stores", eventId: "1", workIdentity: "brick", unit: "each", quantity: "11", occurredAtMicros: "100", kind: "issue" as const };
const visit = { visitId: "visit", startMicros: "0", endMicros: "120000001", lines: [{ quantity: "2", standardMinutes: "1" }], factor: { numerator: "1", denominator: "1", contractVersionId: "contract-v1" } };
describe("persisted prompt deterministic rules", () => {
  it("materials strict excess and incomparable units", () => {
    expect(calculateMaterialsExcess({ lines: [line], facts: [fact, fact] })[0]?.status).toBe("finding");
    expect(calculateMaterialsExcess({ lines: [line], facts: [{ ...fact, quantity: "10" }] })[0]?.status).toBe("silent");
    expect(calculateMaterialsExcess({ lines: [line], facts: [{ ...fact, unit: "pack" }] })[0]?.status).toBe("unevaluated");
    expect(calculateMaterialsExcess({ lines: [line], facts: [{ ...fact, kind: "return" }] })[0]?.status).toBe("quarantined");
  });
  it("visit strict factor boundary and missing standards", () => {
    expect(calculateVisitExcess(visit).status).toBe("finding");
    expect(calculateVisitExcess({ ...visit, endMicros: "120000000" }).status).toBe("silent");
    expect(calculateVisitExcess({ ...visit, factor: null }).status).toBe("unevaluated");
    expect(calculateVisitExcess({ ...visit, lines: [{ quantity: "2", standardMinutes: null }] }).status).toBe("unevaluated");
  });
  it("closeout yes with no logged job extra", () => {
    expect(calculateCloseoutFinding({ visitId: "visit", answerId: "answer", answer: "yes", loggedExtraCount: 0 }).status).toBe("finding");
    expect(calculateCloseoutFinding({ visitId: "visit", answerId: "answer", answer: "yes", loggedExtraCount: 1 }).status).toBe("silent");
  });
  it("matching has no origin or fee authority", () => {
    expect(matchPromptIdentity("job", "work", [{ jobId: "job", identity: "work", extraId: "extra" }])).toEqual({ status: "matched", extraId: "extra" });
    expect(matchPromptIdentity("job", "work", [{ jobId: "other", identity: "work", extraId: "extra" }])).toEqual({ status: "unmatched" });
  });
  it("ambiguous and same-time contradictory facts do not select a winner", () => {
    expect(matchPromptIdentity("job", "work", [{ jobId: "job", identity: "work", extraId: "a" }, { jobId: "job", identity: "work", extraId: "b" }])).toEqual({ status: "ambiguous" });
    expect(calculateMaterialsExcess({ lines: [line], facts: [fact, { ...fact, quantity: "12" }] })[0]?.status).toBe("quarantined");
    expect(calculateMaterialsExcess({ lines: [line], facts: [fact, { ...fact, eventId: "other", quantity: "12" }] })[0]?.status).toBe("quarantined");
  });
});

import { materialsIssueV1, materialsIssueBodyV1, confirmPromptV1, completionObservationV1 } from "./enterprise-live-prompt-persistence.js";
it("strict commands reject caller supplied authority and nonpositive issue facts", () => {
  const command = { version: "materials-issue.v1", commandId: "00000000-0000-4000-8000-000000000001", jobId: "00000000-0000-4000-8000-000000000002", ...fact };
  expect(materialsIssueV1.safeParse(command).success).toBe(true);
  for (const field of ["tenantId", "actor", "role", "gate", "settlement", "environment"]) expect(materialsIssueV1.safeParse({ ...command, [field]: "forged" }).success).toBe(false);
  expect(materialsIssueV1.safeParse({ ...command, quantity: "0" }).success).toBe(false);
  expect(materialsIssueV1.safeParse({ ...command, quantity: "malformed" }).success).toBe(false);
  for (const kind of ["return", "correction"]) {
    expect(materialsIssueV1.safeParse({ ...command, kind, quantity: "0" }).success).toBe(true);
    expect(calculateMaterialsExcess({ lines: [line], facts: [{ ...fact, kind, quantity: "0" }] })[0]?.status).toBe("quarantined");
  }
  const { jobId: _jobId, ...body } = command;
  expect(materialsIssueBodyV1.safeParse({ ...body, quantity: "0" }).success).toBe(false);
  expect(materialsIssueBodyV1.safeParse({ ...body, kind: "return", quantity: "0" }).success).toBe(true);
  expect(confirmPromptV1.safeParse({ version: "confirm-prompt.v1", commandId: command.commandId, jobId: command.jobId, promptId: command.commandId, promptHash: "a".repeat(64), price: 10 }).success).toBe(false);
  expect(completionObservationV1.safeParse({}).success).toBe(false);
});
it("quantity-scaled standards use exact ratios at fractional microsecond boundaries", () => {
  const input = { ...visit, lines: [{ quantity: "0.1", standardMinutes: "0.1" }], factor: { numerator: "1", denominator: "7", contractVersionId: "contract" } };
  expect(calculateVisitExcess({ ...input, endMicros: "85714" }).status).toBe("silent");
  expect(calculateVisitExcess({ ...input, endMicros: "85715" }).status).toBe("finding");
});
it("materials sums instructed lines and preserves input-order independence", () => {
  const facts = [fact, { ...fact, eventId: "2", quantity: "10", occurredAtMicros: "101" }];
  const lines = [line, line];
  expect(calculateMaterialsExcess({ lines, facts })[0]?.status).toBe("finding");
  expect(calculateMaterialsExcess({ lines, facts: [...facts].reverse() })).toEqual(calculateMaterialsExcess({ lines, facts }));
  expect(calculateMaterialsExcess({ lines, facts: [fact, { ...facts[1], quantity: "9" }] })[0]?.status).toBe("silent");
});
it("photo observations bind stored tags without caller text; text observations require a byte preimage", () => {
  const input = { version: "completion-observation.v1", commandId: "00000000-0000-4000-8000-000000000001", jobId: "00000000-0000-4000-8000-000000000002", evidenceId: "00000000-0000-4000-8000-000000000003", sha256: "a".repeat(64), objectVersion: "photo-v1", workIdentity: "gutter", locator: { kind: "photo_tag", tag: "new gutters" } };
  expect(completionObservationV1.safeParse(input).success).toBe(true);
  expect(completionObservationV1.safeParse({ ...input, sourceText: "forged" }).success).toBe(false);
  const span = { ...input, locator: { kind: "text_span", start: 0, end: 4, quote: "work" } };
  expect(completionObservationV1.safeParse(span).success).toBe(false);
  expect(completionObservationV1.safeParse({ ...span, sourceText: "work" }).success).toBe(true);
});
