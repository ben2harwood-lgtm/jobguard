# MON-5 M5-QUOTE — m5-quote-accept

RED: customer sessions and tenant isolation. Built on `codex/sandbox/m5-signin` (PR #423). This is builder evidence, not independent review, CI success or release approval.

Customer acceptance binds the current job revision, immutable issued quote document ID, document version and PDF content hash. The customer page renders the frozen document's parties, lines, exclusions, qualifications and totals. Prices, actor and acceptance time come from the server. No customer-supplied tenant, permission, amount or acceptance timestamp is trusted. Candidate A's proposal informed exact-reference binding only; its link gate and sample expiry were not copied. Sign-in/session policy remains in 0387 unchanged. A small guard adapter projects the strict job-read envelope for the existing guard, restores the original command body, and retains the existing session resolver; the parent sign-in guard/session files are unchanged. Next and Nest share application validation, generic refusal and no-store handling; routes are classified in the existing registry.

Migration 0388 adds a private, immutable command/provenance table and one identity-only checked routine. An additive composite session key supports the tenant/job/customer-qualified provenance foreign key; it changes no session policy. It extends the existing acceptance constraints to distinguish customer acceptance from builder attestation without adding columns or changing historical row bytes. Customer rows have no impersonated builder actor. The normal quote version, acceptance/event history, acceptance sequence and job accepted-baseline pointer are written together, so existing activation/final-account consumers see the acceptance. Builder display attribution distinguishes both methods. The routine preserves 0155's cancellation, replacement lineage and customer-billing restrictions. No existing migration or routine definition is replaced.

Per-job, per-command and existing draft locks protect replay, current revision and issuance checks; session authority is checked after waits. An exact replay returns the original approval, even after cancellation, without approving again. A fresh command cannot duplicate an active approval. Audit uses 0387's canonical chain format with a stable customer-session actor, document hash and identifier-only commercial payload; the audit head is the final lock.

## Validation actually run

- Installed TypeScript compiler: core/config/storage/AI/DB/API builds; API and web no-emit typechecks; a temporary no-emit configuration checking the new PostgreSQL suite and its imported fixtures. Passed.
- `packages/core`: `./node_modules/.bin/vitest run --maxWorkers=1 src/customer-quote-acceptance.test.ts`: 1 test passed under Zod 4.
- `apps/api`: `./node_modules/.bin/vitest run --maxWorkers=1 src/auth/customer-quote.test.ts src/auth/customer-signin.test.ts src/watchdog-registry.test.ts`: 161 tests passed. Includes production Next adapters and direct Nest guard/controller refusal parity.
- `apps/api`: `node --import tsx src/generate-openapi.ts --check`: passed. OpenAPI generated through the same entry point without the CLI's blocked IPC listener.
- Existing core-purity, money-arithmetic, commercial-boundary and PL/pgSQL CASE-in-IF lint: passed. Core-purity reports existing computed test imports as unverifiable under its existing policy.
- Exact lane path coverage of the uncommitted delta against the inherited sign-in HEAD and final whitespace check: passed (commands below). The standard main-based lane lint also ran and rejects inherited PR #423 paths, including its own lane registration, while that stacked base is absent from main. The task lane is not broadened to claim those files; merge/reconcile the sign-in base before the main-based CI gate.

The installed pnpm launcher could not verify/switch to the repository's pinned pnpm version in this network-restricted sandbox. Initial API test collection also needed the missing workspace build outputs. Validation used the installed compiler and Vitest binaries after building those dependencies; no package was installed or lockfile changed.

The exact-path command was `node /tmp/m5-quote-lane-check.mjs`, calling the repository's `loadLanePolicy`, `selectLane` and `lanePathAllowed` against `git diff HEAD` plus untracked paths. It passed for all 30 changed paths, including the implicitly owned lane file. `git diff --check` passed. This is a scoped deterministic path check, not a substitute for the main-based CI lane gate.

## CI and review still required

PostgreSQL, migrations and browser suites were NOT executed locally: this sandbox cannot start PostgreSQL or bind listeners. New real-PostgreSQL coverage includes concurrent replay, changed hash/version/job revision, foreign quote/job/customer/tenant, forged/expired/closed/revoked sessions, stale customer binding, superseded/changed drafts, malformed SQL intent, cancellation/reacceptance lineage, immutable provenance, role privileges, no journal and full rollback including audit. The existing browser sign-in journey now reviews and accepts a real synthetic issued quote, refuses stale/hash changes and replays to one stored acceptance. Upgrade, tenancy, entitlement and SERIOUS-B5 expectations are unioned; LP-0 inventories the new routine's exact privilege and write/call profile.

Router must push for required CI and arrange the one independent Claude RED review against the exact head before merge. No real customer data, provider delivery, money, deployment or release is enabled. Cancellation kit remains outside this piece pending D06 v2 wording. No new operational alert or environment secret is needed; generic customer refusals and unavailable responses retain the existing boundary. Forward-fix migration policy: retain historical facts; disable the new entry point with EXECUTE revocation if necessary, then correct with a later migration rather than dropping history or reinstalling older routines.

Shared files (`packages/core/src/index.ts`, route/privilege expectations, builder quote display and customer sign-in page) require narrow catch-up unions with sibling MON-5 slices. No whole-file replacement of those siblings is intended.

LATER / SIMPLICITY — `packages/db/src/acceptance-repository.ts`, `QuoteAcceptanceRepository.view`: extract the existing repeated projection into small named functions when that file has a dedicated maintenance task. This would make customer/builder attribution and immutable acceptance fields easier to inspect without expanding this slice into a repository refactor. Non-blocking; source inspection only.

## NOPR catch-up — 1 November 2026

READY for the router to stage and commit the pending merge of main
`e9d6c8b2bec984fb2edc604a1fe90005e67e7f0f` (equal to MERGE_HEAD and the supplied origin/main).
All 14 conflicted working files are resolved. Git's index remains unmerged because this sandbox
cannot write `.git`; the router must stage the resolutions and migration rename before committing.
No fetch, commit, push, PR, database server or browser server was attempted.

Preserved main's variation portal, shared exports, registries, latest Next proxy and test expectations,
and added quote acceptance alongside them. Both review links remain on customer sign-in.
Renamed only the migration filename stem from `0388_customer_quote_acceptance` to
`0570_customer_quote_acceptance` and updated its test/lane lookups. SQL bytes are unchanged
(SHA-256 `1f4775e4372add24634ab4f93f76067080887a1a6440d20e4bc42561277c90e5`).
No main migration changed. No existing routine is recreated by this catch-up.

The new `0570_customer_quote_acceptance.proof.json` supplies explicit LP-0, upgrade and tenancy
changes. It owns the quote routine/RLS and additive catalog expectations, leaving main's frozen
LP-0 inventory and historical SERIOUS-B5/tenancy baselines intact. The known main 0510 missing
proof is unchanged. `docs/contracts/lp-downstream-effects-v1.md` is unchanged.

Current local validation (installed tools; no downloads):

- `packages/core`: `./node_modules/.bin/vitest run --maxWorkers=1 src/customer-quote-acceptance.test.ts` — 1 passed.
- `apps/api`: `./node_modules/.bin/vitest run --maxWorkers=1 src/auth/customer-quote.test.ts src/auth/customer-signin.test.ts src/watchdog-registry.test.ts` — 162 passed after rebuilding core. The initial run reported two registry failures from stale built core output; the unchanged tests pass with refreshed output.
- `apps/web`: `./node_modules/.bin/vitest run --maxWorkers=1 proxy.test.ts` — 32 passed, including both quote portal exceptions alongside variation exceptions.
- `./node_modules/.bin/tsc -p tsconfig.json --noEmit` in API, DB and web — passed. Core and DB `tsc -p tsconfig.json` builds also passed.
- `apps/api`: `node --import tsx src/generate-openapi.ts --check` — passed after rebuilding DB. The initial attempt could not import a newly merged DB export from stale output.
- Isolated 0570 proof discovery/schema validation with the existing loader, LP-0 union/parse without duplicate entry keys, upgrade composition and both tenancy projections — passed. This intentionally isolates this proof from main's known 0510 proof gap; it is not a full-catalog or PostgreSQL result.
- Migration byte equality against the original branch, JSON duplicate-key validation, conflict-marker scan, and `git diff --check` — passed.

No stalled check remains. This is builder test evidence, not independent review. RED remains:
CI must run the required full PostgreSQL/migration and browser checks, followed by the independent
exact-head RED review. NOPR remains in force; the router controls opening and merge order.
