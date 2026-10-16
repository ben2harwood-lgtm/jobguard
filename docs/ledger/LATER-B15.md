# LATER-B15 — material corrections and operational transport errors

Status: partial build; PARK under decision 74. No acceptance or independent verdict is claimed.

Base/unchanged HEAD: `31682762c903d716657c573e1b5deae63588aad7` (local `origin/main`), newer than the order's `ca435ee` and draft `0bbb5ddb` bases. Current main governs.

L084–L087 and L066: five existing Nest controllers use a narrow local error mapper. Invalid Zod commands return `400 INVALID_COMMAND`; exact known domain conflicts return 409; exact missing-resource and invalid-domain codes return 404/400. Existing practice, watchdog, work-state and HTTP errors retain their original identity and filters. Unknown faults return `500 INTERNAL_ERROR` without internal text. Application authentication, schemas, repositories, policies, routes and live guards are unchanged.

L083: STOP pending a numbered coordinator ruling for the merged SQL fixture at `apps/api/src/material.application.test.ts:25` and `:37`. The conversion-reuse implementation needs INSERT result metadata which the fixture omits. The repository edit was restored to main; five prospective real-PostgreSQL tests were added but NOT RUN and do not represent a completed repair. The receipt gives exact before/proposed-after lines. Do not merge this incomplete piece.

No migration or production GRANT. No real data, provider calls, charges, Git writes or UI changes. No new command or route; existing command classifications and guards are preserved. Tests use fictional inputs and injected application failures; they are transport evidence only.

Evidence and remaining CI/RED review requirements: [builder receipt](../verdicts/LATER-B15/BUILDER_RECEIPT.md). Intended commit message: `/private/tmp/jg-msg-later-b15.txt` (dispatcher commits; builder does not).
