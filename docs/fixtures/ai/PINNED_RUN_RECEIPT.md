# Pinned local fixture-evaluation receipt

Builder run, not an independent verdict. Node 24.15.0, pnpm 10.28.1. Separate disposable checkout from receipt base 913ff5985665520bea7f3322a8cacc6530a2f1b7 with the published evaluation leaf. The parser, scorer, CLI, runner and test source blobs were checked against GitHub before execution.

Commands executed:

- pnpm turbo run build --filter=@jobguard/ai...: PASS.
- pnpm --filter @jobguard/ai typecheck: PASS.
- pnpm --filter @jobguard/ai test: PASS after explicitly collecting source tests once, independent of prior build artifacts.
- pnpm --silent eval: exit 0; JSON report PASS.

The first build-then-test run collected both source and emitted JavaScript tests and failed a compiled test's relative .ts source lookup. The new Vitest configuration preserves all source tests and avoids running duplicate dist artifacts. No assertion or negative control is removed.

32/32 deterministic cases pass; labelled scope intents 41/41; proposal citations 119/119; designated unknown/question checks 63/63; unsupported monetary facts 0. The five injected negative controls each return exit 1. Invalid CLI arguments return exit 2. The pinned rerun took 8.548 seconds including typecheck, source tests and the CLI/build wrapper.

These results apply only to deterministic structured fixture extraction, not real-model accuracy, independent annotation or persisted citation retrieval. Labels remain AUTHOR_PROPOSED_INDEPENDENT_REVIEW_PENDING. The report retains all outputs, hashes, parser/prompt/schema versions, and releaseDecision NOT_AUTHORIZED. No live data, provider call, billing, main merge or deployment was performed.
