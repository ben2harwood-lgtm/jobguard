# CH-7-REST-B — DW3 issuance STOP record

18 October 2026; RED qualifying-money lane. Build-ahead base is `302e6f01aac7fc2bb4a05ea5f50c6b7b5944263c`, inherited from CH-7-REST-A, PR #292. Local origin/main observed at `42990862881cd048c7167869246551d5360beb17`; no fetch performed. A remains a merge prerequisite, not a reason to prevent authorized build-ahead work. Its implementation is preserved.

## Item-specific STOPs

- Scope: issuance says build only the draft's “sub-order A”; the pasted DW3 draft contains no such sub-order. The referenced `draft-ch-7-rest-20261018T132715.md` defines sub-order A as CH-7-REST-A/F21, already implemented in this base. Clarification requested; no duplicate F21 implementation.
- STOP-2: no approved missing/pre-terms result encoding or reason/precedence. The draft expressly forbids choosing null/held, inventing wording, or deciding saved exclusion versus refusal. This blocks the evaluator/repository/SQL change as one atomic implementation. No permissive partial application change installed.
- STOP-1: equality and reversed transaction-start/commit ordering remain undecided. Ben answer 1.9 is ENT-6-specific; no CH-7 authority inferred.
- STOP-3: exact source anchors refreshed locally: migration `0195_ch7_f21_reason.sql` defines `app.guard_recovery_eligibility_v3()` at line 5 and `app.require_recovery_eligibility_v3_effect()` at line 138. A acceptance/merge evidence remains dispatcher-owned. No claim of independently accepted A head.

Unaffected work: inspected AGENTS, applicable BUILD_PLAN sections, binding Ben answers, referenced remainder draft, contracts, evaluator, repository, A ledger/receipt and lane conventions. Created exact B lane without listing itself. Next locally free migration is 0196, substituted in lane only; no SQL or migration note created. Dispatcher may renumber.

## Acceptance matrix

All six DW3 named tests remain NOT IMPLEMENTED / NOT RUN pending the load-bearing result contract and scope clarification; no failing-first evidence claimed. Existing baseline checks are reported separately in the builder receipt. No new schema, grants, rows, provider, alert, production path or security inventory changes. Standing ruling 113 exceptions not exercised.

DW3 remains incomplete. C still owns non-v3 pursuit. Independent different-model RED verdict on the eventual tested commit, separate acceptance, PostgreSQL/browser CI and all existing release gates remain outstanding. No commit, push, merge or release authorized or performed.

## continuation (decision 123) — 19 October 2026

Continuation scope explicitly supersedes the stale “sub-order A” sentence: B/DW3 is issued. Ben decision 122 releases A for merge; decision 123 chooses saved not-counted pre-terms money and supplies exact wording. Local starting HEAD is `00d4f3453863616f4e844be1a17eeaa43719c5a5` (previous B STOP receipt), parent A `302e6f01aac7fc2bb4a05ea5f50c6b7b5944263c`. No fetch, commit or push. Dispatcher still owns binding acceptance to the eventual committed patch.

Implemented the decided withheld-payment slice across core, repository and both SQL guards in provisional migration 0196. Strict fact validation replaces the approval assumption; command inputs accept no authority fields. Applicable immutable approval is read under the shared case lock with tenant/job/case/version checks. PostgreSQL compares original settlement to approval without truncation; interest uses its own settlement. Later reviews and statement replays cannot rescue pre-terms money. Audit cites the exact approval. Stored reviews, lines, approval records and audit remain unchanged; exact command replay occurs before new timing evaluation. F21 and saved supplier-credit guard branches remain intact. No new schema/grants/security objects or business locks after audit.

Decision 123 text: "This came in before your fee terms were agreed, so it isn't counted as recovered money and there's no fee on it."

Existing applicable reasons retain precedence. Before-opening and insurer reasons remain whole-case explanations; compensation and individual interest retain component exclusions; pending/unverified stays unpaid. Otherwise pre-terms principal/business interest receives the new note, and the existing header-selection rule applies. This follows the order's instruction to preserve approved reasons where their predicates remain true; independent review must check this interpretation.

| Acceptance | Evidence / remaining limit |
| --- | --- |
| ReceiptBeforeTermsNeverRescued | Unit failing-first then pass; real-PostgreSQL test authored, NOT RUN, includes unequal timestamps in one millisecond, new review and statement replay |
| LaterApprovalPreservesEarlierReview | A-schema saved positive result/replay and B new exclusion covered in upgrade test source; missing-approval saved-result subcase STOP-2 |
| SeparateInterestUsesOwnSettlementTime | Unit pass; DB source covers early interest, principal-only 250000p and both later 262000p; NOT RUN |
| ForgedTermsTimingRefused | Strict command/facts tests; raw runtime header/line/foreign-case approval and rollback assertions authored, NOT RUN; real foreign-tenant approval rejection also authored |
| TermsReviewConcurrency | Two-connection case-lock test and real authorized-approval rollback test authored, NOT RUN; reversed transaction-start/commit subcase STOP-1 |
| DW3UpgradePreservesHistory | Populated A v3/lines/approval/audit proof, B alone, later migrations twice, replay/new review and rolled-back row/type controls authored, NOT RUN; populated v1 and broader routine/constraint/catalog comparisons also authored |
| Existing guarantees | Core/API setup only gains explicit synthetic terms facts; no prior money/reason/security assertions weakened. DB positive fixture lifecycle compatibility remains STOP below |

Remaining item-specific STOPs:

1. Missing approval: decision 123 addresses a receipt before agreed terms, not the presentation when no agreement exists. Equal timestamps and reversed transaction-start/commit semantics remain undecided. The implementation stops missing/equal cases internally with typed `ELIGIBILITY_TERMS_DECISION_REQUIRED` (SQLSTATE 0A000), storing no review. This is a capability hold, not an approved public refusal contract; no transport change or invented result encoding. It cannot be released as complete DW3.
2. Supplier credits: existing terms writer explicitly refuses non-withheld-payment categories. It cannot implement decision 123's supplier-credit case within the authorized unchanged-writer boundary. No supplier approval/category extension, new fee rule or altered earlier/mixed-credit path. Dispatcher must issue the exact scope amendment for that item.
3. Inherited current-schema positive recovery/insurer fixtures create null-policy jobs. A real terms approval requires v3 policy. Silently converting those jobs or introducing an old-schema production fallback is expressly forbidden. Kept their assertions and historical seeds; only pure facts gain explicit prerequisites. Exact fixture/lifecycle amendments are required before their DB regressions can pass. New DW3 tests create explicitly v3 synthetic fixtures and obtain actual approval through the existing authorized repository.
4. A's files remain outside B's exact lane against stale local origin/main. No lane widening, historical migration, central registry, runner, inventory or A test edits. A browser/current-schema fixture outside the lane also requires a dispatcher amendment.

No task closure: C's non-v3 pursuit work, database/browser execution, complete adversarial/upgrade coverage, independent different-model RED verdict, separate technical acceptance and all production/release gates remain. This patch is reviewable build-ahead work, not a merge-ready complete B.
