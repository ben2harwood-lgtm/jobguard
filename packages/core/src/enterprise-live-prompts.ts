import { parseCompletionWorkInput, type CompletionWorkFinding } from "./enterprise-live-prompt-contracts.js";

/** Rule (a) only: exact supplied recognition, no text inference, grouping, commercial action or persistence. */
export function calculateCompletionWorkFindings(raw: unknown): CompletionWorkFinding[] {
  const input = parseCompletionWorkInput(raw);
  const instructed = new Set(input.baseline.workIds);
  const sources = new Map(input.sources.map(source => [source.evidenceId, source]));
  const workByTerm = new Map<string, Set<string>>();
  for (const entry of input.recognition.entries) for (const term of entry.terms) {
    const workIds = workByTerm.get(term) ?? new Set<string>(); workIds.add(entry.workId); workByTerm.set(term, workIds);
  }
  const findings: CompletionWorkFinding[] = [];
  for (const observation of input.observations) {
    const source = sources.get(observation.evidenceId)!;
    if (source.status !== "verified" || source.invalidated) continue;
    const term = observation.locator.kind === "text_span" ? observation.locator.quote : observation.locator.tag;
    const candidates = workByTerm.get(term);
    if (candidates?.size !== 1) continue;
    const workId = [...candidates][0]!;
    if (instructed.has(workId)) continue;
    findings.push({ version: "enterprise-completion-finding.v1", rule: "a", ruleVersion: "completion-work-absence.v1",
      tenantId: input.tenantId, jobId: input.jobId, baseline: input.baseline, recognitionVersion: input.recognition.version,
      observationId: observation.observationId, workId, citation: observation });
  }
  return findings.sort((a, b) => a.observationId < b.observationId ? -1 : a.observationId > b.observationId ? 1 : 0);
}
