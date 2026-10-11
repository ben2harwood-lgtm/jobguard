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
