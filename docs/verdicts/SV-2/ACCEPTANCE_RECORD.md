# Acceptance record: SV-2 (PR #119)

Piece: SV-2 shadow persistence and isolation (migration 0128, renumbered 0100 -> 0118 -> 0128)
Pull request: #119
Merge commit on main: a0963f4
Accepted head: eaad751
GitHub run: 38244911229 (on eaad751)
PR comment: 6124060822
Lane: RED (LANE-LOG: "red | red")

Verdict files (first 16 hex of sha256):
- fe76e7f-opus.md  3926c6d5d660f666  (Opus PASS at fe76e7f; already in this folder before this record)
- sv-2-opus-delta-c4442e7.md  341bedb19012b2ee  (Opus PASS at c4442e7)
- sv-2-solcheck-20261011T165133.md  a1d356bdd81858ef  (Sol REPAIR at c4442e7)
- sv-2-opus-recheck-6a2bd6e.md  34f243dd732b692b  (Opus REPAIR at 6a2bd6e)
- sv-2-opus-recheck2-eaad751.md  88e2d3e83e8cba4f  (Opus PASS at eaad751)

Recorded exception (LANE-LOG): one existing row of the merged money test moved out of the runtime loop;
the other six rows are byte-identical, the moved row is stricter, no money figure changed.

Record added after merge under the 11 Oct ruling 1; no code changed.
