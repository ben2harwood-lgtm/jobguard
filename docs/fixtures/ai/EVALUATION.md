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

## M0-12a fixture golden record

`golden-run.v1.json` is the checked-in, zero-cost fixture record. The contract CLI
and source tests compare a fresh run with it; CI never refreshes it automatically.
It records the local fixture deployment, versions, source-code/corpus hashes,
raw metric counts, per-case errors and prediction hashes. Elapsed time is excluded
so reruns remain comparable. Empty predictions and zero denominators fail closed.
The scorer and report share the pinned proposed targets; changing a JSON record
cannot lower them. A target change requires a recorded decision and corresponding
contract and test updates, rather than silently updating the record.

After an intentional model/prompt/parser/schema or gateway change, build the AI
workspace and its dependencies, then explicitly regenerate the record for review:

```sh
node --input-type=module <<'JS'
import { writeFile } from 'node:fs/promises';
import { runCaptureEvaluation } from './packages/ai/dist/evaluation-runner.js';
import { createGoldenRunRecord } from './packages/ai/dist/golden-run-record.js';
const record = await createGoldenRunRecord(await runCaptureEvaluation());
await writeFile('docs/fixtures/ai/golden-run.v1.json', JSON.stringify(record, null, 2) + '\n');
JS
```

Review the record diff alongside the implementation and tests. Fixture success
still cannot authorize release or serve as a live-model golden run. D04 route
approval, founder-authorized spending and persisted-citation live evidence remain
separate release gates; `eval:live` continues to refuse execution.

## real-words-natural-items — 10 November 2026 (RED, builder receipt)

Base inspected: `a5613d56b`, clean `codex/sandbox/real-words-natural-items`.
This deterministic extension recognises comma/and work boundaries, decorating
woodwork, approximate overall amounts and standalone durations. It retains
related objects and finish details. The pure `suggestCapturePartyClause` export
returns only customer/site text and UTF-16 offsets for one narrow unambiguous
`for <name> at <numbered address>` clause; it makes no registry or identity write.
Descriptions joined around that clause are inferred; unchanged descriptions and
exact per-item prices retain original-source spans. Unsupported wording remains
one editable unpriced line with the explicit Split/review prompt. This does not
establish general language understanding or repair Split's existing behaviour.
No schema, migration, provider, live gate or stored format changes.

Before: executing the untouched HEAD parser copied to `/tmp/real-words-base-parser.ts`
with the exact decorating sentence returned one unpriced line, a default title
and the old fallback question; the two-work-item assertion exited 1. This is a
pure-parser failure, **not** the required before-browser failure.

Local execution used installed binaries because the `pnpm` wrapper stalled on
its version switch and reported an unavailable registry/signature fetch. No
packages were installed and no package-manager configuration was changed:

- `node_modules/.bin/tsc -p packages/core/tsconfig.json` — passed.
- `node_modules/.bin/tsc -p packages/ai/tsconfig.json` — passed.
- `node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit` — passed.
- From `packages/core`, `node_modules/.bin/vitest run --maxWorkers=1 src/capture.test.ts` — 4 passed.
- From `packages/ai`, `node_modules/.bin/vitest run --maxWorkers=1 src/capture-plain-words.test.ts src/capture-evaluation.test.ts src/golden-run-record.test.ts` — 102 passed across 3 files.
- From `apps/web`, `node_modules/.bin/playwright test --list real-words-natural-items.spec.ts --project=mobile-360 --project=desktop --workers=1` — 8 cases discovered; listing only, no browser execution.

The golden record was regenerated explicitly using the documented procedure
above after compiling core and AI. Its diff was inspected: only the core/parser
implementation hashes, label hash and walk-18 prediction hash changed. All
32 cases, 41/41 intents, 119/119 valid citations and 63/63 ambiguity checks remain
passing; targets and every other prediction are unchanged. Only walk-18's
fallback-question label changed; its title, unpriced line, quantities and intent
remain intact.

Pending outside this sandbox: required `pnpm typecheck`, `pnpm lint`, `pnpm test`,
`pnpm build`, `pnpm eval`, and the actual PostgreSQL/browser run:
`pnpm --filter @jobguard/web test:e2e real-words-natural-items.spec.ts --project=mobile-360 --project=desktop --workers=1`.
The named `walk 2 ordinary words become reviewable work` must still be executed
on base and candidate. Phone cases explicitly use 390×844; overflow assertions
are written but have not run. An independent RED reviewer must assess the exact
committed head with that real PostgreSQL/browser evidence before acceptance.
No independent review, CI pass, commit, push, PR, merge or deployment is claimed.
Practice data only; D04 and G1–G5 remain closed.
