# Tommy demo recording diagnostics — builder receipt

Date: 19 November 2026. This is preparation of a diagnostic recording run, not evidence that any new recording or hosted rehearsal has executed.

## Exact source and ownership

- Diagnostic branch: `codex/sandbox/tommy-demo-recordings-20261119`.
- Reviewed product/test commit supplied by the coordinator: `da34f12f6cd8b86b96d32a96bc8f7299c1b86c6d`.
- Its complete product/test tree: `465e9f31f70eccc6cf42467d932b78c5ac097369`.
- Local checkpoint `e109e045fffe8926cb16a7d79a0328d397034fbb` has that identical tree. Its history is a local representation, not the remote commit identity.
- First task commit `359514f` registered the exact branch and allowed paths before implementation.
- Five diagnostic additions only: this receipt, its lane, one branch-only workflow, one Playwright configuration, and one recording reporter. Removing exactly those paths must reproduce the reviewed product/test tree. The workflow verifies the real checkout SHA and this projection before install/build/browser execution.
- All existing application, test, helper, global setup, package/lock, production build and mandatory CI files remain byte-identical to the reviewed product/test tree. No authority, financial rule, API, database, provider, live environment or test assertion changes.
- Local preparation is authorized; publication and starting the recording run require the coordinator's source review. This lane has not pushed, opened a PR, merged or deployed anything.

## What the four recordings contain

| Existing full test | Main page fixture | Separate context recording |
| --- | --- | --- |
| `ENT-11b.spec.ts`, 1280px full Northside journey | Fictional contractor's operative, supervisor, surveyor, billing, statement and dashboard controls | Fictional client signs in, approves the exact extra and reloads its saved decision |
| `DEMO-J1-core-1000.spec.ts`, fresh selection/full journey | Builder's fresh five-line job through the worker, invoice, receipts, reversal, correction, sources and saved report | An unrelated person is refused access to the same job |
| `DEMO-J2.spec.ts`, complete recovery-18800 journey | Builder's existing complete recovery and five-figure reconciliation journey | An unrelated person is refused access |
| `DEMO-J3-shadow.spec.ts`, complete shadow-30000 journey | Builder's final check, paid invoice, qualifying recovery and verified packs | Authenticated fictional customer approves the two exact catch revisions and reloads the decisions |

The brief J1 link-only case, ENT360 case and duplicate mobile project executions are excluded from this recording-only run. Mandatory full CI still exercises its normal inventory separately. The source-selected main and separate pages are all real Chromium pages of the production Next build using the existing synthetic PostgreSQL and real local Graphile worker.

## Recording and evidence behavior

The diagnostic config imports the existing configuration. It keeps one worker, zero retries and the unchanged per-test deadlines: J1 five minutes, J2 ten, J3 twelve, ENT eleven-b ten. It selects the existing desktop project at 1280×800, records video with explicit 1280×800 size, and retains traces on every outcome. No sleeps, slow motion, artificial narration, UI generation, fixture replacements or altered test actions are added.

Pinned Playwright 1.55.1 was source-inspected. `video: on` controls its page fixture, whose context supplies the normal per-test video directory. Direct `browser.newContext()` calls inherit `_defaultContextOptions`; the diagnostic `contextOptions.recordVideo` supplies a separate raw video directory for those contexts. Each of the four existing successful tests explicitly awaits closure of its separate context. ENT's close is on its successful path; interrupted/failed tests can leave incomplete footage and are not represented as complete demonstrations.

The diagnostic reporter:

- Requires one worker, desktop only, and one selected case from each of the four specs.
- Binds the fixture's own Playwright video attachment to its test ID and captures newly created raw separate-context videos between that test's start and end. Concurrent tests or leftover/unattributed files are an evidence failure.
- Adds each supplemental video to the test result before the JSON/HTML reporters write it. The separate-context role is labelled as source-derived; actual presentation still needs playback review.
- Records source binding, test ID/title/status/project, start/duration, video paths, byte lengths and SHA-256 hashes. One main plus one separate-context video is expected for each of the four unchanged tests.
- Marks complete recording evidence only if the run and all four tests pass on their first attempt and all eight expected files are present and nonempty. An otherwise passing run with missing recording evidence fails the diagnostic completeness gate. This does not convert a product failure into a pass.
- Does not claim that nonempty WebM bytes prove playback quality. The receiver must open/validate the resulting files before presentation.

The branch-only workflow has `contents: read`, no write credentials, a 45-minute overall runner bound and no dispatch, PR or main trigger. It repeats the ordinary frozen install, production build, Chromium install and existing global setup. An exact four-title discovery gate runs before the actual tests. An `always()` upload retains source binding, discovery, JSON/HTML reports, traces, raw videos and manifest for fourteen days, including failed-run evidence. A runner cancellation or hard timeout can interrupt finalization/upload; it is not a successful recording receipt.

## Local validation

- New config discovery: PASS, exactly the four intended full cases, desktop only. No browser or database launched by `--list`.
- Workflow YAML, branch/read-only/45-minute policy, shell syntax and embedded Python syntax: PASS.
- Fresh web TypeScript check with `NODE_OPTIONS=--max-old-space-size=6144 pnpm --filter @jobguard/web exec tsc --noEmit --incremental false`: PASS, exit 0. The initial invocation exceeded Node's default 2 GB heap. The first 6 GB attempt exposed duplicate nominal types caused by whole dependency-directory links pointing at another worktree; ignored local workspace links were corrected to this worktree, and the same fresh check passed. Both initial failed logs are retained separately; neither was a passing check.
- Exact projection and lane-boundary checks: PASS, five diagnostic additions only, with every other blob identical to product/test tree `465e9f31f70eccc6cf42467d932b78c5ac097369`. Whitespace check passed before freeze and is repeated at commit.
- Existing pinned third-party dependency/build contents were reused; workspace package links resolve this worktree. No local full install/build/browser/PG execution is claimed. The workflow performs its own frozen install and production build if published.

## Cost, presentation and limits

Observed older synthetic CI durations for these same four desktop cases were approximately 49 seconds (J1), 1.5 minutes (J2), 6 minutes (J3) and 60 seconds (ENT1280): approximately 9.3 minutes of test time. Planning estimate is 15–25 minutes including setup/build, plus queue/upload/recording overhead; this is not a completion promise. The 45-minute runner bound limits a stalled diagnostic job. Video adds CPU, disk and artifact storage; no account-specific monetary price or final file size has been assumed.

The result would be four main raw WebM recordings plus four supplemental raw WebM recordings, test/trace evidence and a source-bound manifest. Fast automated actions and long worker waits remain visible. API/database assertions need the test report or trace and may not appear in the video. The recordings are local synthetic CI demonstrations, not a Cloudflare deployment, hosted Northside signoff, reusable live session, real provider/payment execution, microphone or physical-phone test. They carry no claim that unexecuted final combined CI gates passed.
