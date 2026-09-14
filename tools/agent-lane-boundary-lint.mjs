import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SHA = /^[0-9a-f]{40}$/u;
const ZERO_SHA = "0".repeat(40);
const splitPaths = (value) => value.split("\0").filter(Boolean);

export function matches(pattern, file) {
  if (pattern.endsWith("/**")) return file.startsWith(pattern.slice(0, -2));
  return pattern === file;
}

export function selectLane(config, branch, requested, eventName) {
  if (config.version !== 2 || Object.hasOwn(config, "defaultLane")) {
    throw new Error("Lane policy must be version 2 with no fallback/default lane.");
  }
  const found = Object.entries(config.lanes).filter(([, lane]) =>
    lane.branches?.includes(branch) || lane.branchPrefixes?.some((prefix) =>
      prefix && (branch === prefix || branch.startsWith(`${prefix}-`))));
  if (found.length !== 1) throw new Error(`Branch ${JSON.stringify(branch)} must match exactly one registered lane; found ${found.length}. Register the task before building.`);
  const [name, lane] = found[0];
  if (requested && requested !== name) throw new Error(`Lane override ${requested} does not match registered branch lane ${name}.`);
  if (lane.integration && eventName === "pull_request") throw new Error("Integration lanes cannot be used by a pull request; use a registered task branch.");
  if (!Array.isArray(lane.allow) || !lane.allow.length || lane.allow.some((path) =>
    typeof path !== "string" || !path || path === "**" || path.startsWith("/") || path.split("/").includes("..") ||
    (path.includes("*") && !/^[^*]+\/\*\*$/u.test(path)))) {
    throw new Error(`Lane ${name} requires explicit file paths or directory/** scopes; blanket or malformed grants are forbidden.`);
  }
  return { name, lane };
}

export function inspectLane({ cwd = process.cwd(), env = process.env, argv = [], config } = {}) {
  const git = (args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], maxBuffer: 16 * 1024 * 1024 });
  const commit = (ref) => {
    if (typeof ref !== "string" || !ref || ref.endsWith("/") || /[\r\n\0]/u.test(ref)) throw new Error(`Invalid comparison ref: ${JSON.stringify(ref)}`);
    try { return git(["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`]).trim(); }
    catch { throw new Error(`Comparison commit ${JSON.stringify(ref)} is unavailable. Fetch full history; refusing to check an empty substitute range.`); }
  };
  const eventSha = (value, label) => {
    if (typeof value !== "string" || !SHA.test(value) || value === ZERO_SHA) throw new Error(`Missing or invalid ${label} commit SHA.`);
    return commit(value);
  };
  const eventName = env.GITHUB_EVENT_NAME || "local";
  let event = {};
  if (eventName !== "local") {
    if (!env.GITHUB_EVENT_PATH) throw new Error("CI event payload is required; refusing a local-mode fallback.");
    event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8"));
  } else if (env.GITHUB_ACTIONS === "true") throw new Error("GITHUB_EVENT_NAME is required in GitHub Actions.");
  const head = commit("HEAD");
  let branch, base, target = head, comparison;
  if (eventName === "pull_request") {
    branch = event.pull_request?.head?.ref;
    base = eventSha(event.pull_request?.base?.sha, "pull-request base");
    target = eventSha(event.pull_request?.head?.sha, "pull-request head");
    if (env.GITHUB_HEAD_REF && env.GITHUB_HEAD_REF !== branch) throw new Error("Pull-request branch disagrees with the runner context.");
    try { git(["merge-base", "--is-ancestor", target, head]); }
    catch { throw new Error("Checked-out code does not contain the pull-request head."); }
    comparison = "merge-base";
  } else if (eventName === "push") {
    if (event.deleted || !event.ref?.startsWith("refs/heads/")) throw new Error("Lane checking requires a non-deleted branch push.");
    branch = event.ref.slice("refs/heads/".length);
    target = eventSha(event.after, "push after");
    if (target !== head) throw new Error("Checked-out HEAD is not the pushed commit.");
    if (event.before === ZERO_SHA) { base = null; comparison = "initial-tree"; }
    else {
      base = eventSha(event.before, "push before");
      try { git(["merge-base", "--is-ancestor", base, target]); }
      catch { throw new Error("Non-fast-forward push requires separate review; refusing an incomplete range."); }
      comparison = "two-endpoint";
    }
  } else if (eventName === "local") {
    branch = git(["branch", "--show-current"]).trim();
    if (!branch) throw new Error("Detached local HEAD has no task lane; check out the registered branch.");
    if (env.LANE_BASE_REF) base = commit(env.LANE_BASE_REF);
    else {
      const candidates = branch === "main" ? ["HEAD^"] : ["refs/remotes/origin/main", "refs/heads/main"];
      for (const candidate of candidates) { try { base = commit(candidate); break; } catch {} }
      if (!base) throw new Error("No local comparison base is available. Set LANE_BASE_REF to the task's base commit.");
    }
    comparison = "merge-base";
  } else throw new Error(`Unsupported CI event ${eventName}; no permissive fallback.`);
  if (!branch || (base && base === target)) throw new Error("Missing branch or self-comparison range; refusing a misleading pass.");
  const args = argv.filter((value) => value.startsWith("--lane="));
  if (args.length > 1 || argv.some((value) => !value.startsWith("--lane="))) throw new Error("Usage: node tools/agent-lane-boundary-lint.mjs [--lane=registered-name]");
  if (args[0] === "--lane=") throw new Error("An explicit lane cannot be empty.");
  const policy = config ?? JSON.parse(readFileSync(resolve(cwd, "config/agent-lane-assignments.json"), "utf8"));
  const requested = args[0]?.slice(7) || env.AGENT_LANE;
  if (args.length && env.AGENT_LANE && requested !== env.AGENT_LANE) throw new Error("Conflicting explicit lane assignments.");
  const { name, lane } = selectLane(policy, branch, requested, eventName);
  // --no-renames checks both the deleted path and the new path; -z preserves unusual filenames.
  const files = new Set(splitPaths(comparison === "initial-tree"
    ? git(["ls-tree", "-r", "--name-only", "-z", target])
    : git(["diff", "--no-renames", "--name-only", "-z", ...(comparison === "merge-base" ? [`${base}...${target}`] : [base, target]), "--"])));
  if (eventName === "local") {
    for (const args of [["diff", "--no-renames", "--name-only", "-z", "--cached", "HEAD", "--"], ["diff", "--no-renames", "--name-only", "-z", "--"], ["ls-files", "--others", "--exclude-standard", "-z"]]) {
      for (const file of splitPaths(git(args))) files.add(file);
    }
  }
  const violations = [...files].filter((file) => !lane.allow.some((pattern) => matches(pattern, file)));
  if (violations.length) throw new Error(`Lane ${name} cannot edit:\n${violations.map((file) => JSON.stringify(file)).join("\n")}`);
  return { lane: name, branch, event: eventName, base, head: target, comparison, files: [...files].sort() };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = inspectLane({ argv: process.argv.slice(2) });
    console.log(`Lane boundary passed: ${JSON.stringify(result)}`);
  } catch (error) {
    console.error(`Lane boundary FAILED: ${error.message}`);
    process.exitCode = 1;
  }
}
