# Q59 · V2-SQ1: "Talk through a quote" starts the microphone in one click, with typing always there and a clear path when the mic is refused

**Tier:** T2 (screen and on-device speech only; no money, no tenancy, no migration). **Builder:** Opus 5.5 thread. **Checker:** Codex, by an `@codex review` comment on the PR. **Base:** the builder thread's spoken-quote parser PR (`packages/ai/src/capture-fixture-parser.ts`, draft into `v2/main`), its head when you start; record the sha in the PR. If that PR has merged, use `v2/main`. **Branch:** the builder thread's own branch, in `config/lanes/v2-sq1.json`. **PR:** draft into the parser PR's branch; retarget as it merges. **Migration:** none. **Plan check:** Astra, frm-management-layer#3. Rules 1 to 30 apply. Planner: 26 Nov 19:05 UK. Priority: top (Ben's spoken-quote ask JG-PLATFORM-SPOKEN-QUOTE-20261126), ahead of Q58.

## What Ben asked (relayed by the builder thread)
"Talk through a quote" starts the real microphone in one click. Typing still works. When the microphone is refused, the builder is told how to allow it and can carry on typing.

## Planner reading (Astra please confirm or correct)
1. **One press does everything.** On a browser that can run on-device voice, the first press of "Talk through a quote" asks for the microphone, loads the on-device model if it isn't loaded, and starts listening. There is no separate "Install on-device voice" button any more. The download size is said **before** the first press, in the button's help line, so one click is still an informed click.
2. **Audio rules don't change.** en-GB, `processLocally`, no remote fallback, audio never saved or sent. `createLocalSpeechAdapter` keeps its checks, and the AudioContext is still created inside the press (Safari). No new network call is made for speech.
3. **Refusals are told apart.** A refused permission (`NotAllowedError` or `SecurityError`), no microphone (`NotFoundError` or `OverconstrainedError`), no speech heard, and an unsupported browser each get their own short message. Each one keeps the typed words and says the builder can type instead. The refused-permission message also says how to allow it.
4. **The words still get a look before use.** Stop puts the words in "Words to review", as now. "Use these words" copies them into Work details. This piece doesn't change that.
5. **Copy is for real jobs.** "Talk through the example" and "Speak fictional work only" are demo wording. The new wording is about the builder's own quote. Practice-mode labels elsewhere on the page stay as they are.

## Dry-check against `v2/main` @ 9f43bcdc1 (rule 23; re-check line numbers on the parser PR head)
- `apps/web/app/ui/local-dictation.tsx`:
  - `LocalAvailability` (line 6);
  - the test hook `window.__JOBGUARD_SPEECH_ADAPTER__` / `browserLocalSpeechAdapter` (lines 15 to 20);
  - `LocalDictation({onUse,applyDisabled})` (line 22); `tap()` (lines 32 to 43) already creates the adapter on the press and calls `install()` then `start()`, but the button is disabled unless `availability === "installed"` (line 54);
  - `install()` (line 47) behind a separate "Install on-device voice" button (line 52);
  - one message for every failure, "Microphone unavailable. You can type instead." (lines 41 and 44);
  - heading and help text "Talk through the example … Speak fictional work only" (line 50).
- `apps/web/app/ui/local-speech.ts`: `LOCAL_SPEECH_DOWNLOAD_MIB = "42.4"` (line 3); `createLocalSpeechAdapter` (line 7) and its support check (line 8); `getUserMedia` (line 37).
- `apps/web/app/ui/jobguard-app.tsx` `WalkIt`: `LocalDictation` mount (line 141), `walk-source` textarea, "Make my draft".
- Callers that keep working: `apps/web/app/site/extra/site-extra.tsx` line 124 (F6's extra description) also mounts `LocalDictation`. Its own label stays its own (see Build 1).
- e2e specs that press the old button name, all to be updated in this PR (new copy, not weaker checks): `apps/web/e2e/VOICE-1.spec.ts` (has `inject(page, "supported" | "unsupported" | "denied" | "no-speech")`), `ENT-3.spec.ts`, `WALK-3.spec.ts`, `DEMO-VOICE-PHONE.spec.ts`, `capture.spec.ts`. Unit: `apps/web/app/ui/walk-it-retry.test.tsx`.
- Reuse #890 DUI-1a (`codex/sandbox/dui-1a` @ 75afc14c3, on **main**, not v2/main): its `designed` prop on `WalkIt` and `LocalDictation` (designed-ui `Card`/`Note`, `btn` classes), `apps/web/app/(designed)/design-fit.css`, and its e2e helper `capture-journey-designed.ts` with desktop and 360 px screenshots. Copy what fits; don't merge #890 here. Leave #918 alone.

## Build
1. **`LocalDictation`**:
   - one button, label from a prop `startLabel` (default "Talk through a quote"); `site-extra.tsx` passes its own current label so F6 doesn't change;
   - enabled whenever the browser passes the support check and nothing is listening, including the `downloadable` state; the press runs `tap()`, which installs if needed and starts;
   - help line under it: "Uses your microphone on this phone or computer. The voice model (42.4 MiB) downloads once, the first time. Nothing you say leaves this device.";
   - while loading: "Getting the microphone ready…", with Cancel;
   - remove the separate Install button and its state message.
2. **Failure codes.** `createLocalSpeechAdapter.install()` and `start` report one of `denied`, `no_microphone`, `no_speech`, `unsupported`, `failed`, mapped from the DOMException name. A pure helper `dictationMessage(code)` gives the text:
   - `denied`: "JobGuard can't use your microphone. To allow it, open this site's settings from the address bar, allow Microphone, then press Talk through a quote again. You can type the job below instead."
   - `no_microphone`: "No microphone found. You can type the job below instead."
   - `no_speech`: "We didn't hear anything. Press Talk through a quote to try again, or type below."
   - `unsupported`: "Voice doesn't work in this browser. Type the job below. It works the same way."
   - `failed`: "The microphone stopped. Your words so far are kept. You can try again or type."
   After any failure the button stays pressable (a second try), and the Work details box is untouched.
3. **Typing is always there.** In `WalkIt`, the Work details box and "Make my draft" are visible and usable before, during and after voice, as now. The intro line reads: "Say or type the job the way you'd tell the customer. JobGuard splits it into lines for you to check."
4. **`designed` look.** Port #890's `designed` prop for these two components only, so the walk matches the designed screens at 360 px. No other DUI piece.
5. **Lane** `config/lanes/v2-sq1.json`. Note each mount on files other pieces own: `site-extra.tsx` (one prop, owned by F6 #923), the five e2e specs (button name and new messages), `walk-it-retry.test.tsx`.

## Tests
- **Unit** (no jsdom; `renderToStaticMarkup` and the existing render-tree helper in `walk-it-retry.test.tsx`):
  1. `dictationMessage` for each code.
  2. The button is enabled in `downloadable` and `installed`, disabled while listening or `applyDisabled`, and absent-or-disabled with the `unsupported` message when the support check fails.
  3. A fake adapter whose `install()` rejects with `NotAllowedError` gives `denied`; `NotFoundError` gives `no_microphone`.
  4. `site-extra` still renders its own label.
- **e2e** (`VOICE-1.spec.ts` extended, injected adapter, desktop and 360 px):
  1. **One click.** A fresh page with the injected adapter reporting `downloadable`: one press of "Talk through a quote" reaches "Listening on this device". Count presses: exactly one. `__speechTest.starts === 1`.
  2. **Denied.** The `denied` mode shows the allow-it message, keeps typed Work details, and "Make my draft" still saves a typed draft.
  3. **No speech** and **unsupported** show their messages, and typing works.
  4. No request matching `/speech|transcri|audio/` leaves the page in any case (VOICE-1 already collects these).
- The other four specs pass with the new button name.
- **Rule 29/30:** no route or table added. Write "Rule 29: no route added" and "Rule 30: no table added".

## Known limits (to write in the PR)
- A real microphone can't be pressed in CI. CI uses the injected adapter. Ben's own phone run (desktop and iPhone) is Q61.
- How to allow the microphone differs by browser, so the text names the address bar, not a menu path.

## Done when
- On the walk, one press of "Talk through a quote" starts listening, typing is always there, and a refused microphone says how to allow it and leaves the typed work as it was.
- CI1 is green, and the Codex check is clean or answered.

## Claude plan check, 27 Nov (stands in for Astra): PASS WITH CONDITIONS
1. "Downloads once" isn't proven. A new Worker re-fetches about 44 MB per press, and only the browser's HTTP cache stops that. Either prove that a second press transfers nothing (a CDP cache or 304 check), or change the line to "the first time (again if your browser clears it)".
2. Add a `model_failed` message for a model download or integrity failure. Today it shows "The microphone stopped…", which gives the wrong reason.
3. The shipped model is `vosk-model-small-en-us`, while the adapter config says en-GB. Put that in the PR's known limits.
