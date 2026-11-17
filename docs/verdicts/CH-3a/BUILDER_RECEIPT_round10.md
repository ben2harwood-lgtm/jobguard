# CH-3a round 10 — builder receipt

7 October 2026 · `codex/sandbox/ch-3a` · existing PR #98.
Uncommitted repair against **bd2797afa03bd035ed89d2809dca7ebc3c1215bd**;
the dispatcher owns the next commit and push. Earlier CH-3a work, including
rounds 8–9, is retained. This is builder evidence, not acceptance or an independent verdict.

**P1-1 repaired in source; available local checks passed. Exact repaired-commit
PostgreSQL/browser evidence and independent review remain pending.**

Migration **0095** replaces both parse-time `U&` literals in
`app.valid_party_revision_text` with ASCII dollar-quoted regex patterns. The
supplementary range remains U+10000–U+10FFFF. The anchored trim pattern removes
only leading/trailing members of the same 25-character JavaScript trim set;
internal characters remain. UTF8 regex escapes denote Unicode code points as
documented in [PostgreSQL 16 Table 9.20](https://www.postgresql.org/docs/16/functions-matching.html#POSIX-CHARACTER-ENTRY-ESCAPES-TABLE).
Thus trimming and the code-point-length-plus-supplementary-count formula retain
round-9 UTF-16 semantics without converting Unicode SQL literals at function creation.
SQL execution of that equivalence still requires CI.

Two tests were added to the lane's existing `job-parties.integration.test.ts`:

- Create an explicitly **SQL_ASCII** database from `template0` on the existing
  cluster, verify its encoding, apply the complete migration chain, verify every
  registered migration and the validator's installation, and verify migration replay.
- Compare the UTF8 validator with JavaScript `trim().length` on 132 synthetic
  strings: every trim character, internal whitespace, blank and 160/161 boundaries,
  non-trim characters and supplementary endpoints/emoji at 80/81-character boundaries.

All earlier assertions remain, including the 46 runtime refusals, identity/revision
rollback, maximum-length/emoji success and validator catalog checks. None of
`audit`, `capture`, `ledger`, `outbox`, `recovery` or `tenancy` was edited.
No assertion was weakened/deleted; no skip, retry or timeout was added/lengthened.
The lane registry, migration number/order, hard-coded migration counts and all
other product code remain unchanged. `MIGRATIONS.md` now distinguishes migration
installation from site writes/backfill, which still require UTF8 for NFKC normalization.

Environment: Node **24.17.0**, cached pinned pnpm **10.28.1**, existing dependencies.
Commands used `PATH=/private/tmp/jg-ch3a-round9-bin:$PATH`; no install/download
was attempted. Logs: `/private/tmp/jg-ch3a-round10-logs/`.

| Command actually run | Exit | Result |
| --- | ---: | --- |
| `pnpm typecheck` | 0 | Seven packages; four cached. |
| `LANE_BASE_REF=origin/main pnpm lint` | 0 | Repository boundaries and seven package lints; no self-comparison refusal. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | CH-3a scope passed; repeated after writing this receipt. |
| `pnpm --filter @jobguard/core exec vitest run src/job-parties.test.ts src/quote-document.test.ts src/job-import.test.ts` | 0 | 16 tests. |
| `pnpm --filter @jobguard/web test` | 0 | 71 tests. |
| `pnpm --filter @jobguard/api exec vitest run src/job-parties.application.test.ts` | 0 | Four tests. |
| `pnpm --filter @jobguard/db exec vitest run src/demo-seed.test.ts test/verify-evidence-pack-cli.test.ts` | 0 | Seven unit tests. |
| `pnpm --filter @jobguard/db exec vitest run test/demo-bootstrap.integration.test.ts -t 'bootstrap SQL trace'` | 0 | One trace test; three PG cases excluded only by this local filter. |
| `node --test tools/*.test.mjs` | 0 | 42 tests. |
| `pnpm build` | 0 | Seven packages; three cached; Next production build completed. |
| `pnpm openapi:check` | 1 | Sandbox blocks tsx CLI IPC socket: `listen EPERM`. |
| `node --import tsx src/generate-openapi.ts --check` in `apps/api` | 0 | Same generator/comparison without CLI IPC. |
| `pnpm --filter @jobguard/db exec vitest list test/job-parties.integration.test.ts test/demo-bootstrap.integration.test.ts test/restore-rehearsal.integration.test.ts` | 0 | 84 cases collected; no PG execution. |
| `pnpm --filter @jobguard/web exec playwright test --list CH-3a.spec.ts` | 0 | 36 cases collected across both projects; no browser execution. |
| `node /private/tmp/jg-ch3a-round10-encoding-probe.mjs` | 0 | ASCII patterns/no `U&`; 1,112,063 non-null Unicode scalar values and 20,000 deterministic strings agree with round-9 trim/length and JavaScript. Source-equivalence probe, not PostgreSQL proof. |
| `node /private/tmp/jg-ch3a-round10-test-types.cjs` | 0 | New test code adds no TypeScript diagnostics against HEAD; six pre-existing `unknown`-to-`string` diagnostics remain. This comparison is not a green standalone test-file typecheck. |
| `git diff --check` | 0 | Whitespace clean; repeated after receipt. |

Full `pnpm test`, `pnpm test:db`, `pnpm test:migrations`, restore execution and
browser execution were not run: the dispatcher states this sandbox cannot start
PostgreSQL or bind localhost. Collection/source probes do not replace them.
A clean pinned install and full regression execution remain CI work. No AI
behavior changed, so a live-model evaluation is inapplicable and unauthorized.

**P2-1: required exact-head evidence after the dispatcher commits/pushes.**
CI must identify the repaired commit SHA and show green `checks`, `secrets` and
`dependency-review`. `checks` must complete the frozen install, typecheck, lint,
full `pnpm test`, **`pnpm build`**, and full **`pnpm test:e2e`** in **mobile-360
and desktop**. In particular, all six previously failing suites must migrate
and pass unchanged; job-parties must pass all **70** cases (68 earlier plus two
new), including SQL_ASCII migration/replay and UTF8 equivalence. Bootstrap,
restore and shared-money-origin coverage must also remain green. The supplied
run **37655636477** on bd2797a was red and is not repaired-head evidence.
An independent recorded verdict bound to the new commit and separate technical
acceptance remain required. P3-1's later-migration count note needs no change here.

Only unapplied 0095 is amended, within its original atomic transaction. There
was no local database migration/reset. Failed application rolls back; after
rollout use a reviewed forward fix rather than rewriting applied history.
Validator immutability, invoker security, ownership/grants, RLS, authorization,
audit, money and retained commercial/document history are unchanged. No new
operational alert or release permission is introduced.

Synthetic data only; no live provider, spending, real send, production execution,
decision approval, Git-writing command, push, merge or PR creation.
Intended commit subject/body is in `/private/tmp/jg-msg-ch-3a.txt`:
`fix(db): defer CH-3a Unicode validation escapes until runtime`.
