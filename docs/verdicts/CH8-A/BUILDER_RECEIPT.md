# CH8-A builder receipt — preparation only

Issued build-only 23 October 2026 under decision 74. Builder: Codex.
Base and unchanged HEAD: `dc5721230fd8aedbf2d9d0457789074b66b48765` (`origin/main`).
Branch: `codex/sandbox/ch8-a`; integration target: main, after predecessors only.
No commit, push, PR, migration, enablement or shared-file edit. Ben owns merge.
This receipt is source-inspected/test-executed evidence, not an independent
model verdict, professional sign-off or separate technical acceptance.

## Authority and scope

Read full repository AGENTS.md; BUILD_PLAN.md CH-8 and §§10.2.3–10.2.8;
Astra corrected DRAFT lines 6367–6410, surrounding CH-8 verified-source table,
and this planning pack's common contract §§2.1–2.5. Issued user order replaces
the proposed draft branch/lane names with this branch and `config/lanes/ch8-a.json`.
Only the four draft functional files, that lane file and this receipt are added.
Lane shape was read with `git show codex/sandbox/ch5-c:config/lanes/ch5-c.json`.
The JSON functional allowlist excludes the registration path as required.

Implemented strict unbound-specimen manifest/export schemas, all eight declared
section kinds, exact owner/version/object/hash links, microsecond cutoff checks,
locale-independent canonical JSON, both SHA-256 digests, standalone specimen
verification, golden fixtures and adversarial unit tests. No fee calculator.
`complete` is always false and `producerBindings` always held. A trusted matching
checkpoint can establish `specimenIntegrityComplete` only. The new contract lists
all unresolved producer mappings and the narrower preparation acceptance scope.

Specimens include pre-lock ordinary, each post-lock section, settled catch,
unpaid, disputed, early-disclosed, late-evidence and appended reversal. They are
not authentic producer facts or DEMO seeds. Golden digests were generated with
Python standard-library UTF-8 SHA-256 and sorted canonical JSON independently
of the TypeScript renderer. Original strings preserve Unicode, rational text
and microseconds; lone surrogates reject instead of silently replacing UTF-8; no producer allocation representation has been invented.

## Source inventory and item STOPs

Read-only helper `/root/verify_sources` used `git grep`; no implementation or
independent review was delegated. Existing named source symbols/paths were
checked against this actual base, rather than assumed from the draft:

- v1 `buildEvidenceManifest`, `canonicalManifest`, `manifestDigest`,
  `renderStandalonePack`, `verifyStandalonePack`, public `sha256`, banner,
  v1 schemas/tests: present. Private `canonical` remains private and unused.
- Existing `EvidencePackRepository` current/list/generate/approveAttachment/
  inspect/download; source assembler; actual API application/controller and
  PracticeAccess.case/practiceMaterialPool: present, read-only.
- Exact four Next route files and existing evidence-packs UI, M4-3-S browser
  spec, both `mobile-360`/`desktop` project names: present, read-only.
- `FinalAccountLockRepository.read/verify`, `ShadowRepository.reveal`,
  `shadow-read.v1`, `app.reveal_shadow_signals`, shadow worker
  `app.surface_shadow_signal_early`: present. None is composed into a new export.
- Existing shadow attribution/lock schemas and helpers: present under
  `packages/core/src/shadow-domain/attribution.ts` and `lock.ts`.
- Existing `app.recovery_message_sources_current`/latest-pack sink source
  references: present; no compatibility claim or SQL change.
- `packages/db/tools/verify-evidence-pack.mjs` and its test are present here;
  the planning ZIP's absent-CLI note does not apply to this checkout.
- Proposed v3 API names were absent before this work, as expected NEW targets.

**STOP-REF-1:** packet path `requirements/BUILD_PLAN.md` is absent here. Read
actual root BUILD_PLAN.md (CH-8 at line 2043); no missing implementation inferred.
**STOP-REF-2:** `requirements/2026-10-20-speed-v5-milestone-and-deferrals.md`
is absent repository-wide. Its quoted evidence is not independently verified.
These STOPs affect only those reference paths; preparation continued under the
issued order and actual root contracts. No named existing code-symbol STOP arose.

## Environment and commands actually run

Existing dependencies only; no install, package download command or lock edit.
Actual Node is `v24.17.0`; `.nvmrc` pins `24.15.0`. This is not a clean pinned
CI-install claim. The default pnpm launcher emitted a pnpm-11 warning and stalled;
the first scoped test attempt was interrupted (exit 130). All subsequent pnpm
commands used the already-cached exact pnpm `10.28.1` through the external
`/private/tmp/ch8-a-bin/pnpm` shim, with `PATH=/private/tmp/ch8-a-bin:$PATH`.
No repository tooling was changed. `pnpm --version` then returned `10.28.1`.

Resource observations: `df -g .` reported 213 GiB available (>45 GiB).
`memory_pressure` reported 59% available initially, later 47%; heavy Turbo work
used `--concurrency=1`, units used at most two Vitest workers. One heavy command
was run at a time once below 50%. `ps` process inventory was sandbox-refused, so
host-wide process occupancy cannot be certified. No DB/browser service started.

| Actual command | Result |
|---|---|
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/evidence-pack-v3.test.ts src/evidence-pack.test.ts` before implementation | Expected RED: v3 module missing; unchanged v1 26 tests passed; process exit 1 |
| Same scoped test command after implementation | PASS, initially 63 tests; final expanded suite 64 tests, 2 files (26 existing v1 + 38 v3), exit 0 |
| `pnpm --filter @jobguard/core typecheck` | Initial exit 2: direct node:fs test import unsupported by core TS config; corrected using a JSON fixture import; subsequent PASS exit 0 |
| Same scoped tests during JSON import correction | One exit 1: relative computed JSON import resolved incorrectly; corrected to absolute file URL; final 64 tests pass |
| `pnpm --filter @jobguard/core lint` | Initial same test-import TS error, then PASS exit 0 after correction |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Exit 1: guard refuses self-comparison because unchanged HEAD equals origin/main |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=1` | Exit 1: core purity passed (230 TS files); same lane self-comparison stops root wrapper before remaining stages |
| `pnpm build --concurrency=1` | PASS exit 0: all 7 workspace tasks successful (2 cached); 1m42.78s; Next compiled and generated routes |
| `pnpm openapi:check` | Exit 1: tsx CLI IPC pipe listen EPERM in sandbox, before checker execution |
| `node --import tsx src/generate-openapi.ts --check` from apps/api | PASS exit 0; same OpenAPI checker via loader without tsx CLI IPC; no generated file write |
| `node tools/money-arithmetic-lint.mjs` | PASS exit 0 |
| `node tools/commercial-boundary-lint.mjs` | PASS exit 0 |
| `pnpm typecheck --concurrency=1` | PASS exit 0: 7 successful tasks (2 cached), 59.581s |
| `pnpm --filter @jobguard/core build` | PASS exit 0 on final domain source |
| `git diff --check` | PASS exit 0 for tracked changes; new-file whitespace also checked separately at final handoff |

Root build warnings: pre-existing dynamic Nest/load-esm dependency warnings,
Next CSS warning and multiple-lockfile root inference; Turbo cache IO EPERM
warnings did not fail the build. No build warning was represented as an error-free
log. Core purity reports computed imports, including the new test-only JSON
fixture URL; it does not certify those imports. Domain code has no network,
filesystem or provider import. No purity rule was changed or bypassed.

Full workspace build/typecheck passed before the final local Unicode-validation
hardening; the affected core typecheck, lint, build and scoped 64-test suite were
rerun successfully on the final domain source. The late-evidence specimen carries
a later ordinary evidence timestamp and an explicit absent-settlement lifecycle
reason; it does not masquerade as a pre-cutoff observation or settled proof.

Additional deterministic working-tree scope check used actual exported
`loadLanePolicy`, `selectLane`, `lanePathAllowed` and read-only
`git ls-files --others --exclude-standard -z`: PASS, exactly six permitted files,
zero disallowed. This is not a replacement for committed-range `lint:lanes`.
Full local logs are `/private/tmp/ch8-a-*.log`; final receipt retains the real
results even if those temporary logs are removed later.

## Preparation assertions versus held acceptance

| ID | Preparation evidence | Binding/runtime completion |
|---|---|---|
| EP-A01 | All 15 labelled specimens parse; strict versions/fields/hashes and lifecycle declarations tested | BLOCKED: all eight exact producer payload/provenance mappings |
| EP-A02 | Permuted input yields same canonical manifest/export/digests; independent golden digests; Unicode/microseconds/rational text retained | No producer timestamp/amount mapping claim |
| EP-A03 | Missing/tampered/wrong-version/object/owner/duplicate/extra originals and broken declared links fail closed | BLOCKED: authentic originals, producer identity/version mapping |
| EP-A04 | External checkpoint separated from content integrity; wrong digest refuses trust; complete always false | No real independent checkpoint or factual/legal validity claim |
| EP-A05 | Pre-lock ordinary specimen rejects section/shadow metadata shapes | BLOCKED: worker completion handoff, runtime zero/many noninterference and actual source selection |
| EP-A06 | v1 tests unchanged and pass; appended correction retains original specimen and exact link | BLOCKED: actual persisted settlement/reversal lineage EP-B06/EP-C06 |

Remaining holds: H-CH8-A-BINDING (accepted SV-5/SV-6/M4-8 versions/source-section
map); H-SV5/H-SV6/H-ALLOC; H-EP-MUST-SURFACE accepted worker request/completion
contract; H-PACK-CONSUMER version-aware source-current/latest-pack downstream
compatibility; coordinator-owned public exports; actual CH8-V runtime integration;
all EP-B/EP-C proofs; two actual independent Claude exact-commit verdicts; separate
acceptance and required CI. This preparation cannot close CH8-A or CH-8, satisfy
CH8-V/DEMO-S, approve policy, enable a feature or allow merge ahead of predecessors.

NOT RUN locally: PostgreSQL, migrations/fresh-upgrade/grants/RLS/concurrency,
browser/mobile-360/desktop, restores, live integrations/evals, full root tools/
package test suites and CI-only lane regression. These are CI-only under the
order/common contract (or unrelated subsystem gates); no migration, AI, native,
HTTP or web workflow was changed. Dispatcher must rerun root lint/lint:lanes after
its commit and run required CI. No existing test was weakened or deleted.

Intended dispatcher commit message: `/private/tmp/jg-msg-ch8-a.txt`.


## r1

23 October 2026 repair on `codex/sandbox/ch8-a`, inspected HEAD
`afab2eb8cb392ac329fedfdc2c9f65bd9ad27608`. Builder: Codex gpt-6.1-sol.
Read both named Claude REPAIR verdicts in full before editing, located at
`/Users/benharwood/.local/share/full-steam/jg-runs/`:
`v5-ch8-a-claude-A-afab2eb8-20261023.md` and
`v5-ch8-a-claude-B-afab2eb8-20261023.md`.
Read actual AGENTS.md, BUILD_PLAN.md CH-8 and the preparation contract/lane.
This receipt supersedes the original test-coverage claims for the confounded
negatives identified by those verdicts. It is builder test evidence only;
a new exact-commit independent verdict and separate acceptance remain required.

Scope: only the issued negative-test repairs and duplicate-key verifier defect.
Replaced whole-array malformed specimens with isolated changes to otherwise valid
full specimens and explicit passing controls. For schema guards, direct schema
assertions prevent downstream referential checks (or canonical re-rendering)
from masking removal. Added consistent pre-lock settled/reveal packs, an absent
section carrying sourceIds, a present section with empty sourceIds, isolated
unsectioned-source/count tests and two-link permutations. Preserved the existing
owner/content/link/cutoff/trust/reversal and v1 regression assertions.

Verifier now requires exact equality with `renderStandalonePackV3` before it
reports content/checkpoint trust. B's duplicate-content-key repro inserts the
forged value immediately before the genuine `specimen-lock` content and supplies
the correct independent manifest digest. It now throws `EvidencePackV3Error`.
Noncanonical whitespace is also rejected. Contract updated to state this deliberate
compatibility change; renderer bytes and fixture goldens are unchanged. Existing
content-tampering tests render canonical artifacts so they still exercise the
content checks. No v1, fixture, provider, DB, API, UI or barrel change; no migration
or new operational alert. The original producer/runtime/release holds all remain.

### Guard-removal evidence

Actually removed/weakened each guard below separately in the local source,
ran `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2
src/evidence-pack-v3.test.ts --reporter=json`, then restored the source.
All 25 runs exited 1 with assertion failures; zero survivors. Each row records
actual failing test names. No test was weakened. Final restored tests were rerun.
Temporary harness: `/private/tmp/ch8-a-r1-mutations.py`; complete JSON results:
`/private/tmp/ch8-a-r1-mutations.json`; per-mutation logs:
`/private/tmp/ch8-a-r1-mutation-{1..25}.log`. The first harness run's JSON
reader encountered pnpm's trailing failure text; extraction was corrected and
all 25 mutations were rerun successfully against the final repro/test source.

| Removed guard | Failing test name(s) |
|---|---|
| digest regex | `EP-A01: isolated digest regex rejection`; `EP-A01: isolated short digest rejection` |
| six microsecond digits | `EP-A01: isolated six microsecond digits input rejection` |
| calendar check | `EP-A01: isolated calendar input rejection` |
| ID Unicode | `EP-A01: isolated ID Unicode input rejection` |
| content Unicode | `EP-A01: isolated content Unicode input rejection` |
| link strict | `EP-A01: isolated link strict rejection` |
| descriptor strict | `EP-A01: isolated descriptor strict rejection` |
| source strict | `EP-A01: isolated source strict input rejection` |
| present section strict | `EP-A01: isolated present section strict schema rejection` |
| absent section strict | `EP-A01: isolated absent section strict schema rejection`; `EP-A01: isolated absent section with source schema rejection` |
| pre-lock lifecycle strict | `EP-A01: isolated pre-lock lifecycle strict input rejection` |
| post-lock lifecycle strict | `EP-A01: isolated post-lock lifecycle strict schema rejection` |
| input strict | `EP-A01: isolated input strict input rejection`; `EP-A05: pre-lock ordinary shape cannot carry shadow sections or metadata` |
| manifest strict | `EP-A01: isolated manifest strict rejection` |
| export strict | `EP-A01: isolated export strict rejection` |
| export version | `EP-A01: isolated export version rejection` |
| export banner | `EP-A01: isolated export banner rejection` |
| absent reason enum | `EP-A01: isolated absent reason enum schema rejection` |
| present section nonempty | `EP-A01: isolated present section nonempty schema rejection` |
| post-lock section count | `EP-A01: isolated missing lifecycle declaration rejection` |
| unsectioned source | `EP-A01: isolated unsectioned source rejection` |
| pre-lock guard | `EP-A05: consistent settled_catch sections are forbidden before lock`; `EP-A05: consistent section_reveal sections are forbidden before lock` |
| manifest link sorting | `EP-A02: multiple declared links canonicalise in either order` |
| export source link sorting | `EP-A02: multiple declared links canonicalise in either order` |
| canonical bytes check | `EP-A03: duplicate content key before the genuine content refuses trusted verification`; `EP-A03: noncanonical whitespace refuses trusted verification` |

### Checks actually run

Existing installed dependencies only; no download/install or lockfile edit.
Node `v24.17.0` (repository pin `24.15.0`), cached pnpm `10.28.1` via
`PATH=/private/tmp/ch8-a-bin:$PATH`; this is not a clean pinned-install claim.
Logs use `/private/tmp/ch8-a-r1-*.log`.

| Command | Result |
|---|---|
| `pnpm --filter @jobguard/core typecheck` | PASS exit 0; rerun after final restoration |
| `pnpm --filter @jobguard/core lint` | PASS exit 0; rerun after final restoration |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/evidence-pack-v3.test.ts src/evidence-pack.test.ts` | PASS exit 0, 96 tests: 70 v3 and 26 unchanged v1 |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2` | FAIL exit 1, 5 failures / 5990 tests; 5985 passed. Vitest also discovered generated `dist/*.test.js`; five source-inspection assertions tried to open nonexistent `dist/*.ts` files (jobs-on-the-go, recovery-allocation, site-extra-pricing, subscription-architecture). No test/config/output was deleted or weakened to suppress this. |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src` | PASS exit 0, all 3011 tests across 123 source files |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | PASS exit 0; committed-range check against base dc572123 through afab2eb8 |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=1` | PASS exit 0, all 7 workspace tasks; includes purity, lane, money and commercial checks |
| `pnpm typecheck --concurrency=1` | PASS exit 0, all 7 workspace tasks |
| `pnpm build --concurrency=1` | PASS exit 0, all 7 workspace tasks (2 cached); 1m50.551s |
| `pnpm openapi:check` | FAIL exit 1: sandbox refuses tsx CLI IPC pipe listen (EPERM) before checker execution |
| `node --import tsx src/generate-openapi.ts --check` in apps/api | PASS exit 0, same checker without CLI IPC |
| `git diff --check` | PASS exit 0 |

Build emitted existing Nest dynamic-dependency/Next lockfile/CSS warnings and
nonfatal Turbo cache IO EPERM warnings; this is not a warning-free-build claim.

Working-tree scope is separately checked against `config/lanes/ch8-a.json`;
committed-range lane lint alone cannot certify these uncommitted edits.
No DB/PostgreSQL, migrations, browser, service listener, live provider/eval or
native suite was run, per dispatcher/environment constraints and unchanged
subsystems. Dispatcher owns CI checks after committing. No commit, push or PR
performed. Intended conventional commit subject/body saved to
`/private/tmp/jg-msg-ch8-a.txt`.

## make PR green

25 October 2026; dispatched local head `121936e4d5ca7bf5a5e5f773ec4e18a4af8eae0d`,
including the dispatcher's merge of main `5bcd5ede90b84afbb7d1924d91c015dc07d7bd32`.
Read AGENTS.md, BUILD_PLAN.md CH-8 and §§10.2.3–10.2.8, preparation contract,
lane and existing receipt. Builder evidence only; no independent acceptance.

No compatibility defect reproduced. CH8-A already uses Zod 4-compatible inferred
types and public schema APIs; it contains no ZodTypeDef, private schema internals
or one-argument z.record. All strict-object guards, fixture goldens, canonical
bytes and existing assertions remain unchanged. No source/test/scanner, policy,
dependency, migration or lane edit was needed. Only this receipt changes.

Existing dependencies only: Node `v24.17.0` versus `.nvmrc` `24.15.0`; cached
pnpm `10.28.1` via `PATH=/private/tmp/ch8-a-bin:$PATH`. No install or download;
this is not a clean pinned-install claim. Moved all five existing `packages/*/dist`
directories to `/private/tmp/ch8-a-green-dist/{core,config,storage,ai,db}` before
core typecheck and the whole core suite. Build subsequently regenerated outputs.
Logs: `/private/tmp/ch8-a-green-*.log`.

| Command | Result |
|---|---|
| `pnpm --filter @jobguard/core typecheck` with no package dist present | PASS, exit 0 |
| `pnpm --filter @jobguard/core test --maxWorkers=2` | PASS, 3,077 tests across all 130 source test files; includes enterprise boundary scanner |
| `pnpm --filter @jobguard/core lint` | PASS, exit 0 |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | PASS, exit 0, base 5bcd5ede / head 121936e4 |
| `node --test tools/*.test.mjs` | PASS, 295 tests; zero skipped |
| `pnpm typecheck --concurrency=1` | PASS, exit 0; all 7 tasks, 2 cached |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=1` | PASS, exit 0; all 7 tasks, 2 cached; includes unchanged purity, lane, money and commercial checks |
| `pnpm openapi:check` | Sandbox EPERM creating tsx CLI IPC listener, before checker execution |
| `node --import tsx src/generate-openapi.ts --check` in apps/api | PASS, exit 0; same checker without CLI IPC |
| `pnpm build --concurrency=1` | PASS, exit 0; all 7 tasks, 2 cached |
| `git diff --check` | PASS, exit 0 |

Build retained existing Next workspace-root, Nest/load-esm dynamic-dependency and
CSS warnings. Turbo reported nonfatal cache IO EPERM warnings. No warning was
suppressed. Final working-tree scope check: this allowed receipt only.

Read-only `gh pr checks 330` initially could not reach GitHub in the sandbox;
the permitted escalated read succeeded. At observation, core/web were pending,
secrets/dependency-review passed. `gh pr view 330 --json headRefOid,baseRefOid,state,url`
reported remote head `ea5c131e083a105f23d137878156c6eadf0fd66c`, base 5bcd5ede.
That remote head precedes this dispatched local merge; its CI is not evidence for
121936e4. The three functional code/contract files have no diff between remote
head and local merge. Dispatcher must push the local candidate and require its
full CI, including PostgreSQL and browser suites. No listener or database started
locally; full workspace tests needing those services remain CI-only.

No commit, push, checkout, acceptance, enablement or release performed. Original
producer/runtime/review holds remain. Intended commit subject/body is saved at
`/private/tmp/jg-msg-ch8-a.txt`.

Size: +54/−0 lines across 1 file; largest touched logic file: 0 lines (receipt only); new abstractions: none.
