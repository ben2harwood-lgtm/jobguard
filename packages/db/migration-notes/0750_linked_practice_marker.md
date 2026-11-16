# real-wayin-linked-practice-web r2 — authoritative linked marker

RED: sign-in, sessions and tenant isolation. Built from caa143309. This sandbox
cannot write .git, so fetch/merge of current origin/main remains router work.
The locally recorded origin/main ends at b3b1f75bf and includes migrations through
0743. 0744 is the next local number, not a claim of a coordinator reservation;
the router must reconcile the number with current main before committing.

The existing private identity_practice_credential association is the marker. It
is written server-side only by linked entry. The new runtime-only SECURITY
DEFINER accessor reads that marker; it neither infers linkage from a token or
ownership digest nor trusts a browser flag. Its search path is pg_catalog and
its private relation is qualified. No table grants or stored data change.

The web guard queries the marker after ordinary practice authentication. Linked
credentials retain r1's full HMAC receipt, constant-time verification and live
identity/SQL checks, including when the receipt is absent. Non-linked sessions
follow the ordinary demo path even with a leftover pairing receipt. Shared
practice authentication and its historical upgrade paths are unchanged. Entry
CSRF/origin handling, cookies-after-commit and sign-out-after-revocation remain
unchanged. The one spec's cleanup backdates only its consumed, verified fictional
challenges by 601 seconds, covering both the 60-second resend cooldown and the
600-second per-email window. Production rate limits are unchanged.

Rollout: apply the additive migration before deploying the changed web guard.
The accessor is required; missing/malformed results or database errors fail
closed, never silently selecting anonymous access. Forward fix: replace the
accessor under the same owner/ACL. Roll back the web code first, then revoke and
drop only this accessor if necessary. The private associations and all jobs stay
intact. No new operational alerts, provider calls or release authorization.

The catalog proof contains expected source-derived changes, not observed
PostgreSQL evidence. Its function-definition formatting was cross-checked
against the existing 0738 quote_practice_owners expectation. Real fresh/upgrade
catalog, grants, RLS, and route evidence remain CI gates, as does independent RED
review at the final merged head.

## Local commands and results

All commands use installed binaries, Node 24.17.0 and Vitest 4.1.12. Each Vitest
run names at most three files and sets at most two workers.

- `./apps/web/node_modules/.bin/vitest run --root apps/web --maxWorkers=2 app/lib/linked-practice-entry.test.ts`
  — before the fix: 13 passed, 2 new regressions failed. This reproduced the
  guard's digest-inference defect in units, not the full LS-140 browser failure.
- `./apps/web/node_modules/.bin/vitest run --root apps/web --maxWorkers=2 app/lib/linked-practice-entry.test.ts app/api/auth/practice/route.test.ts app/api/session/route.test.ts`
  — final: 35 passed, 3 files.
- `./apps/web/node_modules/.bin/vitest run --root apps/web --maxWorkers=2 app/api/auth/signout/route.test.ts app/api/practice-company/route.test.ts app/sign-in/sign-in.test.tsx`
  — 28 passed, 3 files.
- `./packages/db/node_modules/.bin/vitest run --root packages/db --maxWorkers=2 test/migration-proof-loader.test.ts test/lp-0-catalog.test.ts src/blank-practice-company.test.ts`
  — 114 passed, 3 files. Source/proof checks only, not live catalog evidence.
- `./packages/db/node_modules/.bin/tsc -p packages/db/tsconfig.json`
  — passed; installed database package build.
- `./apps/web/node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit`
  — passed; web typecheck/lint script equivalent.
- `./apps/web/node_modules/.bin/playwright test --config apps/web/playwright.config.ts --list --workers=2 --project=mobile-360 --project=desktop later-safety-140.spec.ts WALK-3.spec.ts M0-6L.spec.ts real-wayin-linked-practice.spec.ts`
  — 30 tests collected in 4 files at both configured widths. Collection only.
- `git diff --check` — passed.

The final environment instruction prohibits database/browser execution here
(PostgreSQL cannot start and localhost cannot bind). No full LS-140 reproduction,
route integration or browser pass is claimed. The requested runtime commands
must run in CI after the router merges current main and pushes:

- `pnpm --filter @jobguard/web exec vitest run --maxWorkers=2 app/api/auth/practice/route.integration.test.ts`
  — not run locally; CI required, including new marker/ACL assertions.
- `pnpm --filter @jobguard/web exec playwright test --workers=2 --project=mobile-360 --project=desktop later-safety-140.spec.ts WALK-3.spec.ts M0-6L.spec.ts real-wayin-linked-practice.spec.ts`
  — not run locally; headless CI required. Includes LS-140 at both widths and
  this piece's multi-device sign-ins without weakening production throttling.
- `pnpm test:db`, `pnpm test:migrations`, and required typecheck/lint/test/build
  — full mandatory checks remain CI gates. Named local runs above are not full
  suite passes.

READY for router commit/CI handoff only; no commit, push, independent approval,
merge, deployment or launch was performed in this sandbox.
