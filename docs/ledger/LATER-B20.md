# LATER-B20 — Commercial integrity projection correctness

- Built on `codex/sandbox/later-b20`, base and unchanged HEAD `31682762c903d716657c573e1b5deae63588aad7`.
- L113: read the current accepted/baseline quote and final-account revision; historical synthetic value facts are ordered fallbacks. Current acceptance determines the won-job count.
- L114: only allocations with positive eligible net principal after tenant/job/allocation-qualified reversals suppress the outside-settlement finding.
- Read projection only; existing D11 thresholds, advisory evaluation, command application, postings and permissions remain unchanged. No migration or application grants.
- Ten new PostgreSQL cases were written before the query change. Runtime execution remains NOT RUN; CI must establish the result. Recovery setup is explicitly a projection fixture, not proof of the financial write path.
- Forced typecheck, forced package lint and forced build: seven successful tasks each, zero cache hits. Lane lint exit 1 (uncommitted HEAD equals main); diff check exit 0. Post-build disk fell to 44.62 GiB, so further heavy checks, including OpenAPI, stopped. See the receipt for commands and limits.
- STOP: `config/lanes/later-b20.json:1` is absent and outside the order's enumerated allow list. Coordinator registration is required; no shared registration, existing test or pin was edited.
- Decision 74: PARK. No merge, enablement, deployment or acceptance is claimed. RED independent Opus and Sol-high verdicts and separate acceptance remain outstanding.

Evidence: [builder receipt](../verdicts/LATER-B20/BUILDER_RECEIPT.md).
