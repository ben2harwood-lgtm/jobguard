# ENT-3 accessibility check — builder receipt

Router ruling: 4 November 2026. RED solely for the test supply chain. Branch `codex/sandbox/ent-3-axe`, based on `origin/main` at `56b74eaec205e86c9eaf7eee75d85ade2599a364`. No PR, merge, deployment or real-data release is authorized or performed.

`@axe-core/playwright` is an exact `4.14.0` web dev dependency, published 2026-10-15T13:33:17.706Z (more than two weeks before 4 November). Only its wrapper and `axe-core@4.14.0` are added to the lockfile. The scanner is dynamically imported inside the existing Playwright spec, never by application code. Every full-page scan attaches its JSON report and fails on serious or critical violations. No exclusions or disabled rules. Disabled buttons also receive an explicit browser contrast check because axe exempts them. Existing retry, privacy, tap-count, touch-size and authority assertions are retained.

Verification is in progress; final commands and results will be recorded before push. These are builder-executed checks, not independent RED review.
