import { z } from "zod";
import { MAX_MONEY_PENCE } from "./money.js";
import { instantV1 } from "./receipt-allocation.js";
import { freezeShadow } from "./shadow-domain/types.js";

export const observationKinds = ["supplier_line", "purchase_order_line", "completion_photo", "note_or_voice", "customer_request"] as const;
export const observationFactsV1 = z.object({
  workReference: z.string().min(1).max(200), scopeArea: z.string().min(1).max(300),
  description: z.string().min(1).max(160),
  status: z.enum(["completed", "requested", "unfinished", "cancelled", "chat", "spare", "alternative_material", "builder_mistake", "unknown"]),
  estimatedValuePence: z.number().int().nonnegative().max(MAX_MONEY_PENCE).nullable(),
  safetyImplication: z.boolean(), customerClearlyRequested: z.boolean(), needsPriorWrittenAgreement: z.boolean(),
  significantWork: z.object({ basis: z.literal("synthetic_fixture"), sourceRef: z.string().min(1).max(300), significant: z.boolean() }).strict().nullable(),
  activeDispute: z.boolean(), silenceMateriallyWorsensDispute: z.boolean(), disclosureDuty: z.boolean(),
}).strict().readonly();
export const observationV1 = z.object({
  version: z.literal("observation.v1"), tenantId: z.guid({ error: "Invalid uuid" }), jobId: z.guid({ error: "Invalid uuid" }),
  kind: z.enum(observationKinds),
  evidence: z.object({ id: z.guid({ error: "Invalid uuid" }), objectVersionId: z.string().min(1).max(300), sha256: z.string().regex(/^[a-f0-9]{64}$/u), serverReceivedAt: instantV1 }).strict().readonly(),
  text: z.string().min(1).max(100_000), facts: observationFactsV1,
  citations: z.array(z.object({ start: z.number().int().nonnegative(), end: z.number().int().positive(), quote: z.string().min(1) }).strict().readonly()).min(1).max(100).readonly(),
}).strict().superRefine((o, ctx) => {
  for (const c of o.citations) if (c.start >= c.end || c.end > o.text.length || o.text.slice(c.start, c.end) !== c.quote)
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["citations"], message: "Citation does not resolve to the supplied text" });
  if (o.facts.customerClearlyRequested && o.facts.needsPriorWrittenAgreement && !o.facts.significantWork)
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["facts", "significantWork"], message: "Evaluated significance fact required" });
}).readonly();
export type Observation = z.infer<typeof observationV1>;
export class ObservationError extends Error {
  constructor(readonly code: "INVALID_OBSERVATION" | "OBSERVATION_BINDING_MISMATCH") { super(code); }
}
export function parseObservation(raw: unknown): Observation {
  const parsed = observationV1.safeParse(raw);
  if (!parsed.success) throw new ObservationError("INVALID_OBSERVATION");
  return freezeShadow(parsed.data);
}
