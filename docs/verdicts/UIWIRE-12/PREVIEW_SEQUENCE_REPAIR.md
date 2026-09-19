# Preview sequencing repair — executed builder evidence

Builder: ChatGPT. Base: 913ff5985665520bea7f3322a8cacc6530a2f1b7. This is not a Claude verdict or acceptance.

The base's CI run 35470161472 passed typecheck, lint, build, security checks and 388 non-browser tests, but failed 1 of 130 browser tests: mobile quote-send expected Queued — not sent and received Not queued. A replacement preview could leave the old send button actionable before its response committed. This change disables quote controls while previewing and guards sends against a pending save/preview, with recoverable preview failure handling.

The existing quote-send test retains its original assertions and adds a delayed REAL preview request. It asserts the old send and recipient controls are disabled until the real response arrives; it never fakes a successful business response.

## Executed locally

Disposable source/dependencies/browser archive SHA-256 sums verified. Node 24.15.0, pnpm 10.28.1. Source base is the named commit, plus the exact candidate code/test blobs below.

- pnpm build: PASS, 7 tasks, 33.654 seconds.
- pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop quote-send.spec.ts --repeat-each=5: PASS, 10/10 browser journeys, 43.313 seconds including wrapper. Tests use the production Next build and embedded PostgreSQL.
- Full typecheck/test/e2e rerun is in progress at this record's creation; no aggregate green claim is made.

Code blob 443f22692bb45e9fe9722a39c56f934c3ac17936; test blob 879ce77c0fdd5d17793d9feb9565b53b276d2b5e. Both remote blob hashes match the local tested files.

## Shared lane registration

Registers exact branch names for the separately scoped offline workbench and synthetic evaluation in their EXISTING m0-1/m0-12 lanes. All 55 lanes and allow lists are preserved; no lint bypass or permission widening. The compact JSON formatting is mechanical. Shared integration is performed here so dependent PRs can inherit it without editing their own allow lists.

Independent review, founder acceptance, main merge and deployment remain outstanding. Synthetic-only/no-spend constraints remain unchanged. The mounted-only unknown receipt hold still does not solve durable recovery across reload; it is not claimed complete.
