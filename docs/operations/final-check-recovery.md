# SV-5 synthetic final-check recovery

SV-5 now installs the post-lock handler for synthetic small-builder practice jobs. Migration 0381 requests one run atomically with each eligible new lock; existing locks can use the checked practice request. Discovery commits the Graphile queue insert and request acknowledgment together. Workers validate tenant, job, lock and frozen manifest before processing and publish a proof-checked completion certificate only after reconciliation. This is synthetic construction, not production activation or proof that every legacy invoice path is guarded.

Freeze one inventory for the immutable lock. Inspect source status through `read_final_check_manifest` using the shadow login, never through a builder database connection. A pending upload, missing decoder, unsupported source, invalidated object or mismatched input stays incomplete. Do not remove an entry, shorten the inventory or turn a failure into zero to unblock it. Supported finalized synthetic observations use the existing detector; missing diary/customer/PO/import adapters stay with their owning tasks. Newly encountered mandatory-surface processing after lock remains unsupported rather than calling the pre-lock disclosure routine.

Every result attempt commits separately. Preserve failures when a later attempt succeeds. On a processing crash, reread the same manifest and resume unfinished sources. On uncertain disposition delivery, replay the exact command ID and body; current session/membership/job authority is checked again. A changed body conflicts. An available run returns its first immutable identity on restart. The worker rereads persisted completion before publication. Its certificate ID is the manifest ID, so a retry or new execution ID reuses the same certificate. Publication errors propagate; an idempotency conflict is never swallowed as success.

Monitor Graphile task failures, source failures, unprocessed inventory and unavailable results. No new external alert is sent by this portion. The unresolved queue contains attribution disputes only; it grants no support or human-resolution authority. Null included references create a dispute; a selected foreign/non-locked reference is refused. No queue action grants eligibility or creates a fee.

Disable the new worker composition/controller to contain a fault, retain inventories/attempts/proofs/dispositions/receipts/audit events, and issue an additive forward migration. Do not delete or rewrite commercial history. No production activation, real provider call, retention decision, merge or release is authorized here.

C239/C204 repair: use the 0204 generated inventory as the source of terminal-upload exclusions. Rejected and expired entries retain their state, reason and `final_check.sources_excluded` audit event; they require no processing attempt. Inspect the separate `final_check_processing_source` inventory for remaining pending/failed sources. Successful reconciliation now persists the prerequisite proof stages and verifies them; publish explicitly through `FinalCheckCompletionRepository.publish` to obtain 0204's checked certificate. Never synthesize a completed label. Existing prerequisite-only manifests are preserved, with #181 begin returning pending; use their original 0204 processing/publication path. No superseded upload state or audited re-freeze exists in this schema.

Browser B/D now cover the automatic run, with no fabricated source results or completion facts. B seeds an existing
held proposal and captures £800 at final review; the real worker must classify it as builder-captured and reveal
nothing. D reconciles the practice photo against the original scope. Database and browser evidence must come from CI.
Test I remains blocked on D13 must-surface activation. J/L remain outside this slice: SV-7A's merged intake refuses
new post-lock diary/messages; email/photo coalescing and post-lock import are not provided by that bounded text intake.

## real-fc-typed-recovery (RED; synthetic only)

Migration 0732 separates a recoverable worker cycle from the immutable manifest
attempt. Each admitted cycle permits at most three executions and Graphile
`max_attempts := 3`. Exhaustion is durable plain failure. Discovery reconciles
missing/exhausted queue work, including process death before terminal recording;
it never creates replacement cycles. Queue insertion and acknowledgement commit
or roll back together, with manifest-plus-cycle queue identity.

Only an authorised owner can restart a terminal failed **managed** request.
Management means that exact request has `enqueued_at IS NOT NULL` or non-empty
`cycle_history`. Restart appends history before clearing the acknowledgement,
retaining the same manifest, lock, cutoff, inventory, source attempts and successful
results. This remains managed before the replacement is enqueued. Competing
requests serialize; pre-manifest duplicates replay, and requests after begin return
`FINAL_CHECK_PENDING` without writes. Current session, membership, ownership/import
ancestry, terms, synthetic environment and open-job checks precede admission.

A reconciled-but-unpublished managed manifest remains pending, or failed on
exhaustion; owner recovery resumes its publication on the same manifest. Completion
requires the exact current checked certificate and authoritative proof. A lost
publication reply reconciles persisted valid publication without duplication.
Invalidated historical certificates never authorize ordinary recovery or completion:
`require_final_check_rerun` retains its separate manifest-attempt authority.
Previously unqueued requests retain direct reconciliation semantics until actual
atomic enqueue. Those legacy completed labels do not authorize invoices.

All shadow writes and checked publication use the same pinned connection holding
the cycle advisory lock. Stale claims/finishes cannot alter a replacement cycle.
Database unavailability propagates as delayed/unavailable work, without fabricated
source failures or completion. The sole queued context constructor stays in
worker.ts; execution receives its stamped context whole and validates tenant
agreement. Infrastructure retains only `UPDATE(enqueued_at)` and the exact checked
`infrastructure.final_check_cycle_exhausted(uuid,uuid,uuid)` executor. No product
role or broad business grant is added.

Authorised unlocked reads remain fixed without terms or hidden lookups. Locked
reads and mutations require terms. Only saved pending state gets the running
message. Permitted reveals return one distinct bounded estimate per coalesced work
identity; conflicting or absent estimates are null. Invoice proof gates remain
unchanged. The browser journey retains the ordinary typed front-door walk,
hallway-ceiling customer message, £150 diary note, isolated job-scoped transient
fault and cleanup. It explicitly uses 390×844, loads plain failure after three
executions, performs a labelled API-driven restart, then loads completion and
records the displayed invoice balance to Paid. The separate screen piece owns
Try again, polling, estimates and invoice refresh; it is outside this lane.

Forward upgrade requires old workers drained before installing 0732 and the new
worker. Acknowledged legacy requests remain managed and conservatively failed
unless exact current checked publication proves completion. Unacknowledged rows
keep direct semantics. Historical manifests, attempts, certificates, grants and
commercial records survive. Unfenced legacy deliveries perform no claim, begin,
processing or publication. Renumbered from build-ahead 1430 to 0732 at landing (migration and proof
together). Use an additive forward fix for faults. No deployment is authorised;
D04 and G1–G5 remain closed.

Repair 1 local evidence (10 Nov 2026):

- From apps/api: `./node_modules/.bin/vitest run --maxWorkers=1 src/final-check.application.test.ts src/final-check-practice-run.test.ts src/sv5pre-worker-registration.test.ts` passed 23 tests.
- From apps/api: `./node_modules/.bin/vitest run --maxWorkers=1 src/auth/context-boundary.test.ts src/shadow-detection.worker.test.ts` passed 154 tests, with the context boundary unchanged.
- From packages/db: `./node_modules/.bin/vitest run --maxWorkers=1 test/migration-proof-loader.test.ts` passed 77 tests.
- `node_modules/.bin/tsc -p apps/api/tsconfig.json --noEmit` and `node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit` passed.
- `node_modules/.bin/tsc -p /tmp/recovery-test-tsconfig.json --pretty false` passed. The temporary config extends the repository config, sets rootDir to this worktree, noEmit and decorator options, and includes the recovery suite and four authorised catalogue/successor suites. This is a typecheck, not database execution.
- `node tools/lint.mjs`, `node tools/agent-lane-boundary-lint.mjs --lane=real-fc-typed-recovery` and `git diff --check` passed. The lane contains exactly the fifteen changed paths other than itself; merged typed-sources files remain outside it. LP-6c successor additions remain intact.
- The pnpm three-file API invocation stalled selecting the pinned manager before Vitest and was interrupted; installed Vitest 4.1.12 ran the equivalent commands above without downloading dependencies.
- `./node_modules/.bin/vitest list test/real-fc-typed-recovery.integration.test.ts --maxWorkers=1` from packages/db collected 18 cases. Collection is not execution.

0732's additive proof retains exact predecessor records. Replacement hashes were
derived from final source using the established PostgreSQL 16 `pg_get_functiondef`
rendering method in ais-migration-proof.test.ts; the method reproduced both original
0698 pins before deriving replacements. Final request hash:
`7b01a37185c80be397c9947f0d837b49fe81dcf17a08899241c3b29d1f415bcd`;
final practice reveal hash:
`ae4fcf69bcbd955fce9e535241c0a94f3f9bfb9a1b731b64e066b0894dfa8940`.
These are source-derived and await real-catalogue verification. Historical proofs
and protected inventory were not edited. Both successor tests replay the complete
proof and compare their schema projection; the recovery suite separately pins the
excluded infrastructure helper's body, owner, search path, ACL and refusals.

Outstanding exact commands (not executed here):

- `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/real-fc-typed-recovery.integration.test.ts`
- `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/final-check-access.integration.test.ts test/final-check-practice-owner.integration.test.ts test/final-check-request-grant.integration.test.ts`
- `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/company-final-check-authority.integration.test.ts test/company-final-check-upgrade.integration.test.ts`
- `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/final-check-rerun.integration.test.ts test/final-check-rerun-upgrade.integration.test.ts test/final-check-invalidation-lock.integration.test.ts`
- `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/final-check-invoice.integration.test.ts test/final-account-lock-invoice.integration.test.ts test/real-fc-typed-sources.integration.test.ts`
- `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/tenancy.integration.test.ts`
- `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/migfix-7-upgrade.integration.test.ts test/plan-entitlement-lifecycle-upgrade.integration.test.ts test/lp-0-grant-freeze.integration.test.ts`
- `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/shadow-catalog.integration.test.ts`
- `pnpm --filter @jobguard/web test:e2e real-fc-typed-recovery.spec.ts --project=mobile-360 --workers=1`

PostgreSQL/browser execution is unavailable in this sandbox (cannot start
PostgreSQL or bind localhost). The independent RED checker must execute these on
the router's exact committed head, including fresh/upgrade and real Graphile
execution. Before/after execution evidence for the named database and browser
regressions remains outstanding; collection and source inspection do not supply
it. Company/rerun behavioural suites remain unchanged. Required CI also remains
`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:db`,
`pnpm test:migrations`, `pnpm lint:lanes` and affected journeys. Full workspace
commands were not run here under the relevant-local-checks-only instruction; the
pnpm lane command is replaced locally by the successful exact node command above.
No independent review, self-merge, release or deployment is claimed.

LATER / SIMPLICITY (initial inspection, retained): apps/api/src/worker.ts constructs
similar generic and practice execution ports. A later scoped change can share a
pool-parameterised factory, preserving the pinned connection, to reduce drift.
This does not block this piece.
