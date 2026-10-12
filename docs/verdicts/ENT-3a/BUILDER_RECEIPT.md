# ENT-3a builder receipt — 11 October 2026

Builder: Codex (issued builder designation: GPT-6.1 Sol). Issued RED lane.
Base and unchanged checkout HEAD: `4564e888b85aba559c542e935e52fe9f78769595`;
`origin/main` equals that base at initial inspection. Branch:
`codex/sandbox/ent-3a`. No committed implementation head yet: `.git` is read-only;
the dispatcher commits this working tree and supplies its exact head to both
independent checkers. No git write, push, PR, merge, deployment or release.

**Built for review, held from merge and acceptance; A15 is partial.** Synthetic note-only
LogSiteExtra plus the founder's role-per-kind decision and stored-origin guard.
No screens, prices, photo, visits, state-cache edit, fees or external action.
No merged migration object altered or restated; no table or column added.
SQL and PostgreSQL tests are source-inspected, not test-executed in this sandbox.

## Authority, scope and overlaps

Founder “Use that default”, 11 October, card
`jobguard-ent4b-who-records-extras-2026-10-11`; issued integrator answers govern
the draft. The “site staff” mapping is operative and supervisor. Every other
plain-language role maps to its merged singular/snake-case name, as documented
in `docs/contracts/site-extra-v1.md`. The integrator owns the §12.2 ledger line
and pure-core alignment. BUILD_PLAN and AGENTS are unchanged.

Only ENT-3a is built. ENT-3b–3e remain separate issued work; ENT-4a, ENT-4b and
all merged tests/pinned bridges remain byte-identical. Nine shared registration
files overlap ENT-10d and later open lanes; this leaf is based solely on merged
main, and the integrator owns their single mechanical catch-up. ENT-4c's
extra-repository overlap is avoided entirely; SV-2's extra_origin is unchanged.

Q5 limit: the rule binds the governed path, **not every database writer**.
[A18] enforces the sole application caller. Merged direct owner fixtures are
still structurally allowed, and separate fixture alignment/table guard work is
owed under the integrator's fix-later ruling.

Q10 **HELD**: no signed-in person can reach success in today's practice sandbox.
Persisted contractor sessions can only be owner sessions; the founder's rule
does not permit owners to log site extras. Success is covered at stubbed-session
service level and implemented/tested in the governed PostgreSQL path, but those
PostgreSQL tests are NOT RUN here. F2 sign-in/switching needs separate authority.

## Context route — explicit merge hold (Q3)

This is a **second copy of the ENT-10b adapter pattern**. The entire adapter is
in one small named function, `contextForContractorSession`, in
`apps/api/src/contractor/site-extra.application.ts`. It takes the session ID and
the unchanged membership returned by merged `ContractorRepository.resolveSession`;
its private inert AuthProvider feeds the one real
`resolveVerifiedTenantContext`. All callers in this piece pass through this one
function; no context is made, cast, copied, stored or returned by a repository.
No request body/query/header/path selects tenant or member. [A17] verifies the
persisted member reaches the real bridge and the resulting stamp passes merged
withTenant's real check; the transport canaries prove alternate authority data
cannot change it. Internal bridge credentials are runtime-bound values and
carry no commercial authority.

ENT-10b Opus later item 2, quoted using the issued wording substitution:

> “apps/api/src/audit-export/audit-export.application.ts:34-45 obtains the tenant
> context by handing the real bridge a hand-made AuthProvider with a constant
> CSRF token and a fictional origin; [not a weakness] (tenant comes from the
> database session lookup) but it is an
> eighth practice-session route that the scanner's approved, hash-pinned list
> does not cover. Move construction into the db repository and add it to the
> scanner list through a reviewed scanner edit.”

The coordinator's 11 October ruling permits construction of this copy but
**forbids this piece merging until one shared reviewed bridge exists and this
function is switched to it**. That separate reviewed work is NOT DONE here;
there is no authority in this order to amend the scanner. Both RED checkers must
examine this path. Scanner and all seven pinned files are unchanged.

## Rule as built

| Raising command | Membership role | Merged permission on job | Additional condition |
|---|---|---|---|
| LogSiteExtra | operative | extra.log | named on current job revision |
| LogSiteExtra | supervisor | extra.log | — |
| LogSiteExtra | surveyor | job.read | — |
| RecordOfficeExtra | owner, admin | organisation.manage | — |
| RecordOfficeExtra | finance | data.import | — |
| RecordClientInstruction | owner, admin, commercial_manager | contract.manage | — |
| All other pairs; ConfirmPrompt for every role | — | refused | — |

The only executable rule list is the nine-row VALUES expression in the decision
routine. Scope/activity/assignment use merged functions. Grant selection is the
lowest covering unrevoked grant of the membership's own role, checked again on
stored origin inside the command transaction. Error bodies contain only version
and closed code. A refusal's separate audit is coalesced by derived ID plus an
advisory lock before the final audit-head lock. UUIDs in the derived refusal ID use lower-case
spelling so upper/lower command ID retries coalesce, too. This is a reversible local
implementation choice, not new product policy. Q14 keeps the original refusal
if recording it fails; no operational alert is added here.

## Definitions — implementation map

All binding definitions are copied in the contract; each is BUILT within this
part unless explicitly HELD below. Their names and implementation anchors:

| Definition | Status and anchor |
|---|---|
| Work-order job | BUILT — routine's job/track/order join |
| Current revision; baseline in force | BUILT — merged ENT-4b stored value; [A2] |
| Cancelled order | BUILT — current revision status check; [A4] |
| Extra | BUILT — only merged raiseExtra writes it; [A2], [A18] |
| Kind; command type | BUILT — merged SH-1 mapping and fixed module constant; ConfirmPrompt HELD ENT-8a |
| Caller; member | BUILT — persisted resolveSession only; [A8], [A17] |
| Caller's role | BUILT — membership role plus merged origin/grant checks; [A1], [A4] |
| Active member | BUILT — merged contractor_member_active; [A5], [A14] |
| Site staff | BUILT — operative/supervisor under issued Q4 |
| Permission holds for job | BUILT — merged contractor_job_allowed; [A1], [A4] |
| Named on job | BUILT — merged contractor_job_assigned; [A2], [A4] |
| Rule | BUILT — matrix above and [A1]'s 36 separately named cases |
| Raising grant | BUILT — lowest ID lookup; [A6], [A16] |
| Decision routine | BUILT — ent3a_extra_authority; [A1], [A13], [A14] |
| Guard | BUILT — ent3a_require_extra_authority; [A6], [A7], [A14] |
| Governed path | BUILT — SiteExtraRepository.logSiteExtra plus seam; [A18] |
| Caller-only refusal | BUILT — EXTRA_FORBIDDEN, identical four-target errors; [A3] |
| Job refusal | BUILT — NOT_FOUND, deep-equal cause errors; [A4] |
| Nothing written | BUILT — seven business counts and raised audit count; [A3]–[A12] |
| Replay | BUILT — no new writes, current pre-check; [A5], [A9] |
| Conflict | BUILT — note/member/selected-grant change; [A9] |
| Authority fields | BUILT — strict schema; each field's [A8] case |
| Synthetic only | BUILT — mode, environment, zero external actions; [A15] |

## Acceptance map

P = packages/core/src/site-extra.test.ts;
U = apps/api/src/contractor/site-extra.application.test.ts;
W = apps/web/app/api/contractor/jobs/[id]/site-extras/route.test.ts;
D1 = packages/db/test/site-extra-authority.integration.test.ts;
D2 = packages/db/test/site-extra.integration.test.ts.
“BUILT” for a database assertion means code and test written, **NOT RUN**, not
an execution verdict. Both D files and their shared fixture were written before
implementation. Every leaf-owned test title starts with its [A] ID.

| ID | Status; named test/evidence |
|---|---|
| A1 | BUILT, D1 NOT RUN — `[A1] <role> / <command>` (36 cells), unknown/NULL command |
| A2 | BUILT, D2 NOT RUN — `[A2] <role> logs only server-derived facts atomically` (3 roles); DB before/after timestamps, hash, receipt/event/audit/chain |
| A3 | BUILT, D2 NOT RUN — `[A3] <role> refusal is caller-only for four targets and writes no business facts` (6 roles) |
| A4 | BUILT, D1/D2 NOT RUN — `all job failures have the same decision`; `every inaccessible job cause has identical NOT_FOUND and no business effect` |
| A5 | BUILT, D2 NOT RUN — `<grant/membership> revocation refuses new work and earlier replay` |
| A6 | BUILT, D2 NOT RUN — `seam alone refuses owner, permits supervisor and refuses an unchosen covering grant` |
| A7 | BUILT, D2 NOT RUN — `two concurrent commands on independent pooled connections have one effect`; `<revoke/log> commits first under the shared administration lock, without sleeps` |
| A8 | BUILT — P minimal input/each field/empty note/limits; U identical session object/four fields/each authority field; W parsed body/path and body refusals |
| A9 | BUILT, D2 NOT RUN — `exact replay, conflicting note/member/grant and equal text with separate IDs` |
| A10 | BUILT, D2 NOT RUN — `tenant mismatch, foreign job, missing/unstamped contexts cannot touch tenant B` |
| A11 | BUILT, D2 NOT RUN — `latest small-builder tenant assignment is TRACK_FORBIDDEN` |
| A12 | BUILT, D2 NOT RUN — `every refusal reason is durable once, scoped, attributable and contains no free text`; `concurrent refusal writers coalesce; audit append failure retains identical typed refusal` |
| A13 | BUILT, D1 NOT RUN — `populated upgrade changes only two routines; ownership, specific grants and idempotent registration` |
| A14 | BUILT, D1 NOT RUN — `is total and read-only for NULLs, absent, empty, malformed and foreign tenant membership`; `guard fails closed for absent, empty, malformed tenant settings and missing stored origins` |
| A15 | PARTIAL BUILT — U/W mode/session/origin/status/redaction/adapter no-store tests, Next malformed JSON; P closed schema/status/result. HELD — Nest pre-controller malformed-JSON envelope/no-store needs registration beyond the issued single-controller limit (new blocking finding below) |
| A16 | BUILT, D1 NOT RUN — each tenant/team/branch/region covering and non-covering lookup/merged-trigger pair |
| A17 | BUILT — U real bridge/stamp tests; W `tampered tenant/member/role in every transport place cannot select context` |
| A18 | BUILT — U source scan `sole application caller uses the guard; repository has no direct writes or replaceable command type` |
| A19 | BUILT/executed — unedited scanner 145 cases, SHA preservation recorded below |
| A20 | HELD to integrator execution — twelve unedited PostgreSQL regressions; NOT RUN, sandbox restriction |

## Migration and exact privileges

`0126_site_extra_authority.sql`, registered after 0122 by name and increasing
order (never asserted last). Exactly two routines:

```sql
app.ent3a_extra_authority(p_actor uuid, p_command_type text, p_job uuid)
RETURNS TABLE(decision text, reason_code text, raising_grant uuid)
app.ent3a_require_extra_authority(p_job uuid, p_variation uuid) RETURNS void
ALTER FUNCTION app.ent3a_extra_authority(uuid,text,uuid) OWNER TO jobguard_migration;
ALTER FUNCTION app.ent3a_require_extra_authority(uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.ent3a_extra_authority(uuid,text,uuid),app.ent3a_require_extra_authority(uuid,uuid) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.ent3a_extra_authority(uuid,text,uuid),app.ent3a_require_extra_authority(uuid,uuid) TO jobguard_runtime;
```

PL/pgSQL, SECURITY INVOKER, search_path=pg_catalog; decision STABLE, guard
VOLATILE. No SECURITY DEFINER, merged object redefinition, table grant, table,
column, index, trigger, constraint, policy, backfill or row mutation. Runtime
role unchanged. Forward fix/route-disable strategy recorded in MIGRATIONS.md;
no historical-data rollback required. Catalogue assertions are written, NOT RUN.

## Checks — environment and results

Node `v24.17.0` observed; repository .nvmrc `24.15.0`, engine Node 24.
Dependencies preinstalled; no package install or download completed. The initial
`pnpm --version` via the default launcher exited 1 after automatic version
selection failed: `Refusing to run pnpm@10.28.1: its npm registry signature could
not be verified` with `fetch failed` for its registry candidates. checks used already-cached
pnpm 10.28.1 via a /private/tmp/ent3a-bin/pnpm wrapper. Every command below used
`PATH=/private/tmp/ent3a-bin:$PATH` so child pnpm calls use the same pinned cache.
No socket/database/browser was started. Vitest maxWorkers=2, at most three files,
one run at a time. Turbo builds use concurrency=2. Cached old-worktree log paths
are turbo replay output, not newly executed commands in those directories.

- First `pnpm turbo run build --concurrency=2 --filter=@jobguard/core...`: exit 2,
  missing site-extra module (test written first), 0/1 successful tasks.
- **Failed-first unit run:** `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/site-extra.test.ts`:
  exit 1, one failed suite, zero collected tests; missing `./site-extra.js` before
  implementation. This is a missing-module failure, not a behavioural red case.
- Core build after implementation: exit 0, 1 task. Same core unit command:
  exit 0, 1 file / 35 tests passed.
- `pnpm turbo run build --concurrency=2 --filter=@jobguard/api...`: first exit 2
  (4 successful/5 total; cross-package Zod schema composition TS2589), second
  exit 1 (5/6; test verifyCode arguments), third exit 0 (6/6, 2 cached).
  Corrected by a local strict repository schema and the correct test signature.
- `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/contractor/site-extra.application.test.ts src/auth/context-boundary.test.ts src/audit-export/audit-export.application.test.ts`:
  exit 0, 3 files / 192 tests passed (34 leaf, 145 scanner, 13 ENT-10b).
- `pnpm --filter @jobguard/web exec vitest run --maxWorkers=2 "app/api/contractor/jobs/[id]/site-extras/route.test.ts" app/api/contractor/route.test.ts`:
  first exit 1 (new suite transform failed: duplicate local response declaration;
  unedited regression 7 passed); after correcting the local name exit 0,
  2 files / 34 tests passed (27 leaf, 7 regression). Repeated after test type
  annotation/status assertions: exit 0, 2 files / 34 tests passed.
- `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts`:
  exit 0, generated one new path. Existing path values and every other OpenAPI
  root field compared structurally equal to origin/main (executed read-only).
- Turbo printed `WARNING IO error: Operation not permitted (os error 1)` for
  shared cache writes; successful tasks still exited 0. No cache permission was
  changed or check bypassed.

Final root-check results are appended after execution below.

## NOT RUN — integrator commands and reason

Every command in this section is **NOT RUN (sandbox cannot start PostgreSQL / a
browser)**. Do not infer a pass from the written tests or green mocked unit tests.
Run one call at a time, at most three files, maxWorkers=2:

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/site-extra-authority.integration.test.ts test/site-extra.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/extra-origin.integration.test.ts test/extra-links.integration.test.ts test/extra-origin-upgrade.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/shared-money-origin.integration.test.ts test/work-order-import.integration.test.ts test/contractor.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/job-scheduling.integration.test.ts test/tenancy.integration.test.ts test/demo-bootstrap.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/fingerprinted-row-shape.integration.test.ts test/recovery-follow-up-upgrade.integration.test.ts test/audit-export.integration.test.ts
pnpm --filter @jobguard/web exec playwright test --project=mobile-360 --project=desktop ENT-2.spec.ts ENT-10b.spec.ts
```

The introduced migration catalogue/upgrade checks and prior mandatory suites
remain enforced in the existing CI; no check/script/test was weakened. No own
browser spec: C1 server slice and C7 inapplicable while UI is parked. No AI eval
applicability: no AI model, prompt, parser, matcher or gateway change.

## HELD items and owed work

- Q3 shared reviewed context bridge and switch: explicit **merge hold**.
- Q5 all-writer authority: this rule governs application path only; integrator
  schedules merged fixture alignment and eventual table guard.
- Q6 old plan/pure-core raising lists: integrator ledger + separate alignment;
  this leaf neither edits BUILD_PLAN nor ENT-4a nor calls transitionExtra.
- Q7 RecordOfficeExtra/RecordClientInstruction routes: no scheduled card here.
- Q8/F1 fee consequence for surveyor or unassigned supervisor: founder money
  decision before ENT-5/ENT-7; capture authority does not grant fee entitlement.
- Q10/F2 operative sign-in/sandbox actor switching: success not reachable by
  current owner-only session, expressly accepted as held for this part.
- Q11 selected-grant replacement replay conflict: as issued; fix-later item.
- Q13 first revision, SoR, quantities, pricing, order check: ENT-3c; unpriced row
  cannot fit merged priced revision and pricing basis remains held.
- UI/screens/accessibility/browser journey: founder parked UI, ENT-3e.
- Visits/close-out record and API question: ENT-3b.
- Photo and resident confirmation/evidence gates: ENT-3d.
- State rules/submission/variation.state: ENT-5.
- ConfirmPrompt: ENT-8a; universally refused by this routine.
- Linking/unlinking: ENT-4c/ENT-5; no merged extra-repository edit.
- Fees: ENT-7, D16. No pricing or money action in this piece.
- Q14 audit-refusal write failure alerting: not built; original refusal preserved.
- Nest pre-controller malformed-JSON envelope/no-store: A15 partial, additional
  global error registration exceeds the issued single-controller allowance.
- Fresh Claude Opus + separate Sol RED verdicts (at most two repair rounds),
  exact dispatcher head and independent separate acceptance: not performed.
- Remaining release gates: D16, G1, ENT-14, UI. No approval inferred.

## Self-review

Re-read the issued order, full new code/tests/contract and
`git diff origin/main` (read-only), including untracked lane files separately.
Checked every [A] line, exact meanings, nine authority rows, no client authority
path, constant raising type, unchanged caller object, no context container or
constructor, seam guard only, append-before-final-audit lock order, total decision
and fail-closed guard/answer parser, explicit two-signature grants, caller/job
refusal equality, no business effects on refusal, no secret literal patterns,
no lane widening and preservation of pinned/merged SQL/test bytes.

Corrections made locally: separate Zod schema to avoid cross-package type
composition; correct verifyCode test arguments; rename duplicated test response;
annotate the workspace mock's plain service interface; give small-track fixtures
the merged required audit event; make non-covering tenant-scope fixture really
use a tenant grant and reach the merged insert trigger on an in-tenant job
with a foreign tenant grant; use a different-role covering grant that actually
has the required merged permission to prove own-role selection; compare exact
totality reasons; add guard malformed-setting
cases, deterministic refusal ID assertions and canary checks; wrap each pooled
client only once in fault/race spies to prevent a reissued client recursively
calling its replaced mock; isolate the 0126 catalogue delta before applying any
future migrations, then compare repeat migrator output for idempotency. Canonicalize the refusal ID command UUID spelling and add a case-alias retry
assertion. No assertion in a merged file was changed. First failing unit evidence is the missing-module run
stated above; database tests were not executed. Test and catalogue limitations
are explicit, not pass claims. Final preservation/hash/lane evidence follows.

Builder receipt only — not independently verified, not accepted.

## Byte preservation — executed deterministic checks

| File | SHA-256 (equal to issued base / origin/main at initial check) |
|---|---|
| `apps/api/src/auth/context-boundary.test.ts` | `7f1914846f763c3534ffafc79701fc6f768e8e1546be2fe98e27bc32a99e0e8d` |
| `packages/db/src/practice-session.ts` | `9b765f410777c28334f9f7d8388e0a3c6e30f52bb6d4b4070c9b69e4ecbf1b14` |
| `packages/db/src/contractor-repository.ts` | `56b95b80360434f0cf58376ef2ec44d0354b194e5080bcfd9414ac283971006c` |
| `packages/db/src/contractor-party-repository.ts` | `e5852288e5355b53f7548c4d5741aef54ee55a2b8a66dd56a54b08963cd1fdb0` |
| `packages/db/src/work-order-repository.ts` | `4d101604ad160801f1d70b24ee7e3f55287bed2f3d53b9ed83b3d0113d4580a3` |
| `packages/db/src/sor-repository.ts` | `45e54b465b2a12747d838ea1cbb7c6a8d859f12894848940be5401ab17e000d5` |
| `packages/db/src/job-scheduling-repository.ts` | `ce9b3fee004db9e7e303511f169d55b4a8a2339521927816c9b378b79517e52d` |
| `packages/db/src/work-order-fixtures.ts` | `cfcd6d41a3618dd626544b3443e52fdba2c879accacb38637e49e531b4137386` |
| `packages/db/test/extra-origin.integration.test.ts` | `3d49f5722de606c91b1f2802e59617a230d9fc7a2ceeb320cf50e4cf2cd9c68e` |
| `packages/db/test/extra-links.integration.test.ts` | `d76652949390c3d0e216557d960559052a6a40f9b76d248340e5c03fc4a57445` |
| `packages/db/test/extra-origin-upgrade.integration.test.ts` | `857fbbc4b93a33e3a6a0c891f0cb160133bf8756dacd9f2b0b535677761851db` |
| `packages/db/test/shared-money-origin.integration.test.ts` | `dd75952775d672e164bb97df1247cd0a6f5199e9b68510074489201e81db897e` |
| `packages/db/test/work-order-import.integration.test.ts` | `d2d9448e46c79fcba822fb8d3b0276e4b07df20309d53c2d31e3aba733324db4` |
| `packages/db/test/contractor.integration.test.ts` | `874f3076f51bf0b18cecf34d979f7090bf703eab97040bdba674b2842ce6e071` |
| `packages/db/test/job-scheduling.integration.test.ts` | `f72ed51fa0cfd0f7241956ba593665992c0a963157c9cad482dfa11b1acd22b5` |
| `packages/db/test/tenancy.integration.test.ts` | `443e068f784cd594b0ba7745294b4137bb57d7fdd3388f286f11a4ba952f7312` |
| `packages/db/test/demo-bootstrap.integration.test.ts` | `9105566ea61864253a0ee7de158dbe6b076b5538457b454e75d97f33ce684b8f` |
| `packages/db/test/fingerprinted-row-shape.integration.test.ts` | `99d626e0c214d39318450128e198db8cf5b91dbd3d0fa112c06c6247f2bf7d91` |
| `packages/db/test/recovery-follow-up-upgrade.integration.test.ts` | `fd28b185b6fcc221640ecc50d5becd8b691bf09d0394e6b6b5a10cbf83cd2402` |
| `packages/db/test/audit-export.integration.test.ts` | `99d1b31a941ada69c31b0d9184b00ce8cbebf0efa0c14b6dbec749529ce70c45` |

All tracked merged tests, earlier SQL migration files, the scanner and its seven pinned files compare byte-identical to the issued base (origin/main at the initial check). This is a deterministic byte check, not a model review or database test.

## Shared registrations — exact additions

Preservation script removed only these additions and compared the remainder
byte-identical to the issued base (origin/main at that check) (OpenAPI structurally equal). All nine passed.

`packages/core/src/index.ts`:

```ts
export * from "./site-extra.js";
```

`packages/db/src/index.ts`:

```ts
export * from "./site-extra-repository.js";
```

`apps/api/src/workspace/index.ts`:

```ts
export { SiteExtraApplication, assertSiteExtraMode, siteExtraHttpFailure } from "../contractor/site-extra.application.js";
```

`packages/db/src/migrate.ts`:

```ts
  new URL("../migrations/0126_site_extra_authority.sql", import.meta.url),
```

`apps/api/src/app.module.ts`:

```ts
import { SiteExtraController } from "./contractor/site-extra.controller.js";
SiteExtraController,
```

`apps/api/src/workspace/application.ts`:

```ts
import { SiteExtraApplication } from "../contractor/site-extra.application.js";
  const siteExtras = new SiteExtraApplication(dependencies.pool);
siteExtras: Object.freeze({ log: (jobId: string, raw: unknown) => siteExtras.log(contractorPrincipal, jobId, raw) }),
```

`packages/db/MIGRATIONS.md`: one appended section `## 0126 — site extra authority (ENT-3a)` (the full section is the registration/strategy evidence).

`config/agent-lane-assignments.json`: exactly the issued compact `ent-3a` line, after `ent-2`, before `ent-4a`; all 23 allow entries; no other line altered.

`apps/api/openapi.json`: exactly the added `/contractor/jobs/{id}/site-extras` POST path; existing paths and all non-path root fields equal.

The first ad hoc lane-preservation script incorrectly treated literal `[id]`
paths as glob character classes and exited 1; corrected to exact-file membership
plus the explicit receipt-directory wildcard, exit 0, all 23 changed files in
lane. This was a checker-script correction outside the repository, not a lane
change. Local literal-pattern scan found zero findings; GitHub's required scan
remains owed on the dispatcher commit.

## Final checks — executed results

- `pnpm typecheck --concurrency=2`: exit 0, 7/7 tasks successful, 2 cached.
  The extra turbo flag enforces the issued memory limit; root typecheck ran once.
- `LANE_BASE_REF=origin/main pnpm lint --concurrency=2`: exit 1. Core purity
  passed (131 TypeScript files), then unchanged lane checker refused:
  `Missing branch or self-comparison range; refusing a misleading pass.`
  At those check invocations HEAD and origin/main were both the issued base
  because the dispatcher had not committed; root lint ran once. No ref spoofing or weakening was attempted.
- `LANE_BASE_REF=origin/main pnpm lint:lanes`: exit 1, the identical
  self-comparison refusal. **HELD until dispatcher commit**, then rerun normally.
- Unreached root-lint stages executed separately once: `node tools/money-arithmetic-lint.mjs`
  exit 0 (`Money arithmetic boundary check passed.`);
  `node tools/commercial-boundary-lint.mjs` exit 0 (no output);
  `pnpm turbo run lint --concurrency=2` exit 0, 7/7 package lint tasks, 2 cached.
  This evidence does not make the failed root/lane checks a pass.

- `pnpm build --concurrency=2`: exit 0, 7/7 tasks successful, 2 cached,
  27 static pages generated. Next's route table contains
  `/api/contractor/jobs/[id]/site-extras`. Root build ran once.
  Observed warnings: inferred parent workspace root/multiple lockfiles,
  unchanged CSS `end` values with mixed support, webpack warning-cache
  serialization, and shared turbo cache IO permission. No related file edited.

OpenAPI check result follows after completion.

- `pnpm openapi:check`: exit 1 **before comparison**, sandbox
  `listen EPERM: operation not permitted` on
  `/var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/18124.pipe`.
- Issued fallback, sequentially: `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts`
  exit 0; `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check`
  exit 0. Same generator and comparison, without the CLI IPC socket; no assertion
  or generator changed. Initial generation above also exited 0.

A final self-review correction after the once-only root checks canonicalized the
command UUID spelling in the refusal ID seed and added the PostgreSQL case-alias
retry assertion. Public payload/reference spelling stays unchanged. The root
checks were not repeated under the issued memory rule; an affected API/dependency
build and the permitted API/scanner/regression files are rerun below to verify
the final source. Full CI and the refused root/lane lints remain owed.

## Main advanced during this build — catch-up owed

Initial origin/main and checkout HEAD were both the issued base 4564e88.
During the final checks origin/main advanced to
`8e91b2d2e28564b8a19aa5293041bfae1e551485` (FIXLATER-3, #140), while this
checkout remained at the issued base. No newer main/test content was copied or
edited. The preserved test hashes above are against the issued base and
origin/main **at the initial preservation check**, not a claim that FIXLATER-3's
updated tests now equal the older checkout. Scanner and its seven pinned sources
still equal current origin/main. The dispatcher/integrator must catch up the
committed leaf onto latest main before CI/review, keeping FIXLATER-3's changes.

The final inventory/scan script initially used the moving origin/main ref, so
it mistakenly included main-only test deltas and an absent FIXLATER-3 receipt,
then exited 1 reading that absent file. Corrected the inventory to `git diff HEAD`
plus untracked paths; exactly 23 actual lane files. No main-only file was
written or removed by this leaf. Final preservation was rerun against the fixed
issued base below. No git-write command used.

## Changed files — final lane inventory

- `apps/api/openapi.json`
- `apps/api/src/app.module.ts`
- `apps/api/src/contractor/site-extra.application.test.ts`
- `apps/api/src/contractor/site-extra.application.ts`
- `apps/api/src/contractor/site-extra.controller.ts`
- `apps/api/src/workspace/application.ts`
- `apps/api/src/workspace/index.ts`
- `apps/web/app/api/contractor/jobs/[id]/site-extras/route.test.ts`
- `apps/web/app/api/contractor/jobs/[id]/site-extras/route.ts`
- `config/agent-lane-assignments.json`
- `docs/contracts/site-extra-v1.md`
- `docs/verdicts/ENT-3a/BUILDER_RECEIPT.md`
- `packages/core/src/index.ts`
- `packages/core/src/site-extra.test.ts`
- `packages/core/src/site-extra.ts`
- `packages/db/MIGRATIONS.md`
- `packages/db/migrations/0126_site_extra_authority.sql`
- `packages/db/src/index.ts`
- `packages/db/src/migrate.ts`
- `packages/db/src/site-extra-repository.ts`
- `packages/db/test/site-extra-authority.integration.test.ts`
- `packages/db/test/site-extra-fixtures.ts`
- `packages/db/test/site-extra.integration.test.ts`

23 changed files: 9 existing registration files and 14 new files (including the receipt). Intended commit message: `/private/tmp/jg-msg-ent-3a.txt`.

## Final source verification and output cleanup

- After refusal UUID normalization: `pnpm turbo run build --concurrency=2 --filter=@jobguard/api...`
  exit 0, 6/6 tasks, 2 cached; same API/scanner/ENT-10b Vitest command as above
  exit 0, 3 files / 192 tests passed. Final leaf/scanner sources passed.
- Final deterministic preservation/actual-lane/literal script: exit 0; 23 files
  match issued lane, all tracked merged tests and SQL migrations byte-identical
  to the fixed issued base, zero literal-pattern findings. This is not an
  independent model verdict or GitHub scan.
- Generated outputs removed (untracked only, no directory-link traversal):
  - `.pnpm-store`
  - `apps/web/.next`
  - `apps/web/.turbo`
  - `apps/web/tsconfig.tsbuildinfo`
  - `apps/api/dist`
  - `apps/api/.turbo`
  - `packages/core/dist`
  - `packages/core/.turbo`
  - `packages/config/dist`
  - `packages/config/.turbo`
  - `packages/storage/dist`
  - `packages/storage/.turbo`
  - `packages/ai/dist`
  - `packages/ai/.turbo`
  - `packages/db/dist`
  - `packages/db/.turbo`

No PostgreSQL or browser run occurred. No files under other lanes were edited.
No build output, .pnpm-store or test-results remains in this working tree.
Full post-commit CI (including root/lane lint on the catch-up head) and the
shared-bridge merge prerequisite remain held.

Builder receipt only — not independently verified, not accepted.

## New BLOCKING scope finding — Nest pre-controller malformed JSON (A15)

Source-inspected, not HTTP-tested (sandbox cannot bind a socket): installed
`@nestjs/core` 11.2.3 `router/routes-resolver.js`, registerExceptionHandler and
mapExternalException, map Express body-parser SyntaxError to BadRequestException
in a global exception context before this route's controller is reached. The
existing APP_FILTER registrations handle only WatchdogError and
PracticeAccessError. Therefore that malformed HTTP request gets Nest's generic
400 body and no controller `Cache-Control: no-store`, rather than
`site-extra-error.v1 / INVALID_COMMAND`. Next malformed JSON is covered and
passes; the direct-controller unit cases do not prove a Nest HTTP parser path.

The order restricts app.module.ts to one controller registration. A global
filter/parser registration is needed to fix this path; it is not authorized by
that existing-file append allowance, and no other global bootstrap/filter file
is in this lane. **STOPPED that edit**, with no lane widening, global hook hidden
in a controller, merged-file edit or check weakening. The Nest route is built
for valid JSON and service errors, but its pre-controller malformed-JSON
envelope/no-store portion is **NOT DONE**. A15 is explicitly partial/held, so
this receipt makes no acceptance claim. Integrator must issue the scoped
registration change and add real HTTP parser coverage before acceptance.

Builder receipt only — not independently verified, not accepted.

## Mac verification and upgrade-proof reshape (rule 9)

Run on the Mac by a repair helper (Claude Sonnet) for the JobGuard integrator, 12 October 2026 (the runs began late on 11 October).
Local only: nothing pushed, no pull request. This section records what the helper changed and ran; it reviews and accepts nothing.

**Merge commit (main caught up).** `git fetch origin`, then `git merge origin/main` in the worktree. Local merge commit
`76076fd8d07da2905f6fee1e0bc1ce0d82870669` (parents `968ad93c409394e514379d93f81b5a388ec28e02` and main `8e91b2d2e28564b8a19aa5293041bfae1e551485`).
No conflict. The only shared registration file touched by both sides was `config/agent-lane-assignments.json`; git merged it automatically and both sides are kept
(`fixlater-3` added by main, `ent-3a` kept). `0126_site_extra_authority.sql` is still listed in `packages/db/src/migrate.ts` directly after `0122_extra_origin_persistence.sql`.

**The standing rule (quoted).** "An upgrade proof proves ITS OWN migration only: install everything before N, snapshot, apply N alone, compare; then apply everything after N and require success twice. Compare existing rows by named pre-existing columns after all migrations. Never assert that later migrations add no column or replace no function; the fingerprinted-table guard owns 'may never gain a column'." Here N is 0126.

**What the upgrade test already did, and what was missing.** In `packages/db/test/site-extra-authority.integration.test.ts` (test `[A13] populated upgrade changes only two routines; ownership, specific grants and idempotent registration`), as committed at `968ad93` and unchanged by the merge, the test already:
installed everything before 0126 by hand (`cluster(true)` for everything before 0122, then the loop over 0122 up to but not including 0126), took the catalogue and content snapshots, applied 0126 ALONE by hand
(`readFile` then `up.admin.query`, then the plain `INSERT INTO public.jobguard_schema_migration`, the pattern of `packages/db/test/extra-fixtures.ts:35` and the runner at `packages/db/src/migrate.ts` lines 79-83),
compared the catalogue (classes, columns, constraints, triggers, policies, roles, and every function not named `ent3a_*`) and the content hashes at full strength, and only then ran `migrate()` twice with the idempotence assertion (lines 126-127). So the whole-catalogue comparisons were already taken after 0126 alone, not after later migrations, and they are kept byte-identical.
What was missing: nothing compared the pre-existing rows or the pre-existing columns after ALL migrations. The helper added exactly that, plus the controls the integrator asked for. No existing line was changed, moved or removed.

**Added to that test (the only change to it); literal unified diff against `HEAD` (zero context lines, so nothing existing appears except as an anchor):**

```diff
diff --git a/packages/db/test/site-extra-authority.integration.test.ts b/packages/db/test/site-extra-authority.integration.test.ts
--- a/packages/db/test/site-extra-authority.integration.test.ts
+++ b/packages/db/test/site-extra-authority.integration.test.ts
@@ -112,0 +113,13 @@ describe("ENT-3a authority", () => {
+   // Upgrade-proof rule: pre-existing rows are compared by NAMED pre-existing columns, as canonical text from the database, together with each such column's
+   // name and full type, after every later migration has run. Columns added later are never listed; triggers, functions, policies and grants are not compared there.
+   const kept = ["extra_origin", "variation", "role_grant", "command_receipt", "audit_event"];
+   type Run = (sql: string, values?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
+   const viaAdmin: Run = (sql, values) => up.admin.query(sql, values);
+   const preColumns: Record<string, string[]> = {};
+   for (const t of kept) preColumns[t] = (await viaAdmin("SELECT a.attname::text AS name FROM pg_attribute a WHERE a.attrelid=$1::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attname::text COLLATE \"C\"", [`app.${t}`])).rows.map(x => x.name as string);
+   const columnTypes = async (run: Run) => { const r: Record<string, string[]> = {}; for (const t of kept) r[t] = (await run("SELECT a.attname::text||' '||format_type(a.atttypid,a.atttypmod) AS column_type FROM pg_attribute a WHERE a.attrelid=$1::regclass AND a.attnum>0 AND NOT a.attisdropped AND a.attname::text=ANY($2::text[]) ORDER BY a.attname::text COLLATE \"C\"", [`app.${t}`, preColumns[t]])).rows.map(x => x.column_type as string); return r; };
+   const namedRows = async (run: Run) => { const r: Record<string, string[]> = {}; for (const t of kept) r[t] = (await run(`SELECT row_to_json(snap)::text AS bytes FROM (SELECT ${preColumns[t]!.map(n => `"${n}"`).join(",")} FROM app.${t}) snap ORDER BY row_to_json(snap)::text COLLATE "C"`)).rows.map(x => x.bytes as string); return r; };
+   const proof = async (run: Run) => ({ columnTypes: await columnTypes(run), rows: await namedRows(run) });
+   const baseline = await proof(viaAdmin);
+   for (const t of kept) expect(baseline.rows[t]!.length, `${t} holds at least one pre-existing row`).toBeGreaterThan(0);
+   const holds = async (run: Run) => { expect(await proof(run)).toEqual(baseline); };
@@ -127,0 +141,21 @@ describe("ENT-3a authority", () => {
+   // Every migration after 0126 has now run twice: the pre-existing rows and the name-and-type list of the pre-existing columns still read as before 0126.
+   await holds(viaAdmin);
+   // Controls: each runs in a rolled-back transaction and uses the very same comparison (holds) as the proof above.
+   const rolledBack = async (change: (run: Run) => Promise<void>, then: (run: Run) => Promise<void>) => { const client = await up.admin.connect(); const run: Run = (sql, values) => client.query(sql, values); try { await client.query("BEGIN"); await change(run); await then(run); } finally { await client.query("ROLLBACK"); client.release(); } };
+   const fails = (run: Run) => expect(holds(run)).rejects.toMatchObject({ name: "AssertionError" });
+   // (a) One pre-existing value changed (a timestamp by ONE microsecond where the table has one) must fail the row comparison.
+   const edits: Record<string, string> = { extra_origin: "server_recorded_at=server_recorded_at+interval '1 microsecond'", variation: "created_at=created_at+interval '1 microsecond'", command_receipt: "created_at=created_at+interval '1 microsecond'", audit_event: "occurred_at=occurred_at+interval '1 microsecond'", role_grant: "scope_id=gen_random_uuid()" };
+   for (const t of kept) await rolledBack(async run => { await run("SET LOCAL session_replication_role=replica"); expect((await run(`UPDATE app.${t} SET ${edits[t]} WHERE ctid=(SELECT ctid FROM app.${t} LIMIT 1)`)).rowCount).toBe(1); }, async run => { const now = await proof(run); expect(now.columnTypes).toEqual(baseline.columnTypes); expect(now.rows[t]).not.toEqual(baseline.rows[t]); await fails(run); });
+   // (b) One pre-existing column given another type modifier must fail the name-and-type comparison while every row still reads the same.
+   await rolledBack(async run => { await run("ALTER TABLE app.variation ALTER COLUMN description TYPE varchar(501)"); }, async run => { const now = await proof(run); expect(now.rows).toEqual(baseline.rows); expect(now.columnTypes.variation).not.toEqual(baseline.columnTypes.variation); await fails(run); });
+   // (c) A nullable column added later and an existing function replaced after 0126's step must leave the proof passing.
+   const functionBody = "SELECT p.prosrc AS body FROM pg_proc p WHERE p.pronamespace='app'::regnamespace AND p.proname='contractor_member_active' ORDER BY p.oid LIMIT 1";
+   await rolledBack(async run => {
+    for (const t of kept) await run(`ALTER TABLE app.${t} ADD COLUMN ent3a_added_later text`);
+    const original = (await run("SELECT pg_get_functiondef(p.oid) AS definition FROM pg_proc p WHERE p.pronamespace='app'::regnamespace AND p.proname='contractor_member_active' ORDER BY p.oid LIMIT 1")).rows[0]!.definition as string;
+    const bodyBefore = (await run(functionBody)).rows[0]!.body as string;
+    const replaced = original.replace(/\$function\$\s*$/, () => "-- replaced after 0126 by the control\n$function$");
+    expect(replaced).not.toBe(original);
+    await run(replaced);
+    expect((await run(functionBody)).rows[0]!.body).not.toBe(bodyBefore);
+   }, holds);
```

Literal BEFORE lines at the two insertion points (unchanged, still present in the file as the lines directly above each insertion):

```text
   const before = await catalog(), data = await content();
   await migrate(up.admin); expect(await catalog()).toEqual(once); expect(await content()).toEqual(onceContent);
```

What the added lines do. (1) `kept` is the five tables the test already snapshots (`extra_origin`, `variation`, `role_grant`, `command_receipt`, `audit_event`). Before 0126 the helper reads, from `pg_attribute`, the NAME of every non-dropped user column of each (`preColumns`), and the proof compares, after all migrations and as canonical text from the database, `row_to_json(snap)::text` over a sub-select of exactly those columns (never driver-parsed values; the driver rounds times to the millisecond), ordered by that text under collation `C`, together with each of those columns' `name || ' ' || format_type(atttypid, atttypmod)` (name and full type including modifiers), ordered by name. Columns added later are not listed and so are ignored. (2) A guard asserts every one of the five tables holds at least one pre-existing row in the fixture (it did: the guard passed, so the row comparison is not vacuous for any of the five). (3) The comparison itself is one function, `holds`, used by the proof and by every control. (4) Controls, each in a rolled-back transaction on its own connection through `holds`: (a) for each of the five tables one pre-existing value is changed (timestamp column plus ONE microsecond for `extra_origin.server_recorded_at`, `variation.created_at`, `command_receipt.created_at`, `audit_event.occurred_at`; `role_grant` has no timestamp column so `scope_id` is replaced), with `session_replication_role=replica` set inside that transaction only so the table's own guard triggers do not stop the control; the comparison must fail with an assertion error, the type list must be unchanged and that table's rows must differ; (b) `app.variation.description` is changed from `varchar(500)` to `varchar(501)`; the rows must still read the same, the type list must differ and the comparison must fail; (c) a nullable column is added to each of the five tables and the existing function `app.contractor_member_active` is replaced (its stored body is checked to have changed), after 0126's step, and the proof must still pass.
Nothing asserts a trigger list, a function definition, a policy, a grant or a whole row after a LATER migration.

## Mac set-up repair (one line this piece added; test set-up only)

First real run of the piece's two database files (log `ent-3a-mac-db1.log`): 69 passed, 2 failed. Both failures were the `[A4]` cancelled-order case: after `cancel(c, f)` the decision routine still said `allowed` for the supervisor
(`site-extra-authority.integration.test.ts:37`, and `unexpected success` at `site-extra.integration.test.ts:46`). The helper did not change the migration or any assertion. It probed (a throwaway test file, moved afterwards to
`~/.local/share/full-steam/jg-runs/ent-3a-mac-scratch/ent-3a-mac-probe.integration.test.ts`, never committed) and found:
- with no earlier `team.move`, the fixture's cancellation import is `revised` and the decision routine returns `not_found` / `job_out_of_scope` (the rule is right);
- after `team.move` has taken the named operative off the job's team (as the `[A4]` cases do just before cancelling), the same import row is REJECTED by the merged importer with `ASSIGNMENT_INVALID` (the row still names the moved operative as assigned), so the order is never cancelled, the job stays live, and `allowed` is the correct answer for a live job.
The importer reports a rejected row in its result instead of throwing, so the fixture's `cancel` helper failed silently. Repair (the cancellation row names nobody as assigned, as the fixture's other-branch order already does): in `packages/db/test/site-extra-fixtures.ts`, function `cancel`:

```diff
diff --git a/packages/db/test/site-extra-fixtures.ts b/packages/db/test/site-extra-fixtures.ts
--- a/packages/db/test/site-extra-fixtures.ts
+++ b/packages/db/test/site-extra-fixtures.ts
@@ -67 +67 @@ export async function cancel(c: Cluster, f: Fixture) {
- await new WorkOrderRepository(c.runtime).importCsv(f.p, { commandId: randomUUID(), name: "fictional-cancel.csv", kind: "csv", csv: demoFile([demoRow(f.demo, 1, { expectedRevision: 1, status: "cancelled", lines: [] })]) });
+ await new WorkOrderRepository(c.runtime).importCsv(f.p, { commandId: randomUUID(), name: "fictional-cancel.csv", kind: "csv", csv: demoFile([demoRow(f.demo, 1, { expectedRevision: 1, status: "cancelled", lines: [], assignedMembershipIds: [] })]) });
```

No assertion, expected value, timeout, grant, policy, migration or route behaviour was touched. Hazard for the reviewers: `cancel` still does not check that the import was `revised`; a future change that makes the cancellation row invalid again would fail silently the same way.

## Mac commands, exactly as run

Common environment for every database, vitest, build and install command: `PLAYWRIGHT_SKIP_BROWSER_GC=1`; every vitest command also `VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2` and `--maxWorkers=2`. `memory_pressure | tail -1` printed 79% free before each heavy command. Every heavy command was run inside `~/.local/bin/heavy-slot <label> ...`. Logs are in `~/.local/share/full-steam/jg-runs/` named `ent-3a-mac-*`. Worktree `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/ent-3a`; node v24.17.0, pnpm 10.28.1. No push, no pull request, no `playwright install`, no package `test` script, no `pnpm test`, `pnpm test:db` or `pnpm test:migrations`.

| # | Working directory | Full command line | Exit | Result |
|---|---|---|---|---|
| 1 | worktree | `git fetch origin` then `git merge origin/main` | 0 | merge commit 76076fd, no conflict |
| 2 | worktree | `~/.local/bin/heavy-slot ent-3a-mac-install pnpm install --frozen-lockfile` | 0 | lockfile up to date |
| 3 | `node_modules/.pnpm/@embedded-postgres+darwin-arm64@16.10.0-beta.15/node_modules/@embedded-postgres/darwin-arm64` | `node scripts/hydrate-symlinks.js` | 0 | `native/bin` has initdb, pg_ctl, postgres |
| 4 | worktree | `~/.local/bin/heavy-slot ent-3a-mac-build pnpm exec turbo run build --filter=@jobguard/api... --concurrency=2` | 0 | 6 tasks successful |
| 5 | worktree | `~/.local/bin/heavy-slot ent-3a-mac-db1 pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/site-extra-authority.integration.test.ts test/site-extra.integration.test.ts` | 1 | 2 files failed; 69 passed, 2 failed (both `[A4]`, the cancel set-up fault above) |
| 6 | worktree | `~/.local/bin/heavy-slot ent-3a-mac-probe pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/ent-3a-mac-probe.integration.test.ts` and the same with label `ent-3a-mac-probe2` (probe values surfaced through thrown errors because the runner hides console output) | 0 then 1 | throwaway probe, not part of the piece; findings above |
| 7 | worktree | `~/.local/bin/heavy-slot ent-3a-mac-db1b pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/site-extra-authority.integration.test.ts test/site-extra.integration.test.ts` (after the one-line fixture repair) | 0 | 2 files passed; 71 tests passed (authority file 50, governed-path file 21), including `[A13]` with the new proof and controls |
| 8 | worktree | `~/.local/bin/heavy-slot ent-3a-mac-db2 pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/extra-origin.integration.test.ts test/extra-links.integration.test.ts test/extra-origin-upgrade.integration.test.ts` | 0 | 3 files passed; 48 tests passed (merged files, unedited) |
| 9 | worktree | `~/.local/bin/heavy-slot ent-3a-mac-db3 pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/fingerprinted-row-shape.integration.test.ts test/tenancy.integration.test.ts test/demo-bootstrap.integration.test.ts` | 0 | 3 files passed; 26 tests passed |
| 10 | worktree | `~/.local/bin/heavy-slot ent-3a-mac-unit-core pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/site-extra.test.ts` | 0 | 1 file, 35 tests passed |
| 11 | worktree | `~/.local/bin/heavy-slot ent-3a-mac-unit-api pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/contractor/site-extra.application.test.ts` | 0 | 1 file, 33 tests passed |
| 12 | worktree | `~/.local/bin/heavy-slot ent-3a-mac-unit-web pnpm --filter @jobguard/web exec vitest run --maxWorkers=2 'app/api/contractor/jobs/[id]/site-extras/route.test.ts'` | 0 | 1 file, 27 tests passed (nothing beyond step 4 needed building) |
| 13 | worktree | `~/.local/bin/heavy-slot ent-3a-mac-boundary pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/auth/context-boundary.test.ts src/audit-export/audit-export.application.test.ts`, then the same with `--reporter=json --outputFile=...ent-3a-mac-boundary2.json` (label `ent-3a-mac-boundary2`) for per-file counts | 0 and 0 | 2 files passed; 159 tests: `context-boundary.test.ts` 145 (file untouched), `audit-export.application.test.ts` 14 |
| 14 | worktree | `~/.local/bin/heavy-slot ent-3a-mac-typecheck pnpm exec turbo run typecheck --concurrency=2` | 0 | 7 tasks successful |
| 15 | worktree | `LANE_BASE_REF=origin/main ~/.local/bin/heavy-slot ent-3a-mac-lint node tools/lint.mjs` | 0 | core purity, lane boundary and money-arithmetic checks passed |
| 16 | worktree | `~/.local/bin/heavy-slot ent-3a-mac-turbolint pnpm exec turbo run lint --concurrency=2` | 0 | 7 tasks successful |
| 17 | worktree | `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | 0 | lane `ent-3a` passed (base 8e91b2d) |
| 18 | worktree | `~/.local/bin/heavy-slot ent-3a-mac-openapi pnpm --filter @jobguard/api openapi:check` | 0 | passed |

Counts note: row 7 includes the `[A13]` test with the default test timeout (no explicit budget in the piece's file; it passed). Run 5's two failures were not timing failures, so no re-run for load was needed.
The two credential greps from the order, run over `git diff origin/main...HEAD` before and after this section was added (builder commit, and the helper's own added lines), printed nothing.

Lane line: `BUILD_PLAN.md` was added to this piece's OWN lane line only (`config/agent-lane-assignments.json`, key `ent-3a`, first entry of `allow`). The §12.2 ledger paragraph "Ledger amendment — ENT-3a, 11 October 2026 (merge-ahead ruling)" was added to `BUILD_PLAN.md` directly before `### 12.3 The graph`, modelled on the ENT-4b paragraph; it records that ENT-3a is the first part of plan leaf ENT-3 (split 3a-3e adopted 11 October; 3e parked), that it takes 0126, and the founder's ruling of 11 October ("Use that default") on who may record each kind of extra, which governs where §9.1.4's older "Who" column differs.

Helper verification only; not independently reviewed, not accepted.

## Round 1 — repair round 1 of at most 2 (12 October 2026)

Order: `ENT-3a-r1-repair.txt` (integrator, issued 12 October 2026 about 00:30). Work finished on the Mac by a second repair helper (Claude Sonnet) after the first was cut off at about 00:30; this helper re-read the whole order and the uncommitted diff before running anything.
Local only: no push, no pull request, no GitHub read or write of any kind by this helper (no `gh`, no `git fetch`). Head before this round's commit: `0305fdfc80466688e0a425b84a0e56b056120b91` (merge of `origin/main` `491f86a` into `8408d85`).
This section records what was changed and run. It reviews and accepts nothing; the same Opus reviewer and a fresh Sol check re-check this round.

**The ruling (quoted from the order).** "Integrator ruling on A15 (a reading of the integrator's own order against merged behaviour; no access rule changes). A15 says every response carries `version` and `code` only and is `no-store`, with the piece's own codes. That binds every response THIS PIECE produces: the web route, the service, and the Nest controller once a request reaches it. Refusals that happen on the Nest transport BEFORE the controller runs are produced by merged code this piece must not change: the framework's body parser (malformed JSON → its own 400) and the merged global guard `apps/api/src/auth/application-auth.guard.ts` (a missing or unacceptable session, or a mode other than the synthetic one → its own 401 `UNAUTHENTICATED`). They keep their merged shape, exactly as for the merged contractor controllers (for example `scheduling.controller.ts`), and they fail closed: no handler runs and nothing is written. The piece is NOT to exempt its route from the global guard, add a global filter, or register middleware that changes how other routes answer. A15 is amended to say so."

| Item | Status | One line |
|---|---|---|
| R1-1 (A15 tests and contract) | DONE | new `apps/api/src/contractor/site-extra.http.test.ts` (13 tests, real Nest pipeline); contract paragraph added; sentence corrected; no product change |
| R1-2 (A20 six database files) | DONE | six merged files, unedited, 3 + 3 files, 80 + 23 tests passed; run on the merged tree before this round's edits; nothing under `packages/db` changed since (see below) |
| R1-3 (browser evidence) | DONE, one known failure | production build, then `ENT-2.spec.ts` and `ENT-10b.spec.ts`, both projects: 5 passed, 1 failed, the failure is the known `ENT-2.spec.ts:105` (mobile-360) |
| R1-4 (marker constant) | DONE | constant renamed and rebuilt from parts; behaviour unchanged (unit file 33/33 still passes) |
| R1-5 (catch-up merge) | DONE | merge commit `0305fdf`, parents `8408d85` and `491f86a`; merge only |

### R1-1 — what the new test pins (each case also asserts the application service, the session lookup, the repository write, `Pool.prototype.query` and `Pool.prototype.connect` were never called, where the request is refused before them)

The test builds the real application module (`AppModule`, with the merged global guard and the framework body parser) and sends real HTTP requests to `POST /contractor/jobs/:id/site-extras`. `Pool.prototype.query` and `.connect` are replaced by functions that reject, and spied, so any database statement would both fail and be counted. Because this runner does not emit decorator metadata, the controller's `Pool` parameter is declared by hand in the test with `Inject(Pool)(SiteExtraController, undefined, 0)`, the same way `app.module.ts` declares it for `DecisionsController`; no product file was changed for this. The request uses a socket on 127.0.0.1, so it runs on the Mac only.

- (a) malformed JSON, valid cookie and Origin: HTTP 400, body has `statusCode: 400` and `error: "Bad Request"` and a text `message`, no `version`, no `code`, no `Cache-Control`; nothing ran. The message is the parser's own text and can quote a few characters of the bad body (noted in the contract).
- (b) no session cookie: HTTP 401, body exactly `{"code":"UNAUTHENTICATED"}` (the guard's), no `Cache-Control`; nothing ran. A cookie that is not a synthetic session identifier: the same 401.
- (c) mode `pilot_no_charge`, `production_billing`, an empty mode and an unset mode, each with a valid session, valid Origin and valid body: **HTTP 401 `{"code":"UNAUTHENTICATED"}`, not 403**; no `Cache-Control`; nothing ran.
- (d) foreign Origin, missing Origin, and Origin `null`, each with a valid session: HTTP 403, body exactly `{"version":"site-extra-error.v1","code":"ORIGIN_FORBIDDEN"}`, `Cache-Control: no-store`; nothing ran.
- (e) three requests that reach the controller and are refused by the piece, each with `Cache-Control: no-store` and a body of exactly `version` and `code`: unknown job (`NOT_FOUND`, 404, the repository write is made to refuse); a body that breaks the strict schema (`INVALID_COMMAND`, 400, no repository write); a session the database does not know (`UNAUTHENTICATED`, 401, a different body from the guard's, `{"version":"site-extra-error.v1","code":"UNAUTHENTICATED"}`).

The first helper's throwaway observation tests (kept outside the repository, `~/.local/share/full-steam/jg-runs/ent-3a-mac-scratch/` and `ent-3a-mac-http-observed*.json`) show the same shapes in every mode; the committed test pins them.

**Contract, `docs/contracts/site-extra-v1.md` (the only other files touched: this receipt and the lane line).**
Sentence corrected. Before: "Both call the same application through `createWorkspaceApplication`; the Next adapter imports `server-only`." After: "Both run the same `SiteExtraApplication`: the Next adapter reaches it through `createWorkspaceApplication` (and imports `server-only`); the Nest controller builds it directly from its injected pool (`new SiteExtraApplication(pool)`), as the merged contractor controllers do."
Paragraph added under the new heading "Refusals before the controller (Nest transport)": it states the ruling in plain words, the two merged refusals and their exact shapes, that both fail closed, and that the piece adds no exemption, filter or middleware. One more small edit: the older paragraph that began "**HELD transport requirement:**" now reads "**HELD transport requirement (superseded by the 12 October ruling below):**", so the contract no longer says A15 is partial without saying why that is replaced. Its text is otherwise unchanged.
Lane line (`config/agent-lane-assignments.json`, key `ent-3a`): `apps/api/src/contractor/site-extra.http.test.ts` added to this piece's own `allow` list, directly after `site-extra.application.test.ts`. No other lane line was touched.

### R1-2 — the six database files

Logs `ent-3a-mac-r1-db4.log` (`shared-money-origin.integration.test.ts`, `work-order-import.integration.test.ts`, `contractor.integration.test.ts`: 3 files, 80 tests passed, exit 0, 00:29) and `ent-3a-mac-r1-db5.log` (`job-scheduling.integration.test.ts`, `recovery-follow-up-upgrade.integration.test.ts`, `audit-export.integration.test.ts`: 3 files, 23 tests passed, exit 0, 00:30), both run by the first helper from `packages/db` with `--maxWorkers=2` through heavy-slot, one run at a time, unedited, on real embedded PostgreSQL with migration 0126 in the migration list (`packages/db/src/migrate.ts`, line 68). They were run on the merged tree (merge commit `0305fdf`, 00:25), before the uncommitted edits of this round. Checked by this helper: `git diff HEAD -- packages/db` is empty, no file under `packages/db` is newer than those logs, and none of the six files differs from `origin/main` (`git diff 491f86a HEAD --stat -- packages/db` lists only this piece's own eight files). So the logs predate the final tree, nothing under `packages/db` changed after them, and they were NOT repeated by this helper.

### R1-3 — browser evidence

Production build first, alone (run 6 below). Then both specs in one run, both projects, `--workers=1`, with `CI=1` so the repository's own Playwright config starts the web server with `next start` (the production build) instead of `pnpm dev`, through an out-of-repo wrapper config (`~/.local/share/full-steam/jg-runs/pw-local-channel-ent-3a.config.ts`; it imports the repo's `apps/web/playwright.config` and sets `channel: "chromium"` for every project because `chromium_headless_shell-1193` is not installed here; nothing added to the repo). Result: 6 tests, 5 passed, 1 failed. The one failure is `[mobile-360] e2e/ENT-2.spec.ts:19:5`, at `ENT-2.spec.ts:105:36`, `expect(await noSideScroll(page)).toBe(true)` received `false` — the known mobile-360 "no sideways scroll" failure the order says is not a finding. The six tests are `ENT-2.spec.ts:19` and `ENT-2.spec.ts:113` and `ENT-10b.spec.ts:5`, each in the two projects. Passed: `ENT-2.spec.ts:19` desktop, `ENT-2.spec.ts:113` in both projects, `ENT-10b.spec.ts:5` in both projects. Log `ent-3a-mac-r1b-e2e-prod.log`. No other failure.

### R1-4 — the marker constant (`apps/api/src/contractor/site-extra.application.ts`)

Before (as committed in `968ad93`, line 14, and used on the two lines that follow it):
```text
 const credential = "ent3a-internal-bridge" + "-credential";
  authenticate: async value => value === sessionId ? { identityUserId: member.identityUserId, sessionId, csrfToken: credential } : undefined,
 return resolveVerifiedTenantContext(provider, { sessionToken: sessionId, requestedTenantId: member.tenantId, csrfToken: credential, origin }, origin);
```
After:
```text
 // Opaque and internal: it is only compared with itself by the bridge, which requires at least 24 characters.
 const bridgeMarker = ["ent3a", "internal", "bridge", "marker", "value"].join("-");
  authenticate: async value => value === sessionId ? { identityUserId: member.identityUserId, sessionId, csrfToken: bridgeMarker } : undefined,
 return resolveVerifiedTenantContext(provider, { sessionToken: sessionId, requestedTenantId: member.tenantId, csrfToken: bridgeMarker, origin }, origin);
```
The earlier form remains in the first commit (`968ad93`) and in this branch's history; nothing was rewritten. The new value is 34 characters; the bridge's schema requires at least 24 (`apps/api/src/auth/auth-schemas.ts`, `csrfToken: z.string().min(24)`), so behaviour is unchanged. The only remaining occurrences of the words token in that file are the merged interface's own property names (`csrfToken`, `sessionToken`), which cannot be renamed here. The unit test does not name the constant (it reads `credentials` from the merged bridge call), so no unit test needed editing; `site-extra.application.test.ts` passes 33/33 unchanged.
Scans run over the added lines of `git diff origin/main...HEAD`, over `git diff HEAD`, and over the new untracked test file: (1) a word ending in key, token, secret or password followed by a colon or equals sign and a quoted literal of ten or more characters; (2) any address that carries a user name and a password in front of the host. All printed nothing. One thing a stricter reader may notice: the new test builds the identity application's code-signing setting name from parts (`["AUTH", "CODE", "SECRET"].join("_")`) and fills it with a random value generated at run time; no literal is written beside the word.

### R1-5 — catch-up

Done before this helper started (first helper, 00:25): merge commit `0305fdf`, parents `8408d85` and `491f86a`. This helper did not fetch or merge again. Note for the integrator: the local `origin/main` ref in this worktree now reads `459ec87` (a later main, PR #118; changed by something other than this helper). This branch contains `491f86a` and not `459ec87`. `LANE_BASE_REF=origin/main` still passes (below).

### Commands, exactly as run

Worktree `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/ent-3a`; node v24.17.0, pnpm 10.28.1. `memory_pressure | tail -1` printed 77% free before the first command and 82% before the heavy ones. Every command ran inside `~/.local/bin/heavy-slot <label> ...`, one at a time, never a build and a test together. Every vitest command used `--maxWorkers=2`. Unlike the earlier section, `VITEST_MAX_THREADS` and `VITEST_MAX_FORKS` were not set (the flag is what limits the vitest 4 runner); no `playwright install`. Logs: `~/.local/share/full-steam/jg-runs/ent-3a-mac-r1b-<name>.log`.

| # | Working directory | Command line (label `ent-3a-mac-r1b-<name>`) | Exit | Result |
|---|---|---|---|---|
| 1 | `apps/api` | `heavy-slot ... pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/contractor/site-extra.http.test.ts src/contractor/site-extra.application.test.ts` (log `http-unit-api`) | 0 | 2 files passed; 46 tests (13 http + 33 unit) |
| 2 | `packages/core` | `heavy-slot ... pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/site-extra.test.ts` (log `unit-core`) | 0 | 1 file, 35 tests passed |
| 3 | `apps/web` | `heavy-slot ... pnpm --filter @jobguard/web exec vitest run --maxWorkers=2 'app/api/contractor/jobs/[id]/site-extras/route.test.ts'` (log `unit-web`) | 0 | 1 file, 27 tests passed |
| 4 | worktree | `heavy-slot ... pnpm typecheck --concurrency=2` (log `typecheck`) | 0 | 7 tasks successful (4 replayed from the turbo cache, `api`, `db` and `web` re-executed) |
| 5 | worktree | `LANE_BASE_REF=origin/main heavy-slot ... pnpm lint` (log `lint`) | 0 | core purity (131 files), lane boundary (lane `ent-3a`, includes the new test file), money-arithmetic check, and `turbo run lint` 7 tasks successful |
| 6 | worktree | `LANE_BASE_REF=origin/main pnpm lint:lanes` (log `lanes`) | 0 | lane boundary passed, lane `ent-3a`, 25 files including `site-extra.http.test.ts` |
| 7 | worktree | `heavy-slot ... pnpm build` (log `build`; alone, before any browser run) | 0 | 7 tasks successful (4 cached), `next build` of `apps/web` completed |
| 8 | `apps/web` | `CI=1 heavy-slot ... pnpm exec playwright test --config ~/.local/share/full-steam/jg-runs/pw-local-channel-ent-3a.config.ts --project=mobile-360 --project=desktop --workers=1 ENT-2.spec.ts ENT-10b.spec.ts` (log `e2e-prod`) | 1 | 6 tests: 5 passed, 1 failed (known `ENT-2.spec.ts:105`, mobile-360) |
| 9 | `apps/web` | `CI=1 pnpm exec playwright test --config <same wrapper config> --project=mobile-360 --project=desktop --list ENT-2.spec.ts ENT-10b.spec.ts` (listing only, to name the six tests; starts no browser or server, not through heavy-slot) | 0 | `Total: 6 tests in 2 files` |
| — | worktree | six database files: not re-run; logs `ent-3a-mac-r1-db4.log` (exit 0, 3 files, 80 tests) and `ent-3a-mac-r1-db5.log` (exit 0, 3 files, 23 tests) cited under R1-2 | — | — |

### NOT RUN in this round

- The six R1-2 database files were not repeated on the final tree (cited above; nothing under `packages/db` changed after them).
- `apps/api/src/auth/context-boundary.test.ts` and `apps/api/src/audit-export/audit-export.application.test.ts` were not re-run this round (the earlier section's run 13 covers them; neither file, nor the global guard, was touched).
- The development-server mode of the browser specs (`pnpm dev`, no `CI`), the other `apps/web/e2e` specs, `pnpm test`, `pnpm test:db`, `pnpm test:migrations`, `openapi:check` (no route or schema changed), and the full CI on a pushed branch.
- Nothing was pushed or fetched; no pull request; no review by Opus or Sol was run by this helper.

Round 1 builder/helper receipt only — not independently verified, not accepted.


## Repair round 2 (12 Oct)

Issued head: `af753af62c3d8492c27ed6fbc7f411a3338db1d0`. Local working-tree
repair only; no commit, push, PR, merge, catch-up or renumbering. Existing HOLD
and limits remain in force (including the round-1 clarification of A15).
F2 remains open; success paths are reachable in tests only.

### Before record — tests first

`PATH=/private/tmp/ent3a-bin:$PATH pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/watchdog-registry.test.ts`
ran before any edit: exit 1; 1 file, 121 tests, 119 passed and 2 failed.
Every failure reported:

- `fails when any job mutation route is unclassified`: `Unclassified job mutation: /api/contractor/jobs/[id]/site-extras`; throw at `watchdog-registry.test.ts:71:29`, call at `:240:5`.
- `classifies standalone job mutations and dispatcher command literals too`: `Unclassified job mutation: nest:/contractor/jobs/:id/site-extras`; same throw at `:71:29`, call at `:344:5`.

The printed source for both failures was lines 69–73, with the missing-key
throw at line 71. No separate `src/watchdog.filter.test.ts` exists in this
checkout (`rg --files apps/api/src`); the registry suite includes typed filter
checks. No other watchdog test file exists under that source directory.

Before SHA-256 text hash of `contextForContractorSession`, from its `async function`
line through the closing brace immediately before `export class SiteExtraApplication`
(excluding the separating newline): `b41102294f59f88ec59a3eb4d911e81c14a8712d712ae2d6572d845f5b022f64`. After hash: `b41102294f59f88ec59a3eb4d911e81c14a8712d712ae2d6572d845f5b022f64` — identical.

Rule 9 is not re-opened: no new migration, and
`0126_site_extra_authority.sql` will remain byte-identical. Pinned security lists,
scanner and its pinned files, `watchdogCommandGuards` and extra-repository.ts
will not be touched. Final implementation anchors and R1–R5 results follow.


### Implementation and named limit

Exactly two new registry rows, both `watchdog_live_only`, plus one ENT-3a
comment line. POST Next derives `/api/contractor/jobs/[id]/site-extras` from the
route file (test lines 57–64); POST Nest combines `@Controller("contractor")`
with `@Post("jobs/:id/site-extras")` and prefixes `nest:` without a verb
(test lines 202–207): `nest:/contractor/jobs/:id/site-extras`. The source scan
requires no `command:` or `method:` addition: the raising type remains a bound
constant. No existing registry row or `watchdogCommandGuards` entry changed.

**Named limit:** the second check runs after raiseExtra's per-job lock, which cannot be avoided without editing extra-repository.ts.
Precheck is a separate transaction before raiseExtra; the seam rechecks before
its final audit append. A typed guard failure is retained in logSiteExtra's
local variable while a known persistence error forces rollback, then rethrown
as the original WatchdogError. This is the issued compromise; RED adjudication
remains owed. The seam runs after tentative business inserts, which all roll
back on failure. Existing stored-result replay returns before the seam; precheck
still guards replay, and replay creates no new business facts.

Pair source observations: merged ReadinessController and ProofController use
Nest's default 201 plus ApiCreatedResponse. Their Next twins currently use
NextResponse.json without a status (200). This checkout therefore does not show
universal status parity in the merged pairs; the issued instruction governs
ENT-3a: both transports explicitly return 201, including identical replay.
Nothing in those merged pairs was edited.

First post-edit API run (same wrapper, maxWorkers=2; registry plus site-extra
application test): exit 1, 2 files, 158 tests; leaf application 37 passed;
registry 119 passed / the same 2 missing-row failures. The API imports the
built core package and this first run still read its pre-repair dist. Rebuild
before the final registry run; no test or resolution config is changed.

OpenAPI generated via the repository generator with `node --import tsx`:
exit 0. All other operations/root content compared structurally equal to HEAD.
The earlier documented 200 response is retained; 201 and the exact 409 schema
are added. Final regeneration follows the final controller text.


### Behaviour anchors (a–d) and changed expected values

- (a) `packages/db/src/site-extra-repository.ts:37`: merged requireLiveJob in
  precheck after the unchanged authority decision. `:21`: recheck in existing
  seam. `:60`, `:70`, `:80`, `:91`: retained typed refusal, rollback and mapping.
  JOB_NOT_LIVE throws without entering recordRefusal. Application `:38` preserves
  WatchdogError; HTTP mapping at `apps/api/src/contractor/site-extra.application.ts:45`
  yields 409 `{code:"JOB_NOT_LIVE"}`. Refused authority targets retain earlier semantics.
- (b) `apps/api/src/contractor/site-extra.controller.ts:12`: explicit 201;
  `apps/web/app/api/contractor/jobs/[id]/site-extras/route.ts:16`: identical 201.
  Stored result and command identity are unchanged.
- (c) `apps/api/src/contractor/site-extra.application.ts:46`: internal
  SiteExtraError(COMMAND_CONFLICT) maps only this route's public answer to 409
  `{code:"IDEMPOTENCY_CONFLICT"}`. Core/internal name and PostgreSQL [A9]
  expectations remain unchanged.
- (d) `apps/api/src/contractor/site-extra.controller.ts:13`: created response;
  `:14`: retained prior 200 documentation; `:15`: exact 409 enum. The repository
  generator updates only this OpenAPI operation. `apps/api/openapi.json` line
  anchor will be recorded after final regeneration.

| Own existing assertion | Before | After |
|---|---|---|
| Next [A8] parsed-body response, route.test.ts:14 | 200 | 201 |
| Next [A17] persisted-context response, route.test.ts:42 | 200 | 201 |
| API [A15] COMMAND_CONFLICT branch, application.test.ts:73 | 409 / `{version:"site-extra-error.v1",code:"COMMAND_CONFLICT"}` | 409 / `{code:"IDEMPOTENCY_CONFLICT"}` |
| Next [A15] COMMAND_CONFLICT branch, route.test.ts:26 | same versioned conflict body | same code-only IDEMPOTENCY_CONFLICT body |
| API [A18] sole-caller seam assertion, application.test.ts:81 | direct `siteExtraAuthoritySeam)` argument | `await siteExtraAuthoritySeam(db, fact)` in rollback-preserving wrapper |
| New [R3], self-review correction before execution | tenant-wide receipt count equals 1 | count increases by 1, and exact command-id query returns one stored result |

[A18] continues asserting one application writer, fixed raising type, no direct
writes, and no replaceable command type; it follows the necessary seam wrapper.
No earlier assertion was deleted, skipped or weakened. No prior OpenAPI snapshot
test exists for this operation; [R5] tests only this piece's operation.


### R1–R5 evidence on this working tree

| ID | Evidence and limits |
|---|---|
| R1 | EXECUTED: unedited `apps/api/src/watchdog-registry.test.ts`, 121/121 passed after core rebuild; exact two-row registry delta verified. |
| R2 | EXECUTED: direct Nest controller/application and Next adapter tests return 409 / `{code:"JOB_NOT_LIVE"}`. PostgreSQL `site-extra.integration.test.ts:161` has separately named before-precheck and between-transactions cases using the merged `app.transition_job` to invoiced, with business counts, complete audit count, chain head and command-row assertions. **NOT RUN (sandbox cannot start PostgreSQL / a browser)**. Nest socket pipeline test `[R2]` added; **NOT RUN (sandbox cannot bind localhost)**. |
| R3 | EXECUTED: public 409 / `{code:"IDEMPOTENCY_CONFLICT"}` on direct Nest and Next adapters. PostgreSQL `[R3]` at `site-extra.integration.test.ts:176` keeps one persisted receipt/result and business effect under a changed request, internal COMMAND_CONFLICT unchanged; **NOT RUN (sandbox cannot start PostgreSQL / a browser)**. Nest socket pipeline `[R3]`: **NOT RUN (sandbox cannot bind localhost)**. |
| R4 | EXECUTED: Nest 201 metadata plus identical application result, Next 201 on success/replay plus identical result. PostgreSQL `[R4]` at `site-extra.integration.test.ts:186` asserts same stored result and unchanged counts/head; **NOT RUN (sandbox cannot start PostgreSQL / a browser)**. Nest actual HTTP `[R4]` added, **NOT RUN (sandbox cannot bind localhost)**. Mocked transport tests do not prove PostgreSQL persistence. |
| R5 | EXECUTED: operation-specific `[R5]`, unedited registry documentation check, and generator comparison. OpenAPI operation starts at `apps/api/openapi.json:4`; its 201 and exact `['JOB_NOT_LIVE','IDEMPOTENCY_CONFLICT']` enum are present. Every original response (200, unchanged description) and every other OpenAPI operation/root field compare equal to HEAD. |

### Commands and results — round 2

All pnpm commands used `PATH=/private/tmp/ent3a-bin:$PATH`, the preinstalled
cached pinned pnpm 10.28.1 wrapper. Node v24.17.0. No install/download.
One heavy command at a time; vitest maxWorkers=2, at most two files here.

- Before run and first stale-dist run: recorded above, exits 1.
- `pnpm build --concurrency=2`: exit 0, 7/7 tasks, 2 cached, 27 static pages.
  Unchanged warnings: parent lockfile/root inference, CSS end-value support,
  webpack warning serialization and shared turbo cache permission.
- `pnpm openapi:check`, working directory `apps/api`: exit 1 before comparison,
  `listen EPERM` at `/var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/7103.pipe`.
  No socket exception or check bypass added.
- Sequential generator fallback: `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts`
  and the same with `--check`: both exit 0; same generator and comparison.
- `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/watchdog-registry.test.ts src/contractor/site-extra.application.test.ts`:
  exit 0, 2 files / 158 tests (121 registry, 37 leaf) passed. No merged test edited.
- `pnpm --filter @jobguard/web exec vitest run --maxWorkers=2 'app/api/contractor/jobs/[id]/site-extras/route.test.ts'`:
  exit 0, 1 file / 30 tests passed. This is an in-process adapter run, no browser.

Root typecheck and both lint results follow after completion.


- `pnpm typecheck --concurrency=2`: exit 0, 7/7 tasks, 2 cached.
- `LANE_BASE_REF=origin/main pnpm lint --concurrency=2`: exit 0, core purity,
  lane boundary, money/commercial checks and 7/7 package tasks, 2 cached.
- `LANE_BASE_REF=origin/main pnpm lint:lanes`: exit 0, lane ent-3a; origin/main
  at invocation `d58560e39bd726dc3eba08e763ef465d98b23cb0`, unchanged checkout HEAD
  `af753af62c3d8492c27ed6fbc7f411a3338db1d0`. The lane reports 26 files across
  the branch plus working tree; this repair itself changes exactly 12 files.
  No fetch, merge or ref write was used.
- `git diff --check`: exit 0.

### Self-review and preservation — round 2

Re-read the entire round-2 diff as a strict reviewer: repository and both error
layers, route status/body/no-store, all changed/new tests, OpenAPI operation,
registry delta, lane line and this receipt. Checked the real helper's signature
and InboxRelevanceRepository invocation, raiseExtra's error wrapper and lock/
write/seam/audit order, merged lifecycle transition SQL, persisted replay's
seam bypass, and all earlier authority/source-boundary assertions.

Caught and fixed one new database-test assumption before handoff: fixture setup
can already persist command receipts, so `[R3]` now checks a one-row delta from
pre-command counts and one exact result row for this command id, rather than
assuming the tenant had no receipts. Added an explicit `this: ExtraRepository`
type on the test-only forwarding function. These final test-source edits affect
only the NOT RUN PostgreSQL suite; no executed product/unit source changed.
An earlier edit helper failed to find its HTTP-test insertion anchor; corrected
the anchor and added the tests without changing any original assertion.

Executed deterministic checks against the saved before-round SHA-256 inventory:
exactly the 12 files listed by this repair's diff change; every other tracked
file is byte-identical. In particular: `context-boundary.test.ts`, all files it
pins, all migrations including `0126_site_extra_authority.sql`, extra-repository.ts,
BUILD_PLAN.md, and every merged test are unchanged. `contextForContractorSession`
text SHA-256 is identical before and after, as recorded above. Pinned lists were
not touched: no security list/value, no watchdogCommandGuards entry, no command:
or method: registry addition. Removing the one comment and two rows from the
new watchdog.ts reproduces its exact before bytes. Only ent-3a's lane line changes;
its allow list adds watchdog.ts only (OpenAPI was already listed).
Local rule-11 added-line scans found zero credential-shaped literals or addresses
carrying a user/password. This is a local deterministic scan, not GitHub CI or
an independent model verdict. New [R5] assertions bind only this piece's operation;
no new standing test freezes an unowned file (rule 12).

Could not verify PostgreSQL behaviour, concurrency/rollback and catalogue paths,
real Nest HTTP responses, browsers, a fresh install or post-catch-up CI here.
Database and browser suites: **NOT RUN (sandbox cannot start PostgreSQL / a browser)**.
Nest `site-extra.http.test.ts` (16 tests, including new R2–R4):
**NOT RUN (sandbox cannot bind localhost)**. Root `pnpm test` is NOT RUN because
it exceeds the issued test-file limit and includes socket/PostgreSQL work;
the permitted unit runs above are the executed evidence. `pnpm test:db`,
`pnpm test:migrations`, `pnpm test:e2e`: **NOT RUN (sandbox cannot start PostgreSQL / a browser)**.
No AI change; eval inapplicable. No suite weakened or made optional.

### Dispatcher handoff

Intended conventional commit subject/body written to
`/private/tmp/jg-msg-ent-3a.txt`. Commit nothing myself; no git write, push, PR,
catch-up or migration numbering. Rule 9 not re-opened. Existing shared-bridge
merge HOLD and all other issued limits remain, F2 still open, UI parked,
synthetic mode only. No new alerts, migration or external action. HTTP backwards
compatibility changes are exactly 200→201 and the public conflict envelope above.
Independent exact-commit RED pair verdicts, separate acceptance, helper/CI runs,
and dispatcher catch-up/landing renumbering remain owed. Builder receipt only —
source-inspected and test-executed where labelled; not independently verified,
not accepted, not released.

## Catch-up and renumber (12 Oct)

Mac-side helper, 12 October 2026, worktree `.worktrees/ent-3a`, branch `codex/sandbox/ent-3a`, starting head 09f063e (clean, local only). Nothing pushed, no PR opened, no review or verdict given, no product code changed beyond the merge and the renumber. Earlier text in this receipt that says 0126 is history and is left as written; the migration is now 0135.

**What was done.**
1. `git fetch origin`; `git merge origin/main` (b223394) as a plain merge commit `2eed74e` "Merge main (b223394) into ENT-3a". Seven files conflicted and were resolved by keeping both sides, main's lines first: `packages/db/src/migrate.ts` (0127, 0128, 0129, then ENT-3a's entry), `packages/db/src/index.ts`, `packages/db/MIGRATIONS.md` (0127, 0128, 0129 sections, then ENT-3a's), `BUILD_PLAN.md` (§12.2 ledger paragraphs), `apps/api/src/app.module.ts` (import plus `SiteExtraController` added in front of `SsoRequiredController` inside the one `@Module` line), `apps/api/src/workspace/application.ts` (import plus `const siteExtras`, and `siteExtras: Object.freeze({ log: ... })` added after `ssoRequired,` inside the one long `return Object.freeze({...})` line; checked by character diff that the line differs from main's only by that addition). `apps/api/openapi.json` was not hand-merged: main's file was taken, then regenerated with `pnpm openapi:generate` in `apps/api` (91 added lines, the same size as this branch's own addition). `config/agent-lane-assignments.json` and `packages/core/src/index.ts` merged without conflict; the JSON files parse.
2. Renumber, commit `77a98ab` "chore(ent-3a): renumber migration 0126 to 0135 after main reached 0129; SQL bytes unchanged": `git mv packages/db/migrations/0126_site_extra_authority.sql packages/db/migrations/0135_site_extra_authority.sql`. sha256 of the file before the move and after the move:
   - before: `1e3119299e15572885633d5f892f2bc385756589e65a1b280d476f5c5cc74eab`
   - after:  `1e3119299e15572885633d5f892f2bc385756589e65a1b280d476f5c5cc74eab` (equal; SQL bytes unchanged)
   References updated: the registry entry in `packages/db/src/migrate.ts` (last, after 0129), the `packages/db/MIGRATIONS.md` heading and the renumber sentence, `packages/db/test/site-extra-authority.integration.test.ts` (migration name and comments; the upgrade proof already finds the migration by name), the ent-3a lane path in `config/agent-lane-assignments.json` (own line only), and a new §12.2 ledger paragraph in `BUILD_PLAN.md` ("Ledger amendment — ENT-3a, 12 October 2026 (catch-up, merge-ahead ruling)"). `docs/contracts/site-extra-v1.md` names no migration number, so it is unchanged.

**Setup.** Embedded PostgreSQL started without the dyld error, so the hydrate script was not needed. `@jobguard/core`, `db`, `storage`, `config`, `ai` each built alone (exit 0); `@jobguard/db` rebuilt after the renumber; `@jobguard/api` built (exit 0). Every heavy command ran through `heavy-slot`; vitest used `--maxWorkers=2` (db files `--maxWorkers=1`), at most three files per run.

**Commands, exits and counts (run at head 77a98ab, after the renumber).**

| Check | Exit | Result |
|---|---|---|
| `pnpm typecheck` | 0 | 7 of 7 tasks |
| `LANE_BASE_REF=origin/main pnpm lint` | 0 | lane boundary passed (lane ent-3a, 26 files, includes `0135_site_extra_authority.sql`); core purity, money arithmetic, 7 of 7 package lints |
| core `src/site-extra.test.ts` | 0 | 35 passed |
| db `test/site-extra-authority.integration.test.ts` (includes the [A13] upgrade proof) | 0 | 50 passed |
| db `test/site-extra.integration.test.ts` | 0 | 25 passed |
| api `site-extra.application.test.ts`, `site-extra.http.test.ts`, `watchdog-registry.test.ts` | 0 | 3 files, 174 passed |
| api `src/auth/context-boundary.test.ts` | 0 | 145 passed |
| `pnpm openapi:check` (apps/api) | 0 | committed openapi.json matches |
| web `app/api/contractor/jobs/[id]/site-extras/route.test.ts` | 0 | 30 passed |
| db `test:migrations` files (`tenancy`, `demo-bootstrap`) | 0 | 2 files, 13 passed |
| db neighbours that install the whole registry: `audit-export`, `extra-origin-upgrade`, `sso-required` | 0 | 3 files, 29 passed |
| db neighbours: `recovery-timing-pin`, `shadow-persistence`, `recovery-eligibility-v3` | 0 | 3 files, 59 passed |

Two findings worth the next round's attention. (1) The scanner test `context-boundary.test.ts` was expected to go red on ENT-3a's local copy of the context adapter (`contextForContractorSession` in `apps/api/src/contractor/site-extra.application.ts`) and did not: it is 145 of 145 green, so that local copy is not forced out by the scanner and the switch to the shared bridge is still owed as a deliberate builder change. (2) A lane-lint run made while the rename was staged but not yet committed failed with "Lane ent-3a cannot edit 0126_site_extra_authority.sql" because the lint also counts staged deletions; it passes once the renumber is committed (the run above).

In the merge commit alone, `migrate.ts` lists 0126 after 0129 (out of numeric order) by design; the next commit puts it at 0135. The upgrade proof now installs 0127 to 0129 before 0135 (it selects by name from 0122 up to 0135), and it passes.

**NOT run.** The full root `pnpm test`; the full `packages/db` suite (only the files in the table above); the rest of the `apps/api` and `apps/web` suites; `pnpm test:e2e` and any browser run; GitHub CI; the 45-minute CI job; any independent Claude or Sol review of this catch-up. No push, no PR, no deployment, no verdict. Not independently verified, not accepted, not released. Free disk 117 GiB at start, 116 GiB at end.


## Repair round 3 (bridge switch)

Issued local head `40ff3405ea14285f40b24615ca57877c74cf9f25`, branch
`codex/sandbox/ent-3a`. Read `git log` first: head is the dispatcher catch-up
receipt, after `77a98ab` renumbered the SQL to 0135 and `2eed74e` merged main
`b223394` (CTX-BRIDGE-1, PR #151). Read Q3 and repair round 2, AGENTS,
BUILD_PLAN §9.1.4/§9.1.5/ENT-3 and ledger amendments, the site-extra contract,
the shared bridge and the merged audit-export application's `resolveContext`.
The bridge exists and is already exported from `@jobguard/db`; no index edit
was needed. All four code/test paths and this receipt are already in the
`ent-3a` lane. No lane widening, migration edit or git write.

**The merge hold of Q3 is now lifted by this switch.** The reviewed shared
bridge is merged and this piece now uses it. This statement discharges only
that explicit prerequisite: it is not an independent verdict, technical
acceptance, permission to merge, or release approval. F2 is still open;
success paths are reachable in tests only. UI remains parked.

### Application change and context route

Removed `contextForContractorSession` in full: the inert hand-made AuthProvider,
its request/verify-code refusals, generated membership projection, marker,
fictional origin and local principal-bridge call, plus their exclusive imports
(`AuthError`, `AuthProvider`, `resolveVerifiedTenantContext`). There is no
credential-shaped replacement value. The application constructs no tenant
context and adds no scanner name.

`SiteExtraApplication.resolveContext` follows merged audit-export's shape:
`const context: VerifiedTenantContext = await contractorSessionContext(this.pool, sessionId)`,
read its tenant ID, reject a mismatch with the persisted actor's tenant as
`UNAUTHENTICATED`, return the exact whole context, and translate an
unauthenticated bridge lookup to the piece's existing typed unauthenticated
error. `log` passes that unchanged context to `logSiteExtra`.

A valid command looks up the session **twice**: once through merged
`ContractorRepository.resolveSession` for the unchanged actor argument, and
once inside the shared bridge, which performs its own persisted lookup and
uses only that result to create context. The actor is never passed to the
bridge or a context constructor. This is the issued two-lookup option and the
audit-export model; it keeps the bridge's context lookup authoritative.
Both use the same pool/session ID. A changed tenant or unknown second lookup
fails closed before the command repository. Activity, role, scope and grant
checks remain in the database path; the bridge intentionally retains context
for an attributable revoked/expired member so a refusal can be recorded.

Round-2 registry rows, precheck/seam `JOB_NOT_LIVE`, success/replay 201,
public `IDEMPOTENCY_CONFLICT` and OpenAPI 201/409 enum remain unchanged.
No operational alert, migration, new external action or public error envelope
is added. Backwards compatibility: only the internal context route/lookup count
changes; existing HTTP bodies and statuses are preserved.

Required command, run after the switch:

```sh
git grep -n "resolveVerifiedTenantContext\|verifiedTenantContextFromMembership\|bridgeMarker" -- 'apps/api/src/contractor/site-extra*' 'packages/db/src/site-extra*'
```

Output: **empty (no matches)**. Exit **1**, git grep's normal no-match result.
No scanner test, bridge file or pinned file is edited.

### Tests first and every changed expected value

Changed only this piece's application test, Nest HTTP test and Next route test.
Every existing test case remains; no skip, weakened intent or deleted case.
The deleted adapter's assertions now drive the real shared bridge rather than
its removed provider interface. Before/after replacements are enumerated below;
all other previous expected values remain unchanged.

| Assertion / intent | Before | After |
|---|---|---|
| Application [A8] exact persisted session lookup | exactly once with session ID | exactly twice, both calls exactly `[sessionId]`; identical actor object and exactly four command fields still asserted |
| Nest HTTP [A15](e) unknown-job lookup | exactly once with session ID | exactly twice, both exactly `[sessionId]`; additionally one real shared-bridge call and repository context identical to its returned object; HTTP 404/body/no-store and zero actual query/connect unchanged |
| Next [A17] successful transport-canary lookup | exactly once with session ID | exactly twice, both exactly `[sessionId]`; additionally one shared-bridge call and identical returned context; 201/body-field refusals/path refusal/one repository write unchanged |
| Application [A17] observed bridge | one local principal-bridge call | exactly one shared `contractorSessionContext(pool, sessionId)` call |
| [A17] tenant selection | adapter credentials' requested tenant equals persisted tenant | only pool/session passed to shared bridge; second lookup returns the exact persisted member; unchanged tenant equality assertion and real withTenant stamp check; returned context identity/frozen assertions added |
| [A17] valid provider authentication | returned identity user equals persisted identity user | second real-bridge lookup result is the identical persisted membership object (includes identity user); actor remains identical to it |
| [A17] provider membership projection | projected ID equals persisted membership ID, invented `read_only` role | exact unchanged persisted member reaches shared bridge/actor; no projected role or membership substitution; existing forged-role transport refusals retained |
| [A17] unrelated session via provider | provider returns undefined | shared bridge rejects unrelated session with typed `UNAUTHENTICATED` |
| [A17] foreign tenant and altered identity via provider membership arguments | provider returns undefined for each | tenant/member IDs used as sessions are rejected as `UNAUTHENTICATED`; authority object is rejected before lookup; existing body/path/principal/cookie/header/query tampering assertions retained |
| [A17] provider requestCode/verifyCode | both inert methods reject as `UNAUTHENTICATED` | provider/methods removed; own application source asserts absence of AuthProvider/requestCode/verifyCode; shared bridge rejects missing/malformed sessions as `UNAUTHENTICATED` and non-synthetic mode as `MODE_FORBIDDEN` without further lookup |

The two negative shared-lookup cases are new: unknown second session and
second tenant mismatch both answer typed `UNAUTHENTICATED` before repository
or connection access. Missing/malformed-principal coverage is strengthened by
zero lookup/query/connect assertions; the previously included unknown valid
session is still asserted separately in the same test. Nest's pre-handler
canaries additionally assert the shared bridge was never called.

New requested inactive-member test runs revoked and expired cases: persisted
session resolves through the actual shared bridge; actual SiteExtraRepository
and merged withTenant/assertContractorGate run against a fake PoolClient that
models no active member and an already-recorded refusal on retry. Both answer
403 with the piece's `EXTRA_FORBIDDEN` envelope after both transactions complete,
and never call `ExtraRepository.raiseExtra`. Like audit-export, a persisted
inactive member remains attributable but cannot perform the action. This is
mocked database evidence, not PostgreSQL verification of revocation/expiry or
of refusal durability. The existing PostgreSQL A5/A12 coverage remains owed
in CI; no database test was changed.

### Commands and results — round 3

Every pnpm command uses `PATH=/private/tmp/ent3a-bin:$PATH`, the already-cached
pinned pnpm 10.28.1 wrapper; Node v24.17.0. Dependencies were already installed;
no install/download or socket/database/browser startup. One heavy command at a
time, vitest `--maxWorkers=2`, only changed test files, at most three per run.
`origin/main` observed at `8472ae0014b2ddb71943d4a903982d77084bdecc`; no fetch,
merge or ref update performed by this builder.

- Tests-first `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/contractor/site-extra.application.test.ts`:
  exit 1; 1 file, 41 tests, 35 passed/6 failed. Failures: [A8] saw one lookup
  rather than two; original [A17] and both inactive cases saw zero shared-bridge
  calls; both second-lookup cases returned SITE_EXTRA_UNAVAILABLE instead of
  UNAUTHENTICATED because the second lookup did not yet exist.
- Same application command after switching: exit 0; 1 file / 41 tests passed.
- First `pnpm typecheck --concurrency=2`: exit 2; 5/6 tasks passed;
  new test's `Pool.connect` overloaded callback signature made `.mockResolvedValue`
  infer void (TS2345). Changed only the fake client stub to `.mockImplementation`
  with an async PoolClient return; no assertion or product change.

- Final `pnpm typecheck --concurrency=2`: exit 0; 7/7 tasks passed, 5 cached.
- `LANE_BASE_REF=origin/main pnpm lint --concurrency=2`: exit 0; core purity
  (131 TypeScript files), lane boundary, money arithmetic and 7/7 package tasks
  passed, 5 cached.
- `LANE_BASE_REF=origin/main pnpm lint:lanes`: exit 0; lane ent-3a passed,
  26 files in the branch/working-tree comparison. This repair changes five only.

- `pnpm build --concurrency=2`: exit 0; 7/7 tasks, 2 cached; Next generated
  29/29 static pages. Existing workspace-root/parent-lockfile, CSS/autoprefixer,
  webpack serialization and shared turbo cache permission warnings remain.
  Cached output naming other worktrees is replayed output, not execution there.
- Final `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/contractor/site-extra.application.test.ts`:
  exit 0; 1 file / 41 tests passed.
- `pnpm --filter @jobguard/web exec vitest run --maxWorkers=2 'app/api/contractor/jobs/[id]/site-extras/route.test.ts'`:
  exit 0; 1 file / 30 tests passed. In-process adapter, no browser.
- `pnpm openapi:check`: exit 1 before comparison; tsx CLI cannot create its IPC
  socket (`listen EPERM`). No permission escalation or check bypass added.
- `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check`:
  exit 0; the same repository generator/comparison succeeds without the CLI IPC
  server. Committed OpenAPI stays byte-identical.
- Required grep above: exit 1, no matches.
- `git diff --check`: exit 0. Saved before-round SHA-256 inventory comparison:
  exit 0, exactly five authorized tracked files differ; every other tracked
  file is byte-identical. Final added-code-line credential-pattern inspection:
  exit 0, no matches (local deterministic check only).

### Self-review and remaining evidence

Re-read the final application, all three test diffs and this receipt. Checked
that only the shared bridge constructs context, no actor or requested tenant
is passed to it, the context is returned/passed whole without copies or caches,
and the audit-export model's tenant mismatch and UNAUTHENTICATED behavior are
preserved. Confirmed missing/malformed principal and non-synthetic refusals
precede access; successful forged transport values cannot select tenant/member/
role; membership authorization remains in the database path; the real stamp
is accepted by merged withTenant. Reviewed each assertion replacement in the
table, every new refusal test and retained round-2 tests. No new standing test
pins any unowned source file; the new source assertion reads only this piece's
application. No test was skipped or weakened to obtain a pass.

The inventory proves `apps/api/src/auth/context-boundary.test.ts`, all its
pinned files including the shared bridge, every migration including 0135,
watchdog.ts, the db exports/repositories, the OpenAPI file, BUILD_PLAN and lane
registry remain byte-identical. The only changed code/test files are the four
issued paths. Historical Q3 HOLD entries above are superseded by this section's
explicit bridge-switch statement; all other outstanding limits remain.

- Database and browser suites (`pnpm test:db`, `pnpm test:migrations`,
  `pnpm test:e2e`): **NOT RUN (sandbox cannot start PostgreSQL / a browser)**.
- `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/contractor/site-extra.http.test.ts`:
  **NOT RUN (sandbox cannot bind localhost)**; 16 cases remain, assertions
  updated and typechecked, no socket attempted.
- Root `pnpm test`, scanner and other merged tests: NOT RUN in this round under
  the changed-files-only order and socket/PostgreSQL restrictions. Mandatory
  CI suites stay enforced. Existing success/membership stubs and the new fake
  PoolClient tests are not a live database integration. Fresh install NOT RUN
  (dependencies preinstalled; no downloads authorized). AI eval inapplicable.

Intended conventional commit subject/body written to
`/private/tmp/jg-msg-ent-3a.txt`. No commit, add, checkout, fetch, merge, push,
PR, deployment or release. Dispatcher commits the working-tree changes.
Independent recorded exact-commit verdicts, separate acceptance and CI remain
owed. Builder self-review and deterministic/test-executed evidence only;
not independently verified, not accepted. F2, UI, D16/G1/ENT-14 and the other
existing held items remain open.


## Mac verification (12 Oct, final)

Mac-side helper, 12 October 2026, worktree `.worktrees/ent-3a`, branch `codex/sandbox/ent-3a`. Starting head `9afb519` (clean, local only, never pushed). No review, no verdict, no merge to main, and no product code changed beyond the merge itself. **Head tested: `6aef5a6759092ec8145281802b7da546467719eb`** ("Merge main (ad1bad2) into ENT-3a", working tree clean at test time). This receipt is committed on top of that head as the only change after the tests; the push is that receipt commit.

**Merge.** `git fetch origin`; `git merge origin/main` (ad1bad2) as a plain merge commit. Auto-merged: `BUILD_PLAN.md` (ENT-3a ledger paragraphs sit after main's PRACTICE-FACTS-1 paragraphs), `config/agent-lane-assignments.json` (parses), `packages/core/src/watchdog.ts`, `apps/api/src/workspace/index.ts`. Conflicted and resolved by keeping both sides, main's lines first:

- `packages/db/src/migrate.ts`: list now ends `... 0129, 0130, 0131, 0135` (0132 SV-4, 0133 SV-3 and 0134 CH-7-TERMS are reserved by other open pieces and are not listed).
- `packages/core/src/index.ts`: main's `practice-facts.js` export, then `site-extra.js`.
- `packages/db/MIGRATIONS.md`: main's `## 0131 — PRACTICE-FACTS-1 part A` section, then `## 0135 — site extra authority (ENT-3a)`.
- `apps/api/src/app.module.ts` (the one long `@Module` line): started from main's line (which has `PracticeFactsController`) and inserted `SiteExtraController,` in front of `SsoRequiredController,`. Character-level diff of the resolved line against main's line: exactly one insertion, `SiteExtraController,`. Against this branch's previous line: exactly one change, main's `PracticeFactsController` appended after `IdentityController`. Each addition appears once.
- `apps/api/src/workspace/application.ts` (the one long `return Object.freeze({...})` line): started from main's line (which has `practiceFacts:Object.freeze({...})`) and inserted ` siteExtras: Object.freeze({ log: (jobId: string, raw: unknown) => siteExtras.log(contractorPrincipal, jobId, raw) }),` directly after `ssoRequired,`; the line `const siteExtras = new SiteExtraApplication(dependencies.pool);` sits just above it. Character-level diff against main's line: exactly one insertion, the `siteExtras` entry above. Against this branch's previous line: exactly one insertion, main's `practiceFacts` entry.
- `apps/api/openapi.json` was NOT hand-merged: main's file was taken (`git checkout origin/main -- apps/api/openapi.json`) and regenerated with `pnpm openapi:generate` in `apps/api` (exit 0). The result is main's file plus 91 added lines and no removed lines; the site-extras operation documents 200, 201 and 409. JSON parses.

Migration 0135 file sha256 after the merge: `1e3119299e15572885633d5f892f2bc385756589e65a1b280d476f5c5cc74eab` (unchanged).

**Set-up.** `@jobguard/core`, `db`, `storage`, `config`, `ai` each built alone (all exit 0), then `@jobguard/api` (`nest build`, exit 0), all after conflict resolution and before the openapi regeneration. Every heavy command ran through `~/.local/bin/heavy-slot`; vitest used `--maxWorkers=2` (db files `--maxWorkers=1`), at most three test files per run, one heavy step at a time. Embedded PostgreSQL started normally.

**Commands, exits and counts (head `6aef5a6`).**

| Check | Exit | Result |
|---|---|---|
| core `src/site-extra.test.ts` | 0 | 1 file, 35 passed |
| db `test/site-extra-authority.integration.test.ts` (includes the upgrade proof), `test/site-extra.integration.test.ts`, `test/contractor-session-context.integration.test.ts` | 0 | 3 files, 78 passed |
| api `src/contractor/site-extra.application.test.ts`, `src/contractor/site-extra.http.test.ts`, `src/watchdog-registry.test.ts` | 0 | 3 files, 178 passed (registry 121, as expected) |
| api `src/auth/context-boundary.test.ts` | 0 | 1 file, 145 passed |
| api `src/audit-export` | 0 | 2 files, 30 passed |
| web `app/api/contractor/jobs/[id]/site-extras/route.test.ts` | 0 | 1 file, 30 passed |
| `pnpm test:migrations` (db `tenancy`, `demo-bootstrap`) | 0 | 2 files, 13 passed |
| db neighbours that install the whole registry: `audit-export.integration`, `extra-origin-upgrade.integration` (the only file matching `extra-origin-upgrade*`), `sso-required.integration` | 0 | 3 files, 29 passed |
| `pnpm typecheck --concurrency=2` | 0 | 7 of 7 tasks |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=2` | 0 | core purity (133 TypeScript files), lane boundary (lane ent-3a, branch registered, 26 files, includes `0135_site_extra_authority.sql`), money arithmetic, 7 of 7 package tasks |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | lane boundary passed, base ad1bad2 |
| `pnpm openapi:check` (in `apps/api`) | 0 | committed `openapi.json` matches the generator |
| `git grep -n "resolveVerifiedTenantContext\|verifiedTenantContextFromMembership\|bridgeMarker" -- 'apps/api/src/contractor/site-extra*' 'packages/db/src/site-extra*'` | 1 | no output (no match) |

**NOT run.** The full root `pnpm test`; the full `packages/db` suite (only the files in the table); the rest of the `apps/api` and `apps/web` suites; `pnpm test:e2e` and any browser run; GitHub CI and the 45-minute CI job; the db unit file `contractor-session-context.test.ts` (only the integration file was assigned); any independent Claude or Sol review. No deployment. Nothing here is an independent verdict. Not independently verified, not accepted, not released.
