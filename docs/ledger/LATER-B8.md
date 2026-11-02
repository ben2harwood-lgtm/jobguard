# LATER-B8 — Capture boundaries, provenance and races

Built locally with synthetic fixtures only; PARKED under decision 74. No acceptance or independent verdict is claimed.

- Base inspected: `origin/main` and HEAD `31682762c903d716657c573e1b5deae63588aad7`, ahead of the issued `ca435eeb5791638c787c830d6ba717146f694539` and draft `0bbb5ddb`. Current main controls.
- L011: review schemas reuse the existing money limit and six-place quantity parser.
- L012: capture replay binds text, source kind, complete acquisition metadata, parsed proposal including source spans, prompt/schema versions and model. JSONB equality ignores object key order.
- L013: an added test makes both request revision fields agree, then expects the existing stored-revision guard's typed refusal. No merged test or review repository change.
- L018: a transaction advisory lock precedes replay lookup and inserts. Added PostgreSQL overlap and rollback coverage; no database execution here.
- No migration, new production GRANT, route, UI, dependency, provider call or Git write. Existing command/audit implementation remains unchanged.
- Verification: `git diff --check` passed. Core Vitest did not start: pinned pnpm's signature verification refused execution. Forced typecheck/lint/build, OpenAPI, DB and browser checks are NOT RUN. Lane lint exited 1 on its unchanged self-comparison guard; the named lane registration is also absent.
- Dispatcher prerequisites: register `config/lanes/later-b8.json`, commit the working tree through the normal process, restore verified pinned pnpm availability, run checks, then obtain RED independent verdicts on that exact commit and separate acceptance. Never merge, enable or deploy without Ben's button.

Detailed commands, hashes, limits and STOP evidence: `docs/verdicts/LATER-B8/BUILDER_RECEIPT.md`.
