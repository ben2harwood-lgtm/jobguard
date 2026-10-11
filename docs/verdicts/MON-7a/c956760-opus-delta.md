VERDICT: PASS — bound to head c9567607edee8c05f5599e89ec0c2969e1eee5be
Reviewer: fresh Claude Opus 5.5 review agent spawned by the JobGuard integrator session (8 Oct 2026); did not build, repair or order any commit in this PR.

**In plain English:** the prevention checks still work exactly as they did when I passed them last night. The two main-merges since then were mechanical. The one new code change, two lines that tell CH-2's watchdog these checks are allowed before a job goes live, is the right call: the checks are meant to run while quoting, they write only their own tables, and they never change the job. CI is fully green on this exact head, including all 258 browser tests (6 of them MON-7). I found only small paperwork and test-hygiene points; none blocks the merge. B4 (the exposure curve) is still parked, nothing for it was built, and so MON-7 as a whole is still not fully accepted.

This is a delta review from my previous PASS at `e7c314f` (and the REPAIR at `347e452` before it), then a verdict on the whole PR at `c956760`.

## What changed since e7c314f, and my judgement

| Commit | What | Verdict |
|---|---|---|
| `191db2c` | Integrator merge of main `df1f9c1` (SEC-DEPS, CH-2 0096, M4-1-S-R 0097) | Mechanical. `git show --remerge-diff`: conflicts only in controller/export unions, migration list, MIGRATIONS.md, tenancy rows, count tests (taken from main, now count-agnostic) and the two mount-point files (taken from main, then re-applied in `2b14a65`). |
| `2b14a65` | Builder round 2: re-applied MON-7a's mount points | Correct. A token diff of main's files against the head shows exactly MON-7a's two insertions per file and nothing else: the import, `<PreventionChecks jobId={jobId}/>` after `</fieldset>` in `quote-editor.tsx` (byte-identical placement to e7c314f, so my earlier P3-3 fix survives), and after the stages `</nav>` in `workspace-shell.tsx`. CH-2's `<WatchdogStatusProvider>`, every `WatchdogPanel` wrapper, and CH-3a's parties-ready / `PARTIES_CHANGED` guards are kept. |
| `4aa8ac9` | Lane edit under Ben's typed approval ("Add the one file") | Verified by parsing the JSON at both commits: 94 lanes before and after, only `mon-7a` changed, and within it only `allow` changed: `packages/core/src/watchdog.ts` added, nothing removed (the list was also re-sorted, as the commit message says). `test`, `receipt`, `note` and `branches` unchanged. Against main, the lane file is main's 94 lanes plus `mon-7a`, one line between `main-integration` and `outbox-adapter-1`. |
| `caac757` | Two registry lines in `packages/core/src/watchdog.ts` | Exactly two added lines (`:31`, `:96`), nothing else in the file changed. Classification judged below. |
| `f80202e` | Integrator merge of main `b552bdc` (CH-3b, 0102) | Mechanical (remerge-diff): `ContractorPartiesController` + `PreventionCheckController` union; export unions in api workspace, core and db indexes; `migrate.ts` = …0096, 0097, 0102, 0103; MIGRATIONS.md has main's 0102 section then this PR's 0103; tenancy rows in name order (`contractor_party_binding`, `contractor_resident_contact`, `counterparty_check`, `customer`). |
| `c956760` | §12.2 ledger paragraph for 0103 | Accurate (P3-3 nit below). 0103 matches the issued order; 0098–0101 renumber at their own merge; 0104 CH-1 and 0105 ENT-2 match the issued orders. |

**The PR's own substance is unchanged.** Comparing each file's added/removed lines in `0264158..e7c314f` against `b552bdc..c956760`: 24 files are identical in substance, including `0103_prevention_checks.sql` (0 diff lines between e7c314f and head), the repository, fixtures, core, routes, UI component, contract, both earlier receipts and both test suites. The only differences are the merge unions above, the two registry lines, the round-2 receipt, the MIGRATIONS.md wording, the ledger line, and UIWIRE-12/demo-bootstrap no longer being touched (main made them count-agnostic).

### `pre_live_allowed` is the right class

- CH-2's rule (BUILD_PLAN.md:463) makes a command `watchdog_live_only` when it records "a site fact, supplier document, order, proof or site message". The live-only list (:461) is purchase orders, supplier documents/facts/matches, Things to check, readiness, relevance inbox and proof. Prevention checks are none of these. They are register lookups about the property and the customer, and CH-2 allows "quoting inputs" before live (:462).
- MON-7's own card says B1 runs "at quote time". `watchdog_live_only` would make the feature unusable on the quoting jobs it is for. `post_live_billing` is plainly wrong.
- The code backs the builder's claim: the command writes only `property_constraint_fact`, `counterparty_check`, its `command_receipt` and one `audit_event`. It never updates `app.job` (no status or revision change), and none of the 0103 tables carries CH-2's `a_watchdog_live_before_insert` trigger.
- My probe Q2 (below) ran all five actions on a quoting job: job status, revision and `updated_at` were unchanged, and every CH-2-guarded table plus `watchdog_command_identity` stayed at 0 rows for the job.
- Red before: with the two entries removed from core's build, `watchdog-registry.test.ts` fails exactly 2 tests ("Unclassified job mutation: /api/jobs/[id]/prevention-checks/[action]" and "…nest:/jobs/:id/prevention-checks/:action"). Green at head: 120 of 120.

### Not wrapping `PreventionChecks` in `WatchdogPanel` is right

`WatchdogPanel` disables its children unless the job is live. Wrapping would disable B1 on quoting jobs, which contradicts the card. The panel is still inside `WatchdogStatusProvider`, but it does not read it. MON-7.spec.ts (6 cases) passes in CI with CH-2's provider in place.

### Against CH-2, CH-3a, SBOX and CH-3b

- **CH-2:** the checks call no live guard, and 0103 adds no trigger to any 0096 table. 0102's receipt constraint trigger fires only for `contractor_parties.*` command types, never `prevention.check`. CH-2's registry, watchdog, lock-order and replay suites pass with 0103 registered (CI).
- **CH-3a / SBOX:** `practice-access.ts`, `workspace-server.ts`, `synthetic-server.ts`, `practice-session.ts` and `job-parties.ts` are byte-identical between e7c314f and head, so the PracticeAccess 404/401 behaviour I accepted last round is unchanged (MON-7.spec still covers it, green in CI).
- **CH-3b:** contractor jobs bind through the same `job_party_binding` / `job_party_current` tables, and `job_party_snapshot` is a view, so MON-7a reads them the same way. MON-7a never reads `contractor_resident_contact`, so the resident (an individual) is never checked (DW3). Probe Q4 confirms a work-order-import-shaped binding: `main_contractor` with a company number is refused, a `business` with one is checked, and property facts run for both.
- **M4-1-S-R:** untouched. The DW4 architecture test scans files by name pattern, so it now also covers M4-1-S-R's recovery modules. It passes.

## Findings (all P3, non-blocking)

**P3-1 (carried forward, unchanged code): my N1 and N2 from the e7c314f PASS are still open.** N1: the receipt says the revise-customer race "cannot be excluded", but one more `companyEligible` check after `appendAuditBatch` (`packages/db/src/prevention-check-repository.ts`) would close it. N2: the 0103 trigger accepts a direct runtime write on a non-current binding (`0103_prevention_checks.sql:74`), though such a row can never be shown. Both stay good follow-ups, not blockers.

**P3-2: the upgrade test's notion of "previous schema" will drift as later migrations merge.** `packages/db/test/prevention-checks.integration.test.ts:191` applies every registered migration except `0103_prevention_checks.sql`, then applies 0103. That is right today, because 0103 is last. Once 0104/0105 or a renumbered 0098–0101 merge after MON-7a, the test will apply those later migrations *before* 0103, which is not a real upgrade path. If 0103 is ever renumbered, the filter excludes nothing and the test fails loudly (it does not pass silently). **Fix when convenient:** apply only the registered prefix before 0103, as CH-2 does for its own upgrade test ("owner setup applies only the registered prefix before CH-2"). Not needed for this merge, because 0103 is the highest number on main and merges ahead.

**P3-3: paperwork.**
- `docs/verdicts/MON-7a/BUILDER_RECEIPT_round2.md:106-107` still ends "Not yet green: two API registry tests". `caac757` fixed that, and CI run 37731565633 is the evidence. The acceptance record should say so.
- `packages/db/MIGRATIONS.md` (0103 section) says the upgrade test covers "now including 0096 and 0097"; it now also includes 0102.
- The BUILD_PLAN.md ledger line for MON-7a does not say it replaces MON-7's §12.3 pre-allocation 0057 (CH-3b's line says "in place of its §12.3 reservation 0055"). It would help to say whether 0057 is released or kept for MON-7b.
- My earlier N3 (the old `docs/verdicts/MON-7/BUILDER_RECEIPT.md` header still says "review and CI pending") is unchanged.

**P3-4 (observation, no change needed): the checks also run after the job leaves live.** Probe Q3: property and company checks succeed on `live`, `invoiced` and `lost` jobs, and the job's status is unchanged. That follows from `pre_live_allowed` (it means "not live-gated", not "pre-live only"), and the panel is not hidden or disabled by job status. It is synthetic and advisory with no fee or outbound effect, so it is harmless. A one-line comment on the two registry entries would record the reasoning; today they sit under the comment about parties.

## Checked and OK

- **Scope:** B1, B2, B3, B5 and B6 only. A grep of the non-doc diff against main finds no exposure, curve, schedule, outbox, notification, Decision or external URL (the only `fetch` calls are same-origin `/api/jobs/…/prevention-checks`). The receipt (`docs/verdicts/MON-7a/BUILDER_RECEIPT.md:17-18, :198, :375`), the contract and MIGRATIONS.md state that B4/MON-7b is parked and MON-7 is not fully accepted. The Q7 rule (`prevention-company-eligibility-reference.v1`: business plus a valid company number only; otherwise "not run — not a registered company") is unchanged and still enforced in core, the repository and the 0103 trigger.
- **Migrations:** only 0103 is added and it is byte-identical to the version I passed. 0000–0102 are untouched. `migrate.ts` order ends 0096, 0097, 0102, 0103.
- **Nothing weakened:** no test or assertion removed or skipped, no timeout lengthened. Playwright `retries: 0`.
- **Founder-reserved areas:** none touched. Synthetic only, no providers, spending, production mode or approvals. BUILD_PLAN.md is changed only by the integrator's ledger line, which the lane note allows.

## What I executed (worktree `/private/tmp/opus-mon-7a-c956760-0810`, detached at c956760; disk 116 GB free)

- `pnpm install --frozen-lockfile --ignore-scripts`: exit 0.
- Lane lint with a simulated `pull_request` event (base b552bdc, head c956760): `Lane boundary passed`, exit 0, 33 files, lane `mon-7a`.
- `pnpm typecheck --force`: exit 0, 7 of 7. `pnpm lint --force` (simulated event): exit 0 (core purity, lane, money arithmetic, tsc).
- `pnpm build`: exit 0, 7 of 7, both prevention routes built.
- `apps/api` `vitest run src`: exit 0, 26 files, 598 tests (registry 120, prevention application 5). `openapi:check`: exit 0.
- `apps/web` vitest: exit 0, 19 files, 350 tests. Core `prevention-checks` + `watchdog` tests: exit 0, 36 tests.
- Registry red-before probe (two entries removed from core's build): exit 1, exactly 2 failures, as quoted above. Restored, then 120 of 120.
- `playwright test --list`: 258 tests in 52 files, including 6 MON-7 cases (3 × `mobile-360` and `desktop`).
- Under `heavy-slot`, on embedded PostgreSQL 16.10 (after hydrating the embedded-postgres binary symlinks that `--ignore-scripts` skips; the first attempt failed at `initdb` for that reason only), the head's `prevention-checks.integration.test.ts` and my own probe file (untracked, in my worktree only) ran together: exit 0, 2 files, 15 of 15 (11 PR tests plus 4 probes):
  - **Q1:** the migration list ends 0096, 0097, 0102, 0103. CH-2's `a_watchdog_live_before_insert` trigger is on more than 20 tables, and on neither 0103 table.
  - **Q2:** on a quoting job, property, company, start, evaluate and stop watch leave the job's status, revision and `updated_at` unchanged. Every CH-2-guarded table and `watchdog_command_identity` stays at 0 rows for the job. No `app.decision` row appears for the tenant. My probe looked for an `outbox_action` table, which does not exist (the real table is `app.action_outbox`), so that half was skipped. The source grep above finds no outbox write.
  - **Q3:** property and company checks succeed on `live`, `invoiced` and `lost` jobs (status forced by the owner role for the probe) with no `JOB_NOT_LIVE`, and the status is unchanged.
  - **Q4:** on a CH-3b-shaped `work_order_import` binding, a `main_contractor` customer with a company number is refused (`NOT_REGISTERED_COMPANY`, shown as "not run — not a registered company"), and property facts still run. After re-binding to a `business` customer with a company number, the company card returns `clear`, and the paying party is cited as the builder's saved record.
- JSON comparison of the lane registry at 4aa8ac9^, 4aa8ac9, e7c314f, b552bdc and head; per-file substance comparison of the PR diff at the old and new heads; `git show --remerge-diff` on both merges.

## What I relied on CI for

Run 37731565633, attempt 1, on the exact head c956760, conclusion success:
- `checks`: install, typecheck, lint, `pnpm test`, build, and Playwright `Running 258 tests using 1 worker` then `258 passed (11.7m)`.
- `pnpm test` counts: core 1634, api 598, web 350, ai 72, db 56 files / 583 tests (`prevention-checks.integration.test.ts` 11 of 11), config 1, storage 2.
- `dependency-review` and `secrets` pass. Vercel builds were ignored. No re-run was needed.

## Not verified

- I ran no browser test locally.
- I did not visually inspect the panel. Its DOM position is unchanged from e7c314f, and the MON-7 browser cases pass in CI.
- Probe Q3/Q4 set job status and the work-order binding directly as the database owner, to model those states. They do not exercise CH-3b's real `bind_contractor_parties` path end to end.

