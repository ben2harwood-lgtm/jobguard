# CH-8 part 3 — RED synthetic evidence-pack activation

Plan: BUILD_PLAN.md CH-8, finish-list row 11. Branch codex/sandbox/ch8-p3, built on ch8-rest
and the router's pending SV-6 merge. Resolved packages/db/src/index.ts by keeping both exports;
the router must stage it to clear the unmerged index. No git mutation was attempted here.

The application queues v3 generation/approval; 0327 installs the checked SQL writer and extends
post-lock material with SV-6 stored receipt facts, allocations, exact invoice bindings/invoiced
lines and payment/adjustment history. Ordinary pre-lock material still exits before hidden reads.
0306 retains its refusal without unreachable code. Existing v1 storage/behavior and privileges
remain intact. Shared command receipts exclude cross-family IDs; worker completion rechecks the
receipt, session, case/job, material and canonical bytes. Case -> stored-line -> job locking matches
SV-6. The separate queued worker is required to keep hidden credentials out of runtime requests.

New CI tests cover SQL-versus-TypeScript canonical byte equality (including Unicode, control
characters, microseconds and rational text); actual generation/approval/replays; altered artifacts;
material forged with another job; cross-session/tenant reads; consumed allocation capacity;
locked original versus supplementary descendant invoice references; stale approval after refund;
immutable old packs and appended attribution/reversal history. A fresh shadow-30000 fixture runs
existing commercial writers from a £30,000 baseline to settled catch, allocation and attribution.
Source evidence/classifier proposals are controlled fixtures, not detection accuracy or live AI
proof. The browser test then builds/approves through the UI and existing worker, downloads, checks
all eight sections, compares the offline CLI report and verifies persistence on reload.

SB-02 activation coverage runs the actual worker with its deterministic must-surface reader/sink,
compares completed pre-lock artifact bytes and ordinary revisions with zero versus 100 hidden
signals, compares runtime statement shape, and inspects the ordinary SQL branch for hidden reads.
This is structural timing coverage, not a measured wall-clock constant-time claim. Must-surface
fixtures are excluded from equality. No real customer data, live provider, money or release.

Validation actually run locally:

- Installed Vitest 4.1.12, maxWorkers=1: API evidence-pack-v3.application, worker and controller:
  22 tests passed; core evidence-pack-v3-assembly, evidence-pack-v3 and evidence-pack: 99 passed;
  db verify-evidence-pack-cli: 5 passed (126 total).
- Installed tsc with package tsconfig.json: core/config/storage/db builds passed; API, web and db
  typechecks passed. These package checks are also their TypeScript lint checks.
- Changed PostgreSQL test files transpile without syntax diagnostics; Playwright --list discovers
  the two CH-8 tests on both mobile-360 and desktop. No DB/browser execution was attempted.
- git diff --check, core purity, money-arithmetic and commercial-boundary checks passed.
- Full tools/lint.mjs stops at lane boundary: comparison with current main includes inherited
  ch8-rest and staged SV-6/other prerequisite changes outside this piece's exact lane. Do not
  broaden the lane to hide that; router must reconcile prerequisite ancestry/current-main CI.
- Initial pnpm invocation failed its automatic version-signature fetch in the restricted network;
  all successful checks used installed package executables, with no package download/install.
  Two mistaken root-level tsc invocations used the root base config instead of package configs
  and failed on repository-wide decorator/test settings; corrected package checks passed above.

CI must execute the new PostgreSQL command, post-lock, isolation and 0327 upgrade suites (including
non-superuser migration install, preserved rows/types/keys/grants and reruns), existing #346/#356/#368
SV-6/allocator adversarial suites, CH-8 browser tests and required full current-main checks. SQL byte
parity and the browser journey are source-inspected/test-authored, not locally test-executed or
independently verified. One fresh independent Claude RED review remains required. No separate
security/commercial approval, production enablement or fee authorization is inferred.

LATER / SIMPLICITY — packages/db/src/evidence-pack-v3-command.ts and the old preparation ports:
once compatibility consumers are migrated, consolidate the held sentinel/preparation seam around
the installed worker repository. This reduces competing entry-point explanations; it is outside
this activation and does not block it.

## RED repair round 1 — reviewer FAIL at 33414dcd

Fixed the disclosure defect in the activation candidate. 0327 now selects reveal and disposition
records only for a reveal classification bound to the current case's catch, via extra_origin,
variation_revision, case source references and the final-account line's actual revision-valued
source_id/commercial_revision_id. Processing sources and attempts export explicit ID/hash projections.
The wider hidden-path check also found whole-run classifications in the run-binding JSON and another
catch's signal ID in ordinary extra_origin rows: these are now projected/scoped too. Public original
evidence, accepted documents and commercial line history remain ordinary sources; hidden detector
inputs, classification lists and unrelated catch proofs are excluded. No grants or money writers change.

The PostgreSQL regression uses the real reconciler with three signals on one completed run: own
reveal, not_enough_evidence and a second revealed/confirmed catch. Negative controls verify all three
proofs actually exist. It checks exact own proof/disposition selection, explicit ID/hash-only source
shapes, absence of the two excluded signal IDs/descriptions from the full artifact, rejected hidden
proof injection and a separate ordinary recovery case receiving no catch proofs at all.

0306 restored byte for byte from origin/codex/sandbox/ch8-rest c0ac3776 (PR #389), verified with cmp.
The previous receipt's statement about removing unreachable 0306 code is superseded by this repair.
Resolved the current-main conflict in packages/core/src/index.ts by preserving evidence-pack and
meter-today exports. Verified the shared privilege expectation identities contain both HEAD and
origin/main sets; staged expectation rows from the router merge were preserved.

Local repair validation: 73 core evidence-pack v3/assembly tests and 25 API v3 application/worker/
controller tests passed using installed Vitest 4.1.12 with maxWorkers=1. Core and db package builds,
db typecheck, web typecheck, money/commercial boundary checks, changed PostgreSQL fixture/test syntax
and diff whitespace checks passed. PostgreSQL is unavailable in this sandbox: the new same-run
regression, migration installation, SQL canonical parity, earlier adversarial allocation suites and
browser journeys remain CI execution requirements, followed by the independent Claude RED recheck.
The router must stage the resolved index; no git-writing command was run.
