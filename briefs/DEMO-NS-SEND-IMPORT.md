DEMO-NS-SEND-IMPORT (JobGuard, demo-critical for Tommy's Sunday 22 Nov demo; not RED: import fix only, no behaviour change)
Base: current origin/main. New branch codex/sandbox/demo-ns-send-import. Push, no PR.

PROBLEM (hosted demo, Cloudflare OpenNext build, next build --webpack): webpack does not map a `.js` ending on a DYNAMIC relative import to the `.ts` source, so it bundles a stub that throws MODULE_NOT_FOUND on every call. Confirmed in the deployed chunk .open-next/server-functions/default/apps/web/.next/server/app/api/northside/extras/[extraId]/[action]/route.js. Vitest maps .js->.ts, so unit tests pass.
1. apps/web/app/api/northside/extras/[extraId]/[action]/route.ts:119 (send branch): `const { identityApplication } = await import("../../../../../lib/identity-server.js");` -> breaks Northside "Approve, sending to the client".
2. apps/web/app/api/jobs/[id]/relevance-inbox/decisions/[decisionId]/route.ts:33: `await import("../../../../../../lib/inbox-metrics-server.js")` -> breaks relevance-inbox dismiss.

SMALLEST FIX
- Route 1: add a static `import { identityApplication } from "../../../../../lib/identity-server";` beside the existing imports (same form other routes use) and remove the dynamic import at :119. Behaviour identical.
- Route 2: static `import { recordInboxDismissal } from "../../../../../../lib/inbox-metrics-server";` (use the real exported name(s) the route uses), remove the dynamic import.
- Update any vi.mock path that uses the `.js` form for these two modules (e.g. send-expiry.test.ts:12) to the no-extension form. No assertion changes.
- If a static import is impossible for a real reason (server-only cycle, edge bundling), keep it dynamic but drop the `.js` ending, and say why.
- Also grep apps/web/app (excluding tests) for any other relative dynamic `import("./...js")` / `import("../...js")`; fix only ones that are the same bug, list them.
CHECKS: whole apps/web unit suite (--maxWorkers=2), typecheck, lint, lane lint (new config/lanes/demo-ns-send-import.json, exact changed paths, not itself); then build the Cloudflare bundle (pnpm --filter @jobguard/web build:cloudflare) and prove `grep -rl "Cannot find module '" apps/web/.open-next/server-functions` finds NOTHING (it finds 2 files on main); run the Northside e2e specs that cover send-to-client (e.g. ENT-11b*.spec.ts, ENT-5b*) and the relevance-inbox spec headless. Commit, push, report the full 40-character SHA and the grep result before/after.
# Keep it simple: rule for every Codex build order

Revision: rev 2, 25 Oct 2026 (Ben's card simplicity-check-before-launch; original rules from Keep It Simple plan rev 3, section 2; Ben-approved coding-run audit additions 7–11).
Build dispatchers append this whole file to every Codex build prompt, so an edit here reaches every later build.

**KEEP IT SIMPLE — builder rule.** Build the smallest clear, maintainable solution that fulfils the approved
task and preserves all required behaviour and controls.

1. Reuse suitable existing code before introducing new abstractions.
2. Do not introduce speculative frameworks, versions, configuration switches or layers. Preserve anything
   required by approved contracts, including compatibility and recovery.
3. Prefer one authoritative source for a fact, except where separate sources or independent verification are
   deliberately required.
4. Keep functions and files understandable. Treat 80-line functions, 800-line files and 1,500-line files as
   prompts to investigate, not automatic failures. Data-heavy files are exempt from size-based criticism.
5. Never simplify away child safety, privacy, identity, financial controls, access restrictions, audit evidence,
   data protection or independent acceptance.
6. Never refactor unrelated code during a repair or catch-up. Never change checks, protected fingerprints, stored
   formats or approved interfaces without the required separate authorisation.

7. After reading required instructions, inspect the affected source, callers and tests. Search explicit paths first; exclude generated evidence, logs and dependency trees unless they answer a specific question. If output is truncated, narrow the query. Once the behaviour and affected path are clear, implement.
8. Use an explicit working directory and the repository's existing interpreter, dependency tool and test runner. Establish these from available configuration once; do not guess paths or rediscover them between commands. Before a long or permission-gated run of a new helper, perform its cheap syntax/import check where available.
9. Reuse existing parsers, validators and test helpers before writing alternatives. Keep repair diffs focused; avoid whole-file formatting and unrelated cleanup unless required by the repository. Preserve necessary compatibility, isolation and evidence binding.
10. Test the changed behaviour and the existing rules that depend on it, not just input syntax. When extending a state or format, inspect its consumers and cover affected open/closed, permission or failure boundaries. Confirm that new regression tests run through the actual repository test runner before handing them off.
11. Complete required checks and advance to the required review or handoff. Repeat or broaden checks only when a change, failure, specific unresolved risk or explicit gate requires it. Keep evidence in the existing receipt. A real external hold blocks the affected action; it does not justify speculative code or new reporting machinery.

Explain any substantial new complexity in the existing task receipt. Do not introduce another reporting document.
