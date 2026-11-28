# Q86 · V2-C3C-UI: a builder can add their crew on a screen, so snags can be fixed and checked by a second person

**Tier:** T2 (route and screen over the existing C3C repository; no migration expected). **Builder:** Opus 5.5 thread. **Checker:** desktop Codex. **Base:** v2/main + #1057 at its head when you start (record the sha). **Branch:** the builder thread's own branch, in a new lane `config/lanes/v2-c3c-ui.json`. **Migration:** none. If one seems needed, stop and tell the planner. **From:** H1 dry run B5 (`/mnt/project-files/jobguard-v2/notes/h1-dry-2026-11-28.md`, step 12). **Plan check:** Claude stand-in after 2 hours. Rules 1 to 30 apply. Planner: 28 Nov 16:05 UK.

## What it is
In the H1 run, "who fixed" and "who checked" on Snags offered only the builder. The run added Jordan and Sam Fictional by script. C3C (Q28) is on v2/main as data and commands only:
- `CrewContactRepository` (`packages/db/src/v2-crew-contact-repository.ts`);
- `CrewContactApplication` with `list` and `record` (`apps/api/src/workspace/crew-contact.application.ts`), wired as `crewContacts` in `workspace/application.ts`.

There is no HTTP route and no screen, so a builder can't add a crew member.

## Steps
1. **Dry-check, and put the answers in the PR.**
   - Do G1's "who fixed" and "who checked" accept a crew contact ref, or only a membership? Read G1 at Q78's head, 7c74a3e, on `claude/project-thread-trp08u-g1`, without editing it.
   - If only a membership, a crew contact can't be the second person. Then this packet is still worth doing for the work plan and brief pickers (C3C's purpose). The snag picker becomes part 2, on the G stack after it lands. Say which applies.
2. **Route.** Add `GET` and `POST` for the firm's crew contacts, calling `CrewContactApplication.list` and `record` unchanged, behind the existing practice session and `JOBGUARD_LOCAL_V2`. Errors keep their codes. Use the same idempotency (`commandId`) and expected version as the seed tests use.
3. **Screen: "Your crew".** It lists crew with name and trade, and has an add form with name, trade, phone and email. The email must be `.invalid` and the phone fictional; the CHECK already enforces both, so show its refusal in plain words. It's reached from the work plan's assignee picker ("Add someone") and from settings. Use 44 px controls and M3 copy, with no sideways scroll at 360.
4. **Picker.** The work plan's assignee picker lists the new contacts straight away, without a reload.

## Off limits (Codex red-team claims)
- `apps/web/app/ui/jobguard-app.tsx` and `apps/web/app/(designed)/designed-ui.tsx` (RT-FIX-7);
- packages/ai `capture-fixture-parser.ts` and `context-reader.ts`;
- `packages/core/src/job-understanding.ts`;
- `review-proposal.tsx`, `local-dictation.tsx` and the shared styles;
- the billing-export files.

If a nav link needs one of these, stop and tell the planner the line. Don't work around it.

## Tests
- Route: another firm's session gets 404 on list and is refused on record. A replayed `commandId` returns the same contact. A real-looking email or phone is refused with the CHECK's code.
- Screen, in vitest: the add form, the refusal copy, and the new contact in the picker.
- Browser, at 1280 and 360: add Jordan Fictional, then assign a work-plan task to Jordan. Screens go in `screens/h1dry/b5/`.
- v2-seed and CI1 pass. Rule 29/30: one route and no table.

## Done when
- A builder adds crew on a screen and assigns work to them with no script.
- The PR says whether snags need part 2.
- Desktop Codex is clean on the named head.
