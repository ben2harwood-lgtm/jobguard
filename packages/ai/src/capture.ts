import { createHash } from "node:crypto";
import { CAPTURE_PROMPT_VERSION, CAPTURE_SCHEMA_VERSION, jobRecordProposalV1, type JobRecordProposal } from "@jobguard/core";
import { FixtureAiProvider } from "./fixture-provider.js";
import { AiGateway } from "./gateway.js";

export const PINNED_CAPTURE_MODEL = "fixture-capture-v1" as const;

/** Deterministic zero-spend extractor. Source text is data, never an instruction channel. */
export async function extractCaptureFixture(sourceId: string, text: string, fixtureId: string): Promise<JobRecordProposal> {
  let cursor = 0;
  const lines = text.split("\n").map((raw) => { const start = cursor; cursor += raw.length + 1; return { raw, start }; }).filter(({ raw }) => /^ITEM:/u.test(raw));
  const statedTitle = text.match(/^JOB:\s*(.+)$/mu)?.[1];
  const titleText = statedTitle ?? "Work described in your words";
  const titleStart = text.indexOf(titleText);
  const extracted = (start: number, end: number) => ({ kind: "extracted" as const, span: { sourceId, sourceVersion: 1 as const, start, end } });
  const proposal: JobRecordProposal = {
    title: statedTitle
      ? { value: titleText, provenance: extracted(titleStart, titleStart + titleText.length) }
      : { value: titleText, provenance: { kind: "defaulted", note: "No job title was stated" } },
    lines: (lines.length ? lines : [{ raw: text, start: 0 }]).map(({ raw, start }) => {
      const parts = raw.slice(5).trim().split("|").map((part) => part.trim());
      const description = lines.length ? (parts[0] || raw) : raw;
      const price = lines.length ? parts.find((part) => /^£\d+(?:\.\d{2})?$/u.test(part)) : undefined;
      const descStart = start + raw.indexOf(description);
      const priceStart = price ? start + raw.indexOf(price) : -1;
      return {
        description: { value: description, provenance: extracted(descStart, descStart + description.length) },
        quantity: { value: lines.length ? "1" : null, provenance: { kind: "defaulted" as const, note: lines.length ? "One item per supplied ITEM line" : "Quantity not stated" } },
        unit: { value: lines.length ? "item" : null, provenance: { kind: "defaulted" as const, note: lines.length ? "Supplied work item" : "Unit not stated" } },
        unitPricePence: { value: price ? exactPence(price) : null, provenance: price ? extracted(priceStart, priceStart + price.length) : { kind: "defaulted" as const, note: "Rate not stated; never invented" } },
      };
    }),
    materials: [{ description: { value: "Review materials required", provenance: { kind: "inferred", note: "Suggestion for human review only" } } }],
    questions: [{ question: { value: lines.length ? "Confirm disposal and waste allowance" : "Please turn these words into work items", provenance: { kind: "inferred", note: "Human review is required; source text is never treated as an instruction" } } }],
  };
  const gateway = new AiGateway(new FixtureAiProvider({ [fixtureId]: { output: proposal, citations: collectSpans(proposal) } }));
  return (await gateway.generate({ contractVersion: "ai_gateway_request_v1", fixtureId, operation: "capture_job_record_proposal", promptVersion: CAPTURE_PROMPT_VERSION, schemaVersion: CAPTURE_SCHEMA_VERSION, sources: [{ id: sourceId, content: text, sha256: createHash("sha256").update(text).digest("hex") }], timeoutMs: 1_000, maxOutputTokens: 4_096 }, jobRecordProposalV1)).output;
}

function collectSpans(value: unknown): { sourceId: string; start: number; end: number }[] {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const own = record.kind === "extracted" ? [record.span as { sourceId: string; start: number; end: number }] : [];
  return own.concat(...Object.values(record).map((child) => Array.isArray(child) ? child.flatMap(collectSpans) : collectSpans(child)));
}

function exactPence(value: string): number { const [pounds, pennies=""] = value.slice(1).split("."); return Number(BigInt(pounds!) * 100n + BigInt(pennies.padEnd(2,"0"))); }
