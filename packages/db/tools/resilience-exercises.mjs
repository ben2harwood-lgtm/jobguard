/** M5-10: disposable synthetic fixtures only; no supplied database is ever opened. */
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, cp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import { runSyntheticRestoreRehearsal } from "./synthetic-restore.mjs";

const optionsSchema = z.object({
  version: z.literal("resilience-exercises.v1"),
  runs: z.number().int().min(1).max(100).default(3),
  outputDirectory: z.string().min(1),
  objectivesFile: z.string().min(1).optional(),
  // A supplied URL is checked, then refused even if local: only fresh fixtures are allowed.
  databaseUrl: z.string().optional(),
}).strict();
const dependencyNames = ["database", "evidenceVersions", "auditCheckpoint", "fakeKeys", "fakeProvider", "sync", "externalAuditAnchors"];
const limitSchema = z.object({ recoveryMilliseconds: z.number().finite().nonnegative(), dataLossMilliseconds: z.number().finite().nonnegative() }).strict();
const objectivesSchema = z.object({
  version: z.literal("resilience-objectives.v1"),
  approval: z.object({ decisionReference: z.string().min(1), approvedBy: z.string().min(1), approvedAt: z.iso.datetime() }).strict().nullable(),
  dependencies: z.partialRecord(z.enum(dependencyNames), limitSchema),
}).strict();

export function compareObjectives(measurements, objectives) {
  if (!objectives?.approval) return { status: "no approved objective" };
  const comparisons = Object.fromEntries(dependencyNames.map(name => {
    const actual = measurements[name], limit = objectives.dependencies[name];
    return [name, !limit ? "no approved objective" : actual?.status !== "exercised" ? "not exercised" :
      actual.recoveryMilliseconds <= limit.recoveryMilliseconds && actual.dataLossMilliseconds <= limit.dataLossMilliseconds ? "within objective" : "objective missed"];
  }));
  return { status: Object.values(comparisons).every(value => value === "within objective") ? "within synthetic objective" : "incomplete or missed", approval: objectives.approval, limits: objectives.dependencies, comparisons };
}

// Fake local provider state is independent of the restored local execution ledger.
// Reconciliation can learn terminal facts; it never sends or collects anything.
export function reconcileFakeProvider(local, provider) {
  for (const effect of local) {
    const fact = provider.find(item => item.id === effect.id && item.kind === effect.kind);
    if (!fact || fact.status !== (effect.kind === "send" ? "executed" : effect.kind === "collection" ? "settled" : null)) throw new Error("FAKE_PROVIDER_RECONCILIATION_REQUIRED");
    effect.status = fact.status;
  }
}
export function replayFakeEffect(effect, provider) {
  if (["executed", "settled"].includes(effect.status)) return;
  if (effect.status !== "pending" || !["send", "collection"].includes(effect.kind)) throw new Error("FAKE_PROVIDER_RECONCILIATION_REQUIRED");
  provider.calls[effect.kind]++;
  effect.status = effect.kind === "send" ? "executed" : "settled";
  provider.effects.push({ ...effect });
}

export async function fakeDependencies(root) {
  const source = join(root, "source.json"), backup = join(root, "backup.json"), restored = join(root, "restored.json");
  const effects = [{ id: randomUUID(), kind: "send", status: "pending" }, { id: randomUUID(), kind: "collection", status: "pending" }];
  // The fake provider has already made each effect once. The backup deliberately
  // contains stale unknown outcomes, so restore must reconcile before any replay.
  const provider = { effects: [], calls: { send: 0, collection: 0 } };
  for (const effect of effects) replayFakeEffect(effect, provider);
  const providerPath = join(root, "fake-provider.json");
  await writeFile(providerPath, JSON.stringify(provider));
  const fixture = { key: `fake-key-${randomUUID()}`, effects: effects.map(effect => ({ ...effect, status: "outcome_unknown" })) };
  await writeFile(source, JSON.stringify(fixture));
  await cp(source, backup, { errorOnExist: true, force: false });
  const started = performance.now();
  await cp(backup, restored, { errorOnExist: true, force: false });
  const recovered = JSON.parse(await readFile(restored, "utf8"));
  assert.equal(createHash("sha256").update(recovered.key).digest("hex"), createHash("sha256").update(fixture.key).digest("hex"));
  const measurement = () => ({ status: "exercised", recoveryMilliseconds: performance.now() - started, dataLossMilliseconds: 0, boundary: "quiescent disposable JSON fixture; no real key or provider" });
  const fakeKeys = measurement();
  const external = JSON.parse(await readFile(providerPath, "utf8"));
  for (const effect of recovered.effects) assert.throws(() => replayFakeEffect(effect), /RECONCILIATION_REQUIRED/);
  reconcileFakeProvider(recovered.effects, external.effects);
  for (let retry = 0; retry < 3; retry++) for (const effect of recovered.effects) replayFakeEffect(effect, external);
  assert.deepEqual(external.calls, { send: 1, collection: 1 });
  assert.deepEqual(recovered.effects, effects);
  return { measurements: { fakeKeys, fakeProvider: measurement() }, noDuplicateEffects: { fixtureOnly: true, sendCallsBefore: 1, sendCallsAfter: external.calls.send, collectionCallsBefore: 1, collectionCallsAfter: external.calls.collection, reconciledBeforeReplay: true } };
}

export async function runResilienceExercises(input, api) {
  const options = optionsSchema.parse(input);
  if (options.databaseUrl !== undefined) {
    let url;
    try { url = new URL(options.databaseUrl); } catch { throw new Error("NON_LOCAL_DATABASE_REFUSED"); }
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.search) throw new Error("NON_LOCAL_DATABASE_REFUSED");
    throw new Error("SUPPLIED_DATABASE_REFUSED_DISPOSABLE_FIXTURES_ONLY");
  }
  if (process.env.JOBGUARD_ENV && process.env.JOBGUARD_ENV !== "synthetic_demo") throw new Error("SYNTHETIC_REHEARSAL_ONLY");
  const objectives = options.objectivesFile ? objectivesSchema.parse(JSON.parse(await readFile(options.objectivesFile, "utf8"))) : null;
  await mkdir(options.outputDirectory, { recursive: true });
  const receipts = [];
  for (let run = 1; run <= options.runs; run++) {
    const runId = randomUUID(), started = performance.now();
    const root = await mkdtemp(join(tmpdir(), "jobguard-resilience-"));
    try {
      const baseline = await runSyntheticRestoreRehearsal({ environment: "synthetic_demo" }, api);
      const fake = await fakeDependencies(root);
      const measurements = { ...baseline.dependencyMeasurements, ...fake.measurements,
        sync: { status: "not exercised", reason: "No native device or sync service in the local fixture" },
        externalAuditAnchors: { status: "not exercised", reason: "Only the baseline local audit checkpoint is verified; no external timestamp service" } };
      const receipt = { version: "jobguard-resilience-exercise-receipt.v1", synthetic: true, run, runId, recordedAt: new Date().toISOString(),
        elapsedMilliseconds: performance.now() - started, measurements, noDuplicateEffects: fake.noDuplicateEffects,
        objectiveResult: compareObjectives(measurements, objectives), baseline,
        notExercised: ["Real key-vault recovery", "Real provider recovery and collection", "Deployed backups and failover", "MinIO/S3 object-version recovery", "Human operational exercises and remediation decisions"],
        releaseDecision: "NOT_AUTHORIZED", productionRecoveryEstablished: false };
      const path = join(options.outputDirectory, `${run}-${runId}.json`);
      await writeFile(path, JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
      receipts.push(path);
    } finally { await rm(root, { recursive: true, force: true }); }
  }
  return receipts;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    if (process.argv.length !== 3) throw new Error("Usage: node packages/db/tools/resilience-exercises.mjs <options.json>");
    const options = JSON.parse(await readFile(process.argv[2], "utf8"));
    // Validation and non-local refusal happen before any cluster can be started.
    const api = await import("../dist/index.js");
    console.log(JSON.stringify(await runResilienceExercises(options, api)));
  } catch (error) { console.error(String(error?.message ?? error)); process.exitCode = 1; }
}
