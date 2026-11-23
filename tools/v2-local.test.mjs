import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { assertV2Recipient, captureV2Delivery } from "../packages/db/src/v2-local-catcher.ts";
import { database, refuseDotenvFiles, validateSettings } from "./v2/settings.mjs";

const { settings } = validateSettings({});
const endpointSettings = [
  ...Object.keys(settings).filter(key => /URL|ORIGIN|S3_ENDPOINT/u.test(key)),
  "SMTP_URL", "CONNECTOR_ENDPOINT", "SENTRY_DSN", "PAYMENT_ENDPOINT", "SMS_URL", "NEW_PROVIDER_SETTING",
];

for (const name of endpointSettings) {
  test(`V2 refuses a public address in ${name}`, () => {
    assert.throws(() => validateSettings({ [name]: "https://public.example" }), new RegExp(name, "u"));
  });
  test(`V2 refuses a demo identifier in ${name}`, () => {
    assert.throws(() => validateSettings({ [name]: "https://jobguard-demo.ben2harwood.workers.dev" }), /blocked demo identifier/u);
  });
}

test("V2 accepts its fixed loopback configuration", () => {
  assert.deepEqual(validateSettings(settings).settings, settings);
});

test("V2 refuses encoded, case-insensitive and database/host demo identifiers", () => {
  for (const value of ["JOBGUARD_SYNTHETIC_DEMO", "https://name.NEON.TECH", "https://%6e%65on.tech"]) {
    assert.throws(() => validateSettings({ EXTRA_SETTING: value }), /blocked demo identifier/u);
  }
});

test("V2 refuses every other local database, including a pg connection-option override", () => {
  for (const name of Object.keys(settings).filter(key => key.endsWith("DATABASE_URL"))) {
    const url = settings[name];
    for (const target of [url.replace(database, "another_database"), url.replace(":56432", ":5432"),
      url.replace(":56432", ":56433"), `${url}?host=127.0.0.1&port=5432`, `${url}?dbname=other`]) {
      assert.throws(() => validateSettings({ [name]: target }), new RegExp(name, "u"));
    }
  }
});

test("V2 refuses a different local storage destination", () => {
  for (const env of [
    { S3_ENDPOINT: "http://127.0.0.1:9000" },
    { S3_ENDPOINT: `${settings.S3_ENDPOINT}/other-root` },
    { S3_BUCKET: "other-bucket" },
    { S3_BUCKET: "jobguard-evidence-private" },
    { JOBGUARD_STORAGE_DIR: "/tmp/another-environment" },
    { V2_POSTGRES_DATA: "/tmp/another-cluster" },
    { PGPORT: "5432" },
  ]) assert.throws(() => validateSettings(env), new RegExp(Object.keys(env)[0], "u"));
});

test("V2 refuses an unknown endpoint and alternate local proxy", () => {
  assert.throws(() => validateSettings({ EXTRA: "https://external.example" }), /outside the V2 endpoint allowlist/u);
  assert.throws(() => validateSettings({ HTTPS_PROXY: "http://127.0.0.1:3128" }), /outside the V2 endpoint allowlist/u);
});

test("V2 refuses a tunnel, a different device's LAN IP and insecure phone access", () => {
  const interfaces = { en0: [{ address: "192.168.0.24", family: "IPv4", internal: false }] };
  for (const address of ["https://tunnel.example", "192.168.0.25"]) {
    assert.throws(() => validateSettings({ JOBGUARD_V2_PHONE_HOST: address }, interfaces), /private IPv4 address/u);
  }
  assert.throws(() => validateSettings({ JOBGUARD_V2_PHONE_HOST: "192.168.0.24" }, interfaces), /local TLS certificate and key/u);
});

test("V2 checks framework dotenv files before Next can read them", () => {
  const root = mkdtempSync(join(tmpdir(), "jobguard-v2-settings-"));
  try {
    writeFileSync(join(root, ".env"), "SMTP_URL=smtp://mail.example:25\n");
    assert.throws(() => refuseDotenvFiles(root), /SMTP_URL/u);
    writeFileSync(join(root, ".env"), "");
    assert.throws(() => refuseDotenvFiles(root), /clean worktree/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the start entry point fails before it can launch other programs", () => {
  for (const env of [
    { DATABASE_URL: settings.DATABASE_URL.replace(database, "other_database") },
    { S3_BUCKET: "jobguard-evidence-private" },
    { WORKER_DATABASE_URL: settings.WORKER_DATABASE_URL.replace(":56432", ":5432") },
    { SMTP_URL: "smtp://mail.example:25" },
    { AUTH_ALLOWED_ORIGIN: "https://jobguard-demo.ben2harwood.workers.dev" },
  ]) {
    const result = spawnSync(process.execPath, ["tools/v2/start.mjs"], { env: { ...env, PATH: "/missing" }, encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, new RegExp(Object.keys(env)[0], "u"));
    assert.doesNotMatch(result.stderr, /ENOENT/u);
  }
});

test("V2 delivery captures approved fictional destinations and refuses unlisted ones", t => {
  const previous = process.env.JOBGUARD_LOCAL_V2;
  process.env.JOBGUARD_LOCAL_V2 = "1";
  t.after(() => {
    if (previous === undefined) delete process.env.JOBGUARD_LOCAL_V2;
    else process.env.JOBGUARD_LOCAL_V2 = previous;
  });
  const localSink = t.mock.method(console, "info", () => undefined);
  for (const destination of ["customer@jobguard-v2.invalid", '["merchant@jobguard-v2.invalid"]', "+447700900042"]) {
    captureV2Delivery("fixture", destination);
  }
  for (const destination of ["somewhere@nonlocal.example", "unlisted@jobguard-v2.invalid", '["customer@jobguard-v2.invalid","unknown@elsewhere.invalid"]', "[]", "[bad"]) {
    assert.throws(() => captureV2Delivery("fixture", destination), /V2_RECIPIENT_BLOCKED/u);
  }
  assert.equal(localSink.mock.callCount(), 3);
  assert.deepEqual(localSink.mock.calls[0].arguments, ['{"event":"v2.delivery.captured","kind":"fixture"}']);
});

test("V2 catcher adds no recipient restrictions outside its own mode", () => {
  assert.doesNotThrow(() => assertV2Recipient("other-practice-user@practice.invalid"));
});

test("V2 runtime refuses unlisted TCP and HTTP(S) destinations", () => {
  const result = spawnSync(process.execPath, ["--import", "./tools/v2/network.mjs", "--input-type=module", "-e", `
    import assert from "node:assert/strict";
    import { connect } from "node:net";
    import { get } from "node:http";
    import { get as getHttps } from "node:https";
    const blocked = { code: "V2_OUTBOUND_BLOCKED" };
    const connection = client => new Promise((resolve, reject) => {
      client.once("error", reject).once("connect", resolve).once("response", resolve);
    });
    await assert.rejects(connection(connect(5432, "127.0.0.1")), blocked);
    await assert.rejects(connection(connect(3401, "external.example")), blocked);
    await assert.rejects(connection(get("http://127.0.0.1:8025")), blocked);
    await assert.rejects(connection(getHttps("https://outside.example")), blocked);
    await assert.rejects(fetch("https://outside.example"), error => error.cause?.code === blocked.code);
  `], { env: {}, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});

test("the fictional seed refuses an unchecked process before connecting", async () => {
  const { seedV2 } = await import("./v2/seed.mjs");
  await assert.rejects(seedV2(), /V2 seed requires JOBGUARD_LOCAL_V2=1/u);
});

test("the V2 database target must match the independent Compose identity", async () => {
  const { verifyDatabaseTarget } = await import("./v2/local-targets.mjs");
  const { postgresData } = await import("./v2/settings.mjs");
  const target = { name: database, directory: postgresData, port: 5432, id: "123" };
  const check = (row, id = "123") => verifyDatabaseTarget({ query: async () => ({ rows: [row] }) }, id);
  await check(target);
  for (const override of [{ name: "other_db" }, { directory: "/tmp/other_pg" }, { port: 56432 }, { id: "321" }]) {
    await assert.rejects(check({ ...target, ...override }), /V2 PostgreSQL server identity does not match/u);
  }
  await assert.rejects(check(target, ""), /requires the dedicated PostgreSQL server identity/u);
});
