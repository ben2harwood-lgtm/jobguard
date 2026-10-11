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
