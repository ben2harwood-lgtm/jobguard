# LATER-SAFETY-15 — RED connector authority

Both reported faults remain on batch-35: legacy intake accepts machine bindings,
and SQL NULL key/kind membership predicates can fail open. Neither item was skipped.

Forward-only replacement of the latest intake (0576, including materials support)
and machine_stage (0991). Intake refuses any machine_connection binding with
CONNECTOR_INPUT_REFUSED / 42501 before tenant context, staging or receipt replay.
Machine staging explicitly refuses NULL/empty key references and NULL/empty/missing
kinds before nonce insertion. All signatures, owners, ACLs, configuration, tables,
locks, original validation, immutable receipt semantics and sealed audit are retained.
No backfill, data deletion, real credential, provider, endpoint or activation.

Machine staging previously called legacy intake. Its latest complete intake body is
now an inner PL/pgSQL block after the unchanged machine checks/nonce insertion.
This duplication avoids a new privileged helper or caller-controlled bypass setting;
it preserves atomic rollback of nonce, staged event and audit. The deterministic
body-equivalence regression binds both copies to the latest 0576 body. Any later
intake validation change must also update machine staging. This is the only added
complexity. No app.* function SET clause is introduced.

The proof explicitly replaces machine_stage's static writes/calls. No LP-0 grant,
owner, RLS, policy, app routine ACL or tenancy snapshot changes; upgrade and tenancy
sections are empty for that reason. No baseline pin/scanner changes are made.

## Named holds for landing

- Migration ordering repaired: 0992 follows 0991_connector_machine on batch-35.
  Migration SQL is unchanged; only the complete filename stems and references were
  renumbered. The proof-loader suite now passes without weakening its guards.
- No scanner/pin edit is currently justified. If CI requires one, its exact finding
  remains a separately authorised landing hold; do not relax guards.
- Exact-head independent RED review and green required CI remain mandatory.

## Verification and CI obligations

Added real-PostgreSQL regression cases (not executable in this sandbox): valid
machine token under jobguard_connector cannot call intake, including receipt replay;
no staged row/nonce/audit on refusal; NULL/empty key; NULL/empty/missing kind;
forged machine actor/tenant/capabilities; replay; valid machine_stage still stages.
Original five machine cases and original intake cases are unchanged. The assertions
are regression-first but no failing-first SQL execution is claimed locally.

CI must execute connector-machine.integration.test.ts and the
unchanged connector-intake integration cases, test:db, test:migrations, LP-0 and
upgrade/tenancy/catalogue guards, and required typecheck/lint/test/build. Prove fresh
install, populated predecessor upgrade, repeat migration, atomic refusal/rollback,
non-machine compatibility and correct machine staging on real PostgreSQL. No
browser workflow changes. Forward-fix by another reviewed migration; preserve
connections, source receipts and audit history rather than dropping them.

Local results (5 November 2026):

- Installed core/storage TypeScript builds passed to supply missing local dist
  entrypoints; no dependency download or tracked generated change.
- `packages/db/node_modules/.bin/tsc -p tsconfig.json --noEmit` from packages/db:
  PASS. The package tsconfig covers source; SQL integration execution is still CI.
- Installed Vitest, from packages/db:
  `./node_modules/.bin/vitest run --maxWorkers=2 test/connector-intake-proof.test.ts test/migration-proof-loader.test.ts`:
  80 passed, 3 failed (83). Connector proof file: all 6 PASS, including both new
  body-preservation cases. All three failures are strict proof-discovery assertions:
  `duplicate proof identity: lp0:routines:function:connector.machine_stage(uuid,text,jsonb,text,text,bigint,jsonb)`.
  The 0791 replacement precedes its 0991 introduction. Do not weaken this guard.
- The initial Vitest attempt could not resolve unbuilt @jobguard/core; the run above
  followed local dependency compilation. Initial pnpm wrapper attempts stalled and
  were interrupted; installed package binaries were used without downloads.
- `node tools/agent-lane-boundary-lint.mjs --lane=later-safety-15` compared against
  main and included the parent batch. With LANE_BASE_REF=codex/sandbox/batch-35 it
  refuses self-comparison because this uncommitted worktree HEAD equals that base.
  The existing exported loadLanePolicy/lanePathAllowed checks PASS for all seven
  actual changed/untracked paths against batch-35; formal post-commit lane/order
  lint remains for the router after renumbering. No parent files added to this lane.
- `git diff --check`: PASS. No PostgreSQL/browser execution, git writes, commit,
  push, PR or independent review performed here.

Follow-up verification (5 November 2026, after renumbering):

- From packages/db, `./node_modules/.bin/vitest run --maxWorkers=2 test/connector-intake-proof.test.ts test/migration-proof-loader.test.ts`:
  PASS, 83/83 tests in two files, including the three previously failing discovery
  tests. No assertions were weakened.
- From packages/db, `./node_modules/.bin/tsc -p tsconfig.json --noEmit`: PASS.
- Lane allow-list exactly matches all six changed/untracked non-lane paths against
  codex/sandbox/batch-35 and excludes its own config/lanes file.
- `git diff --check`: PASS. No PostgreSQL or browser suite was run locally; this
  sandbox cannot start PostgreSQL or bind localhost. No git writes were performed.

Handoff status: READY for router commit/push as NOPR. PostgreSQL CI and an
independent RED review against the exact head remain required before landing.
