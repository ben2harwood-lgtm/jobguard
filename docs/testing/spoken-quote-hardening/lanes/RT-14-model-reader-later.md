# RT-14 Model reader (SQ-G Reader B), held

**Held:** not on Tommy's workers.dev preview (the planner, 28 Nov). Run only when SQ-G runs on the Mac tunnel
preview and Ben has created the API key. Practice text only (Ben, 27 Nov 16:24 UK); no audio, no customer line.

## Plan for later
- Stub the model to return hostile outputs (prices not in the transcript, wrong room keys, extra lines, malformed
  JSON, 10 MB output, a line per word) and prove `checkSpokenNumbers` and `jobUnderstandingV1` reject or open each.
- Replay the whole RT-01 to RT-13 corpus through Reader B with the stub, then (with Ben's key, within his £10 a
  month cap) through the live model once, comparing to Reader A.
- Injection (RT-07) against the live prompt.
- The append-only `v2_ai_call` ledger records every call; a failure leaves Reader A's result standing.
