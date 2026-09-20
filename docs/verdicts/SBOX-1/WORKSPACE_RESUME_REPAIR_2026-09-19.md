# Saved workspace lifecycle and navigation repair

ChatGPT implementation under Ben's 19 September JobGuard request. This is not a Codex receipt, Claude verdict or acceptance record.

Base: proof-repair candidate 41327ff760ab6598cd6f837130ce2a96f7d9e06e (PR #66). This is a separately reviewable SBOX-1 repair, not a claim that UIWIRE-15 is complete. No merge/release or live gate is changed.

## Changes

- Capture responses preserve all seven existing core/DB lifecycle states. Invoiced/paid no longer silently become draft; unknown state fails validation.
- Scope summaries show their actual saved state. Closed jobs remain read-only; returning from quote/work reloads the authoritative job state.
- Saved job navigation and existing proof/final-account deep links enter the real QuoteEditor and its persisted work panels. An anchor does not advance a draft or closed job.
- Capture-service errors fail visibly rather than falling back to a disconnected shell; superseded requests are aborted/ignored.
- API unit tests cover each lifecycle and invalid/missing records. Browser tests use actual capture/review/quote/acceptance/activation endpoints, reload/deep links, a second authorized browser context and a missing-job denial. No successful business API is mocked.

Local dependency execution remains unavailable. CI results must be recorded from actual runs. The existing suite, security scans and lane policy are unchanged. The absent historical SBOX-1 repair branch is reused within its existing scope; authorship remains ChatGPT. Independent review, founder acceptance and the continuous UIWIRE-15/payment integration remain separate.
