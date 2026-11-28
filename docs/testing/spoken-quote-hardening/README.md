# Spoken quote hardening plan (before Tommy)

Written 28 Nov 2026 by Claude (thread "Harden spoken quote before Tommy") at Ben's request (28 Nov 11:31 UK).
**Claude plans and tracks. Codex does all of the work**: corpus, tests, attacks, fixes (Ben, 28 Nov 11:32 UK).
**Nothing starts until the feature is finished** (Ben, 28 Nov 11:33 UK). See "Start gate".

## What we are hardening

The heart of the product: the builder speaks a quote; JobGuard understands it; splits it into lines with
the prices that were said; and puts each thing in the right place (room, trade, quantity, unit, price,
room total, whole-job total, questions for the builder), on the right firm's right job, without losing or
inventing anything.

Code under test (on the preview head, see "Start gate"):

| Stage | Where |
| --- | --- |
| Microphone and transcript | `apps/web/app/ui/local-dictation.tsx`, `apps/web/app/ui/local-speech.ts` |
| Capture request and limits | `packages/core/src/capture.ts` (`captureRequestV1`, 50,000 chars), `packages/core/src/offline-capture.ts` |
| Capture route and tenant gate | `apps/web/app/api/jobs/capture/route.ts`, `apps/api/src/capture/capture.application.ts`, `apps/api/src/practice-access.ts` |
| Line splitter and line prices (v1 path) | `packages/ai/src/capture-fixture-parser.ts` (`plainDraft`, `plainPrice`, `amounts`, `saidAmountOpen`) |
| Reader A: rooms, trades, measures, totals | `packages/ai/src/context-reader.ts` (`readSpokenJob`, `understoodLabels`, `totals`), `packages/ai/src/room-words.ts` |
| Money rule check | `packages/core/src/job-understanding.ts` (`checkUnderstandingNumbers`) |
| Review screen and pricing | `apps/web/app/ui/review-proposal.tsx`, `apps/web/app/ui/review-pricing.ts`, `apps/web/app/ui/jobguard-app.tsx` |
| Save, reopen, confirm | `CaptureApplication.save/confirm/view`, `ProposalReviewRepository` |
| Existing sets | `docs/fixtures/ai/spoken-quote-understanding/*.v1.json`, `apps/web/e2e/fixtures/spoken-quote/` |

Out of scope for Tommy (planner, 28 Nov 11:34 UK): SQ-E, SQ-F, SQ-G (model reader), SQ-I screens, SQ-H.
They need V2 tables the workers.dev preview does not have. Lane RT-14 covers SQ-G later, on the Mac tunnel.

## Start gate (do not launch before all of these hold)

1. Q77 V2-SQ-M ("up to £200", "minus £50" stay open) is on the #1061 head.
2. Q75 V2-SQ-L ("Bedroom two £500 all in") is on the #1061 head.
3. The thread "Make JobGuard spoken quote understand jobs" has redeployed the preview from that head and
   given the head sha and Worker version. Every lane records that sha as `HEAD_UNDER_TEST`.
4. Claude posts "GO" with the sha on the tracking issue (see "Tracking"). Codex starts only on that GO.

Q77's 19 cases are already written (`capture-qualified-price.test.ts`). No lane repeats them; lanes go
beyond them.

## The invariants (what "hard" means)

Every lane tests against these. A case fails if any one breaks.

- **M1 No invented money.** Every kept pence value cites a transcript span whose words read to exactly that
  value. No arithmetic, no guessing, no rounding.
- **M2 Qualified money stays open.** Any amount with a limit, range, hedge, rate, condition, credit, VAT,
  "plus materials", currency other than pounds, or a correction near it is left unpriced and asked about.
- **M3 A credit is never a charge.** Minus, off, discount, credit, knock off: never a positive price.
- **M4 Totals are never forced.** A said total that differs from the sum of the lines raises a question;
  neither the total nor any line is changed to fit.
- **M5 Corrections never keep the old value silently.** "£400, no, make that £450": the line is £450 with a
  question, or open with a question. Never £400, never both as two lines.
- **S1 Nothing is lost.** Every work clause said appears as a line or a question. Every amount said appears
  on a line, a total, or a question.
- **S2 Nothing is doubled.** One item said once is one line.
- **S3 Right place.** Room, trade, quantity and unit match what was said; anything inferred is marked inferred.
- **S4 Transcript untouched.** The stored text equals what was captured; every span points at the right words.
- **D1 Speech is data.** Spoken or typed instructions ("ignore previous instructions", "ITEM:", HTML, JSON,
  "system:") never change parsing rules, prices, tenant or job; text renders as text everywhere.
- **D2 Right firm, right job.** A capture lands only on the caller's firm and the job it was made for;
  nothing from another firm is readable, guessable or overwritten.
- **D3 Exactly once.** Double-submit, retry, reload, offline replay and two tabs produce one capture and one
  confirmed review, or a clear conflict. Never two jobs, never a lost edit.
- **U1 Usable at 360 px.** No horizontal scroll, 44 px tap targets, every price and question readable.
- **P1 Bounded.** Any input up to the 50,000 character limit reads in under 1 s on CI; no regex blow-up.

## Lanes (run all in parallel once GO is posted)

Each lane file is a complete Codex task: focus, inputs, seed cases with expected output, what to deliver,
definition of done.

| Lane | Focus | Kind |
| --- | --- | --- |
| [RT-01](lanes/RT-01-money-words.md) | Numbers in words, slang money, digits, separators | corpus + tests |
| [RT-02](lanes/RT-02-qualifiers.md) | VAT, plus materials, ranges, rates, discounts, conditions (beyond Q77) | corpus + tests |
| [RT-03](lanes/RT-03-corrections.md) | Mid-sentence corrections, repeats, restarts | corpus + tests |
| [RT-04](lanes/RT-04-structure.md) | Several rooms or jobs in one recording, run-on speech, unpriced items | corpus + tests |
| [RT-05](lanes/RT-05-speech-realism.md) | Accents, dialect, trade slang, mis-hearings, no punctuation | corpus + tests |
| [RT-06](lanes/RT-06-limits-and-noise.md) | Silence, noise, very long recordings, unicode, regex blow-up | tests + perf |
| [RT-07](lanes/RT-07-injection.md) | Prompt injection spoken aloud, fake ITEM: records, HTML/CSV injection | tests + review |
| [RT-08](lanes/RT-08-tenant-and-job.md) | Another firm's data, wrong client or job attached | integration tests + review |
| [RT-09](lanes/RT-09-exactly-once.md) | Double-submit, retry, offline, reload, two tabs | integration + browser |
| [RT-10](lanes/RT-10-mobile-360.md) | Phone at 360 px, mic denied, long quotes on the review screen | browser |
| [RT-11](lanes/RT-11-totals-currency-units.md) | Totals that don't add up, currency and unit confusion | corpus + tests |
| [RT-12](lanes/RT-12-right-place-e2e.md) | End to end: right room, trade, line, total, save and reopen | browser on preview |
| [RT-13](lanes/RT-13-fuzz-metamorphic.md) | Generated quotes with known truth; metamorphic checks | property tests |
| [RT-14](lanes/RT-14-model-reader-later.md) | SQ-G model reader (later, Mac tunnel only) | held |
| [RV-1..RV-6](lanes/RV-focused-reviews.md) | Six focused Codex code reviews of the head | review |

Codex may split any lane further and run as many tasks in parallel as it likes. Ben has asked for heavy
use of Codex credits.

## Corpus format (shared by every corpus lane)

One file per lane: `packages/ai/src/redteam/corpus/RT-NN-<name>.v1.json`, an array of cases:

```json
{
  "id": "RT-01-017",
  "lane": "RT-01",
  "transcript": "Fit the door for a hundred and fifty quid",
  "why": "number words with 'a hundred and'",
  "expect": {
    "lines": [
      { "descriptionIncludes": "Fit the door", "room": null, "trade": "Carpentry",
        "quantity": "1", "unit": "item", "unitPricePence": 15000, "priceBasis": "line" }
    ],
    "areaPrices": [],
    "wholeJobPricePence": null,
    "questionsInclude": [],
    "neverPence": [150, 1500, 150000],
    "lineCount": 1
  },
  "status": "pass"
}
```

- `null` price means "must stay open". `room: null` means "Whole job". Leave a field out to not check it.
- `neverPence` lists values that would be a dangerous misreading. The runner checks they appear nowhere.
- `status` is `"pass"` (must pass now) or `"open-finding"` with a `finding` id. The runner asserts an
  open finding **still fails**, so a fix flips it and forces the status change in the same PR.
- Expected values are written from what the builder *said*, never from what the code does now. Never edit
  an expectation to get green. If an expectation looks wrong, flag it in the findings file.

One runner, `packages/ai/src/redteam/corpus.test.ts`, loads every corpus file and checks both paths:
`extractCaptureFixture`/`parseCaptureFixture` (lines and line prices) and `readSpokenJob` (rooms, trades,
room totals, whole-job total), plus `checkSpokenNumbers` on Reader A's output, plus invariants M1, S2 and
S4 on every case automatically.

## Rules for Codex

1. Work against `HEAD_UNDER_TEST` only. Record the sha in every PR and every finding.
2. **Attack phase (parallel):** each lane opens one PR into the #1061 head branch
   (`claude/project-thread-trp08u-sqpv`) that adds only its corpus file, tests and findings, never source
   changes. Failing cases go in as `open-finding`, so CI stays green.
   The runner PR (RT-00 below) goes first; lanes may stack on it.
3. **Findings:** every failure becomes a row in `docs/testing/spoken-quote-hardening/FINDINGS.md` with id,
   lane, head sha, the transcript, what was expected, what happened, severity (P0 wrong money / wrong
   firm, P1 lost or misplaced item, P2 confusing but safe) and the failing case id.
4. **Fix phase (after the attack PRs land):** Codex fixes findings in small PRs into the #1061 head, one
   area per PR, P0 first. Each PR flips its cases from `open-finding` to `pass` and names the files it
   touches in its first line. Fixes to `capture-fixture-parser.ts` and `context-reader.ts` go one at a
   time, never in parallel (they all touch the same functions). Keep each guard in its one existing place
   (`saidAmountOpen`, `readInPart`, `checkUnderstandingNumbers`); no second copy.
5. **Cautious beats clever.** When a fix can't be made safe, the item stays open and is asked about. An open
   price is always better than a wrong price.
6. No score may get worse: existing tests, the SQ-C eval floors (`pnpm eval`), held-out sets and Q77's
   file pass unchanged. Report before and after scores. The golden-run hash may change; say so.
7. Practice data only. Fictional firms, people and addresses. No real customer text, no audio uploads, no
   calls to any paid API. Do not deploy; the preview owner deploys.
8. Follow `AGENTS.md`, `BUILD_PLAN.md` and the lane config rules (`config/lanes/`): each PR adds its own lane
   file `config/lanes/v2-rt-NN.json`.
9. Review: every fix PR gets an "@codex review" from a separate Codex task, not the one that wrote it, then CI,
   then the merge thread. Never merge your own PR.

## RT-00 (first, before the lanes): the runner

Add `packages/ai/src/redteam/corpus.test.ts` and an empty `corpus/` with one seed file of 5 cases taken
from this README. Done when: it runs in `packages/ai` vitest, checks the fields above, enforces M1, S2 and
S4 on every case, fails an `open-finding` case that starts passing, and prints a per-lane pass/open table.

## Tracking

- Tracking issue in `ben2harwood-lgtm/jobguard`, "Spoken quote red-team before Tommy", created by Claude at
  GO. Every lane posts its PR link and finding count there. Claude keeps a lane status table at the top.
- Findings also go to the V2 planner thread as a list (head sha + failing case each), per the planner.
- Final sign-off is [CHECK.md](CHECK.md).

## Done (ready for Tommy)

All of [CHECK.md](CHECK.md) passes at the head the preview runs: zero open P0 and P1 findings, every P2
either fixed or accepted in writing by Claude with the reason, and the full check run once more at the
final deployed head.
