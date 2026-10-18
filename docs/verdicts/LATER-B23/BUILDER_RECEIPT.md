Built by Claude Sonnet (Codex stand-in), dispatcher 14

# LATER-B23 builder receipt (rewritten 17 Oct 2026)

Status: BUILT, not accepted. RED lane, decision 74: PARK, never merge or enable. Only independent reviewers accept. Base: branch head ab44fd7a (on origin/main 31682762; origin/main has since moved to 1bcd8db8 and does not change fee.ts; not merged, per template).

History kept: an earlier Codex run on 16 Oct stopped before implementation at the old 45 GB disk gate (its receipt follows below, unchanged). Decision 82 lowered the gate to 33 GB; free disk this run was 46-47 GB.

## Changes
- `packages/core/src/enterprise-domain/fee.ts` (reversal branch of `allocateEnterpriseReceipt`, now around lines 39-60): (1) removed the blanket `receipt.explicit !== null` refusal; (2) an explicit reversal is accepted only when the original receipt was explicit and every named line was explicitly settled originally and takes no more than its original explicit gross share (otherwise INVALID_ALLOCATION); the existing balance/outstanding, net/gross ratio, invoice, effective-time and separateInvoiceId checks and the shared allocator (exact arithmetic, signed negative deltas) are unchanged; (3) a reversal whose sourceRef is already recorded as a `reversed` billing fact on any supplied extra is refused (no double reversal); (4) a malformed original receipt is now INVALID_ALLOCATION instead of MONEY_LIMIT.
- `packages/core/src/enterprise-domain/later-explicit-refund.test.ts` (new, 8 tests): GBP 288 gross / 240 net extra, 60 gross refund reverses 50 net; conservation and unrelated order line earns no fee; two-part refund bounded by original share; negatives for over-refund, wrong line (incl. pro-rata original steering), forged original (balance, sourceRef, shares, ratio), repeated source identity (explicit and pro-rata), mismatched invoice.
- No existing test, pin, harness or expected value edited (sha256 of fee.test.ts 67fa2296..., fee-both.test.ts 2ddceef4..., fee-pins.test.ts 99921a04... unchanged from the earlier receipt). Existing "round2 P2-2 refuses reversal steering" still passes. No rate, fee-base, priority or entitlement change. No migration, no GRANT (standard F: none), no database work.
- Note: the premise line moved: the refusal was fee.ts:43 on this base (order said :39); main wins.

## Commands run
- Tests first: new file against unchanged fee.ts: 4 failed / 4 passed (explicit reversal x3 refused with INVALID_ALLOCATION at fee.ts:43; duplicate-source pro-rata case accepted). After the change: 8/8 pass.
- `pnpm --filter @jobguard/core exec vitest run` later-explicit-refund + fee.test + fee-both (--maxWorkers=2): 143/143 pass. fee-pins + origin + transitions: 277/277 pass.
- `pnpm exec turbo run typecheck --force --concurrency=2`: exit 0, 7/7, 0 cached. `... lint --force --concurrency=2`: exit 0, 7/7, 0 cached. `pnpm build --force --concurrency=2`: exit 0, 7/7, 0 cached.
- `git diff --check`: clean.
- `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs`: FAILED as expected: branch matches no registered lane (config/lanes/later-b23.json missing; the dispatcher registers it to the changed files: fee.ts, later-explicit-refund.test.ts, receipt, ledger).

## NOT RUN
Full `pnpm test`, `test:db`, `test:migrations`, `test:e2e`, PostgreSQL and browser suites (sandbox rule; CI runs them). Lane lint pass (lane file absent). No migration, so no upgrade proof.

## Limits
The pure allocator cannot prove persisted source uniqueness; the double-reversal check covers facts supplied in `groups` only, the database remains the authority. Self-inspection only; no independent review claimed. UI: none. Pending: RED two-model check, acceptance, Ben's button.

---- Earlier receipt (Codex, 16 Oct 2026), kept as history ----

LATER-B23 / L121 / pkg-src-82#5. RED lane. Decision 74: PARK; no merge, enablement or deployment. No acceptance claimed. The requested first-line attribution to Claude Sonnet 5.5 is inaccurate for this session and is not asserted.

## Status and stops

NOT BUILT. Only this receipt, the ledger and the intended-message file were written. No source or test changes, migration, new GRANT, external action, Git write, installation, database start or browser run.

1. Disk safety STOP: `df -k /System/Volumes/Data` initially reported 47,225,108 KiB available, then 47,167,320 KiB (below the required 47,185,920 KiB = 45 GiB minimum), then 46,834,348 KiB. The binding instruction says to stop below the threshold. No heavy command was started. Initial memory check was 80% free, above 35%.
2. Coordinator prerequisite STOP: `config/lanes/later-b23.json:1` is absent, and no `later-b23` registration was found in the merged registry. Before: file absent. Required after: coordinator registers key `later-b23`, branch `codex/sandbox/later-b23`, and the four allowed repository paths named by the order. No registry or pinned list was edited and no substitute lane was used.
3. Lane check returned exit 1 at tools/agent-lane-boundary-lint.mjs:303: `Lane boundary FAILED: Missing branch or self-comparison range; refusing a misleading pass.` HEAD and origin/main are identical. No alternate base or modified checker was used. The dispatcher must provide a valid comparison when committing the piece; no checker edit is requested.

## Main verification and source inspection

Actual initial and final HEAD and origin/main: `31682762c903d716657c573e1b5deae63588aad7`. This differs from the issued header's `ca435eeb5791638c787c830d6ba717146f694539` and draft's `0bbb5ddb`; current main wins. Initial working tree was clean and branch was `codex/sandbox/later-b23`.

Verified against origin/main: BUILD_PLAN.md:483 retains SH-1's exact-rational shared allocator and linked negative deltas; BUILD_PLAN.md:628/633 retains §9.1.8 and the quoted reverse allocation rule. Current fee.ts:39 begins the reversal branch; the explicit-refund rejection is actually fee.ts:43:

```ts
        receipt.explicit !== null || receipt.separateInvoiceId !== original.receipt.separateInvoiceId) return refuse("INVALID_ALLOCATION");
```

No change made to that line. Source inspection confirms the premise; no executed test proves it. The shared allocator already signs reversals and preserves per-line net/gross ratios. The enterprise wrapper checks original source, invoice, time, line identity and remaining balances. Existing merged tests were read only; no contradicting assertion was established. Duplicate billing-fact checks exist in origin.ts, but no new replay test was written or run. A pure allocator cannot independently establish persisted source uniqueness from a single supplied input; the planned duplicate test must be truthful about the fact-history boundary.

## Acceptance and verification

All L121 acceptance criteria remain NOT IMPLEMENTED / NOT RUN: explicit refund reversing the original £288 gross/£240 net extra by £60 gross/£50 net; gross/net conservation; unrelated order lines contributing no fee; duplicate reversal prevention. Planned negative cases (over-refund, wrong line, invalid original allocation, repeated source identity, mismatched invoice) were not written. Tests-first red run: NOT RUN due to disk STOP; no implementation was written ahead of tests.

NOT RUN due to disk STOP: the new explicit-refund Vitest file (not created), relevant existing pure fee files, `pnpm exec turbo run typecheck --force --concurrency=2`, `pnpm exec turbo run lint --force --concurrency=2`, `pnpm build --force --concurrency=2`, root static lint, `pnpm lint:lanes`, and `pnpm openapi:check`. No cache hit is represented as a run.

NOT RUN by sandbox/order restriction: full `pnpm test`, `pnpm test:db`, `pnpm test:migrations`, `pnpm test:e2e`, PostgreSQL suites, browser/Playwright suites and socket listeners. CI/dispatcher owns these. No database or web workflow was changed. Evaluation and migration upgrade proofs are inapplicable: no AI or database changes.

New GRANTs: NONE. Standard F: no new direct INSERT, UPDATE or DELETE grant to jobguard_runtime; no route or command was introduced. No migration or rollback requirement. No new alert, compatibility impact or changed runtime behavior.

## Commands actually run

Every shell invocation below is read-only. Counts: zero test files executed, zero tests passed, zero tests failed. Exit 1 entries are inspection/check failures, not test results. Long read outputs were sometimes truncated by the tool; this is not evidence that an unread assertion passed.

| # | Command | Exit |
|---|---|---|
| 1 | `pwd && git status --short && git rev-parse HEAD && git rev-parse origin/main && rg --files -g 'AGENTS.md' -g '*later-b23*' -g '*fee*test*' -g '*lane*' -g 'package.json' -g 'BUILD_PLAN.md' -g 'fee.ts'` | 0 |
| 2 | `cat AGENTS.md` | 0 |
| 3 | `cat packages/core/src/enterprise-domain/fee.ts && cat packages/core/src/enterprise-domain/fee.test.ts && cat packages/core/src/enterprise-domain/fee-both.test.ts && cat packages/core/src/enterprise-domain/fee-pins.test.ts` | 0 |
| 4 | `cat config/lanes/later-b23.json && cat package.json && cat packages/core/package.json && cat turbo.json && cat ~/.local/share/full-steam/handoffs/jobguard-task.md` | 1; missing lane file, later reads short-circuited |
| 5 | `rg -n 'SH-1\|9.1.8\|Explicit line allocation\|Credits and refunds\|exact rational\|linked negative\|L121\|LATER-B23' BUILD_PLAN.md && sed -n '450,500p' BUILD_PLAN.md && sed -n '610,655p' BUILD_PLAN.md && cat tools/agent-lane-boundary-lint.mjs && node --version && command -v pnpm && memory_pressure \| tail -1 && df -g /System/Volumes/Data` | 0 |
| 6 | `df -k /System/Volumes/Data && cat config/lanes/later-b23.json && cat package.json && cat packages/core/package.json && cat turbo.json` | 1; missing lane file, later reads short-circuited |
| 7 | `cat packages/core/src/receipt-allocation.ts && rg -n 'enterpriseReceiptV1\|original:\|remainingGross' packages/core/src/enterprise-domain/contracts.ts && cat packages/core/src/enterprise-domain/fee.test.ts` | 0 |
| 8 | `cat ~/.local/share/full-steam/handoffs/jobguard-task.md && rg -n 'SH-1\|9.1.8\|Explicit line allocation\|Credits and refunds\|exact rational\|linked negative' BUILD_PLAN.md && sed -n '630,650p' BUILD_PLAN.md && rg -n 'refund\|reversal\|explicit\|original' packages/core/src/enterprise-domain/fee-both.test.ts packages/core/src/enterprise-domain/fee-pins.test.ts && rg --files packages/core/src/enterprise-domain \| head -30` | 0 |
| 9 | `cat package.json && cat packages/core/package.json && cat turbo.json && sed -n '115,135p' packages/core/src/enterprise-domain/contracts.ts && sed -n '120,205p' packages/core/src/enterprise-domain/fee.test.ts` | 0 |
| 10 | `sed -n '1,90p' packages/core/src/enterprise-domain/origin.test.ts && sed -n '1,90p' packages/core/src/enterprise-domain/origin.ts && cat packages/core/src/enterprise-domain/fee-pins.test.ts && rg -n 'later-b23\|fee.ts\|enterprise-domain' config/agent-lane-assignments.json config/lanes && rg -n 'sourceRef\|originalSourceRef\|reversed\|seen' packages/core/src/enterprise-domain/origin.ts` | 0 |
| 11 | `git show origin/main:packages/core/src/enterprise-domain/fee.ts \| shasum -a 256 && shasum -a 256 packages/core/src/enterprise-domain/fee.ts && git show origin/main:BUILD_PLAN.md \| sed -n '628,634p' && git branch --show-current && df -k /System/Volumes/Data` | 0 |
| 12 | `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | 1; exact diagnostic above |
| 13 | `git rev-parse HEAD && git rev-parse origin/main && git status --short && git diff --stat && nl -ba packages/core/src/enterprise-domain/fee.ts \| sed -n '35,43p' && shasum -a 256 packages/core/src/enterprise-domain/fee.ts packages/core/src/enterprise-domain/fee.test.ts packages/core/src/enterprise-domain/fee-both.test.ts packages/core/src/enterprise-domain/fee-pins.test.ts && df -k /System/Volumes/Data` | 0 |
| 14 | `rg -n 'Missing branch or self-comparison' tools/agent-lane-boundary-lint.mjs && git diff --name-only origin/main && git ls-files config/lanes/later-b23.json packages/core/src/enterprise-domain/later-explicit-refund.test.ts docs/verdicts/LATER-B23/BUILDER_RECEIPT.md docs/ledger/LATER-B23.md` | 0 |
| 15 | `git diff --check && git diff --stat && git status --short && git rev-parse HEAD` | 0; whitespace check passed, tracked diff empty, only receipt/ledger untracked |

Commands 5, 7, 8, 10, 11 and 13 use literal shell pipes; Markdown escapes only preserve table rendering. Installed runtime: Node v24.17.0; repository pins pnpm 10.28.1. No pnpm command was executed.

## Scope evidence and builder self-inspection

Before writing documentation, `git diff --stat` and `git diff --name-only origin/main` were empty. Only the receipt and ledger are intended untracked repository additions; `git diff --stat` does not include untracked files. The intended commit message is `/private/tmp/jg-msg-later-b23.txt`. This is a deferred commit proposal, not a claim the fix exists.

SHA-256 of unchanged source and merged tests:

```text
1533a6964aad18abb7bbf29c16a73eebbb43373485fdaa903e313e632ed0d6a7  packages/core/src/enterprise-domain/fee.ts
67fa22965093200b362b9d70dd58505ca012055239519b0654b3143c6726a0f5  packages/core/src/enterprise-domain/fee.test.ts
2ddceef4ea7cfba37b157f83ac15c07db87e816657b378eee5d0d87204dd34ba  packages/core/src/enterprise-domain/fee-both.test.ts
99921a0493c010adf24538ac071d40af068fe91ec5eaf5417fd4a2e2468bbaa6  packages/core/src/enterprise-domain/fee-pins.test.ts
```

The fee.ts hash also matched `git show origin/main:packages/core/src/enterprise-domain/fee.ts`. No existing assertion, shared harness, watchdog registry, fingerprint or money kernel was edited. Builder self-inspection is source-inspected only, not an independent review. Independent RED two-model verdicts, separate acceptance and Ben's merge/enablement button remain pending. No reviewer was impersonated or spawned. No security/commercial approval inferred.

Final head: `31682762c903d716657c573e1b5deae63588aad7` (unchanged; all work uncommitted).
