import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { lstatSync, chmodSync, mkdirSync, mkdtempSync, realpathSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { V2FilesystemStorage } from "../packages/storage/src/v2-filesystem.ts";
import { assertPostgresTarget, checkDirectory, embeddedData, storageData } from "./v2/local-targets.mjs";
import { database, host, ports, validateSettings } from "./v2/settings.mjs";

test("embedded bootstrap refuses each mismatch after only its read-only identity query", async () => {
  const target = { id: "327867", directory: embeddedData, name: database, port: ports.database, address: host };
  for (const mismatch of [{ id: "123" }, { directory: "/other/data" }, { name: "other_db" },
    { port: 5432 }, { port: ports.database + 1 }, { address: "0.0.0.0" }]) {
    const calls = [];
    const client = { query: async sql => {
      calls.push(sql);
      return { rows: [{ ...target, ...mismatch }] };
    } };
    await assert.rejects(assertPostgresTarget(client, target.id, true), /server identity does not match/u);
    assert.equal(calls.length, 1);
    assert.match(calls[0], /^SELECT .*current_database\(\)/u);
  }
  await assertPostgresTarget({ query: async () => ({ rows: [target] }) }, target.id, true);
});

test("launcher refuses alternate embedded directories and ports before starting any programs", () => {
  for (const [name, value] of Object.entries({
    JOBGUARD_V2_STORAGE_DIR: "/tmp/other-objects",
    JOBGUARD_V2_POSTGRES_DIR: "/tmp/other-data",
    V2_DATABASE_PORT: "5432",
  })) {
    const result = spawnSync(process.execPath, ["tools/v2/start.mjs"], {
      env: { PATH: "/missing", JOBGUARD_V2_BACKEND: "embedded", [name]: value },
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, new RegExp(name, "u"));
    assert.doesNotMatch(result.stderr, /ENOENT/u);
  }
});

test("V2 accepts only the checkout's storage directory in embedded mode", () => {
  const env = { JOBGUARD_V2_BACKEND: "embedded", JOBGUARD_V2_STORAGE_DIR: storageData };
  assert.equal(validateSettings(env).backend, "embedded");
  assert.throws(() => validateSettings({ ...env, JOBGUARD_V2_BACKEND: "docker" }), /JOBGUARD_V2_STORAGE_DIR/u);
  assert.throws(() => validateSettings({ ...env, JOBGUARD_V2_STORAGE_DIR: storageData + "/other" }), /JOBGUARD_V2_STORAGE_DIR/u);
});

test("the generated-certificate setting still requires an assigned private LAN address", () => {
  const interfaces = { en0: [{ address: "192.168.0.24", family: "IPv4", internal: false }] };
  const env = { JOBGUARD_V2_PHONE_SELF_SIGNED: "1", JOBGUARD_V2_PHONE_HOST: "192.168.0.24" };
  const { settings, phone } = validateSettings(env, interfaces);
  assert.deepEqual(phone, { address: "192.168.0.24", generate: true });
  assert.equal(settings.NEXT_PUBLIC_API_URL, "/api/v2-backend");
  assert.throws(() => validateSettings({ ...env, JOBGUARD_V2_PHONE_HOST: "192.168.0.25" }, interfaces), /assigned/u);
  assert.throws(() => validateSettings({ ...env, JOBGUARD_V2_PHONE_CERT: "/tmp/tls.pem" }, interfaces), /either/u);
});

test("embedded state refuses a symlink and a shared directory before creating anything", t => {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "jobguard-v2-target-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const outside = join(root, "outside");
  const target = join(root, "objects");
  mkdirSync(outside, { mode: 0o755 });
  chmodSync(outside, 0o755);
  symlinkSync(outside, target);
  assert.throws(() => checkDirectory(target, true), /private directory/u);
  assert.throws(() => checkDirectory(outside, true), /private directory/u);
  assert.deepEqual(readdirSync(outside), []);
});

test("V2 filesystem versions survive reopening, stay private and refuse escapes", async t => {
  const checkout = mkdtempSync(join(realpathSync(tmpdir()), "jobguard-v2-objects-"));
  const previous = process.cwd();
  const saved = [process.env.JOBGUARD_LOCAL_V2, process.env.JOBGUARD_V2_STORAGE_DIR];
  const root = join(checkout, ".jobguard", "v2", "objects");
  const other = join(checkout, "other");
  t.after(() => {
    process.chdir(previous);
    for (const [index, name] of ["JOBGUARD_LOCAL_V2", "JOBGUARD_V2_STORAGE_DIR"].entries()) {
      if (saved[index] === undefined) delete process.env[name];
      else process.env[name] = saved[index];
    }
    rmSync(checkout, { recursive: true, force: true });
  });
  for (const path of [".jobguard", ".jobguard/v2", ".jobguard/v2/objects", "other"]) {
    mkdirSync(join(checkout, path), { mode: 0o700 });
  }
  process.chdir(checkout);
  delete process.env.JOBGUARD_LOCAL_V2;
  process.env.JOBGUARD_V2_STORAGE_DIR = root;
  assert.equal(V2FilesystemStorage.fromEnvironment(), undefined);
  process.env.JOBGUARD_LOCAL_V2 = "1";
  process.env.JOBGUARD_V2_STORAGE_DIR = other;
  assert.throws(() => V2FilesystemStorage.fromEnvironment(), /target does not match/u);
  assert.deepEqual(readdirSync(other), []);
  process.env.JOBGUARD_V2_STORAGE_DIR = root;
  const first = V2FilesystemStorage.fromEnvironment();
  const key = "tenants/fictional/uploads/one/original";
  const bytes = Buffer.from("first version");
  const [v1, replay] = await Promise.all([first.put(key, "image/png", bytes), first.put(key, "image/png", bytes)]);
  const v2 = await first.put(key, "image/png", Buffer.from("second version"));
  assert.equal(v1, replay);
  assert.notEqual(v1, v2);
  const second = V2FilesystemStorage.fromEnvironment();
  assert.deepEqual((await second.readExactVersion(key, v1)).bytes, bytes);
  assert.equal((await second.readExactVersion(key, v2)).bytes.toString(), "second version");
  await assert.rejects(second.readExactVersion(key, "../other"), /Invalid/u);
  await assert.rejects(second.put("../outside", "image/png", bytes), /Invalid/u);
  await assert.rejects(second.readExactVersion("other/key", v1), { code: "ENOENT" });
  assert.ok(readdirSync(root).every(name => (lstatSync(join(root, name)).mode & 0o777) === 0o600));
  const file = join(root, readdirSync(root).find(name => name.endsWith(v1)));
  await second.deleteExactVersion(key, v1);
  await assert.rejects(second.readExactVersion(key, v1), { code: "ENOENT" });
  writeFileSync(join(other, "outside"), "leave untouched", { mode: 0o600 });
  symlinkSync(join(other, "outside"), file);
  await assert.rejects(second.readExactVersion(key, v1), { code: "ELOOP" });
  assert.deepEqual(readdirSync(other), ["outside"]);
});
