# M2-5 dark benchmark harness

This implements only the synthetic scoring machinery for M2-3/M2-5. It is AMBER,
pure and disconnected from product workflows. No migration, provider route,
authorization, commercial action or runtime behaviour changes.

The invented fixture `packages/core/src/test-fixtures/made-up-only-supplier-benchmark.ts`
is not the real corpus. This version accepts only `made-up-test-only` manifests.
A passing synthetic run never establishes that the product release targets are met.
The earlier supplier-fact-corpus summary is not consumed as labelled benchmark evidence.

Build with `pnpm --filter @jobguard/core build`, then run:

```
node tools/supplier-benchmark.mjs manifest.json predictions.json pinned.sha256
```

All inputs are local files; no network or providers are used. The pin file contains
one lowercase SHA-256 digest. Exit codes: 0 synthetic harness pass; 1 scored but
not passing; 2 invalid input or pin. JSON results always say made-up data and
`productReleaseTargetMet: false`. Failed runs still print their full results.

The exported strict versioned Zod schemas in `supplier-benchmark.ts` define the
JSON formats. Every case binds ID, split, class, original source-byte SHA-256,
frozen label, known net discrepancy pence (otherwise null) and critical-fixture status.
The schema requires at least 100 distinct held-out sources, separate development
sources, all three labels, and a critical held-out fixture. Hashes are declarations:
this harness does not read source documents or verify their bytes or human labels.

Before tuning, retain the hash returned by `supplierBenchmarkManifestHash` in a
separate controlled pin file. Schema field order is canonical, cases are sorted by
ID, and JSON formatting/key order is immaterial. All parsed fields, including
version, targets, labels, source hashes, critical flags and splits, are hashed.
Changing or moving a case requires a new independently controlled pin; the scorer
cannot prevent an operator replacing the pin too. This is integrity against a
trusted retained pin, not approval, tamper-proof storage or manual ground-truth review.

Predictions bind the manifest hash and contain separate `confirmedFact` and
`endToEnd` arrays. Each row supplies case ID, matching source hash, predicted
label and `criticalPassed` from the deterministic fixture runner. Only held-out
cases may be scored; duplicate, unknown and development rows are refused. The
harness consumes runner results; it does not itself execute an extraction or
matching engine, nor independently validate a supplied critical-pass declaration.
Missing rows are reported as missing, remain in recall denominators and fail
completeness. A critical row must be present, correctly classified and explicitly
pass its deterministic assertions. Critical failures fail the run regardless of rates.

Each run reports held-out class/label counts, a three-label confusion matrix with
a missing column, and every misclassified, missing or failed critical case as an
error example. Predicting discrepancy on match or ambiguous truth is a false
positive; predicting discrepancy on discrepancy truth is a true positive. All
predicted discrepancies are treated as actionable for this harness. False discovery
is FP/(TP+FP) over all exposures; recall counts only discrepancy truth at or above
2500 pence net, inclusively. Fractions retain exact integer counts, and target
comparisons use integer cross-products (at most 5/100 and at least 90/100).
Zero-denominator metrics fail their target. Empty/all-negative predictions cannot
pass. Every target and critical/completeness result is reported separately.

Uncertainty uses approximate two-sided Wilson 95% binomial intervals, independent
case assumption, without correction for related documents or label/extraction bias.
Bounds are floating-point proportions; exact numerators/denominators are separate.
Intervals are null when the denominator is zero. Targets compare observed rates,
not interval endpoints. This statistical convention confers no product approval.

Still open for people: the real 100+ varied labelled document sets and labellers;
manual ground-truth review and freezing before tuning; the real benchmark run and
published results; G2 and reviewed pilot feedback; M2-8, which needs those results;
and approved OCR routes under D04. No human review, approval, provider suitability,
real result or completion of these tasks is claimed. G0–G5 remain closed.
