# ENT-11A — dispatcher 13 rework, 16 October 2026

Authority: first contractor demo (Ben 33), practice role switch and true actor recording (38–39), labelled ENT-5 remainder demo settings (53). All triage section B work belongs to PR #218; there is no ENT-5c implementation, lane, ledger or migration.

Integrated base supplied by dispatcher: main merge 3063e070 (main 760fe6f5), then #225 merge a395bbed (practice-worker-switch d1432d26). Shared-file work serialized after those merges. #225 code is consumed unchanged. No merge markers found. Delete the archived stray local Playwright config; no executable reference remains.

0167_northside_run_attribution is this piece's only migration, above inspected 0164/0165. It adds immutable tenant-scoped settings and source-linked action attribution; no migration runner/predecessor SQL edits. Own-step upgrade proof and comparator controls are added. The existing `ent-11a` lane registration remains in the legacy register with explicit new paths: the lane loader forbids a duplicate in `config/lanes/ent-11a.json`, and a new lane file cannot authorize removal of its legacy register entry. No other lane is changed. The local-config allowance is for deletion only.

Settings include whole-pence bands/comparisons, actor sequence, evidence requirements, dormant timer/alternate values, photo-upload lifetime and client-link expiry. Their label is “Demo setting, not a real rule”; the full notice is “Demo settings, not real rules — Ben sets these before any real customer”. X/Y do not grant proceed permission. Work timing is explicitly unavailable. Stored contract/rule requirement snapshots remain immutable.

The same persisted `jg_session` uses #225 start/end/state. Switching explicitly ends the old role. Owner-only exact request approval remains with the original dispatcher. The browser journey no longer inserts non-owner sessions. A pending `.invalid` fake outbox row/local link is the only request artifact; no executor or adapter is invoked.

See the appended r-d13 builder receipt for actual command evidence and environment limits. Technical acceptance is held for CI PostgreSQL/migration/browser proof, then two fresh exact-integrated-commit independent verdicts (Opus and Sol) and separate acceptance. A source inspection or builder test result is not either verdict.
