# LATER-B11 — Security guard negative controls

Status: built in the working tree; partial evidence; RED review pending; PARK under decision 74. No technical acceptance, commit, push, merge, enablement or deployment.

Base inspected: `origin/main` and HEAD `7ff452eeec1c523345d34715adfa3f8310062013`. Current main wins over the order's `ca435eeb5791638c787c830d6ba717146f694539` and draft `0bbb5ddb` bases. C5/C6 remain at BUILD_PLAN.md:117/119; the ENT-10 audit-export contract remains at :1055.

| Item | Change | Evidence |
| --- | --- | --- |
| L004 / dbsrc-00#4 | Follow initialized `let` loader aliases, including a createRequire alias and chained require aliases. | Both new controls failed before the guard change; handoff unit file now passes. |
| FL104 subprocess clause | Inspect textual arguments to imported child_process launch functions for the handoff module, CLI or package-script reference. Named aliases, namespace/default imports, argument arrays, constant paths and node eval text have fixtures. | Seven new controls failed before the guard change; benign launches, comments, unrelated functions and shadowed parameters remain accepted. FL104 is PARTIAL; its other notes and FL105 remain outside this order. |
| L022 / api-commercial#2 | Add a separate real-PostgreSQL proof: hold the job row FOR UPDATE, observe the command's backend blocked by that holder, verify no completion/audit advance, release, then check one transition, replay and audit continuity. Add a SELECT-only control that the same observer refuses. | Two integration cases written, NOT RUN (cannot start PostgreSQL in this sandbox; CI/dispatcher execution required). |

No migration, new GRANT, application route, production permission change or operator execution. Standard F: no direct INSERT/UPDATE/DELETE grant to jobguard_runtime was added. The integration file reuses the existing synthetic cluster and runtime login without changing its setup. No existing test assertion, count, pin or fixture was edited; only the expressly allowed scanner helper was extended and new cases added.

STOP: coordinator-owned `config/lanes/later-b11.json` is absent (insertion line 1); no replacement lane registration was written. The boundary check also refuses comparison of uncommitted HEAD to identical origin/main at tools/agent-lane-boundary-lint.mjs:303. Neither check is weakened. See BUILDER_RECEIPT.md for the exact before/after registration and run evidence.

Independent RED verdicts and separate acceptance are pending. All data used by the added fixtures is made up; the integration tests have not executed locally. The piece stays PARKED after checks until Ben authorizes further action.
