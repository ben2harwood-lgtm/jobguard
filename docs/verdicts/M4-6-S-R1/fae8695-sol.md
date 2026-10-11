VERDICT: REPAIR
HEAD: fae86956c587b4a97d3d32f12582a232d99d74af

1. **P2 — BLOCKING: a resumed pre-repair command can append its clock audit twice.**

   Evidence: [recovery-follow-up-repository.ts:180](/private/tmp/jg-check-m4-6-s-r1-20261011T111921/packages/db/src/recovery-follow-up-repository.ts:180) checks `clockAudited` before taking the serialization lock at [line 428](/private/tmp/jg-check-m4-6-s-r1-20261011T111921/packages/db/src/recovery-follow-up-repository.ts:428). Meanwhile, [0115_recovery_follow_up_repair.sql:95](/private/tmp/jg-check-m4-6-s-r1-20261011T111921/packages/db/migrations/0115_recovery_follow_up_repair.sql:95) can append that clock fact during historical catch-up.

   **Failing case:** an 0112 clock advance commits its due records, but its follow-up command is interrupted before finalization. After applying 0115, retry that command concurrently with `signalDue`. The retry reads `clockAudited=false`; the signal commits the clock and due audits; the retry subsequently obtains the lock and appends its already-constructed clock audit. Two `time_advanced` records now reference the same command.

   My [scratch reproducer](/private/tmp/jg-solcheck-r1/clock-race.test.mjs:49) executes the actual repository method with a storage-interleaving double. It observed **2 entries instead of 1**, while the actual audit-chain verifier still passed. This is orchestration evidence, not an executed PostgreSQL race. It violates the order’s duplicate-audit requirement and C5.

   **Required fix:** acquire the shared `recovery-follow-up-audit` lock before checking `clockAudited`, and construct the optional clock event under that lock. Preserve audit-last ordering. Append a PostgreSQL regression covering this interrupted legacy command racing catch-up, asserting one clock audit, one due audit and a valid chain.

No additional findings in the repair scope.

**Acceptance checks**

| Criterion | Result |
|---|---|
| Repair 1: audit atomic with direct SBOX advance; transaction IDs, rollback and chain verification | Implemented and PostgreSQL regressions passed in CI. Duplicate suppression remains incomplete as above. |
| Repair 2: delivered message 1 → approved/revoked reminder 2 → close/reopen → fresh run/intent → exact reminder 3 delivery | Implemented; complete regression passed in CI. Repository and SQL source rules agree. |
| Repair 2: active, queued and unknown attempts retain typed refusals | Passed in CI; executing refusal also covered. My selector tests checked 512 histories. |
| Repair 3: populated 0111 upgrade through 0112 and 0115 | All three upgrade tests passed in CI: unchanged prior rows, privileges, verified audit chains and preserved preview/approve/revoke/deliver/reconcile behavior. |
| DW1: due review with zero new messages | Preserved; CI passed. |
| DW2: exact approval only; elapsed time creates no consent | Preserved; CI passed. |
| DW3: repeated advances/restart/signals produce one Decision and no duplicate transition, journal or send | Preserved; CI passed. The separate audit duplication is finding 1. |
| DW4: cancel/dispute/settlement shows Stopped | Preserved; CI passed. |
| DW5: revocation requires approval again | Preserved; CI passed. |
| DW6: reopening requires a fresh reviewed intent | Repaired; full revoked-reminder continuation passed in CI. |

C1–C3 preserve the existing persisted application/UI slice, shared server composition and synthetic boundary. C4’s atomic due write and catalog guarantees have PostgreSQL evidence; C5 has the audit-race blocker. C6 has executed unit, PostgreSQL and browser evidence. C7’s existing browser assertions remain unchanged and ran in both projects. C8’s lane and CI checks passed; this verdict does not provide separate acceptance.

**Source inspected**

I inspected the issued order, AGENTS, C1–C8, task card, receipts, original findings, migrations, repository, application boundaries and relevant tests.

The real routine diffs confirm:

- `guard_recovery_follow_up` changes only the stated source-selection query/comment.
- `evaluate_recovery_follow_ups` retains its original domain body and refusals, adding declarations and the final audit batch.
- No refusal was loosened beyond repair 2’s cancellation rule.
- Migration 0115 contains only two routine replacements; earlier migrations, tables, policies, grants, roles and existing rows are untouched.
- Registration uses allocated 0115 in increasing order.
- The nine-file diff stays within the lane, including the integrator’s separately recorded BUILD_PLAN ledger amendment.
- Existing integration tests remain a byte-identical prefix. No tests were weakened/skipped, and no timeout increased. No founder-reserved capability changed.

**Executed locally**

Using Node 24.17.0 and cached pinned pnpm 10.28.1:

| Command/check | Exit | Result |
|---|---:|---|
| `pnpm typecheck` | 0 | 7 tasks; 4 cached, 3 executed |
| `LANE_BASE_REF=origin/main pnpm lint` | 1 | Detached-HEAD lane refusal |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1 | Detached-HEAD lane refusal |
| `pnpm exec turbo run lint` | 0 | 7 tasks; 4 cached |
| Core follow-up Vitest | 0 | 20 tests |
| API follow-up Vitest, after dependency build | 0 | 38 tests |
| DB repository unit Vitest | 0 | 9 tests |
| `pnpm build` | 0 | 7 tasks; 4 cached; 24 pages generated |
| `pnpm openapi:check` | 1 | Sandbox denied tsx IPC socket |
| Same OpenAPI generator via `node --import tsx … --check` | 0 | Snapshot matched |
| Typecheck both DB integration files | 0 | Both files |
| Independent Python cases | 0 | 7 tests, including 512 selector histories |
| Independent audit-hash cases | 0 | 2 tests |
| Independent legacy clock-race case | 1 | 1 failed: duplicate audit |
| Diff, lane comparison and boundary checks | 0 | Passed |

The initial API attempt failed to load unbuilt DB output and executed zero tests. No tracked files were edited, committed or pushed.

**External evidence and limits**

I read [CI run 38131294261](https://github.com/ben2harwood-lgtm/jobguard/actions/runs/38131294261). It tested PR merge commit `524eb0a`, incorporating this exact head into `ff072c7`: **892 database-package tests**, including **52 follow-up tests and 3 populated-upgrade tests**, plus **300 browser tests** across both projects. Typecheck, lint, dependency audit and secrets checks passed.

I did not run PostgreSQL or browsers locally. The Mac run was stopped before starting because of host load; I relied on GitHub CI for those suites. The newly identified race has not been executed against PostgreSQL. No live providers, real data or release approvals were verified.