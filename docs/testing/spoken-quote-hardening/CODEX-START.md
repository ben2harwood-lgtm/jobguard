# Paste this into Codex to start the spoken-quote red-team

> Only after Claude has posted GO with a head sha on the tracking issue. Replace HEAD_UNDER_TEST below.

---

You are red-teaming JobGuard's spoken quote before a real builder (Tommy) uses it. Repo
`ben2harwood-lgtm/jobguard`, branch `claude/project-thread-trp08u-sqpv` (PR #1061), head HEAD_UNDER_TEST.
Preview: https://sq-preview-jobguard-demo.ben2harwood.workers.dev/jobs/new (practice firms only).

Read `docs/testing/spoken-quote-hardening/README.md` first (on v2/main or the head). It has the invariants,
the corpus format, the rules, and the lane list. Then:

1. Do RT-00 (the corpus runner) first, as one small PR into the #1061 branch.
2. Then run every lane in `docs/testing/spoken-quote-hardening/lanes/` RT-01 to RT-13 **in parallel**, as separate
   tasks, each producing its own PR into the #1061 branch (stacked on RT-00 if it has not landed). Split big lanes
   into several tasks if useful. Use as much capacity as you need; Ben wants this as thorough as possible.
3. Post the six focused reviews in `lanes/RV-focused-reviews.md` as six separate comments on PR #1061.
4. Every failure goes in `FINDINGS.md` as a row and in the corpus as `open-finding`. Attack PRs change no source.
5. When the attack PRs have landed, fix findings P0 first, in small PRs into the #1061 branch, one area per PR,
   one PR at a time for `capture-fixture-parser.ts` and `context-reader.ts`. Each fix flips its cases to `pass`
   and names the files it touches in its first line. An open price is always better than a wrong one.
6. Each fix PR gets "@codex review" from a different task than the one that wrote it. Never merge.
7. Finally run `CHECK.md` sections A and B at the deployed head and post the table.

Practice data only, no paid APIs, no deploys, no changes to v2/main or main. Follow AGENTS.md.
Report progress as comments on the tracking issue: lane, PR link, cases written, findings by severity.
