import { z } from "zod";
import { customerTypes, jobPartiesSnapshotV1 } from "./job-parties.js";

export const PREVENTION_COMPANY_ELIGIBILITY_REFERENCE = "prevention-company-eligibility-reference.v1";
export const PREVENTION_SOURCES = {
  listed_building: { id: "synthetic-listed-building.v1", name: "Generated property register (synthetic)" },
  conservation_area: { id: "synthetic-conservation-area.v1", name: "Generated property register (synthetic)" },
  article_4: { id: "synthetic-article-4.v1", name: "Generated property register (synthetic)" },
  planning_history: { id: "synthetic-planning-history.v1", name: "Generated planning history (synthetic)" },
  flood: { id: "synthetic-flood.v1", name: "Generated flood register (synthetic)" },
  company: { id: "synthetic-companies-house-card.v1", name: "Companies House (synthetic)" },
  companies_house_feed: { id: "synthetic-companies-house-feed.v1", name: "Companies House (synthetic)" },
  gazette_feed: { id: "synthetic-gazette-feed.v1", name: "The Gazette (synthetic)" },
} as const;
export const preventionKinds = ["listed_building", "conservation_area", "article_4", "planning_history", "flood", "company", "companies_house_feed", "gazette_feed"] as const;
export type PreventionKind = typeof preventionKinds[number];
export const PREVENTION_STALENESS_REFERENCE = {
  version: "prevention-staleness-reference.v1" as const, referenceOnly: true as const,
  maximumAgeMinutes: {
    "synthetic-listed-building.v1": 1440,
    "synthetic-conservation-area.v1": 1440,
    "synthetic-article-4.v1": 1440,
    "synthetic-planning-history.v1": 1440,
    "synthetic-flood.v1": 180,
    "synthetic-companies-house-card.v1": 1440,
    "synthetic-companies-house-feed.v1": 180,
    "synthetic-gazette-feed.v1": 180,
  },
} as const;
export const preventionStalenessPolicyV1 = z.object({ version: z.literal("prevention-staleness-reference.v1"), referenceOnly: z.literal(true),
  maximumAgeMinutes: z.record(z.string().min(1), z.number().int().positive().max(525600)),
}).strict();
type StalenessPolicy = z.infer<typeof preventionStalenessPolicyV1>;
/** Missing policy, missing observations and clock skew all fail closed. No production threshold. */
export function preventionFactStale(sourceId: string, observedAt: string | null, evaluatedAt: string, policy: StalenessPolicy): boolean {
  const age = observedAt === null ? NaN : Date.parse(evaluatedAt) - Date.parse(observedAt);
  const maximum = policy.maximumAgeMinutes[sourceId];
  return !Number.isFinite(age) || age < 0 || maximum === undefined || age > maximum * 60_000;
}
export function preventionCompanyEligible(customer: { type: string; companyNumber?: string | undefined }): boolean {
  return customer.type === "business" && /^(?:\d{8}|[A-Z]{2}\d{6})$/u.test(customer.companyNumber ?? "");
}
const factV1 = z.enum(["constraint", "no_record", "company_active", "company_attention", "feed_event", "no_event"]).nullable();
const readingV1 = z.object({ kind: z.enum(preventionKinds), source: z.object({ id: z.string().min(1).max(100), name: z.string().min(1).max(100) }).strict(),
  retrievedAt: z.string().datetime(), observedAt: z.string().datetime().nullable(), fact: factV1, evaluatedAt: z.string().datetime(),
}).strict();
type Reading = z.infer<typeof readingV1>;
function state(input: Reading, policy: StalenessPolicy): { status: "unknown" | "advisory" | "clear"; reason: "missing" | "stale" | "future" | "current" } {
  if (input.fact === null || input.observedAt === null) return { status: "unknown", reason: "missing" };
  if (Date.parse(input.retrievedAt) > Date.parse(input.evaluatedAt) || Date.parse(input.observedAt) > Date.parse(input.retrievedAt)) return { status: "unknown", reason: "future" };
  if (preventionFactStale(input.source.id, input.observedAt, input.evaluatedAt, policy)) return { status: "unknown", reason: "stale" };
  return { status: ["constraint", "company_attention", "feed_event"].includes(input.fact) ? "advisory" : "clear", reason: "current" };
}
export const preventionResultV1 = readingV1.extend({ version: z.literal("prevention-result.v1"), environment: z.literal("synthetic_demo"),
  policyVersion: z.literal("prevention-staleness-reference.v1"), referenceOnly: z.literal(true),
  maximumAgeMinutes: z.number().int().positive(), status: z.enum(["unknown", "advisory", "clear"]), reason: z.enum(["missing", "stale", "future", "current"]),
}).strict().superRefine((value, ctx) => {
  const source = PREVENTION_SOURCES[value.kind];
  const expected = state(value, PREVENTION_STALENESS_REFERENCE);
  if (value.source.id !== source.id || value.source.name !== source.name || value.maximumAgeMinutes !== PREVENTION_STALENESS_REFERENCE.maximumAgeMinutes[source.id] || value.status !== expected.status || value.reason !== expected.reason) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Source, reference policy and result state must agree" });
  }
});
export type PreventionResultV1 = z.infer<typeof preventionResultV1>;
export function evaluatePreventionFact(raw: Reading): PreventionResultV1 {
  const input = readingV1.parse(raw), policy = preventionStalenessPolicyV1.parse(PREVENTION_STALENESS_REFERENCE);
  return preventionResultV1.parse({ ...input, ...state(input, policy), version: "prevention-result.v1", environment: "synthetic_demo",
    policyVersion: policy.version, referenceOnly: true, maximumAgeMinutes: policy.maximumAgeMinutes[input.source.id] });
}
const base = { version: z.literal("prevention-command.v1"), commandId: z.string().uuid(), expectedBindingId: z.string().uuid(), scenarioNow: z.string().datetime(), fixture: z.enum(["mixed", "fresh", "stale", "missing"]) };
export const preventionCommandV1 = z.discriminatedUnion("action", [
  z.object({ ...base, action: z.literal("property") }).strict(),
  z.object({ ...base, action: z.literal("company") }).strict(),
  ...(["start_watch", "stop_watch", "evaluate_watch"] as const).map(action => z.object({ ...base, action: z.literal(action), expectedWatchRevision: z.number().int().nonnegative() }).strict()),
]);
export type PreventionCommandV1 = z.infer<typeof preventionCommandV1>;
export const preventionViewV1 = z.object({ version: z.literal("prevention-view.v1"), environment: z.literal("synthetic_demo"), jobId: z.string().uuid(), retrievedAt: z.string().datetime(),
  parties: jobPartiesSnapshotV1.nullable(), customerType: z.enum(customerTypes).nullable(),
  payingParty: z.object({ name: z.string(), revisionId: z.string().uuid(), source: z.literal("Builder's saved paying-party record"), retrievedAt: z.string().datetime(), recordedAt: z.string().datetime() }).strict().nullable(),
  companyEligibility: z.enum(["eligible", "not run — not a registered company"]), eligibilityPolicyVersion: z.literal("prevention-company-eligibility-reference.v1"),
  property: z.array(preventionResultV1), company: preventionResultV1.nullable(),
  watch: z.object({ enabled: z.boolean(), revision: z.number().int().nonnegative(), results: z.array(preventionResultV1) }).strict(), realExternalActions: z.literal(0),
}).strict();
export type PreventionViewV1 = z.infer<typeof preventionViewV1>;
export const preventionCommandResultV1 = z.object({ version: z.literal("prevention-command-result.v1"), environment: z.literal("synthetic_demo"), commandId: z.string().uuid(), view: preventionViewV1, realExternalActions: z.literal(0) }).strict();
export class PreventionCheckError extends Error {
  constructor(readonly code: "INVALID_PREVENTION_COMMAND" | "FORBIDDEN" | "NOT_FOUND" | "PARTIES_REQUIRED" | "REVISION_CONFLICT" | "COMMAND_CONFLICT" | "NOT_REGISTERED_COMPANY" | "WATCH_NOT_STARTED" | "WATCH_ALREADY_STARTED" | "SYNTHETIC_ONLY") { super(code); this.name = "PreventionCheckError"; }
}
