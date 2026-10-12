# Receipt: SCAN-EXCEPT-1 (secret-scanner exceptions)

**Role of this file:** the task record for a tiny piece that has no card in BUILD_PLAN.md. It is the complete specification and evidence for the piece, so the reviewers do not need a plan card. It is not a review and not an acceptance.

**Authority.** Ben (founder), 12 Oct 2026, "yes to all" to the five one-line approvals relayed by the coordinator (16:20), including the scanner exceptions; the card asked for exact exceptions only. The coordinator wrote `.gitleaksignore` and committed it (4597fc4) on the dispatcher's lane commit (44035a2).

**What the piece is.** Two files, nothing else: (1) `.gitleaksignore` at the repository root holding exactly two scanner fingerprints (form `commit:file:rule:line`), plus comment lines; (2) one new lane line `scan-except-1` in `config/agent-lane-assignments.json` (branch `codex/sandbox/scan-except-1`; allow `.gitleaksignore`, the lane file and `docs/verdicts/SCAN-EXCEPT-1/**`). No code, no test, no workflow or scanner setting changes.

**Why.** The `secrets` job (`gitleaks/gitleaks-action@v2.3.7` in `.github/workflows/ci.yml`) is red on pull requests #138 and #139 because of two made-up practice-feed names in test set-up that the `generic-api-key` rule flags. The flagged commits sit in those pull requests' histories; history must not be rewritten to satisfy a scanner. An exact exception is the honest route. The real scanner output for each is saved at `~/.local/share/full-steam/jg-runs/secret-scan-2026-10-11/pr138-secrets-job.log` and `pr139-secrets-job.log` (one `Fingerprint:` line each).

**The two exceptions (exactly).**
- `3a82b3e6c542c0965243fb1f46fec6f4f3b0a073:packages/db/test/recovery-eligibility-v3.integration.test.ts:generic-api-key:239`
- `90a1534b23a5a421c72de4bda6af163c4c12689c:packages/db/test/practice-facts.integration.test.ts:generic-api-key:255`

**Done-when (what the reviewers check).** (a) The two non-comment lines equal the scanner's `Fingerprint:` lines in the two saved logs, character for character; no pattern, path rule, wildcard or extra entry. (b) Both flagged lines are made-up names, not credentials (open each at its commit). (c) Nothing else changes the scanner: `.github/workflows/ci.yml` and any scanner configuration are untouched; a fingerprint suppresses only a finding with that exact commit, file, rule and line, so a planted secret anywhere else is still reported (gitleaks is not installed on the Mac, so this is judged from the mechanism). (d) The lane line is valid JSON, touches no other lane, and the lane check passes. (e) The diff is exactly the files above.

**How it is used.** gitleaks reads `.gitleaksignore` from the root of the checked-out tree; for a pull request that tree is the pull request's head merged with current main, so once this piece is on main, #138 and #139 only need their `secrets` job re-run. The flagged commit ids do not change when main is merged into them.

**Not verified here:** GitHub's `secrets` result for #138 and #139 after this lands (the dispatcher re-runs it and records it).
