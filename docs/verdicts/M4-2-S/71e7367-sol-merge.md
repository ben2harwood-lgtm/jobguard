VERDICT: PASS
HEAD: 71e736703ac9345803ce92192edbc366fe3eeba8

No outstanding P1, P2 or P3 findings. No required repair.

Source-inspected the complete 19-file `origin/main...HEAD` diff, AGENTS rev 3.0, C1–C8, the repair specification, original task card, all four receipts and PR #102.

- Scope stays within M4-2-S-R and its lane entry. No founder-reserved changes, weakened/skipped tests, added retries or lengthened timeouts. No new migration; allocated **0044 remains unused**.
- All three original Done-when lines have implementation and automated coverage: £320 eligibility approval without landing/fee creation; exact exclusion reasons; unknown-basis/causation holds, supersession, stale refusal and strict rejection of forged authority.
- Superseded and already-approved reviews cannot be approved again with current revisions: [recovery-case-repository.ts:43](/private/tmp/jg-check-m4-2-s-r-20261004T080916/packages/db/src/recovery-case-repository.ts:43).
- Recorded owner membership, identity, revocation and expiry are checked before replay, then recorded as reviewer/audit actor: [recovery-case-repository.ts:30](/private/tmp/jg-check-m4-2-s-r-20261004T080916/packages/db/src/recovery-case-repository.ts:30). This remains the labelled synthetic principal bridge.
- Re-review rejects backward evidence/policy revisions; UI commands preserve saved revisions: repository line 42 and [recovery-eligibility-command.ts:11](/private/tmp/jg-check-m4-2-s-r-20261004T080916/apps/web/app/ui/recovery-eligibility-command.ts:11).
- Eligible wording explicitly says settlement is unverified. Canonical case IDs cover eligibility locks, writes, audit subjects and lookup.
- C1/C7 coverage includes separate browser contexts, cookie-less refusal, persisted identity/revisions, keyboard focus, touch targets, error focus, banner and overflow checks. Ben’s accepted Jobs-navigation substitute and PR #85 receipt record close those findings.

The merge preserves both PRs’ behaviour. Main’s source-picker implementation is byte-for-byte unchanged, including recorded invoice/supplier version selection. Its evidence-pack integration and source warnings remain. This branch’s saved-revision commands and error focus remain. Only `m4-2-s-repair` differs in the parsed lane registry.

Executed locally with Node 24.17.0 and pnpm 10.28.1:

| Command | Exit | Result |
|---|---:|---|
| `pnpm typecheck`; `pnpm typecheck --force` | 0 / 0 | 7 tasks; forced run uncached |
| `LANE_BASE_REF=origin/main pnpm lint`; `pnpm lint:lanes` | 1 / 1 | Detached HEAD cannot select lane |
| Both with scratch PR metadata; lint forced | 0 / 0 | All 19 paths allowed; 7 lint tasks |
| `pnpm turbo run build --filter=@jobguard/api... --force` | 0 | 6 tasks, uncached |
| Core `vitest run src --maxWorkers=1` | 0 | 216 passed |
| Web unit suite, after dependency build | 0 | 63 passed |
| Full API unit suite, after build | 1 | 107 passed; health test hit `listen EPERM` |
| Recovery API application/controller suites | 0 | 8 passed |
| DB seed/offline-verifier unit suites | 0 | 7 passed |
| OpenAPI check through `node --import tsx` | 0 | Contract matches |
| My scratch tests through `node --test` | 0 | 9 passed |
| Playwright discovery for both tasks/projects | 0 | 10 cases; discovery only |
| Diff/working-tree checks | 0 | Tracked files unchanged |

Initial API/web attempts lacked compiled workspace packages; initial scratch attempts required module-format corrections. Passing reruns followed those environment fixes.

My [independent tests](/private/tmp/jg-check-m4-2-s-r-20261004T080916/.tmp-check/independent.test.ts) cover repeated supersessions, forged fields, excluded/unknown principal, current-revision approval refusals, backward revisions, membership-before-replay ordering and merge preservation. Repository rejection tests use stub SQL responses; they do not prove PostgreSQL guarantees.

Independently retrieved [CI run 37184509985](https://github.com/ben2harwood-lgtm/jobguard/actions/runs/37184509985): checks, secrets and dependency review succeeded. CI tested merge `cfed4b3`; GitHub comparison confirms **zero changed files versus this exact head**. Logs show **180 database tests passed**, including recovery cases **12/12**, tenancy, bootstrap and evidence-pack upgrade tests; **166 browser tests passed**. CI supplies frozen-install, full-suite, production-build and pinned-browser evidence.

Database/browser journeys were not executed locally. I relied on retrieved CI logs, with the merge receipt’s **183 DB tests, 11 migration tests and 10 task browser tests** as supplementary builder evidence. Screenshots, Neon deployment, real-user authentication and live integrations were not verified. No tracked files were edited, committed or pushed. This verdict grants no technical acceptance, merge or release authority.

---

_Provenance (added by the technical-acceptance actor, 4 October 2026): the text above is copied verbatim from `~/.local/share/full-steam/jg-runs/m4-2-s-r-solcheck-20261004T080916.md` on Ben's Mac (GPT-6.1 Sol, high reasoning, via the local Codex CLI check runner `jg-solcheck.sh`; log confirms `model: gpt-6.1-sol`, `reasoning effort: high`; `dispatch.log` records exit 0, verdict PASS). It is the merge check of `e2ca790` and binds head `71e736703ac9345803ce92192edbc366fe3eeba8`. Its `/private/tmp/...` links point at the checker's scratch worktree and are not part of this repository._
