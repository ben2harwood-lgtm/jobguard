/**
 * Train guide: only unassigned train names on draft pull requests to main use
 * the train rule. The integrator checks approvals under CHECK-LANES section 9.
 * This tool verified only that every commit is a clean merge of main or an exact current branch tip that passes its own lane check; it does not verify that any piece is approved (verdicts live off-branch).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const SHA = /^[0-9a-f]{40}$/u;
const ZERO_SHA = "0".repeat(40);
const splitPaths = (value) => value.split("\0").filter(Boolean);

export function matches(pattern, file) {
  if (pattern.endsWith("/**")) return file.startsWith(pattern.slice(0, -2));
  return pattern === file;
}

const matchingLanes = (config, branch) => Object.entries(config.lanes).filter(([, lane]) =>
    lane.branches?.includes(branch) || lane.branchPrefixes?.some((prefix) =>
      prefix && (branch === prefix || branch.startsWith(`${prefix}-`))));

const hasNoLane = (policy, branch) => {
  try { return matchingLanes(policy, branch).length === 0; }
  catch { return false; } // Malformed policies keep selectLane's original error.
};

export function selectLane(config, branch, requested, eventName) {
  if (config.version !== 2 || Object.hasOwn(config, "defaultLane")) {
    throw new Error("Lane policy must be version 2 with no fallback/default lane.");
  }
  const found = matchingLanes(config, branch);
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

export const TRAIN_NOTICE = "This tool verified only that every commit is a clean merge of main or an exact current branch tip that passes its own lane check; it does not verify that any piece is approved (verdicts live off-branch).";

const isTrainName = (branch) => typeof branch === "string" && branch.length <= 64 &&
  /^train\/[a-z0-9]+(?:-[a-z0-9]+)*$(?![\s\S])/u.test(branch);

export function trainPathViolations(files, lanes) {
  return files.filter((file) => !lanes.some((lane) => lane.allow.some((pattern) => matches(pattern, file))));
}

// L1: Approved cannot be seen: verdicts live off-branch. The integrator checks
// approvals (CHECK-LANES section 9 step 1); the lint checks registration, exact
// current tips and each piece's own lane. The run exposes only the same code.
// L2: Offline branch tips cannot prove a pull request exists; a registered
// pushed branch without a pull request also counts as a registered head.
// L3: Draft is the event-time flag; an old run replays its old event. GitHub's
// draft restriction, the ready_for_review trigger and people keep it unmerged.
// L4: The tick covers only printed heads; a later piece move does not re-run it.
// The integrator compares main's tree to the train (section 9 step 3).
// L5: The lane file remains self-service; reviewers read each registration.
function inspectTrain({ cwd, event, branch, base, target, comparison, eventName, policy }) {
  let scratch;
  const prefix = `Train branch ${JSON.stringify(branch)} refused: `;
  try {
    if (event.pull_request.draft !== true) throw new Error("the event must declare draft as the boolean true.");
    if (event.pull_request.base.ref !== "main") throw new Error("the base branch must be main.");
    // Preserve the policy-version and no-fallback invariants on this path too.
    try { selectLane(policy, branch, undefined, eventName); }
    catch (error) {
      if (error.message !== `Branch ${JSON.stringify(branch)} must match exactly one registered lane; found 0. Register the task before building.`) throw error;
    }
    const options = { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], maxBuffer: 16 * 1024 * 1024 };
    const git = (args) => execFileSync("git", ["--no-replace-objects", ...args], options);
    if (git(["rev-parse", "--is-shallow-repository"]).trim() !== "false") throw new Error("full history is required; the repository is shallow or its history state is invalid.");
    const objects = git(["rev-parse", "--path-format=absolute", "--git-path", "objects"]).trim();
    if (!objects || !objects.startsWith("/")) throw new Error("invalid repository object directory.");
    scratch = mkdtempSync(join(tmpdir(), "jobguard-train-objects-"));
    const scratchObjects = join(scratch, "objects"); mkdirSync(scratchObjects);
    options.env = { ...process.env, GIT_OBJECT_DIRECTORY: scratchObjects, GIT_ALTERNATE_OBJECT_DIRECTORIES: JSON.stringify(objects) };
    const plainMerge = (a, b, label) => {
      let output;
      try {
        output = git(["-c", "merge.renames=true", "-c", "merge.directoryRenames=conflict", "merge-tree", "--write-tree", "--end-of-options", a, b]).trim();
      } catch (error) {
        if (error.status === 1) throw new Error(`${label}: plain merge conflicts; the piece leaves the train (CHECK-LANES section 9 step 1).`);
        throw new Error(`${label}: git merge-tree --write-tree is unavailable or refused (status ${error.status ?? "unknown"}).`);
      }
      if (!SHA.test(output)) throw new Error(`${label}: unexpected merge-tree output.`);
      return output;
    };
    plainMerge(base, base, "merge-tree availability");
    const isMainSide = (sha) => {
      try { git(["merge-base", "--is-ancestor", "--end-of-options", sha, base]); return true; }
      catch (error) { if (error.status === 1) return false; throw error; }
    };
    const paths = (a, b, range = false) => splitPaths(git(["diff", "--no-renames", "--name-only", "-z", "--end-of-options", ...(range ? [`${a}...${b}`] : [a, b]), "--"]));
    const refs = git(["for-each-ref", "--format=%(refname) %(objectname)", "--end-of-options", "refs/remotes/origin/"]).trim();
    const tips = new Map();
    for (const line of refs ? refs.split("\n") : []) {
      const match = /^(refs\/remotes\/origin\/(.+)) ([0-9a-f]{40})$/u.exec(line);
      if (!match) throw new Error("unexpected origin branch tip output.");
      if (match[2] === "HEAD") continue;
      const branches = tips.get(match[3]) ?? []; branches.push(match[2]); tips.set(match[3], branches);
    }
    const registered = (sha, trainCommit) => {
      const branches = tips.get(sha);
      if (!branches?.length) throw new Error(`commit ${trainCommit}, second parent ${sha}: no branch tip points exactly at this parent.`);
      const tree = plainMerge(base, sha, `commit ${trainCommit}, second parent ${sha}`);
      let policy;
      try { policy = JSON.parse(git(["show", "--end-of-options", `${tree}:config/agent-lane-assignments.json`])); }
      catch { throw new Error(`commit ${trainCommit}, second parent ${sha}: invalid or unavailable piece lane policy.`); }
      const selected = [], reasons = [];
      for (const branch of branches) {
        try { selected.push({ branch, ...selectLane(policy, branch, undefined, "pull_request") }); }
        catch (error) { reasons.push(`${branch}: ${error.message}`); }
      }
      if (!selected.length) throw new Error(`commit ${trainCommit}, second parent ${sha}: not registered; ${reasons.join("; ")}`);
      if (new Set(selected.map((entry) => entry.name)).size !== 1) throw new Error(`commit ${trainCommit}, second parent ${sha}: exact branch tips select different lanes: ${selected.map((entry) => `${entry.branch} (${entry.name})`).join(", ")}.`);
      const { branch, name, lane } = selected[0];
      const violations = trainPathViolations(paths(base, sha, true), [lane]);
      if (violations.length) throw new Error(`commit ${trainCommit}, second parent ${sha}, piece ${branch}, lane ${name} cannot edit: ${violations.map((file) => JSON.stringify(file)).join(", ")}`);
      return { piece: { branch, lane: name, head: sha }, lane };
    };
    const commits = [], entries = [];
    let current = target;
    while (!isMainSide(current)) {
      const raw = git(["cat-file", "-p", "--end-of-options", current]);
      const header = raw.split("\n\n", 1)[0].split("\n");
      const parents = header.filter((line) => line.startsWith("parent ")).map((line) => line.slice(7));
      if (parents.length !== 2) throw new Error(`commit ${current} has ${parents.length} parents; exactly two are required.`);
      if (parents.some((parent) => !SHA.test(parent))) throw new Error(`commit ${current} has invalid parents.`);
      commits.push(current);
      if (!isMainSide(parents[1])) entries.push(registered(parents[1], current));
      const tree = plainMerge(parents[0], parents[1], `commit ${current}`);
      const actualTree = git(["rev-parse", "--verify", "--end-of-options", `${current}^{tree}`]).trim();
      if (!SHA.test(actualTree)) throw new Error(`commit ${current} has an invalid tree.`);
      if (tree !== actualTree) throw new Error(`commit ${current} has a hand-edited merge tree; differing paths: ${paths(tree, actualTree).map((file) => JSON.stringify(file)).join(", ")}`);
      current = parents[0];
    }
    if (!commits.length) throw new Error("at least one train commit is required.");
    if (!entries.length) throw new Error("at least one registered head must be a second parent.");
    const files = paths(base, target, true).sort();
    const violations = trainPathViolations(files, entries.map((entry) => entry.lane));
    if (violations.length) throw new Error(`paths outside every piece lane: ${violations.map((file) => JSON.stringify(file)).join(", ")}`);
    return { lane: null, branch, event: eventName, base, head: target, comparison, files,
      train: { pieces: entries.reverse().map((entry) => entry.piece), commits } };
  } catch (error) {
    throw new Error(`${prefix}${error.message}`);
  } finally {
    if (scratch) {
      try { rmSync(scratch, { recursive: true, force: true }); }
      catch (error) { throw new Error(`${prefix}scratch cleanup was refused: ${error.message}`); }
    }
  }
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
  if (eventName === "pull_request" && isTrainName(branch) && !args.length && env.AGENT_LANE === undefined && hasNoLane(policy, branch)) {
    return inspectTrain({ cwd, event, branch, base, target, comparison, eventName, policy });
  }
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
    if (result.train) console.log(TRAIN_NOTICE);
  } catch (error) {
    console.error(`Lane boundary FAILED: ${error.message}`);
    process.exitCode = 1;
  }
}
