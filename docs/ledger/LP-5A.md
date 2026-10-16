# LP-5A — partial dispatcher input preparation

Build-ahead base `d5ccbb7b08e29071e0a82184cfda1390d3e67fac` (incomplete LP-4); observed main `4c407a6c81bd714a6875b7adf995812381d0fe57` supersedes the issued main SHA. RED; not accepted. No commit/push/merge/enable/deploy.

New unconnected candidate codec, tests-first unit cases, lifecycle preparation map and exact coordinator findings. No migration (0198 reservation; eventual `{mig}_lp_command_dispatcher.sql`), grants, caller cutover or protected file edits. Checked LP-4 audit and coordinator amendments are missing. Heavy execution stopped at 44 GB free, below the required over-45-GB disk threshold. Database/browser suites NOT RUN. Full task and exact-commit reviews remain owed; receipt: `docs/verdicts/LP-5A/BUILDER_RECEIPT.md`.
