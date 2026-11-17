# ENT-8A-P deterministic fixture evaluation

The development corpus is separate from held-out inputs and labels. Predictions complete before the label file is read. Rule (a) retains the previously labelled held-out observations, without changing its detector. Rules (b)–(d) add strict-excess/equality, units, unknown mapping, replay, contradiction, unsupported return, exact factor, missing standard/factor, invalid duration, and job-wide close-out cases. All facts are fictional.

The new test reports false prompts and missed extras separately per rule. This is deterministic fixture coverage, not a live-model evaluation or proof of database provenance. The PostgreSQL suites must independently prove persisted source binding and command behaviour. The optional end-check owning-interface dependency remains outstanding.

Run: `pnpm --filter @jobguard/ai exec vitest run src/enterprise-live-prompt-persisted-evaluation.test.ts`. The existing `pnpm eval` runner remains unchanged under this lane's exact allow list.
