ENT-4a — builder receipt, round 3

7 October 2026 · branch `codex/sandbox/ent-4a` · existing worktree / PR #110.
Repair input: independent Claude Opus **REPAIR**, bound to
`4f1e80d605db1d32205bedefbb1bbf50bf7a2e5f`.
HEAD remains that commit; this receipt describes the uncommitted working diff.
It is builder evidence, not independent review or technical acceptance.

Read before editing: repository AGENTS.md rev 3.0; BUILD_PLAN.md §2.4,
§9.1.4–§9.1.11 and ENT-4a; the existing domain and round-2 receipt;
SH-1's `docs/contracts/shared-money-origin-v1.md`.

**Finding → fix → test**

- **P2-R1:** `qualifyingPrincipal` now always requires `billed | part_paid | paid`,
  additionally permitting `credited` when a recorded cutoff is supplied. Every
  other canonical lifecycle state returns exact zero even with finalized invoice
  and payment facts. Cutoff filtering and all earlier repair behavior remain.
- **35 new regression rows:** all seven excluded states (`withdrawn`, `rejected`,
  `billing_rejected`, `logged`, `awaiting_approval`, `approved`, `exported`) through
  ordinary and reference qualification with and without cutoff; `feeBearing`
  false; both statement derivations with complete finalized 15,000p facts.
  Each statement row first proves the unchanged ENT-F1 control earns 1,500p,
  changes only state, then asserts exact zero principal, fee, delta and line
  amounts. Both statement schemas require a cutoff; omitting it in each state
  through each API asserts typed `EnterpriseDomainError/INVALID_STATEMENT`.
- Existing round-2 ENT-F12 full-credit (`credited`) and full-reversal (`billed`)
  tests remain unchanged, including byte-identical October replay and November
  linked compensation. No earlier test or assertion was removed or weakened.

**Tests-first evidence**

Before editing implementation, only `fee.test.ts` differed from reviewed HEAD.
`pnpm --filter @jobguard/core exec vitest run src/enterprise-domain/fee.test.ts -t 'round3 P2-R1'`
exited **1**: **21 failed / 14 passed / 29 skipped**, 3.55s. The reviewed code
returned 15,000p principal / 1,500p fee for the forbidden states.
Log: `/private/tmp/jg-ent-4a-round3-red.log`, SHA-256
`2cb51ae983f7f7db54c212c9696e77809007eabf5f947df91bf92e02d19755ad`.

An initial added assertion incorrectly expected no statement lines; the existing
API retains a zero-valued line. Corrected that new expectation to assert the
line's exact zero amounts and identity, retaining every fee/principal assertion.
The first working-source enterprise run exited **1**, 263/278 passed: 14 such
shape failures plus one unchanged purity test's five-second timeout.
A one-row diagnostic exited **1**, confirming the shape mismatch.

The final test file was overlaid on a read-only `git archive` of exact reviewed
HEAD in `/private/tmp/jg-ent-4a-round3-baseline`, using installed dependencies
via symlinks; baseline implementation was unchanged. Final red command:

`pnpm --dir /private/tmp/jg-ent-4a-round3-baseline/packages/core exec vitest run src/enterprise-domain/fee.test.ts -t 'round3 P2-R1'`

Exit **1**, **21 failed / 14 passed / 29 skipped**, 7.23s. Skips are selection,
not a passing-suite claim. Log: `/private/tmp/jg-ent-4a-round3-red-final.log`,
SHA-256 `bbf111eb78cbde53640f94f2cffe74f6bd58366f07ae75cc98bd5cbdb28029a7`.

Working-source final fee run:
`pnpm --filter @jobguard/core exec vitest run src/enterprise-domain/fee.test.ts`,
exit **0**, **64/64**, including all 35 new rows and both round-2 ENT-F12 tests.
Log: `/private/tmp/jg-ent-4a-round3-fee-final.log`, SHA-256
`51d45f26cef4fe92945d401c56b84e0937d81ff9f0b44c905defa6705c2ed078`.

**Checks actually run**

All pnpm commands used `PATH=/private/tmp/jg-ch-3a-merge-bin:$PATH`: the existing
socket-free launcher for cached pnpm **10.28.1**. Node **24.17.0** differs from
the repository pin **24.15.0**. No install or download occurred.

| Command | Exit / evidence |
| --- | --- |
| `pnpm typecheck` | **0**, seven package tasks (two cache hits), 6m03s. |
| `pnpm --filter @jobguard/core test` | **1**, 1,137/1,147 passed across 82 source-plus-compiled files; ten five-second timeouts in unchanged timestamp/receipt and enterprise purity tests. All fee regressions passed. |
| `pnpm --filter @jobguard/core test --maxWorkers=1` | **1**, 1,179/1,182 passed, 82 source-plus-compiled files, 156.31s. Three five-second SH-1 timeouts (compiled receipt stress case and source/compiled timestamp exhaustive case); all enterprise tests passed. |
| `pnpm --filter @jobguard/core test --maxWorkers=1 --pool=threads` | **0**, **1,182/1,182**, 82 source-plus-compiled files, 39.60s. This is **591 unique source tests**, including **278 enterprise source tests**; all earlier regressions and both ENT-F12 full-adjustment tests pass. Five-second default unchanged. |
| `LANE_BASE_REF=origin/main pnpm lint` | **0**, purity, lane, money/commercial checks and seven package lints (two cache hits), 6m03s. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | **0**, initial and receipt-inclusive runs; existing lane passed, no self-comparison refusal. Local lane output includes the uncommitted changes and new receipt. |
| `pnpm build` | **0**, seven package tasks (two cache hits), 4m49s, including optimized Next build and all 14 static pages; no deployment. |
| `pnpm openapi:check` | **1**; unchanged `tsx` launcher cannot bind its IPC pipe (`listen EPERM`). |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | **0**; actual specification check through the socket-free loader; no API/specification edits. |
| `git diff --check` | **0**, including the receipt. |
| Read-only working-diff / earlier-test audit (Python) | **0**: exactly the two intended core files plus this receipt, all in the existing lane; all pre-existing fee test blocks byte-identical to reviewed HEAD. |

Logs: `/private/tmp/jg-ent-4a-round3-*.log`. The plain core failure is preserved,
not treated as a green run. No timeout, retry, assertion or configuration was
relaxed. Worker serialization/thread selection is command-line scheduling only;
the final thread run starts after the build has finished.

Final full-core log SHA-256:
`f11852e17f7580d588829990cd94367d15c136fc2d68caef0735c417889b1157`.
Build log SHA-256:
`b48a04800299f00a970279b2e10f661d4d920937e1a8a75fefb305253ca0307f`.

Final source SHA-256: `origin.ts`
`a7c1fb7d076570c721e39220686ecf6792e664cf2962b89858a63fc10689794e`;
`fee.test.ts`
`67fa22965093200b362b9d70dd58505ca012055239519b0654b3143c6726a0f5`.

**Recorded follow-ups — not implemented**

- **P3-R2 → ENT-7:** unresolved duplicate candidates, photo status and duplicate
  group membership lack recorded-time filtering. ENT-7 must supply the exact
  group snapshot as of cutoff or introduce recorded-time facts; later candidate
  flags or rejected photos must not alter a replayed earlier statement. This
  repair freezes the already-timestamped facts only, not those untimed inputs.
- **P3-R3 → ENT-6:** derive each original receipt line's remaining gross balance
  from persisted settlement/reversal facts, rather than accepting supplied
  balances as authoritative. Cover the 28,800p refund of a blended 148,800p
  receipt: exact net reversal order −600,000/31p and extra −144,000/31p; an
  invented zero remaining balance for the extra must not steer the refund away.
- **P3-R4 timing margin:** no implementation action. The reviewer reported
  purity/SH-1 timeouts under heavy load; this builder also observed timeouts.
  Defaults remain unchanged; timing observations do not prove a margin in CI.
- Earlier round-2 **P3-4 → ENT-5** escalation prerequisite remains recorded in
  its original receipt and is not changed or implemented here.

**Scope, limits and remaining gates**

Only `origin.ts`, `fee.test.ts` and this receipt change in round 3. All earlier
work remains. Pure supplied-fact logic only: no migration, backfill, persistence,
UI, provider, shared kernel, v1 fee, manifest, lockfile, lane-registry or decision
change. Public signatures are unchanged; contradictory lifecycle inputs now
fail closed. Existing no-cutoff eligibility is unchanged. No new operational
alert or external action applies. Exact integer/rational GBP pence only.

All fixtures are generated fictional data. `production_billing` and an open
fee gate appear only as pure test-input values to exercise the mandated path;
no environment, agreement, production capability or Decision was activated.
No live provider, spending, actual send, charge or posting occurred.

Not run: clean frozen install/pinned Node (installed dependencies only; downloads
prohibited); root `pnpm test`, PostgreSQL/migrations/restore and browser/e2e
(dispatcher says the sandbox cannot start PostgreSQL or bind localhost; this
pure repair changes no persistence/UI); eval/live-model, native and deployment
(no corresponding changes or authorized release). Mandatory CI suites remain
required on the dispatcher-created revision; earlier CI is not evidence for
this diff. The exact OpenAPI launcher remains locally blocked as recorded.

C1/C2/C7 application/UI criteria are inapplicable to this pure card. C3/C4/C5
evidence is limited to pure mode, identity and money assertions; it proves no
server authorization, locking, RLS, audit, posting or durable effect. C6 evidence
is recorded above. C8 fresh independent review bound to the new commit and
separate technical acceptance remain outstanding. ENT-4b/ENT-5/ENT-6/ENT-7
persistence and execution, D16/D02 approval and release gates remain unresolved;
this repair opens none.

No Git write command, commit, push, merge or PR creation. Intended conventional
commit subject/body: `/private/tmp/jg-msg-ent-4a.txt`. The dispatcher retains
commit/push ownership; founder retains acceptance/merge/release authority.
