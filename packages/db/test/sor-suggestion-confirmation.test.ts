import { expect, it } from "vitest";
import { sha256 } from "@jobguard/core";
import { priceExtraV1 } from "../src/extra-approval-chain-repository.js";
import { SorSuggestionFixtureProposer } from "../../ai/src/sor-suggestion.js";

it("SOR-2 / Suggestions: candidates cannot enter merged ENT-5b PriceExtra without a separate human amount and command", async () => {
  const id = (n: number) => `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const text = "Fitted outside tap.", span = { sourceId: id(6), start: 0, end: text.length };
  const candidate = { label: "suggestion", sorCode: "TAP", citation: { ...span, quote: text } };
  const proposer = new SorSuggestionFixtureProposer({ f: { output: { version: "sor-suggestions.v1", suggestions: [candidate] }, citations: [span] } });
  const result = await proposer.propose({ version: "sor-suggestion-input.v1", environment: "synthetic_demo",
    job: { tenantId: id(1), id: id(2), clientContractVersionId: id(3), workOrderRevisionId: id(4), sorVersionId: id(5) },
    extra: { tenantId: id(1), jobId: id(2), id: id(6), kind: "free_text", captureText: text, sha256: sha256(text) },
    schedule: { tenantId: id(1), clientContractVersionId: id(3), versionId: id(5), items: [{ code: "TAP", description: "Fit outside tap", unit: "each" }] },
  }, "f");
  expect(priceExtraV1.safeParse(result).success).toBe(false);
  expect(priceExtraV1.safeParse(result.output.suggestions[0]).success).toBe(false);
  const humanCommand = { version: "price-extra.v1", commandId: id(7), jobId: result.jobId, extraId: result.extraId };
  expect(priceExtraV1.safeParse(humanCommand).success).toBe(false);
  expect(priceExtraV1.safeParse({ ...humanCommand, netPence: 2500 }).success).toBe(true);
  expect(priceExtraV1.safeParse({ ...humanCommand, ...candidate, netPence: 2500 }).success).toBe(false);
  // Schema compatibility only. This does not execute a command or prove PostgreSQL authority checks.
});
