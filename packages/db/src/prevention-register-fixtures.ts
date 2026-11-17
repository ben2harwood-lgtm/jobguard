import { evaluatePreventionFact, PREVENTION_SOURCES, type PreventionKind, type PreventionResultV1 } from "@jobguard/core";

export const PREVENTION_FIXTURE_ID = "generated-prevention-registers.2026-10-07.v1";
export const PREVENTION_FIXTURE_RETRIEVED_AT = "2026-10-07T12:00:00.000Z";
/** Generated fictional records. Never query a real address, individual or company. */
export function preventionRegisterFixtures(kinds: readonly PreventionKind[], fixture: "mixed" | "fresh" | "stale" | "missing", evaluatedAt: string): PreventionResultV1[] {
  return kinds.map(kind => {
    const missing = fixture === "missing" || (fixture === "mixed" && kind === "article_4");
    const stale = fixture === "stale" || (fixture === "mixed" && kind === "flood");
    const fact = missing ? null : kind === "listed_building" ? "constraint" : kind === "company" ? "company_active" : kind === "gazette_feed" ? "feed_event" : "no_record";
    return evaluatePreventionFact({ kind, source: PREVENTION_SOURCES[kind], retrievedAt: PREVENTION_FIXTURE_RETRIEVED_AT,
      observedAt: missing ? null : stale ? "2026-09-01T00:00:00.000Z" : PREVENTION_FIXTURE_RETRIEVED_AT, fact, evaluatedAt });
  });
}
/** There is no live adapter or fallback in this leaf. */
export function createLivePreventionAdapter(): never { throw new Error("LIVE_PREVENTION_ROUTE_DISABLED_D04_D12_REQUIRED"); }
