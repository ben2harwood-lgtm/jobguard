import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FakeOpsSink, failureClasses, observeOpsFailure, parseOpsAlerts } from "../packages/config/src/ops-alerts.ts";
import { checkProviderRegister, renderProviderRegister } from "./provider-register.mjs";
import { requireLocalDatabase, runPreflight, scanBuildOutput } from "./deployment-preflight.mjs";

const catalogue = JSON.parse(readFileSync(new URL("../config/ops-alerts.v1.json", import.meta.url)));
test("exact five classes, role ownership, real source paths and runbook anchors", () => {
  assert.deepEqual(parseOpsAlerts(catalogue).alerts.map(row => row.id), failureClasses);
  const docs = readFileSync(new URL("../docs/operations/incident-ownership.md", import.meta.url), "utf8");
  for (const row of catalogue.alerts) {
    assert.ok(existsSync(new URL(`../${row.source}`, import.meta.url)));
    assert.ok(docs.toLowerCase().includes(`## ${row.runbook.split("#")[1].replaceAll("-", " ")}`));
  }
  for (const bad of [{ ...catalogue, extra: true }, { ...catalogue, alerts: catalogue.alerts.slice(1) },
    { ...catalogue, alerts: [...catalogue.alerts.slice(0, 4), catalogue.alerts[0]] },
    { ...catalogue, alerts: catalogue.alerts.map(row => ({ ...row, ownerRole: "Some Person" })) }])
    assert.throws(() => parseOpsAlerts(bad), /Invalid operations alert input/u);
});
test("five made-up failure signals fire through the fake sink; no content survives", async () => {
  const sink = new FakeOpsSink(catalogue);
  sink.outboxTelemetry().emit("outbox.failure", { attempt: 5, secret: "discarded" });
  sink.outboxTelemetry().emit("outbox.unknown_outcome", { actionId: "fictional-action" });
  sink.outboxTelemetry().emit("outbox.queue_age", { seconds: 1 });
  for (const signal of ["backup.failed", "route.denied", "storage.verification_failed"]) {
    const failure = new Error("fictional private error");
    await assert.rejects(observeOpsFailure(sink, signal, async () => { throw failure; }), error => error === failure);
  }
  assert.deepEqual(sink.records.map(row => row.id), failureClasses);
  assert.ok(!JSON.stringify(sink.records).includes("fictional private"));
  assert.throws(() => sink.emit({ version: "ops-signal.v1", signal: "backup.failed", content: "private" }));
  assert.throws(() => sink.emit({ version: "ops-signal.v1", signal: "invented" }));
  await observeOpsFailure(sink, "backup.failed", async () => "success");
  assert.equal(sink.records.length, 5);
});
test("register covers every data-flow source; an omitted or changed source fails", async () => {
  checkProviderRegister();
  const directory = await mkdtemp(join(tmpdir(), "ops-register-"));
  try {
    const operations = join(directory, "docs/operations");
    await mkdir(operations, { recursive: true });
    await writeFile(join(operations, "provider-register.md"), renderProviderRegister(directory));
    await writeFile(join(operations, "new-data-flow.md"), "Fictional new flow");
    assert.throws(() => checkProviderRegister(directory), /PROVIDER_REGISTER_STALE/u);
    await writeFile(join(operations, "provider-register.md"), renderProviderRegister(directory));
    checkProviderRegister(directory);
    await writeFile(join(operations, "new-data-flow.md"), "Changed destination");
    assert.throws(() => checkProviderRegister(directory), /PROVIDER_REGISTER_STALE/u);
  } finally { await rm(directory, { recursive: true }); }
});
test("nonlocal/override database URLs refuse before any database runner or connection", async () => {
  for (const url of ["postgres://user:fake@remote.invalid/db", "postgres://user@localhost/db",
    "postgres://user@127.0.0.1/db?host=remote.invalid", "postgres://user@127.0.0.1/db?options=-cfoo",
    "file:///tmp/db", "postgres://user@127.0.0.1/db#override"]) {
    let calls = 0;
    await assert.rejects(runPreflight({ databaseUrl: url }, { run: () => { calls++; } }), /PREFLIGHT_LOCAL_DATABASE_REQUIRED/u);
    assert.equal(calls, 0);
  }
  assert.ok(requireLocalDatabase("postgres://user@127.0.0.1/db"));
  assert.ok(requireLocalDatabase("postgres://user@[::1]/db"));
});
test("build scanner rejects secret signatures, exact configured secrets, symlinks and empty outputs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ops-build-"));
  try {
    await assert.rejects(scanBuildOutput(directory), /EMPTY/u);
    const file = join(directory, "app.js.map");
    for (const value of ["-----BEGIN PRIVATE KEY-----", "postgres://fixture:fake@127.0.0.1/db",
      "sk_live_" + "a".repeat(24), "AKIA" + "A".repeat(16)]) {
      await writeFile(file, value);
      await assert.rejects(scanBuildOutput(directory), /SECRET_FOUND/u);
    }
    await writeFile(file, "synthetic-exact-secret");
    await assert.rejects(scanBuildOutput(directory, ["synthetic-exact-secret"]), /SECRET_FOUND/u);
    await writeFile(file, "public build output");
    assert.equal(await scanBuildOutput(directory), 1);
    let calls = 0;
    await runPreflight({ databaseUrl: "postgres://user@127.0.0.1/db", buildOutput: directory,
      tenantA: "fixture-a", tenantB: "fixture-b" }, { run: env => { calls++; assert.ok(env.PREFLIGHT_DATABASE_URL); } });
    assert.equal(calls, 1); // Orchestration only; not a database pass claim.
    await symlink(file, join(directory, "link"));
    await assert.rejects(scanBuildOutput(directory), /SYMLINK_REFUSED/u);
  } finally { await rm(directory, { recursive: true }); }
});
