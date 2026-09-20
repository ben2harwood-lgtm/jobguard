# Synthetic capture evaluation — JG-B / M0-12 fixture slice

This is a deterministic structured-fixture evaluation, not a measurement of a live language model, field transcription, or general natural-language extraction. It creates no database writes, commercial actions, network calls or provider charges.

## Inputs and labels

`walkarounds.v1.json` contains 32 fictional source records. `labels.v1.json` holds separately stored expected descriptions, scope-intent IDs, rates, quantities, units and required questions. The parser/provider never reads the label file. Expected values were authored without using parser output; however, both corpus and implementation were authored by the builder in this session. **Independent label review is pending**, explicitly recorded as `AUTHOR_PROPOSED_INDEPENDENT_REVIEW_PENDING`. Do not rename this a held-out, externally annotated or blinded evaluation.

Cases cover the five-priced-line example and unresolved question; missing/competing/oversized/negative/fractional-penny rates; uncertain, zero, duplicate and decimal quantities; unknown units; split/combined work; repeated descriptions; CRLF; Unicode/UTF-16 offsets; excluded work; and hostile instructions inside/outside structured items. The unstructured example is deliberately only a verbatim unpriced proposal, not successful natural-language parsing.

## Grammar and bounds

Existing column-zero `JOB:` and `ITEM: description | £rate` recipes retain their clearly defaulted quantity `1` and unit `item`. Optional `QTY:`, `UNIT:` and `RATE:` cells are now explicitly parsed. Quantity syntax is a positive decimal with at most nine integer digits and six fraction digits; unsupported quantities stay unknown with a question. Rates are exact integer pence, bounded by the existing £10,000,000,000 (1,000,000,000,000-pence) application ceiling. This is a boundary test, not a realistic quoted job. Competing or invalid cells are never resolved by taking the first value. Standalone fixture descriptions are limited to 500 characters; longer free text needs structured records. Source size is at most 50,000 UTF-16 code units and at most 100 work items. These are fixture-parser bounds, not a claim that the production capture model supports this grammar or size.

No source text is executed. Instructions and URLs are inert text. The parser has no tenant, payment, dispatch or file/network capability.

## Running

From a pinned clean repository install:

```sh
pnpm --silent eval > capture-evaluation.json
pnpm --silent eval --mutation money > capture-negative-control.json
# The deliberate negative control must exit 1, not 0.
pnpm --filter @jobguard/ai test
```

The root command builds the AI workspace and its dependencies with build logs on stderr, then executes the compiled CLI. `pnpm --silent eval` also suppresses the package-manager script header; the CLI itself writes only JSON to stdout. Alternatively run `node packages/ai/dist/evaluation-cli.js` after the build. Supported negative controls: omission, money, citation, provenance, ambiguity. Invalid arguments, missing/invalid corpora and runtime errors exit 2; a failed evaluation exits 1; only a complete passing evaluation exits 0.

CI unit tests invoke the same CLI entry function and real fixture gateway, assert exit codes and all per-case results, and print a version/hash/count run receipt. They do not replace the separate live golden run required before a model/prompt release.

## What a pass establishes

The plan's proposed targets remain at least 95% scope-intent recall, zero unsupported extracted monetary facts, all citations in bounds, and every designated ambiguity handled. As an additional regression guard every explicit case label must match; a failed small case cannot disappear into a pooled average. The report preserves all per-case errors and proposal outputs, raw numerators/denominators, dataset/label SHA-256 hashes, parser/prompt/schema/fixture-route versions and the negative-control identity.

Citation counts refer to proposal output BEFORE database persistence. Actual stored-source retrieval, independent annotation, real model accuracy/cost/residency, and builder usability remain not tested by this evaluator. All results keep `releaseDecision: NOT_AUTHORIZED`; no policy record or live gate changes.

## Change receipt

Builder: ChatGPT, under Ben's instruction to continue JobGuard. Initial source main `ab8e7f2d9d43ac5ec6ff62bff2533b0fa508d404`; integrated parent `913ff5985665520bea7f3322a8cacc6530a2f1b7` on the receipts branch. This is a separate stacked candidate, not acceptance or main merge of its parent.

Local pure-module checks on Node22.16: 51 Node tests passed; 32/32 cases, 41/41 labelled intents, 119/119 proposal spans and 63/63 designated unknown/question checks. These local checks did not execute Zod, the application gateway, the pinned Node24 build or browser tests. Those must be reported from the exact candidate's actual CI or subsequent pinned local execution, not inferred from these local results. No independent Claude verdict or founder acceptance is recorded here.
