#!/usr/bin/env python3
"""LANE-FORMAT-1 equivalence check.

Usage: python3 docs/verdicts/LANE-FORMAT-1/equivalence-check.py [BASE_REF [HEAD_REF]]
Defaults: BASE_REF=origin/main, HEAD_REF=HEAD. Run from anywhere inside the repo.

Asserts that config/agent-lane-assignments.json at HEAD_REF is the file at BASE_REF
with exactly one lane added ("lane-format-1") and nothing else changed in meaning,
and that the HEAD file is in the canonical one-lane-per-line, sorted-by-name format.
Exits non-zero on any failure.
"""
import json
import subprocess
import sys

PATH = "config/agent-lane-assignments.json"
ADDED_NAME = "lane-format-1"
ADDED_LANE = {
    "branches": ["codex/sandbox/lane-format-1"],
    "allow": [PATH, "docs/verdicts/LANE-FORMAT-1/**"],
}


def dump(obj):
    """Canonical writer: '{"version":2,"lanes":{', one compact lane per line sorted by name, '}}', one newline."""
    head = {k: v for k, v in obj.items() if k != "lanes"}

    def c(v):
        return json.dumps(v, separators=(",", ":"), ensure_ascii=False)

    prefix = c(head)[:-1] + ("," if head else "")
    rows = [f"{c(n)}:{c(obj['lanes'][n])}" for n in sorted(obj["lanes"])]
    return prefix + '"lanes":{\n' + ",\n".join(rows) + "\n}}\n"


class Dup(Exception):
    pass


def no_dupes(pairs):
    seen = set()
    for k, _ in pairs:
        if k in seen:
            raise Dup(k)
        seen.add(k)
    return dict(pairs)


def git_show(ref):
    return subprocess.run(
        ["git", "show", f"{ref}:{PATH}"], check=True, capture_output=True, text=True
    ).stdout


failures = []


def check(ok, msg):
    print(("PASS  " if ok else "FAIL  ") + msg)
    if not ok:
        failures.append(msg)


def load(ref):
    raw = git_show(ref)
    try:
        return raw, json.loads(raw, object_pairs_hook=no_dupes)
    except Dup as e:
        check(False, f"{ref}: duplicate key {e.args[0]!r} in {PATH}")
        return raw, None


def main():
    base_ref = sys.argv[1] if len(sys.argv) > 1 else "origin/main"
    head_ref = sys.argv[2] if len(sys.argv) > 2 else "HEAD"
    base_raw, base = load(base_ref)
    head_raw, head = load(head_ref)
    if base is None or head is None:
        return 1
    check(True, f"{base_ref} and {head_ref} parse with no duplicate keys at any level")

    def rest(o):
        return {k: v for k, v in o.items() if k != "lanes"}

    check(rest(base) == rest(head), "top-level keys and values other than 'lanes' are identical")

    bl, hl = base["lanes"], head["lanes"]
    check(ADDED_NAME not in bl, f"'{ADDED_NAME}' is not already present at {base_ref}")
    check(hl.get(ADDED_NAME) == ADDED_LANE, f"'{ADDED_NAME}' at {head_ref} has the expected definition")
    expected = dict(bl)
    expected[ADDED_NAME] = ADDED_LANE
    check(hl == expected, f"lanes at {head_ref} == lanes at {base_ref} plus exactly '{ADDED_NAME}' (order-insensitive, each lane identical)")
    check(set(hl) - set(bl) == {ADDED_NAME} and not (set(bl) - set(hl)), "added lane names == {lane-format-1}; removed lane names == {}")
    check(all(hl[n] == bl[n] for n in bl if n in hl), "every pre-existing lane object is unchanged")

    check(head_raw == dump(head), f"{head_ref} file is byte-for-byte the canonical form (one lane per line, sorted by name)")
    check(list(hl) == sorted(hl), "lane keys in file order are sorted by name")
    check(head_raw.count("\n") == len(hl) + 2 and head_raw.endswith("}}\n"), "line count == lanes + 2 and file ends with '}}' + single newline")

    print(f"summary: base lanes={len(bl)} head lanes={len(hl)} base lines={base_raw.count(chr(10))} head lines={head_raw.count(chr(10))}")
    if failures:
        print(f"RESULT: FAIL ({len(failures)} check(s) failed)")
        return 1
    print("RESULT: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
