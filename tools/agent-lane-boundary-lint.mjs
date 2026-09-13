import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const config = JSON.parse(readFileSync(new URL("../config/agent-lane-assignments.json", import.meta.url), "utf8"));
const argument = process.argv.find((value) => value.startsWith("--lane="));
const branch = process.env.GITHUB_HEAD_REF || execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim();
const inferred = Object.entries(config.lanes).find(([, lane]) => lane.branchPrefixes.some((prefix) => branch === prefix || branch.startsWith(`${prefix}-`)))?.[0];
const laneName = argument?.slice("--lane=".length) || process.env.AGENT_LANE || inferred || config.defaultLane;
const lane = config.lanes[laneName];
if (!lane) throw new Error(`Unknown agent lane: ${laneName}`);

const base = process.env.LANE_BASE_REF;
const args = base ? ["diff", "--name-only", `${base}...HEAD`] : ["status", "--porcelain"];
const raw = execFileSync("git", args, { encoding: "utf8" });
const files = base ? raw.trim().split("\n") : raw.trim().split("\n").map((line) => line.slice(3));
const matches = (pattern, file) => pattern === "**" || (pattern.endsWith("/**") && file.startsWith(pattern.slice(0, -3)));
const violations = files.filter(Boolean).filter((file) => !lane.allow.some((pattern) => matches(pattern, file)));
if (violations.length) throw new Error(`Lane ${laneName} cannot edit:\n${violations.join("\n")}`);
console.log(`Lane boundary passed for ${laneName} (${files.filter(Boolean).length} changed files).`);
