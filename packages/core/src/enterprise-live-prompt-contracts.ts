import { z } from "zod";

const uuid = z.guid({ error: "Invalid uuid" });
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const name = z.string().min(1).max(200).refine(value => value.trim() === value);
const term = z.string().min(1).max(1000).refine(value => value.trim().length > 0);
const unique = (values: readonly string[]) => new Set(values).size === values.length;

export class EnterpriseLivePromptError extends Error {
  constructor(readonly code: "INVALID_LIVE_PROMPT_INPUT" | "INVALID_LIVE_PROMPT_CITATION") {
    super(code); this.name = "EnterpriseLivePromptError";
  }
}

export const completionWorkLocatorV1 = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text_span"), start: z.number().int().safe().nonnegative(), end: z.number().int().safe().positive(), quote: term }).strict(),
  z.object({ kind: z.literal("photo_tag"), tag: term }).strict(),
]).refine(locator => locator.kind !== "text_span" || locator.end > locator.start);

export const completionWorkCitationV1 = z.object({
  observationId: uuid, evidenceId: uuid, sha256: hash, objectVersion: name, locator: completionWorkLocatorV1,
}).strict();

const baselineV1 = z.object({ workOrderId: uuid, revisionId: uuid, sha256: hash,
  workIds: z.array(name).max(10000).refine(unique),
}).strict();

/** Supplied facts only. This is neither a public request nor proof that stored evidence was verified. */
export const completionWorkInputV1 = z.object({
  version: z.literal("enterprise-completion-input.v1"), environment: z.literal("synthetic_demo"), tenantId: uuid, jobId: uuid,
  baseline: baselineV1,
  recognition: z.object({ version: name, entries: z.array(z.object({ workId: name, terms: z.array(term).min(1).max(100).refine(unique) }).strict()).max(10000)
    .refine(entries => unique(entries.map(entry => entry.workId))),
  }).strict(),
  sources: z.array(z.object({ evidenceId: uuid, tenantId: uuid, jobId: uuid, sha256: hash, objectVersion: name,
    status: z.enum(["upload_pending", "quarantined", "verified", "rejected", "superseded"]), invalidated: z.boolean(),
    content: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("completion_note"), text: z.string().max(100000) }).strict(),
      z.object({ kind: z.literal("completion_photo"), tags: z.array(term).max(1000).refine(unique) }).strict(),
    ]),
  }).strict()).max(10000).refine(sources => unique(sources.map(source => source.evidenceId))),
  observations: z.array(completionWorkCitationV1).max(10000).refine(observations => unique(observations.map(observation => observation.observationId))),
}).strict().superRefine((input, context) => {
  const known = new Set(input.recognition.entries.map(entry => entry.workId));
  if (input.baseline.workIds.some(workId => !known.has(workId))) context.addIssue({ code: z.ZodIssueCode.custom, message: "Incomplete instructed vocabulary" });
});

export type CompletionWorkInput = z.infer<typeof completionWorkInputV1>;

export const completionWorkFindingV1 = z.object({
  version: z.literal("enterprise-completion-finding.v1"), rule: z.literal("a"), ruleVersion: z.literal("completion-work-absence.v1"),
  tenantId: uuid, jobId: uuid, baseline: baselineV1, recognitionVersion: name,
  observationId: uuid, workId: name, citation: completionWorkCitationV1,
}).strict();
export type CompletionWorkFinding = z.infer<typeof completionWorkFindingV1>;

/** Resolves supplied identities and exact UTF-16 spans/tags; a later persistence boundary must re-read stored facts. */
export function parseCompletionWorkInput(raw: unknown): CompletionWorkInput {
  const parsed = completionWorkInputV1.safeParse(raw);
  if (!parsed.success) throw new EnterpriseLivePromptError("INVALID_LIVE_PROMPT_INPUT");
  const input = parsed.data;
  const sources = new Map(input.sources.map(source => [source.evidenceId, source]));
  for (const citation of input.observations) {
    const source = sources.get(citation.evidenceId), locator = citation.locator;
    if (!source || source.tenantId !== input.tenantId || source.jobId !== input.jobId || source.sha256 !== citation.sha256 || source.objectVersion !== citation.objectVersion) {
      throw new EnterpriseLivePromptError("INVALID_LIVE_PROMPT_CITATION");
    }
    const resolves = locator.kind === "text_span"
      ? source.content.kind === "completion_note" && locator.end <= source.content.text.length && source.content.text.slice(locator.start, locator.end) === locator.quote
      : source.content.kind === "completion_photo" && source.content.tags.includes(locator.tag);
    if (!resolves) throw new EnterpriseLivePromptError("INVALID_LIVE_PROMPT_CITATION");
  }
  return input;
}
