import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));
const path = new URL("../dependency-releases.json", import.meta.url);
const pins = Object.entries({ ...manifest.dependencies, ...manifest.devDependencies }).filter(([, version]) => version !== "workspace:*");
if (process.argv.includes("--refresh")) {
 const releases = Object.fromEntries(pins.map(([name, version]) => {
  assert.match(version, /^\d+\.\d+\.\d+$/u);
  const metadata = JSON.parse(execFileSync("npm", ["view", `${name}@${version}`, "time", "dist.integrity", "--json", "--registry=https://registry.npmjs.org"], { encoding: "utf8" }));
  return [name, { version, publishedAt: metadata.time[version], integrity: metadata["dist.integrity"] }];
 }));
 writeFileSync(path, JSON.stringify({ checkedAt: new Date().toISOString(), releases }, null, 2) + "\n");
}
const evidence = JSON.parse(readFileSync(path));
const lock = readFileSync(new URL("../../../pnpm-lock.yaml", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../../../pnpm-workspace.yaml", import.meta.url), "utf8");
assert.match(workspace, /^minimumReleaseAge: 20160$/mu);
// Age is evaluated against the task date, never a future machine clock.
const cutoff = Date.parse("2026-10-22T00:00:00Z");
for (const [name, version] of pins) {
 assert.match(version, /^\d+\.\d+\.\d+$/u);
 const r = evidence.releases[name];
 assert.equal(r.version, version);
 assert.ok(Number.isFinite(Date.parse(r.publishedAt)) && Date.parse(r.publishedAt) <= cutoff, `${name} younger than two weeks`);
 assert.match(r.integrity, /^sha512-[A-Za-z0-9+/]+=*$/u);
 assert.ok(lock.includes(r.integrity), `${name}: registry integrity missing from lock`);
}
const config = JSON.parse(readFileSync(new URL("../app.json", import.meta.url))).expo;
assert.equal(config.plugins.find(p => p[0] === "expo-sqlite")[1].useSQLCipher, true);
assert.equal(config.updates.enabled, false);
assert.equal(config.newArchEnabled, true);
console.log(`Mobile supply-chain lint PASS: ${pins.length} exact direct pins, registry SHA-512 lock bindings, release cutoff 2026-10-22, install quarantine 20160 minutes, SQLCipher required. Not a vulnerability scan or native build proof.`);
