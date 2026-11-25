# Q31 · V2-K1: share the Friday update to WhatsApp from the phone (batch C5, Friday-update half)

**Tier:** T1 (client only; the builder's own phone shares the text, and JobGuard sends nothing). **Builder:** web Codex, or lane A when a slot frees. No database is needed. **Base:** `codex/sandbox/v2-k3` (#935). **Branch:** `codex/sandbox/v2-k1`. **PR:** draft into `codex/sandbox/v2-k3`. **Planner:** Fable thread, 25 Nov 16:00 UK. Use ★★★, effort S. The brief half (K1-B, sharing a crew brief) comes after D5B-B (Q23).

## Rules this piece must meet
`01-RULES.md` (rules 1 to 28) and `02-BUILD-RULES-CHECKLIST.md`, with a "Rules met" list in the PR body.

## Dry-check against `codex/sandbox/v2-k3` (planner, 25 Nov 15:55 UK, rule 23)
- The screen is `apps/web/app/(designed)/jobs/[id]/friday-update/screen.tsx` (K3's file, so don't edit beyond one mount). After a load or a command it holds `snapshot: FridaySnapshot | null` (with `sentAt` and `contentHash`) and `message: string`. The message is the server's text from `fridayMessage` in `packages/db/src/v2-friday-update.ts`, and it starts with the practice notice.
- **Nothing on v2/main uses `navigator.share`**, so this is new.
- `apps/web` has no jsdom, so test pure helpers.

## What to build
1. `apps/web/app/(designed)/jobs/[id]/friday-update/share.tsx`, which you own: `<FridayShare message={...} sentAt={...}/>`.
   - **Show it only when `sentAt` is set**, so the shared text is exactly the version the record says was sent. Before that, show nothing.
   - The "Share" button calls `navigator.share({ text: message })` when `navigator.canShare?.({ text })` is true.
   - Otherwise show "Copy text" (clipboard) and "Open WhatsApp", which is a link to `https://wa.me/?text=<encoded message>` with `target="_blank" rel="noreferrer"`. The builder chooses who to send it to in WhatsApp. JobGuard never picks a number.
   - Keep the practice notice line in the text.
   - A cancelled share (AbortError) shows nothing. Any other failure shows "Sharing didn't work. Copy the text instead."
2. **One mount** in `screen.tsx`, right after the sent preview: one import line plus one element, passing `message` and `snapshot?.sentAt`. Put it in your lane file with the note "mount only, owned by K3". Change nothing else.
3. A pure helper `shareTargets(message, canShare)` that returns which buttons to show and the exact WhatsApp URL. Test it for:
   - long text;
   - emoji and the `£` sign (so encoding matters);
   - the practice notice is kept;
   - nothing to show before sending.

## Not in scope
Any server change, a share log, phone numbers, or sharing a brief (K1-B).

## Done when
Unit tests pass, and K3's browser test still passes (CI or lane B). CI is green apart from Vercel, and a Claude check has been done on the frozen head.
