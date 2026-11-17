import { pathToFileURL } from "node:url";

/** Release preflight: deliberately cannot turn fixture success into live evidence.
 * A future approved route must replace this refusal with the actual golden run. */
export function liveEvaluationMain(emit: (text: string) => void = text => process.stdout.write(text)): number {
  emit(JSON.stringify({
    schema: "jobguard-live-evaluation/1", status: "BLOCKED", releaseDecision: "NOT_AUTHORIZED",
    code: "LIVE_ROUTE_DISABLED", costPence: 0, deployment: null,
    blockers: ["D04 exact route approval", "Founder authorization for spending", "Verified regional adapter", "Live golden run including persisted citations"],
    targets: { scopeIntentRecallPercent: 95, unsupportedMonetaryFacts: 0,
      persistedCitationsInBoundsPercent: 100, designatedAmbiguities: "ALL" },
    results: null,
  }) + "\n");
  return 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = liveEvaluationMain();
}
