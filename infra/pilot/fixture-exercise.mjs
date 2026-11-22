import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { get } from "node:http";
import { json } from "node:stream/consumers";
import { setTimeout as delay } from "node:timers/promises";
import pg from "../../apps/api/node_modules/pg/lib/index.js";
import { createDarkClaudeProvider } from "../../packages/ai/dist/index.js";
import { FakeOpsSink, observeOpsFailure } from "../../packages/config/dist/ops-alerts.js";
import { S3PrivateVersionedStorage, sha256, storageEnvironmentSchema } from "../../packages/storage/dist/index.js";

const sink = new FakeOpsSink(JSON.parse(await readFile(new URL("../../config/ops-alerts.v1.json", import.meta.url), "utf8")));

async function expectRefusal(signal, operation) {
  await assert.rejects(observeOpsFailure(sink, signal, operation));
  assert.equal(sink.records.at(-1)?.signal, signal);
}

async function verifyServices() {
  const options = { signal: AbortSignal.timeout(3000) };
  const api = await new Promise((resolve, reject) => {
    get("http://api:3001/healthz", { ...options, headers: { Host: "pilot-api.invalid" } }, resolve).on("error", reject);
  });
  assert.equal(api.statusCode, 200);
  assert.deepEqual(await json(api), { status: "ok" });
  const refusal = await fetch("http://api:3001/healthz", options);
  assert.equal(refusal.status, 403);
  assert.equal((await fetch("http://web:3000/local-speech/manifest.json", options)).status, 200);
  const web = await fetch("http://web:3000/api/jobs", options);
  assert.equal(web.status, 403);
  assert.deepEqual(await web.json(), { code: "TENANT_FORBIDDEN" });
}

async function verifyObjects() {
  const storage = new S3PrivateVersionedStorage(storageEnvironmentSchema.parse(process.env));
  const key = "pilot_no_charge/fixture/original";
  const upload = await storage.createUploadUrl({ key, contentType: "text/plain", expiresInSeconds: 60 });
  assert.equal((await fetch(new URL(upload).origin + "/jobguard-pilot-fixture/" + key)).status, 403);
  const versions = [];
  for (const body of ["fictional original", "fictional replacement"]) {
    const response = await fetch(upload, { method: "PUT", headers: { "Content-Type": "text/plain" }, body });
    assert.equal(response.status, 200);
    const version = response.headers.get("x-amz-version-id");
    assert.ok(version && version !== "null");
    versions.push(version);
  }
  assert.notEqual(versions[0], versions[1]);
  const original = await storage.readExactVersion(key, versions[0]);
  assert.equal(sha256(original.bytes), sha256(new TextEncoder().encode("fictional original")));
  await expectRefusal("storage.verification_failed", () => storage.readExactVersion(key, "null"));
}

async function seedQueue(connectionString) {
  const pool = new pg.Pool({ connectionString });
  try {
    // An unregistered task remains due. The registered predecessor refusal fails once and is retained.
    await pool.query(`SELECT jobguard_pilot_queue.add_job('fixture_unhandled', '{}'::json,
      run_at := now() - interval '1 minute', job_key := 'fixture_unhandled'),
      jobguard_pilot_queue.add_job('execute_outbox', '{}'::json,
      max_attempts := 1, job_key := 'fixture_failure')`);
  } finally {
    await pool.end();
  }
}

export async function exercise(connectionString) {
  assert.equal(process.env.JOBGUARD_COMMERCIAL_OUTBOUND, "paused");
  for (let attempt = 0; ; attempt++) {
    try { await verifyServices(); break; }
    catch (error) { if (attempt >= 15) throw error; await delay(1000); }
  }
  await verifyObjects();
  let called = false;
  await expectRefusal("route.denied", async () => {
    createDarkClaudeProvider({ mode: "synthetic_contract", region: "unapproved" }, async () => {
      called = true;
      throw new Error("Unexpected fictional transport");
    });
  });
  assert.equal(called, false);

  // Inject the executor's closed signal at its telemetry port. Never simulate sending from the pilot worker.
  sink.outboxTelemetry().emit("outbox.unknown_outcome", { detail: "fictional private detail" });
  assert.equal(sink.records.at(-1)?.signal, "outbox.unknown_outcome");
  for (const { signal, ownerRole } of sink.records) console.log(JSON.stringify({ signal, ownerRole }));
  await seedQueue(connectionString);
  console.log("PILOT_FIXTURE_EXERCISE_VERIFIED");
}
