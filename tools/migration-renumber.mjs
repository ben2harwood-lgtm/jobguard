/**
 * MERGE-CHURN-1 (founder decision 35): number a piece's own new migrations at merge time.
 *
 *   node tools/migration-renumber.mjs [--base=origin/main] [--write]
 *
 * Run on the piece's branch after catching up with main. It finds the migrations this branch added (against the merge
 * base with --base) and, only if one is not numbered above the highest migration on --base or two share a number,
 * renames them to the next free numbers in their current order. SQL bytes never change (git mv). Every reference to an
 * old file stem (for example 0156_quote_fix) in files this branch added or changed is rewritten, and files whose name
 * carries the stem (a migration note) are renamed. Merged files are never touched. Without --write it only reports and
 * exits 1 when a renumber is needed. With --write it stages the result for the caller to review and commit.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MIGRATION_PATH } from "./agent-lane-boundary-lint.mjs";

const MIGRATIONS = "packages/db/migrations/";
const split = (value) => value.split("\0").filter(Boolean);
const stemOf = (file) => file.slice(MIGRATIONS.length, -".sql".length);
const numberOf = (file) => Number(MIGRATION_PATH.exec(file)[1]);
const pad = (n) => String(n).padStart(4, "0");

/** Pure plan: baseFiles are paths on the base, added are this branch's added paths. Returns [{ from, to }]. */
export function planRenumber(baseFiles, added) {
  const own = added.filter((file) => MIGRATION_PATH.test(file)).sort();
  const base = baseFiles.filter((file) => MIGRATION_PATH.test(file));
  const highest = base.length ? Math.max(...base.map(numberOf)) : -1;
  const numbers = own.map(numberOf);
  const ok = numbers.every((n, i) => n > highest && (i === 0 || n > numbers[i - 1]));
  if (ok) return [];
  if (highest + own.length > 9999) throw new Error("No free four-digit migration numbers remain.");
  return own.map((from, i) => ({ from, to: `${MIGRATIONS}${pad(highest + 1 + i)}${stemOf(from).slice(4)}.sql` }))
    .filter(({ from, to }) => from !== to);
}

export function renumber({ cwd = process.cwd(), base = "origin/main", write = false } = {}) {
  const git = (args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], maxBuffer: 16 * 1024 * 1024 });
  const baseSha = git(["rev-parse", "--verify", "--end-of-options", `${base}^{commit}`]).trim();
  const fork = git(["merge-base", baseSha, "HEAD"]).trim();
  if (write && git(["status", "--porcelain"]).trim()) throw new Error("The worktree must be clean before renumbering.");
  const baseFiles = split(git(["ls-tree", "-r", "--name-only", "-z", baseSha, "--", MIGRATIONS]));
  const added = split(git(["diff", "--no-renames", "--diff-filter=A", "--name-only", "-z", `${fork}`, "HEAD", "--", MIGRATIONS]));
  const plan = planRenumber(baseFiles, added);
  if (!write || !plan.length) return { plan, rewritten: [], renamed: [] };
  const stems = plan.map(({ from, to }) => [stemOf(from), stemOf(to)]);
  const touched = split(git(["diff", "--no-renames", "--diff-filter=AM", "--name-only", "-z", fork, "HEAD", "--"]))
    .filter((file) => !MIGRATION_PATH.test(file));
  const renamed = [];
  for (const { from, to } of plan) { git(["mv", "--", from, to]); renamed.push([from, to]); }
  const rewritten = [];
  for (let file of touched) {
    for (const [oldStem, newStem] of stems) {
      if (file.split("/").at(-1).includes(oldStem)) {
        const moved = file.replace(new RegExp(`${oldStem}(?![0-9a-z_])`, "u"), newStem);
        git(["mv", "--", file, moved]); renamed.push([file, moved]); file = moved;
      }
    }
    const path = resolve(cwd, file);
    if (!existsSync(path)) continue;
    const bytes = readFileSync(path);
    if (bytes.includes(0)) continue; // binary
    let text = bytes.toString("utf8");
    const before = text;
    // Two passes through placeholders, so a chain such as 0156->0157 and 0157->0158 cannot double-rewrite.
    stems.forEach(([oldStem], i) => { text = text.replace(new RegExp(`(?<![0-9a-z_])${oldStem}(?![0-9a-z_])`, "gu"), `\u0000${i}\u0000`); });
    stems.forEach(([, newStem], i) => { text = text.split(`\u0000${i}\u0000`).join(newStem); });
    if (text !== before) { writeFileSync(path, text); git(["add", "--", file]); rewritten.push(file); }
  }
  return { plan, rewritten, renamed };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const unknown = args.filter((arg) => arg !== "--write" && !arg.startsWith("--base="));
  if (unknown.length) { console.error("Usage: node tools/migration-renumber.mjs [--base=origin/main] [--write]"); process.exit(2); }
  try {
    const base = args.find((arg) => arg.startsWith("--base="))?.slice(7) || "origin/main";
    const write = args.includes("--write");
    const { plan, rewritten, renamed } = renumber({ base, write });
    if (!plan.length) { console.log("Migration numbers are already above the base; nothing to renumber."); process.exit(0); }
    for (const { from, to } of plan) console.log(`${write ? "renamed" : "needs"} ${from} -> ${to}`);
    if (!write) { console.log("Run again with --write to apply (SQL bytes unchanged)."); process.exit(1); }
    for (const [from, to] of renamed.filter(([from]) => !MIGRATION_PATH.test(from))) console.log(`renamed ${from} -> ${to}`);
    for (const file of rewritten) console.log(`rewrote references in ${file}`);
    console.log("Staged. Review the diff, then commit it as the piece's renumber.");
  } catch (error) {
    console.error(`Migration renumber FAILED: ${error.message}`);
    process.exit(1);
  }
}
