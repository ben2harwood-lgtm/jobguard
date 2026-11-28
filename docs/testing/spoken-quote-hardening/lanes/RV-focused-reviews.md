# RV-1 to RV-6: six focused Codex code reviews of the head

Post each as its own comment on PR #1061 at `HEAD_UNDER_TEST`, so they run in parallel. Each comment starts with
"@codex review" and then the brief. (Never write that tag on frm-management-layer#3.)

- **RV-1 Money.** "Review only how amounts are read and kept: `amounts`, `spokenPounds`, `saidAmountOpen`,
  `readInPart`, `plainPrice`, `totals`, `checkUnderstandingNumbers`. Find any input where a kept price is not
  exactly the said amount, or where a qualified amount (limit, range, credit, rate, VAT, currency, correction) is
  kept. Give a failing sentence for each."
- **RV-2 Splitting and placement.** "Review only `plainDraft`, `splitWithin`, room carry-forward, `tradeOf` and
  `understoodLabels`. Find inputs where a work item is lost, doubled, merged with another, or put in the wrong room
  or trade. Give a failing sentence for each."
- **RV-3 Tenant and job binding.** "Review only the capture route, `CaptureApplication`, `PracticeAccess` and the
  capture and review repositories. Find any way one firm reads, writes or confirms another firm's capture or
  review, or a capture lands on the wrong job." (security)
- **RV-4 Exactly once.** "Review only capture submit, save, confirm, discard and offline replay. Find any way a
  double submit, retry or two tabs makes two jobs, two confirmations or loses an edit."
- **RV-5 Injection and rendering.** "Review only how transcript text reaches the parser and the screens. Find any
  way spoken or typed text enters the ITEM:/JOB: fixture grammar, changes parsing, or renders as HTML; check
  exports for formula injection." (security)
- **RV-6 Performance and limits.** "Review only the regular expressions and loops in `capture-fixture-parser.ts`,
  `context-reader.ts` and `room-words.ts`. Find any input up to 50,000 characters that takes over 100 ms, and any
  limit (100 items, 500-char description) that silently drops what the builder said."

Each review's P0 to P2 findings become rows in `../FINDINGS.md` with a failing case, then go to the fix phase.
