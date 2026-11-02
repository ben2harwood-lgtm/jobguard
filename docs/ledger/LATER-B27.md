# LATER-B27 — Shared money boundary enforcement

Built locally on `codex/sandbox/later-b27`; uncommitted. RED check lane. Decision 74: PARK after the required independent checks; no merge, enablement or deployment without Ben's button. No acceptance or independent verdict is recorded by this builder.

L016: proposal confirmation validates its supplied total using `parseQuantity`, `money` and `calculateNetLine` (existing half-even rule). L026/L102: command, ledger and job-repository money fields share a Zod adapter around the public money validator. Existing signs, nullable amounts and amount/currency pairing remain explicit. No migration or new grants.

Five unit cases and two PostgreSQL cases were written before implementation. Execution is incomplete: disk reports 44 GB available, below the dispatcher's required 45 GB; PostgreSQL/browser execution is prohibited here. Syntax inspection and `git diff --check` passed. Lane lint refused a self-comparison because HEAD equals `origin/main`.

Receipt: [BUILDER_RECEIPT.md](../verdicts/LATER-B27/BUILDER_RECEIPT.md). Required next evidence: own unit and PostgreSQL suites, uncached typecheck/lint/build, lane check after the dispatcher commits, applicable CI, then the ordered independent RED verdicts bound to the committed diff. Base and final HEAD: `31682762c903d716657c573e1b5deae63588aad7`.
