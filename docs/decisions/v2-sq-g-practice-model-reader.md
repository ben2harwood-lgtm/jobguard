# V2-SQ-G: practice-sandbox model reader (Claude Sonnet 5.5)

Status: approved for the practice tenant only, by Ben (founder), on his cards in the thread "Make JobGuard spoken
quote understand jobs":

- **27 Nov 2026, 15:07 UK**: live model reader on for the practice tenant, Claude Sonnet 5.5 (`claude-sonnet-5-5`),
  £10 a month cap.
- **27 Nov 2026, 16:24 UK** ("Yes, practice only"): made-up practice words, as text and never audio, with the customer
  line removed, may go to Anthropic's standard API. The UK/EU-only rule stays for real data.

Still Ben's before any live call: an API key he creates with a spend limit set on the key at Anthropic, and his merge
of the RED pull request that carries this record.

## What this allows, and nothing wider
- **Who**: the practice tenant (`DEMO_TENANT_ID`) in the `synthetic_demo` environment only. The route refuses any
  other environment, tenant or operation.
- **What is sent**: the typed or on-device recognised words of one capture, as text, never audio, with the
  customer-and-site clause removed (`suggestCapturePartyClause`), and Reader A's item list, which is words from that
  same text. Nothing else. A name spoken elsewhere in the words would be sent, so the screen says, beside the mic and
  the typed box: "Your words (text only, never audio) are sent to Anthropic's Claude to be sorted into rooms and
  trades. Practice only: don't say real names or addresses." No call is made from a screen that did not show it.
- **What comes back**: rooms and trades for Reader A's items, and at most eight quoted pieces of possibly missed work.
  The model never supplies, moves or confirms a number; no model-written text reaches the proposal, the builder or a
  quote (`packages/ai/src/locate-model-reading.ts`).
- **Model and limits**: Claude Sonnet 5.5, one call per capture, no retry (SDK `maxRetries: 0`), 15 s timeout,
  2,000 output tokens, transcripts over 8,000 UTF-8 bytes go to Reader A only.
- **Spend**: £10 a month (`JOBGUARD_SPOKEN_JOB_MONTHLY_CAP_PENCE=1000`), hard ceiling £20 in code, 40 calls per UTC
  day, reserved before each call at the worst case and settled from returned usage (`app.v2_ai_call`, migration
  2069). At the cap the reader is dark until the next UTC month and Reader A carries on.
- **Switches**: a live call needs all three of `JOBGUARD_SPOKEN_JOB_MODEL_KEY` (a Worker secret), a valid cap and
  `JOBGUARD_SPOKEN_JOB_LIVE=1`. All are unset in the repository and on every preview.
- **Scored run**: `pnpm --filter @jobguard/ai eval:spoken-sort-live`, by hand on Ben's Mac, never in CI. The live flag
  is set only after it shows zero number differences from Reader A and zero invented work without a question.

## Register fields (AGENTS 5.11)
| Field | Value |
| --- | --- |
| Provider / feature | Anthropic, Claude API (`api.anthropic.com`), through `packages/ai/src/anthropic-live-sort.ts` only |
| Accountable owner | Ben (founder) |
| Environment | `synthetic_demo`, practice tenant only |
| Categories / subjects | Made-up practice words; no real customers. Visitors are told not to say real names or addresses |
| Purpose | Sort a spoken job description into rooms and trades for the builder to check |
| Controller / processor | JobGuard controller; Anthropic processor under its commercial terms |
| Region | Anthropic's standard (global) API. **Not** the approved EU/UK route; allowed for practice words only by the 16:24 card |
| Subprocessors | Anthropic's published subprocessor list, as it stands when Ben creates the key |
| Retention / training | Per Anthropic's commercial terms for API traffic: not used for model training by default; inputs and outputs kept for a limited period for trust and safety. Not verified by the builder from inside this build; Ben confirms on the console when he creates the key |
| Deletion | Nothing is stored at Anthropic by JobGuard beyond the provider's own retention; JobGuard keeps the combined reading in `app.v2_job_understanding` with the practice job |
| Logs | No transcript text and no key in any log line (tested) |
| Review date | 5 Dec 2026, with the templates decision |

## What this does not do
- It does **not** satisfy D04 for real data. G1 still gates any real use, and real customers' words never take this
  route.
- D12 (data-protection role and transparency) for anonymous practice visitors is noted, not closed: the on-screen
  notice is the only transparency step in this packet.
