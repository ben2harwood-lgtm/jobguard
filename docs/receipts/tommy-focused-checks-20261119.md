# Tommy focused diagnostic execution — 19 November 2026

This branch adds execution infrastructure for the existing reviewed Tommy tests. It is not a main-branch promotion candidate and does not replace or weaken the full CI release gates.

## Candidate binding

- Reviewed combined base: `c953c427755fb6b66f6c184fb4caac958cccd33f`.
- Reviewed combined base tree: `cec631184ceeacf028be018d98b7dea08a578e8e`.
- Exact additional test delta: `636ef83d20fbfb48d96890d519392d4bf1639d93..dd3d7d420b6e741457a52fde950475fb6873bc90`, affecting only `TOMMY-money-gaps.spec.ts` and its existing receipt.
- **Product/test candidate tree before this diagnostic workflow, lane and receipt: `21340673da19cb735b1abf34fb329fd017dbe761`.**

The test delta preserves full capture-response schema validation and every stable field, and excludes only the documented provisional review ID from whole-response equality while both reviews are null. It changes no monetary, retry, source-provenance or deadline assertion. All other combined candidate blobs are unchanged. Prior failed runs remain evidence: the four new cases reached successful capture but did not reach their financial boundaries.

The diagnostic workflow verifies its actual checkout SHA against GitHub's event SHA, prints the complete tree, and computes the product/test tree after removing exactly these three added infrastructure files. That projection must equal the pinned candidate tree above. The final commit and complete diagnostic tree are recorded in the handoff because a receipt cannot contain its own final Git tree hash.

## Execution boundary

Only a push to `codex/sandbox/tommy-focused-checks-20261119` triggers the new workflow. There is no pull-request, main, dispatch, reusable-workflow or scheduled trigger. Permissions are only `contents: read`; checkout does not persist credentials.

Two independent Ubuntu 24.04 matrix jobs run `mobile-360` and `desktop` with fail-fast disabled. Each gets its own normal GitHub runner, frozen dependency install, complete production build and Chromium installation, using the same existing pins: checkout 4.2.2, pnpm setup 4.1.0, pnpm 10.28.1, Node setup 4.0.3, Node 24.15.0, and artifact upload 4.6.2.

The command uses the existing root `pnpm test:e2e` forwarding chain:

```sh
pnpm test:e2e e2e/TOMMY-money-gaps.spec.ts e2e/TOMMY-acceptance-recovery.spec.ts --project="$PLAYWRIGHT_PROJECT" --workers=1 --retries=0
```

Each project runs only those two exact spec files, with one worker and zero retries. The original case bounds and existing Playwright config are unchanged. Each job has a 45-minute bound. No skip filter, success mock, financial fixture replacement, secret, live provider, external database override or deployment is introduced.

The existing Playwright global setup creates and migrates real embedded PostgreSQL, bootstraps the synthetic practice environment, starts the real practice Final Check worker under its existing roles, starts the production Next server and drains/stops the stack afterward. Separate runner jobs preserve port and session isolation.

Existing HTML reports and test-result attachments are uploaded with `if: always()` and retained for 14 days, including passing JSON evidence. This does not force traces on passing cases: the existing `retain-on-failure` trace policy remains intact.

## Scope and review

The first branch commit registered its own exact-path lane. Three files form the diagnostic infrastructure: its workflow, lane and this receipt. The only carried delta in the product/test candidate is the two-file money comparison correction above. The existing CI workflow, package scripts, Playwright configuration, global setup, product code, database migrations and other test assertions remain byte-identical to the reviewed combined base.

C1: there is no new product or user workflow in this infrastructure task, so no new browser spec is invented. The existing acceptance and money scenarios are the diagnostic targets.

Source inspection, schema validation and test discovery do not establish runtime success. Both the new money financial boundaries and this focused execution path still await actual CI. Independent review of the complete focused branch is required before publication; no main merge or deployment is proposed.

## Local validation

- Lane-first commit: `6065b43d18192438ea9522866ab1d4dee1b9aec0`, containing only the new lane file.
- Frozen install: passed; no lockfile change. Six dependency builds needed for discovery were restored from the existing local cache; no application server or database was started.
- YAML parsing and the SchemaStore GitHub Actions workflow JSON Schema: passed. The retained schema has SHA256 `1d41b6e2af8beafa92843005876794524a0bb481f275b5224d150d687dbc23bf` and no external references.
- Additional exact-scope checks: passed for the single push branch, read-only permissions, two projects, original action/runtime pins, frozen install, full build, Chromium installation, zero retries, one worker, 45-minute job bound and always-retained existing report paths.
- Every shell run block passed `bash -n`.
- Actual existing-script argument forwarding and discovery passed with `pnpm test:e2e e2e/TOMMY-money-gaps.spec.ts e2e/TOMMY-acceptance-recovery.spec.ts --project=mobile-360 --project=desktop --workers=1 --retries=0 --list`: exactly eight executions in two files, four per project. This command does not execute the global setup or test bodies.
- Lane check against the exact reviewed combined base and whitespace check passed. The final committed tree projection and complete changed-path comparison are recorded in the handoff.

No browser execution, CI dispatch, push, merge or deployment was performed locally. Existing full-suite requirements remain unchanged.
