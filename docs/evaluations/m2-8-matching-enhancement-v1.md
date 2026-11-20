# M2-8 matching enhancement v1 — evaluation only

The v1 sections below retain the 7 Nov evidence-availability result. The v2
section records the separately authorised, designed input corpus from 10 Nov;
it supersedes v1's missing-input status only for that synthetic regression run.

No added technique is warranted on the available evidence. This is an evidence
availability conclusion, not a successful matcher benchmark or completion of M2-8.
No enhancement is built or enabled. Made-up data only; `productReleaseTargetMet`
remains **false**. The real corpus and G2 were not run; D04 stays open.

## Frozen evidence inspected

- `packages/core/src/test-fixtures/made-up-only-supplier-benchmark.ts`: 100 held-out
  cases (40 discrepancy, 40 match, 20 ambiguous), plus one separate development
  case. Thirty discrepancies have labelled net exposure at least 2500 pence;
  ten have 2499 pence. No splits, labels, manifest or harness were changed.
- Retained M2-5 pin:
  `df5e0d6115b143a6bd62f121b61ece0d77a4b1287176d79df3013493f9c31e5c`.
- These cases contain invented source hashes and labels, **no matcher inputs,
  document bytes or extraction results**. `madeUpOnlyPerfectPredictions` copies
  labels; it is a scorer test fixture, not deterministic matcher output.
- `docs/fixtures/supplier-matching/critical-v1.json` contains six scenario
  descriptions, not benchmark-bound line matcher inputs or expected outputs.
  The scenarios include allocation enforcement and negative return quantities;
  those cannot all be executed through `supplier-line-matching.ts` alone.
  The manifest's only critical row (`invented-99`) is not bound to these six
  scenario IDs. We do not manufacture that binding or declare them passing.

## Results from frozen labels

`evaluateSupplierMatchFailureClusters(manifest, retainedPin)` reuses the M2-5
scorer. Without source inputs it submits empty prediction arrays, preserving
missing cases in every denominator. It does not substitute invented facts chosen
to fit labels. The two paths are scored separately:

| Figure | Confirmed-fact | End-to-end extraction/matching | Required |
| --- | --- | --- | --- |
| Executed held-out cases | 0/100 | 0/100 | Complete predictions |
| Actionable false discovery | 0/0, undefined; fails | 0/0, undefined; fails | ≤5%, nonzero denominator |
| Recall, labelled net exposure ≥2500 pence | 0/30 (missing predictions); fails | 0/30 (missing predictions); fails | ≥90% |
| Non-empty predictions | No | No | Yes |
| Manifest critical failures | 1, unavailable | 1, unavailable | 0 |
| Six scenario assertions executed by this evaluator | No | No | Every fixture passes |
| Synthetic harness pass | false | false | true |

Both confusion matrices have 40 discrepancy, 40 match and 20 ambiguous cases in
the missing column; all other cells are zero. Both analysis paths group all 100
cases under **matcher input unavailable**. These are missing-evidence counts,
not measured matcher false negatives or a measured 0% product recall. No observed
held-out failure justifies fuzzy matching, vectors or an LLM tie-break.

The evaluator can run the existing deterministic matcher on explicitly supplied,
case/hash-bound synthetic facts, rejecting development, duplicate and wrong-source
rows. Its issue-to-label mapping is evaluation-only: incomplete/unresolved facts
are ambiguous; only complete quantity or net-price discrepancies are actionable.
It groups actual misclassifications by observed issue codes. An unmatched SKU is
not automatically called a description variant; a quantity issue is not proof of
a split/merge failure. Matching a critical label never establishes its separate
assertions passed. Source hashes remain declarations as in M2-5; source byte
verification and extraction execution are not implemented by this evaluator.

Tests of supplied facts are regression probes of this evaluator, **not additional
frozen held-out evidence**. They do not populate the published baseline. All
amounts use integer pence; scoring and gates reuse the existing exact-count harness.

## Decision and remaining evidence

The missing class is evidence availability, not a documented matcher defect.
No matching candidate, held-out improvement, latency/cost measurement or rollback
switch can honestly be claimed. No technique is enabled, so no switch is added.
The next step is to obtain independently frozen, source-bound matcher inputs,
separate extraction outputs and deterministic critical assertions through the
M2-5 evidence process, then rerun before proposing an enhancement. Do not retrofit
facts from truth labels or move held-out cases into development.

**Unresolved brief conflict:** the requested all-critical-pass held-out result
cannot be produced from the permitted frozen files. The evaluation code and
record are prepared, but acceptance criterion (b) remains unmet. This slice must
not be reported as completing M2-8 or passing its restored M2-5 gate.

No matching behaviour, provider, storage, dependency, schema migration or product
export changes. No provider added. Generated matches cannot create a landed
outcome, order, invoice obligation or fee. G0–G5 remain closed. Real-corpus gate
run, G2, D04, CI and downstream acceptance remain outstanding.

## Local verification

Run from the worktree root:

```
pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/supplier-match-failure-clusters.test.ts src/supplier-benchmark.test.ts src/supplier-line-matching.test.ts
pnpm --filter @jobguard/core exec tsc --noEmit
```

The two `pnpm` commands printed a configuration warning and stalled without
starting either runner; they were interrupted (exit 130). Using the installed
executables directly from `packages/core` succeeded:

```
./node_modules/.bin/vitest run --maxWorkers=2 src/supplier-match-failure-clusters.test.ts src/supplier-benchmark.test.ts src/supplier-line-matching.test.ts
# exit 0: 3 files, 50 tests passed
./node_modules/.bin/tsc --noEmit
# exit 0
```

Database, browser, provider, full-build and live evaluation suites are outside
this sandbox slice. Green regression tests do not establish the absent held-out
benchmark or the six deterministic scenario assertions.


## v2: made-up input corpus

**Decision:** add a separate, clearly made-up input corpus so the existing
deterministic matcher can actually be run and its misses grouped. This is
synthetic regression evidence only. It never stands in for the real corpus,
G2 or the restored M2-5 gate. No enhancement is built or enabled.

The recipe at the top of
`packages/core/src/test-fixtures/made-up-only-supplier-match-inputs.ts` was
written before the first matcher run. Numeric case index modulo six selects:
exact lines, explicit invented SKU wording alias, known five-unit packs,
two receipt/invoice lines against one order, unmapped invoice SKU, or missing
receipt. Discrepancy inputs add the frozen `netPence` to the invoice total;
match inputs do not. Ambiguous inputs retain incomplete identity, receipt or
conversion facts. V1 has no free-text description field, so the wording example
uses a declared alias rather than pretending to test description extraction.
All amounts are integer pence; product names and supplier references are invented.
The corpus is deliberately designed from the labels, not independently annotated
source evidence. These figures say nothing about real documents.

The 100 rows bind exactly once to the held-out case IDs and declared source
hashes; `invented-100` remains development and has no input. No label, split,
manifest, manifest pin, matcher, benchmark scorer or harness changed. Canonical
JSON is `JSON.stringify` of the corpus array in numeric case order, preserving
the recipe's field order and omitting whitespace. Its pinned SHA-256 is:

`35829f3ce11ffc15fc6741acd69d714f490c214e06fe300fcf11a7092516b1d2`.

All inputs passed `supplierLineMatchInputV1` before the first matcher run and the
pin was fixed before that run. No schema-invalid input needed correction and
no input was changed after observing results. The existing supplied-facts path
was sufficient; the evaluator's rejection of development, duplicate and
wrong-source rows remains covered by its existing tests. No product export added.

### Confirmed-fact results

| Figure | Observed | Target/result |
| --- | --- | --- |
| Executed cases / non-empty predictions | 100/100 | Complete |
| Actionable false-discovery proportion | 0/28 = 0% | ≤5%; meets synthetic point target |
| Recall, labelled discrepancies ≥2500 pence net | 20/30 = 66.7% | ≥90%; fails |
| All labelled discrepancies predicted discrepancy | 28/40 | Twelve predicted ambiguous |
| Manifest critical failures | 1 | Assertions unavailable, not a matcher misclassification |
| Synthetic harness pass | false | Extraction and critical assertions absent |
| `productReleaseTargetMet` | false | Unchanged |

Confusion matrix (rows are frozen labels, columns are matcher-derived labels):

| Frozen label | match | discrepancy | ambiguous | missing |
| --- | ---: | ---: | ---: | ---: |
| match | 26 | 0 | 14 | 0 |
| discrepancy | 0 | 28 | 12 | 0 |
| ambiguous | 0 | 0 | 20 | 0 |

Failure classes below are the evaluator's error clusters. Counts include both
missed discrepancies and clean cases deferred as ambiguous; the critical row
is a separate evidence gap, not an incorrect label. There are 26 label errors
and one critical-assertion gap.

| Failure class | Count | Example |
| --- | ---: | --- |
| unmatched identity (description cause unproven) | 13 | `invented-4`: frozen discrepancy; unmapped `QUENZO-BEAM` invoice produces `unmatched_line` and an ambiguous prediction |
| missing line | 13 | `invented-5`: frozen discrepancy; absent receipt produces `missing_receipt` and an ambiguous prediction |
| critical assertions unavailable | 1 | `invented-99`: correctly predicted ambiguous, but no deterministic scenario assertions executed |

End-to-end extraction/matching: **not run**. There is no extraction step or
source document corpus here. Its empty prediction array is an unavailable path,
not a measured extraction failure rate; none of the confirmed-fact figures is
an end-to-end result. The six scenarios in
`docs/fixtures/supplier-matching/critical-v1.json` remain unbound to the manifest's
critical row, and their assertions are not claimed to pass.

### Outcome and remaining evidence

**No added technique is warranted** on this evidence. Recall misses occur where
the fixed recipe deliberately removes identity or receipt facts. The unmapped
SKU cluster does not establish that two product descriptions mean the same thing,
and fuzzy matching cannot supply an absent receipt. These inputs demonstrate
existing ambiguity handling and its recall tradeoff; they do not establish a
real-document defect or support an expected improvement from another technique.
No candidate is built, no latency/cost improvement is claimed and no enhancement
rollback switch is introduced. To undo this slice's corpus decision, remove the
new fixture and its dedicated test plus this v2 section and its added regression
assertion/lane entries; the earlier missing-input evaluation remains available.

Made-up data only. The real-corpus run of the restored M2-5 gate, end-to-end
extraction results, critical-fixture binding, G2 and D04 remain open. M2-8 is
not finished by this slice. No provider added; no matching behaviour, storage,
embedding, model, dependency or migration change. Generated matches cannot create
a landed outcome, order, invoice obligation or fee. Gates G0–G5 remain closed.

### v2 local checks

Run from `packages/core` using the installed executables (at most two workers):

```
./node_modules/.bin/vitest run --maxWorkers=2 src/supplier-match-failure-clusters.test.ts src/supplier-benchmark.test.ts src/supplier-line-matching.test.ts
./node_modules/.bin/vitest run --maxWorkers=2 src/test-fixtures/made-up-only-supplier-match-inputs.test.ts
./node_modules/.bin/tsc --noEmit
```

Final results: first command exit 0, three files and 51 tests passed; second
command exit 0, one file and two tests passed; typecheck exit 0. Total: four
files, 53 tests passed. No database, browser, provider, full-build or real-corpus
evaluation run in this sandbox slice.
