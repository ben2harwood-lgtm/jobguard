# Spoken quote red-team findings

One row per finding. Codex adds rows in its attack PRs; fix PRs change the status. Claude mirrors open P0/P1
to the tracking issue and to the V2 planner.

Severity: **P0** wrong money (invented, wrong sign, qualified kept as fixed) or wrong firm or job.
**P1** lost, doubled or misplaced item or price; crash; over 1 s. **P2** confusing but safe.

| ID | Lane | Head sha | Case id | Transcript | Expected | Actual | Sev | Status | Fix PR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| RT-00-F001 | RT-00 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-00-002 | Fit the door for a hundred and fifty pound | One line priced 15000 pence | Capture and Reader A leave the price null; singular pound is not read as exact money | P1 | open | — |
| RT-00-F002 | RT-00 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-00-003 | Paint the kitchen £400, no, make that £450 | One open line with a question (or 45000 with a question); never 40000 | Capture keeps 40000 and adds a second “make that” line priced 45000, with no correction question; Reader A safely opens one line | P0 | fixed (local tests; golden gate held) | RT-FIX-2 / #1071 (commit only) |
| RT-00-F003 | RT-00 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-00-005 | Run 15mm pipe to the rad £120 | One line priced 12000; diameter never becomes a count | Capture leaves the price null; Reader A correctly keeps 12000 with quantity null | P1 | open | — |

## RT-FIX-2 receipt (28 Nov 2026, #1071)

Changed `packages/ai/src/capture-fixture-parser.ts`, the RT-03 correction seed corpus, RT-00-003's status,
this findings file, and `config/lanes/v2-rt-fix-2.json`. The already-staged RT-00 runner and plan files
are included unchanged. No push, live model, paid API, deployment, database or browser action.

One shared correction-marker guard keeps corrections attached before splitting and feeds the existing
`saidAmountOpen` price guard. The capture price stays null and an explicit question says a spoken
correction was made. It never chooses between the old and new figures. The 24 corpus cases cover
`no make that`, `actually`, `sorry I mean`, `scratch that`, `not X Y`, `change that to`, `or rather`,
and `call it X instead`, including omitted replacement currency, punctuation, unpunctuated speech,
and an independent following item. Original source words and citation offsets are retained.

Before → after:

| Check | Before | After |
| --- | --- | --- |
| Existing AI suite | 28 files, 508 tests pass | 528 pass / 4 fail out of 532 including 24 new cases; all four failures are the unchanged golden hash gate |
| RT-00 corpus | 2 pass / 3 open | 3 pass / 2 open (F001 and F003 unchanged) |
| New RT-03 regressions | 12 pass / 12 fail against original parser | 24 pass / 0 open; explicit capture correction questions checked on 24/24 |
| Qualified-price tests (unchanged) | 19/19 | 19/19 |
| Capture evaluation | 32/32 cases; scope 41/41; citations 119/119; ambiguities 63/63; unsupported money 0 | Identical |
| Reader A main set | 30 cases; room 82/82; trade 82/82; wrong numbers 0; invented work 0; missed work 0; questions 15/15 | Identical |
| Reader A held-out 1 | 10 cases; room 30/40; trade 28/40; wrong numbers 0; invented work 0; missed work 9; missed numbers 3; questions 7/9 | Identical |
| Reader A held-out 2 | 10 cases; room 15/30; trade 14/30; wrong numbers 0; invented work 0; missed work 9; missed numbers 8; questions 2/4 | Identical |

Validation: built `@jobguard/core` once to provide the existing package dependency; ran
`pnpm --filter @jobguard/ai test --maxWorkers=1` before the repair (508/508), the new corpus before
the repair (12 failures), and the corpus plus unchanged `capture-qualified-price.test.ts` after
(54/54). `pnpm eval --maxWorkers=1` ran all 532 AI tests with one worker: 528 pass, four golden-gate failures.
No whole-repository tests ran. Before/after evaluator reports were compared using the original parser
from Git HEAD through a temporary Node loader and the repaired compiled parser; the reports are identical.
The AI package's `build`, `typecheck` and `lint` pass.

Golden hash note: the parser SHA-256 changes from
`bbdcc67597d8298f6f4dcb6a3ed5dcd59bca44982f51d556558ca2b9cab8aaee` to
`b2f5f2c9a91c25d2a5a2d3f221da9bd9baf49b6e05dc4cf6fa085b19ee614841`.
A full golden-record comparison confirms that this one source hash is the only difference; predictions,
labels, metrics, versions, thresholds and other source hashes are identical. The checked-in golden record
is outside this order's five-file edit scope and is unchanged. Its two direct equality tests and the two
CLI tests that invoke the same verification fail until that record is refreshed and reviewed. This is a
held gate, not a green `pnpm eval` claim. Independent review and merge are not claimed.

Initial review — LATER / SIMPLICITY: `packages/ai/src/context-reader.ts:correction` and `totals` have
older, narrower correction patterns. A future reader change could reuse the shared correction marker
rather than maintain separate vocabularies, reducing grammar drift. Outside this fix's allowed files;
non-blocking.
