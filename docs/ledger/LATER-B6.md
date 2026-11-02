# LATER-B6 — Shadow proposal and evaluation reliability

Decision 74: synthetic build, RED check, PARK. This is builder evidence only; independent review and separate acceptance remain pending. No merge, enablement, deployment or outward action is authorized by this note.

Base inspected: `origin/main` and HEAD `7ff452eeec1c523345d34715adfa3f8310062013`, ahead of the issued `ca435eeb5791638c787c830d6ba717146f694539` and draft `0bbb5ddb`. Current main controls. The SV-3 contracts remain at BUILD_PLAN.md:1813–1825. No migration or grants.

- L123: versioned candidate identities distinguish validated description, confidence, recommendation and citation, preserve work identity, rebind evidence links, ignore processing order/time and collapse identical candidates.
- L126: typed fixture/provider-output failures permit deterministic results and successful proposals from other observations to reach the established sink. After sink success, the first AI failure is rethrown for scheduler failure recording. Sink, authorization, cancellation, request and invariant failures propagate.
- L131: the evaluator reads new `shadow-labels.v2.json` only after generating predictions and compares labelled tenant/job/area/work references against actual grouped work IDs. The existing 11 cases retain TP=3, FP=0, FN=0. A separate synthetic substitution regression yields TP=0, FP=1, FN=1. Existing corpus, v1 labels and merged test assertions are unchanged.

The three new test files include combined gateway-plus-shadow coverage against this base. B3 owns gateway changes; rerun these regressions on any combined head. B24 owns persistence; this piece does not modify its sink or prove PostgreSQL behavior. Two-worker source tests exercise the real detector/gateway/grouping path with a stubbed sink; they are not a live provider or database integration.

No contractor route, fee entitlement, disclosure policy, builder projection, live-model path, schema, RLS, authorization grant or UI change. The new self-service lane registration contains only the issued paths, including the new v2 labels, receipt and ledger. See `docs/verdicts/LATER-B6/BUILDER_RECEIPT.md` for commands, counts, hashes, limitations and pending checks.
