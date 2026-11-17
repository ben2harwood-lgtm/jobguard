import { z } from "zod";
import { utcDatetimeV1 } from "./datetime.js";

const id = z.guid().transform(value => value.toLowerCase());
const code = z.string().regex(/^[a-zA-Z0-9_.-]{1,80}$/u);
const binding = { tenantId: id, jobId: id, ruleId: code, ruleVersion: code };
const instant = utcDatetimeV1.refine(value => Number.isFinite(Date.parse(value)));
const common = { ...binding, eventId: id, commandId: id, occurredAt: instant };
export const inboxMetricEventV1 = z.discriminatedUnion("kind", [
  z.object({ ...common, kind: z.literal("finding"), findingId: id }).strict(),
  z.object({ ...common, kind: z.literal("decision"), decisionId: id,
    findingIds: z.array(id).min(1).max(1000).refine(ids => new Set(ids).size === ids.length) }).strict(),
  z.object({ ...common, kind: z.literal("resolution"), decisionId: id,
    resolution: z.enum(["confirmed", "dismissed"]),
    reason: z.enum(["useful", "already_handled", "incorrect", "not_relevant", "duplicate"]) }).strict(),
  z.object({ ...common, kind: z.literal("later_outcome"), decisionId: id,
    outcome: z.enum(["useful", "no_issue", "cancelled", "reversed"]) }).strict(),
]);
const scopeV1 = z.object({ version: z.literal("inbox-metrics.v1"),
  environment: z.literal("synthetic_demo"), tenantId: id, jobId: id, asOf: instant }).strict();
export type InboxMetricEvent = z.infer<typeof inboxMetricEventV1>;
export type InboxMetricScope = z.infer<typeof scopeV1>;
export class InboxMetricsError extends Error {
  constructor(readonly code: "INVALID_METRICS_INPUT" | "IDEMPOTENCY_CONFLICT" | "INVALID_METRICS_REFERENCE") {
    super(code);
  }
}
const sameRule = (a: Pick<InboxMetricEvent, "ruleId" | "ruleVersion">, b: Pick<InboxMetricEvent, "ruleId" | "ruleVersion">) =>
  a.ruleId === b.ruleId && a.ruleVersion === b.ruleVersion;
const timestamp = (event: InboxMetricEvent) => Date.parse(event.occurredAt);

/** Dark, pure read over fictional metadata. Not an authorization boundary or a durable event writer.
 * No message, monetary, customer, bill, shadow or free-text fields are accepted. Live input is refused.
 * Later outcomes are observations, never settlement facts or instructions to commercial commands.
 */
export function inboxOutcomeMetrics(rawScope: unknown, rawEvents: unknown) {
  const scopeResult = scopeV1.safeParse(rawScope);
  const eventsResult = z.array(inboxMetricEventV1).max(10000).safeParse(rawEvents);
  if (!scopeResult.success || !eventsResult.success) throw new InboxMetricsError("INVALID_METRICS_INPUT");
  const scope = scopeResult.data;
  const events = eventsResult.data.filter(event => event.tenantId === scope.tenantId && event.jobId === scope.jobId);
  const commands = new Map<string, string>();
  const identities = new Map<string, string>();
  const unique: InboxMetricEvent[] = [];
  for (const event of events) {
    // Parsed schemas normalize property order, so equivalent JSON is an exact replay.
    const payload = JSON.stringify(event);
    const priorCommand = commands.get(event.commandId), priorEvent = identities.get(event.eventId);
    if ((priorCommand && priorCommand !== payload) || (priorEvent && priorEvent !== payload)) {
      throw new InboxMetricsError("IDEMPOTENCY_CONFLICT");
    }
    if (priorCommand || priorEvent) continue;
    commands.set(event.commandId, payload);
    identities.set(event.eventId, payload);
    unique.push(event);
  }
  const visible = unique.filter(event => timestamp(event) <= Date.parse(scope.asOf));
  const findings = new Map<string, Extract<InboxMetricEvent, { kind: "finding" }>>();
  const decisions = new Map<string, Extract<InboxMetricEvent, { kind: "decision" }>>();
  const resolutions = new Map<string, Extract<InboxMetricEvent, { kind: "resolution" }>>();
  const later = new Map<string, Extract<InboxMetricEvent, { kind: "later_outcome" }>>();
  const fail = () => { throw new InboxMetricsError("INVALID_METRICS_REFERENCE"); };
  for (const event of visible) {
    if (event.kind === "finding") {
      if (findings.has(event.findingId)) fail();
      findings.set(event.findingId, event);
    } else if (event.kind === "decision") {
      if (decisions.has(event.decisionId)) fail();
      decisions.set(event.decisionId, event);
    }
  }
  const converted = new Set<string>();
  for (const decision of decisions.values()) {
    for (const findingId of decision.findingIds) {
      const finding = findings.get(findingId);
      if (!finding || !sameRule(finding, decision) || timestamp(finding) > timestamp(decision) || converted.has(findingId)) fail();
      converted.add(findingId);
    }
  }
  const outcomeTimes = new Set<string>();
  for (const event of visible) {
    if (event.kind !== "resolution" && event.kind !== "later_outcome") continue;
    const decision = decisions.get(event.decisionId);
    if (!decision || !sameRule(decision, event) || timestamp(event) < timestamp(decision)) fail();
    if (event.kind === "resolution") {
      if (resolutions.has(event.decisionId) || (event.resolution === "confirmed" && event.reason !== "useful") ||
        (event.resolution === "dismissed" && event.reason === "useful")) fail();
      resolutions.set(event.decisionId, event);
    } else {
      const timeKey = JSON.stringify([event.decisionId, timestamp(event)]);
      if (outcomeTimes.has(timeKey)) fail();
      outcomeTimes.add(timeKey);
      const previous = later.get(event.decisionId);
      if (!previous || timestamp(previous) < timestamp(event)) later.set(event.decisionId, event);
    }
  }
  const rules = new Map<string, { ruleId: string; ruleVersion: string }>();
  for (const event of findings.values()) rules.set(JSON.stringify([event.ruleId, event.ruleVersion]), event);
  const byRule = [...rules.values()].map(rule => {
    const matches = (event: InboxMetricEvent) => sameRule(rule, event);
    const ruleFindings = [...findings.values()].filter(matches);
    const ruleDecisions = [...decisions.values()].filter(matches);
    const resolved = [...resolutions.values()].filter(matches);
    const confirmed = resolved.filter(event => event.resolution === "confirmed").length;
    const dismissed = resolved.length - confirmed;
    const linked = ruleFindings.filter(event => converted.has(event.findingId)).length;
    const duration = resolved.reduce((total, event) => total + timestamp(event) - timestamp(decisions.get(event.decisionId)!), 0);
    const reasons = { useful: 0, already_handled: 0, incorrect: 0, not_relevant: 0, duplicate: 0 };
    const laterOutcomes = { useful: 0, no_issue: 0, cancelled: 0, reversed: 0 };
    for (const event of resolved) reasons[event.reason]++;
    for (const event of later.values()) if (matches(event)) laterOutcomes[event.outcome]++;
    return { ruleId: rule.ruleId, ruleVersion: rule.ruleVersion, findings: ruleFindings.length,
      decisions: ruleDecisions.length, convertedFindings: linked,
      findingToDecisionRate: ruleFindings.length ? linked / ruleFindings.length : null,
      coalescedCount: linked - ruleDecisions.length, confirmed, dismissed, reasons,
      meanTimeToDecisionMs: resolved.length ? Math.round(duration / resolved.length) : null,
      laterOutcomes, signalToNoise: { signal: confirmed, noise: dismissed,
        confirmedShare: resolved.length ? confirmed / resolved.length : null } };
  }).sort((a, b) => a.ruleId.localeCompare(b.ruleId) || a.ruleVersion.localeCompare(b.ruleVersion));
  return { version: scope.version, environment: scope.environment, asOf: scope.asOf, byRule };
}
