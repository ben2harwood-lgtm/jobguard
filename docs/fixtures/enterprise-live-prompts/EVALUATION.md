# Deterministic completion-work evaluation v1

`development.v1.json` contains three fictional examples. The separately reserved `held-out-inputs.v1.json` contains eight different cases and observation identities: absent work in a note and a photo tag, instructed work, an explicit ordered synonym, unsupported text, ambiguous recognition, pending evidence and invalidated evidence. Inputs contain no labels. Expected observation identities live only in `held-out-labels.v1.json`. Fixtures and labels were written before the evaluation implementation; no claim of an independent or blinded external benchmark is made.

`predictCompletionWorkCorpus` accepts only the strict versioned input corpus and calls the released rule (a). `runCompletionWorkEvaluation` finishes predictions before opening labels. The scorer is a separate function; changing labels changes its report and cannot change predictions. A case's observation identity is an evaluation key, not a production prompt/extra matching policy. There is no grouping across observations.

For each case, the scorer compares sets of observation IDs, rather than comparing counts alone. False prompts are predicted observations absent from the expected set; missed extras are expected observations absent from predictions. It reports both counts separately. The false-prompt rate divides by predictions; the missed-extra rate divides by expected observations. A zero denominator is `null` and formats as `n/a`, retaining the distinction from measured zero. Duplicate case/observation identities, unmatched case sets and extra fields refuse rather than changing the denominator silently.

Run the existing wrapper, targeted to this new suite:

```sh
pnpm eval --maxWorkers=2 src/enterprise-live-prompt-evaluation.test.ts
```

The test prints both metrics, exercises deliberate false/missed controls and all zero-denominator combinations, and checks label-independent predictions. The implementation imports only Node file reading, Zod and core calculation/contracts. It imports no provider factory, constructs no provider client and calls no fetch. The suite also installs a throwing fetch spy. This is deterministic synthetic evaluation, not a live-model run, PostgreSQL verification, full `pnpm eval` pass or all-rule evaluation. Rules (b), (c), (d) and the aggregate card remain held.
