# ENT-4a-ALIGN builder receipt

12 October 2026 · branch `codex/sandbox/ent-4a-align` · check lane **RED**.
Main/base: `17c82ee2822cba9be364297d64e8754b43a57013` (draft inspected `a0963f405fee263cf2bfe8effe68bbeaa9ae1ff6`).
Coordinator commit / builder starting HEAD: `9488a358f96d77866ae2466d6365fe1c3bbc45b8`.
This receipt describes working-tree additions on that exact commit; no builder commit exists yet.

**The access-rule change itself was committed by the coordinator on Ben's typed yes**, in commit
`9488a358f96d77866ae2466d6365fe1c3bbc45b8`. Ben said **"yes, update the extras rule"** on 12 October,
card `jobguard-ent4a-align-extras-rule-test-2026-10-12`. The builder has not amended,
squashed, rebased or rewritten that commit, changed `transitions.ts`, or changed the
coordinator's three expected rows or comment. Dispatcher owns the subsequent commit.

Read: AGENTS.md; BUILD_PLAN §2.4 C1/C6/C8, §9.1.2, §9.1.4–5, ENT-4a and §12.2;
whole transition source/tests; shared origin fixtures, fee predicate, purity test;
ENT-4a round-3 receipt; standing handoff rules 11 and 12. No skill applies to this pure-core task.

## Founder authority (verbatim from the issued order)

Card `jobguard-ent4b-who-records-extras-2026-10-11`, 11 October 2026.

Question: "On a contractor job, which roles may record each kind of extra: one logged on site, one recorded by the office, and one instructed by the client?"

Default: "A sensible default: surveyors and site staff may log site extras; finance, admins and owners may record office ones; commercial managers, admins and owners may record client-instructed ones. Say if you want it different."

Answer: **"Use that default"**.

Issued mapping: "site staff" means `operative` and `supervisor`. Q1 resolved by the typed yes
and coordinator commit; Q3 leaves the site guard unchanged; Q4 confirms the client/import
split; Q5 retains AL-6 and Run B. Q2 belongs to the dispatcher: before both RED checks,
it adds one §12.2 sentence to BUILD_PLAN and widens this lane for that integrator-only file.
This builder did neither.

## Table 1 — lists as built

| Command / origin kind | Before | After | Authority |
|---|---|---|---|
| `LogSiteExtra` / `site_user` | operative, supervisor | operative, supervisor, surveyor | founder, 11 Oct |
| `RecordOfficeExtra` / `office_entry` | supervisor, surveyor, commercial_manager, admin | finance, admin, owner | founder, 11 Oct |
| `RecordClientInstruction` / `client_instruction` | surveyor, commercial_manager, connector | commercial_manager, admin, owner | founder, 11 Oct |
| `ImportOrderLine` / `client_instruction` | surveyor, commercial_manager, connector | surveyor, commercial_manager, connector | unchanged §9.1.4 |
| `ConfirmPrompt` / `jobguard_surfaced_confirmed` | supervisor, surveyor, commercial_manager | supervisor, surveyor, commercial_manager | unchanged §9.1.4 |

## Table 2 — every role/kind before → after, and test mapping

"yes" means permitted with the matching covering job grant and all other guards satisfied.
Capitals mark exactly the ten changed cells. There are nine permitted and 21 refused pairs.
Every cell is proved by its distinct test named `[AL-2] COMMAND / ROLE permitted=BOOLEAN`:
column gives COMMAND, row gives ROLE, and after yes/no gives literal true/false.
Example: `[AL-2] LogSiteExtra / surveyor permitted=true`; `[AL-2] RecordOfficeExtra / supervisor permitted=false`.

| Role | Site (`LogSiteExtra`) | Office (`RecordOfficeExtra`) | Client instruction (`RecordClientInstruction`) |
|---|---|---|---|
| operative | yes → yes | no → no | no → no |
| supervisor | yes → yes | yes → NO | no → no |
| surveyor | no → YES | yes → NO | yes → NO |
| commercial_manager | no → no | yes → NO | yes → yes |
| finance | no → no | no → YES | no → no |
| admin | no → no | yes → yes | no → YES |
| owner | no → no | no → YES | no → YES |
| read_only | no → no | no → no | no → no |
| client_approver | no → no | no → no | no → no |
| connector | no → no | no → no | yes → NO |

The checkers' question **"does the committed change match the founder's lists exactly,
ten cells and no others?"**: **yes**, by the coordinator diff, Table 2, all 30 AL-2 rows,
and the preserved exhaustive table. Exactly five cells become permitted and five refused.
No role absent from the founder's list succeeds in these single-role recording rows;
the covering-grant and capture refusals still hold. The unchanged creation/lifecycle
boundaries covered by AL-4 and the existing exhaustive table retain their expectations.
This is pure supplied-fact evidence, not proof of database or API authorization.

## Before/after text — coordinator's change, source-inspected

Draft/base line numbers are used here; the module constant shifts the source lookup
and guard down nine lines (old 16 → current 25; old 21 → current 30).

`transitions.ts:16` before:

```ts
    const roles = command === "LogSiteExtra" ? ["operative", "supervisor"] : command === "ConfirmPrompt" ? ["supervisor", "surveyor", "commercial_manager"] : command === "RecordOfficeExtra" ? ["supervisor", "surveyor", "commercial_manager", "admin"] : ["surveyor", "commercial_manager", "connector"];
```

After:

```ts
    const roles = raisingRoles[command as keyof typeof raisingRoles];
```

Only this old source line is removed; one private typed constant and its comment were added.
Its five literal lists are Table 1. No new source import or export.

`transitions.test.ts` old lines 10, 12, 14, 15 before:

```ts
// Independent normative rows from BUILD_PLAN §9.1.4; no implementation-generated expectation.
 LogSiteExtra:{from:["absent"],roles:["operative","supervisor"],to:"logged"},
 RecordOfficeExtra:{from:["absent"],roles:["supervisor","surveyor","commercial_manager","admin"],to:"logged"},
 RecordClientInstruction:{from:["absent"],roles:["surveyor","commercial_manager","connector"],to:"logged"},
```

Coordinator after (same original line numbers):

```ts
// Independent hand-written rows, never generated from the implementation: BUILD_PLAN §9.1.4, except the roles of LogSiteExtra, RecordOfficeExtra and RecordClientInstruction, which follow the founder's answer of 11 Oct 2026 (card jobguard-ent4b-who-records-extras-2026-10-11).
 LogSiteExtra:{from:["absent"],roles:["operative","supervisor","surveyor"],to:"logged"},
 RecordOfficeExtra:{from:["absent"],roles:["finance","admin","owner"],to:"logged"},
 RecordClientInstruction:{from:["absent"],roles:["commercial_manager","admin","owner"],to:"logged"},
```

Builder additions: one new test import after the byte-identical original lines 1–3;
one appended describe block, 62 tests. No existing test line was edited by the builder.

## Acceptance criteria

| ID | Result | Evidence |
|---|---|---|
| AL-1 | **MET by issued coordinator evidence** | Recorded red/green evidence below; builder was expressly told not to reproduce red. |
| AL-2 | **MET** | 30 `[AL-2] COMMAND / ROLE permitted=BOOLEAN` tests and `[AL-2] the hand-written table covers every role exactly once for each kind`; identity, origin, exact refusal code and unchanged input. |
| AL-3 | **MET** | Nine `[AL-3] COMMAND / ROLE requires a covering grant` tests, each with permitted control plus no grant / other job / other tenant / other member, exact `PERMISSION_DENIED` and unchanged input. |
| AL-4 | **MET** | Two `[AL-4] ROLE has no blanket override across states and commands` rows (13 × 14 calls each); ten `[AL-4] ImportOrderLine / ROLE permitted=BOOLEAN` rows; all 34 original tests preserved. |
| AL-5 | **MET** | Three `[AL-5] site capture by ROLE not named on the job is refused` rows and `[AL-5] surveyor site capture without a note or verified photo is refused`, exact `INVALID_TRANSITION`; unchanged guard. |
| AL-6 | **MET (current tree executed; before-rule invariance source-inspected)** | Six `[AL-6] merged fee rule / ROLE named=BOOLEAN` rows, exact principal, site and fee assertions. `origin.ts` / `fee.ts` unchanged from draft, main and coordinator HEAD. No pre-change AL-6 run was performed; issued header disallows reproducing red. F1 remains open. |
| AL-7 | **MET** | Actual four outputs below; coordinator removes one source line and four test lines; builder adds only lane, import/tests and receipt. |
| AL-8 | **MET** | Coordinator source diff is exactly the stated private constant and lookup; no source import/export/platform/network addition; unchanged purity test passes in Run B. |
| AL-9 | **MET** | Seven identical blob records below; temporary read-only audit, no standing hash/byte tests added. |
| AL-10 | **MET for builder delivery** | This receipt and intended commit-message file; final-check outcomes populated below. Independent verdict/acceptance and dispatcher plan sentence remain required. |

## Tests-first evidence and executed runs

**Coordinator evidence, attributed; not run by this builder:** the issued header and
commit message record plain main 214 passed, new expected rows against old code with
one failed (`absent`) and 213 passed, then changed code with 214 passed.
The issue declares AL-1 satisfied. The builder did not reproduce red or alter that commit.
The coordinator's log path and SHA-256 were not supplied; they are **not available in this receipt**.
The draft's 20-failure prediction is superseded by the issued workflow; no builder red run is claimed.

**Builder Run A**, current coordinator implementation plus appended tests:

`VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2 pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/enterprise-domain/transitions.test.ts`

Exit **0**, **96 passed / 0 failed**, one file, duration 4.30s. All six AL-6 rows pass.
34 existing + 30 AL-2 + one AL-2 shape + nine AL-3 + 12 AL-4 + four AL-5 + six AL-6 = 96.
The draft allowed 96 with a separate shape test; that is the observed count.
Log `/private/tmp/jg-ent-4a-align-run-a.log`, SHA-256 `505d03afb37522432c5c437a9aa964edc4525c8eb15e3d933b3017cb031b61f2`.

**Builder Run B**:

`VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2 pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/enterprise-domain/origin.test.ts src/enterprise-domain/fee.test.ts src/enterprise-domain/boundaries.test.ts`

Exit **0**, **244 passed / 0 failed**, three files, duration 11.95s. No timeout, no repeat.
Log `/private/tmp/jg-ent-4a-align-run-b.log`, SHA-256 `1eaab28a2994937487e1245747ec3d361017311b32280870a81fdfcdc7ea4ea4`.
One test run at a time, at most three files, maxWorkers=2; both VITEST variables exported.
No other vitest run and no package/root test script.

Environment: installed dependencies only, cached pnpm **10.28.1** via
`PATH=/private/tmp/jg-ent4b-round1-bin:$PATH`; Node **24.17.0** (repository pin 24.15.0),
Vitest **4.1.11**. No clean install or package download.
Default launcher `pnpm --version` stalled and was interrupted (exit 130), then the existing
cached launcher returned version 10.28.1 (exit 0).

Run A used `HEAVY_SLOTS=2 /Users/benharwood/.local/bin/heavy-slot ent-4a-align-A`
before the pnpm command. The helper emitted these inspection refusals before running the tests:

```text
sysctl: sysctl fmt -1 1024 1: Operation not permitted
sysmon request failed with error: sysmond service not found
pgrep: Cannot get process list
```

An earlier ancillary inspection `ps -ax -o pid,ppid,command | rg 'pnpm|89172'`
was refused with `zsh:1: operation not permitted: ps`.
Those inspection items were stopped; no replacement process probe or helper retry was used.
Run B used the separately prescribed pnpm command directly and stayed serialized locally;
shared-slot process inspection could not be verified in this sandbox.
Observed `memory_pressure | tail -1`: `System-wide memory free percentage: 70%`.

## End-of-work checks

Executed once each, in the issued order (OpenAPI additionally requested by the dispatcher).
The cached launcher PATH described above applies to all pnpm commands.

| Command | Exit | Result | Log SHA-256 |
|---|---|---|---|
| `pnpm typecheck` | **0** | Seven successful tasks; two cache hits; 2m29.311s. Core compiles its test files. Log `/private/tmp/jg-ent-4a-align-typecheck.log`. | `2641e5a93e5d54da5cac472dad5adcfc020f2919959fc3bd3de46c5287fd2d7f` |
| `LANE_BASE_REF=origin/main pnpm lint` | **0** | Core purity (129 TypeScript files), lane and money boundaries pass; seven successful package lints, two cache hits; 39.011s. Log `/private/tmp/jg-ent-4a-align-lint.log`. | `a3276f6d75ee2b122d89414ffbe9e5c73fb268f5359118a2d799b4b45a212991` |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | **0** | Exact four intended paths, including the untracked receipt; lane ent-4a-align. Log `/private/tmp/jg-ent-4a-align-lanes.log`. | `db98930d090ad056bbb442d14511e0fbb9c327643ca83f22637ab16017323956` |
| `pnpm build` | **0** | Seven successful tasks, two cache hits; 2m26.379s, including production Next build. Log `/private/tmp/jg-ent-4a-align-build.log`. | `1201e5bfe18404508d37e8244d0253d287345d76792c2dbc0b97de0b5eb5f1ab` |
| `pnpm openapi:check` | **1** | Sandbox refusal: tsx IPC pipe listen EPERM. Stopped; no alternate invocation or repeat. Log `/private/tmp/jg-ent-4a-align-openapi.log`. | `22735166515148263a325e18440c6b7406bba7218e8251e7b19e191e9f08c71e` |

`git diff --check`: exit **0**, no output. The four AL-7 commands each exited **0**
(outputs below). The seven AL-9 working/main/draft blob comparisons and final temporary
source/test/lane byte audit exited **0**. These are deterministic receipt checks, not
standing tests or independent model verification. Final-check record
`/private/tmp/jg-ent-4a-align-final-checks.json`, SHA-256
`9f17c9804682cce607eda819a14057e8b8e51fba57e1c418d77ac919ea31aff3`.

Turborepo emitted `WARNING  IO error: Operation not permitted (os error 1)` cache warnings;
no retry or cache-path workaround was attempted. The task results above are the actual exits.

Exact OpenAPI refusal:

```text
Error: listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/75370.pipe
```

The refused command was `pnpm openapi:check` → `tsx src/generate-openapi.ts --check`.
Standing rule 10 requires stopping a refused item; it was stopped, with no alternate
invocation. This leaves the local OpenAPI check NOT MET, to be executed by CI.
No automated approval escalation/review was requested or received.

Generated build/typecheck/cache artifacts were removed after the checks: `packages/core/dist`, `packages/config/dist`, `packages/storage/dist`, `packages/ai/dist`, `packages/db/dist`, `apps/api/dist`, `apps/web/.next`, `packages/core/.turbo`, `packages/config/.turbo`, `packages/storage/.turbo`, `packages/ai/.turbo`, `packages/db/.turbo`, `apps/web/.turbo`, `apps/api/.turbo`, `.pnpm-store`, `apps/web/tsconfig.tsbuildinfo`.
No `.pnpm-store`, `dist`, `.next`, `.turbo`, tsbuildinfo or test-results artifact from these runs remains.

## AL-7 actual read-only outputs

`git diff origin/main -U0 -- packages/core/src/enterprise-domain/transitions.ts | grep '^-' | grep -v '^---'` — exit **0**.

```text
-    const roles = command === "LogSiteExtra" ? ["operative", "supervisor"] : command === "ConfirmPrompt" ? ["supervisor", "surveyor", "commercial_manager"] : command === "RecordOfficeExtra" ? ["supervisor", "surveyor", "commercial_manager", "admin"] : ["surveyor", "commercial_manager", "connector"];
```

`git diff origin/main -U0 -- packages/core/src/enterprise-domain/transitions.test.ts | grep '^-' | grep -v '^---'` — exit **0**.

```text
-// Independent normative rows from BUILD_PLAN §9.1.4; no implementation-generated expectation.
- LogSiteExtra:{from:["absent"],roles:["operative","supervisor"],to:"logged"},
- RecordOfficeExtra:{from:["absent"],roles:["supervisor","surveyor","commercial_manager","admin"],to:"logged"},
- RecordClientInstruction:{from:["absent"],roles:["surveyor","commercial_manager","connector"],to:"logged"},
```

`git diff origin/main --name-only` — exit **0**.

```text
config/agent-lane-assignments.json
packages/core/src/enterprise-domain/transitions.test.ts
packages/core/src/enterprise-domain/transitions.ts
```

`git status --porcelain` — exit **0**.

```text
 M config/agent-lane-assignments.json
 M packages/core/src/enterprise-domain/transitions.test.ts
?? docs/verdicts/ENT-4a-ALIGN/
```

The three-path tracked diff includes the coordinator's committed source change.
The receipt is untracked, so it appears in status rather than `git diff --name-only`.
Against coordinator HEAD, only the lane and appended tests are modified; source is unchanged.
The final temporary audit reconstructed the main source by removing just the private
constant/comment and replacing the lookup with its old line; the result equals main
byte-for-byte. Removing just the new lane line likewise reproduces the entire main
lane registry. Removing the new test import leaves the original coordinator file as
a byte-identical prefix. None of these checks was added as a standing test.

## AL-9 unchanged blobs (receipt records, never tests)

All files below are under `packages/core/src/enterprise-domain/`.
`git hash-object FILE` (without -w), `git rev-parse origin/main:FILE` and
`git rev-parse a0963f4:FILE` were executed; all three equal the draft hash.

| File | Draft / a0963f4 | Working blob | origin/main blob |
|---|---|---|---|
| `contracts.ts` | `fdc3cc51aa6283ea7fcbf0ed5d55a92b416b4f71` | `fdc3cc51aa6283ea7fcbf0ed5d55a92b416b4f71` | `fdc3cc51aa6283ea7fcbf0ed5d55a92b416b4f71` |
| `origin.ts` | `290c563153e62413d5b7720e9a7fb031a4933c2d` | `290c563153e62413d5b7720e9a7fb031a4933c2d` | `290c563153e62413d5b7720e9a7fb031a4933c2d` |
| `fee.ts` | `eec73e564acf36851025db88afa49f92ee9ed542` | `eec73e564acf36851025db88afa49f92ee9ed542` | `eec73e564acf36851025db88afa49f92ee9ed542` |
| `index.ts` | `c0a9dae7bb168bacc6a392b808c4edb81696a8f5` | `c0a9dae7bb168bacc6a392b808c4edb81696a8f5` | `c0a9dae7bb168bacc6a392b808c4edb81696a8f5` |
| `origin.test.ts` | `999876d6722b9fcac925f5d6fb183b4c433833bb` | `999876d6722b9fcac925f5d6fb183b4c433833bb` | `999876d6722b9fcac925f5d6fb183b4c433833bb` |
| `fee.test.ts` | `0e9d69d8c128a4ead4146fed8a796b3dabfd6dc0` | `0e9d69d8c128a4ead4146fed8a796b3dabfd6dc0` | `0e9d69d8c128a4ead4146fed8a796b3dabfd6dc0` |
| `boundaries.test.ts` | `edd8e85278a0ca0e32ea5dd6f84d60e972eeb3a7` | `edd8e85278a0ca0e32ea5dd6f84d60e972eeb3a7` | `edd8e85278a0ca0e32ea5dd6f84d60e972eeb3a7` |

The changed files' draft blobs are `transitions.ts` `97c43fcd36f9349b0ba918fe92e37fd1020c970a`
and `transitions.test.ts` `e17a87a5ae6c915515fc75bef874e7f1c90c5d79`.
Coordinator source working blob is `ae571eef932074775dc1515394a4f898b7b53636`;
appended-test working blob is `d6134286120124a4179de0714ccb5d365c4ccb91`.

## Lane floor and remaining review

Actual tool invocation:

`python3 /Users/benharwood/.local/share/full-steam/lane-floor.py jobguard /Users/benharwood/Claude/Projects/my-new-project/.worktrees/ent-4a-align origin/main HEAD`

```text
LANE FLOOR: AMBER  (jobguard; origin/ma..HEAD; 2 paths: 0 red, 2 amber, 0 green)
  amber: packages/core/src/enterprise-domain/transitions.test.ts
  amber: packages/core/src/enterprise-domain/transitions.ts
This is a floor from path names only. Read the diff for indirect effects; raise the lane if unsure.
```

This tool sees committed HEAD only: the coordinator's two-file commit.
The full builder working diff was classified with the tool's matching function and unchanged map, including the untracked receipt:

```text
Working-tree classification using lane-floor.py matching and the unchanged map: AMBER (4 paths: 0 red, 3 amber, 1 green)
{
  "red": [],
  "amber": [
    "config/agent-lane-assignments.json",
    "packages/core/src/enterprise-domain/transitions.test.ts",
    "packages/core/src/enterprise-domain/transitions.ts"
  ],
  "green": [
    "docs/verdicts/ENT-4a-ALIGN/BUILDER_RECEIPT.md"
  ]
}
```

This working-tree calculation is separate from the committed-head tool invocation above. This is a path floor of AMBER;
**check lane is RED** because an access rule and expected access rows changed.
The dispatcher must run the tool on the final committed head after its ledger sentence,
then GitHub CI, fresh Claude Opus review and separate Codex Sol check on that exact head.
At most two repair rounds. No independent reviewer was spawned by this builder.
Separate acceptance and founder-owned merge/push/release remain outstanding.

## NOT RUN / applicability and limits

NOT RUN: every other repository test: remaining core, all DB/migration/upgrade tests,
API/web unit tests, browser/e2e suite and root `pnpm test`; live-model/eval, native/device,
live providers, clean frozen install and deployment. GitHub must run the mandatory suites
on the dispatcher's pushed head. No database/PostgreSQL/browser service or suite was started.
The OpenAPI launcher's attempted socket bind was refused as recorded above.
OpenAPI check outcome is recorded above; it is not an API integration test.
C1 expressly pure-core; no web workflow, e2e spec, UI or persistence added. C6 evidence is
Run A/B only; C8 still requires CI and real recorded independent verdicts.
No migration/backfill, schema, financial write, durable action, public signature or
operational alert change. The access-list compatibility change is exactly Table 2.
Synthetic fictional fixtures only; `production_billing` is a pure test input,
not production activation, settlement, charging or regulatory approval.

## Residuals

- **R1:** the pure rule book still requires a supervisor or surveyor to be named on the job
  before logging a site extra, stricter than ENT-3a's database rule as described in the
  issued order (only operatives require it). The old line-21 guard is byte-identical;
  Q3 expressly leaves it. Not a founder rule, not adjusted by these tests.
- **R2:** the fee rule is untouched. A surveyor's site extra carries no fee today;
  a supervisor not named on the job also fails the site-origin fee predicate. F1 is
  an open founder question; the six AL-6 rows decide nothing about it.
- **R3:** BUILD_PLAN §9.1.4 still prints the older Who cells. This builder may not edit it.
  Issued Q2 requires the dispatcher to add one §12.2 ledger sentence, in its own commit,
  and widen this lane integrator-only before the checks. Merge remains held for that action.

Known adjacent issue, unchanged and not implemented: a person with multiple covering
grants can satisfy permission with one grant while recording a different held raising
role; the drafter assigned this to ENT-5. Single-role table tests do not claim to resolve
that existing supplied-fact gap. No database rule or cross-layer test was inspected or added.

## Self-review

- All 30 Table 2 cells map to distinct named AL-2 tests; exactly nine permitted and 21 refused.
  The hand-written shape test covers each enterpriseRoles member once per kind, exactly 30.
- ImportOrderLine remains exactly surveyor/commercial_manager/connector (all ten roles tested).
  ConfirmPrompt remains exactly supervisor/surveyor/commercial_manager, via its byte-identical
  normative row and existing exhaustive tests. The nine later command rows are unchanged.
- Coordinator diff removes exactly one source line and four original test lines as ordered;
  builder diff against HEAD contains no source edit or original test edit. Original lines 1–3
  and all 34 expanded merged test names/assertions remain byte-identical. No .skip/.todo/.only,
  retry, new timeout, dependency or standing hash test was introduced.
- Old line 21 (current 30) is byte-identical; source equals coordinator HEAD. origin.ts is
  byte-identical to draft and main. All six AL-6 rows pass on the current tree; invariance
  across the coordinator's source edit is source-inspected, not a claimed pre-change run.
- No new production-source import/export. One permitted new test import; no public export.
  All new role/kind/permission/fee expected values are hand-written literals, never derived
  from the implementation. Role enumeration is used only to assert table coverage.
- Lane line is a single insertion; no other lane line changes. No BUILD_PLAN, AGENTS,
  context-boundary test/pinned file, DB/API/web, package manifest or lockfile edit.
  No credential-shaped string introduced; new prose/test names use the issued wording.
- The full diff was read as a builder self-review. This is not independent verification.

Builder receipt only — not independently verified, not accepted.

## Dispatcher's additions and Mac run (12 Oct 2026)

- Commit f8df7f8 (dispatcher): one BUILD_PLAN.md section 12.2 ledger paragraph ("Ledger amendment — ENT-4a-ALIGN, 12 October 2026") and the lane line widened by `BUILD_PLAN.md` for that sentence only. `git diff 9488a35..HEAD -- packages/core/src/enterprise-domain/transitions.ts` is empty (the coordinator's rule change is untouched), and the builder's test commit removed no line of any existing test (`git diff 9488a35..HEAD -- transitions.test.ts` has no '-' lines).
- Mac, through `~/.local/bin/heavy-slot`, working directory `.worktrees/ent-4a-align`: `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/enterprise-domain/transitions.test.ts src/enterprise-domain/origin.test.ts src/enterprise-domain/boundaries.test.ts`: exit 0, 3 files, 276 tests passed (log `jg-runs/ent-4a-align-mac-core.log`); `pnpm typecheck`: exit 0 (log `jg-runs/ent-4a-align-mac-typecheck.log`); `LANE_BASE_REF=origin/main pnpm lint:lanes`: passed.
- Not run: database, browser, whole suites (pure core; GitHub's run is the whole-suite proof).
