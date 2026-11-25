# Q41 · V2-D4B: crew briefs in the crew member's language (practice, paid service later)

> Ben, 25 Nov 17:37 UK: "Plan it with a paid service." Practice first. A real provider is wired only after Ben picks and pays for one, and real use waits for the privacy check (`reviews/v2/D4B-privacy-note.md`).

**Tier:** RED (data leaves JobGuard once a real provider is on). **Builder:** desktop Codex (lane A; no web Codex runner, 25 Nov). It needs no live database while building; CI1's seed job is the proof. Checker: Claude (rule 27). **Base (amended 25 Nov 18:00 UK, rule-23 planner miss: #916 has no web consumer of `CrewBriefApplication`):** D5B-B #954 `codex/sandbox/v2-d5b-b` @ df6371499, or v2/main once #954 has merged. **PR:** draft into `codex/sandbox/v2-d5b-b`, so CI1 runs. Retarget to v2/main after #954 merges. This round-1 hold doesn't count as a repair round. **Migration: 2052** (next free becomes 2053). **Plan check:** Astra, on frm-management-layer#3. Rules 1 to 29 apply, with a "Rules met" list in the PR body. Planner: Fable thread, 25 Nov.

## Dry-check against #954 @ df6371499 (rule 23; it carries #916's brief code unchanged)
- `packages/db/src/v2-crew-brief-repository.ts` lines 30 to 50 define `CrewBriefContent`, with these text fields: `trade`, `accessWindow`, `tasks[].title`, `tasks[].scope.description`, `tasks[].scope.unit`, `tasks[].visit`, `tasks[].owner`, `tasks[].proofNeeded[]`, `proofNeeded[]`. It holds no price, value or finding source (comment, lines 28 and 29). Photos are evidence ids.
- Briefs are saved per `(tenant_id, job_id, trade, expected_version)` in `app.v2_crew_brief` (`2007_v2_crew_brief.sql`), and are created through `CrewBriefRepository` with its audit batch (line 180).
- Application layer: `apps/api/src/workspace/crew-brief.application.ts`.
- **Screen:** `apps/web/app/(designed)/jobs/[id]/work/briefs.tsx`.
  - `TradeBrief` (line 18) renders one trade's saved brief:
    - access at line 68;
    - tasks at line 69;
    - photos count at line 77;
    - proof needed at line 78.
  - `Briefs` (line 95) lists trades and renders `TradeBrief` at line 115.
- **Route:** `apps/web/app/api/v2-backend/jobs/[id]/crew-briefs/route.ts`, with GET at line 16 and POST at line 42. Its tests are in `route.test.ts` beside it.
- apps/web has no jsdom, so screen logic goes in pure helpers tested directly, as in Q25.

## Build
1. **A translator port**, `packages/db/src/v2-brief-translator.ts`, with `translate({ texts: string[], target: Lang }): Promise<string[]>`.
   - Languages: Polish, Romanian, Portuguese, Lithuanian and Bulgarian to start, as a data list.
   - The only implementation in this piece is **`FakeTranslator`**: deterministic, offline, returning `[pl] <text>` and similar. No real provider, no network and no API key.
   - A real adapter is a later piece, once Ben has picked a service.
2. **What is sent.** Only these fields: `trade`, `accessWindow`, `tasks[].title`, `tasks[].scope.description`, `tasks[].visit`, `tasks[].proofNeeded[]` and `proofNeeded[]`.
   - Never sent: `owner`, quantities, ids, photos, job or customer names, or addresses.
   - Before sending, a pure helper `briefTextsForTranslation(content)` returns exactly that list. Unit-test that it holds nothing else.
3. **Migration 2052: `app.v2_crew_brief_translation`.**
   - Columns: tenant_id, job_id, trade, expected_version (FK to the brief revision), lang, provider (`'fake'` only, enforced by a CHECK until the real-provider piece), translated content as jsonb in the same shape, source text hash, created_at, actor_membership_id.
   - Immutable, with forced RLS, SELECT and INSERT only, and the `v2_practice_firm` lock (2001's pattern, rule FL).
   - Audit event `v2.crew_brief.translated`, carrying references only.
4. **Showing it.**
   - Add a **new sibling route** `apps/web/app/api/v2-backend/jobs/[id]/crew-briefs/translation/route.ts`. Don't change the existing crew-briefs route.
     - `GET ?trade=&version=&lang=` reads a saved translation, or returns 404 `NOT_FOUND`.
     - `POST` creates one with the fake translator.
     - Rule 29: `assertBuilderRouteRefuses` with a positive control, and append it to `builderGetRoutes`.
   - In `TradeBrief`, add a "Language" select under the card head, for the builder. Choosing a language POSTs if the translation is missing, then shows the translated text in place of the lines 68 to 78 text.
   - The translated view always shows "Show the English original", and the English stays the brief of record.
   - When `brief.current === false`, hide the language select, since the warning at line 66 already applies.
   - Rendering goes through a pure helper, `briefDisplayText(content, translation | null)`, unit-tested for both cases.
   - Retranslation happens only when the brief's version changes.
5. **Refusals.** Unknown language: refused. Brief version changed between preview and save: refused, as a version conflict. Crew or customer sessions: refused (rule 29, `assertBuilderRouteRefuses`).

## Tests
- Unit tests:
  - `briefTextsForTranslation` sends no owner, quantity, id or photo;
  - the fake translator is deterministic;
  - the translated shape equals the source shape.
- Seed tests:
  - translate, then read back;
  - a second firm sees nothing (FL);
  - a replay gives one row;
  - the CHECK refuses any provider other than `'fake'`.
- No real network call anywhere. The test fails if `fetch` is called.

## Done when
- A builder on the practice job picks Polish and sees the fake-translated brief, with the English original one tap away.
- CI1 is green, and the Claude check is clean or answered.

## Not in this piece
- The real provider adapter: account, key, cost cap and data-processing terms. It waits for Ben's pick.
- Crew-chosen language: later, with F7 My brief.
