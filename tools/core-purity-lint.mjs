import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.argv[2] || "packages/core/src");
const forbidden = /(?:from\s+["'](?:pg|postgres|@aws-sdk\/|stripe|@anthropic-ai\/)|\bfetch\s*\()/;
const walk = (directory) => readdirSync(directory).flatMap((entry) => {
  const path = resolve(directory, entry);
  return statSync(path).isDirectory() ? walk(path) : path.endsWith(".ts") ? [path] : [];
});
const violations = walk(root).filter((file) => forbidden.test(readFileSync(file, "utf8")));
if (violations.length) throw new Error(`Core purity violation:\n${violations.join("\n")}`);
console.log(`Core purity passed (${walk(root).length} TypeScript files).`);
