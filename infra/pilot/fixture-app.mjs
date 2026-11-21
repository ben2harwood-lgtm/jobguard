import { createHash } from "node:crypto";

const service = process.argv[2];
if (!["web", "api", "worker", "exercise"].includes(service)) process.exit(1);

const fixture = process.env;
if (fixture.JOBGUARD_COMMERCIAL_OUTBOUND !== "paused") throw new Error("FIXTURE_OUTBOUND_MUST_BE_PAUSED");
const database = (user, password, name = "jobguard_pilot_fixture") => {
  if (!/^[a-f0-9]{48}$/u.test(password ?? "")) throw new Error("FIXTURE_INPUT_REFUSED");
  return `postgresql://${user}:${password}@postgres:5432/${name}`;
};
const settings = {
  PILOT_RUNTIME_DATABASE_URL: database("jobguard_runtime", fixture.PILOT_FIXTURE_RUNTIME_PASSWORD),
  IDENTITY_DATABASE_URL: database("jobguard_identity", fixture.PILOT_FIXTURE_IDENTITY_PASSWORD),
  AUTH_ALLOWED_ORIGIN: "https://pilot-web.invalid",
  PILOT_API_ORIGIN: "https://pilot-api.invalid",
  AUTH_CODE_SECRET: fixture.PILOT_FIXTURE_AUTH_SECRET,
  S3_ENDPOINT: "http://objects:9000",
  S3_REGION: "eu-west-2",
  S3_BUCKET: "jobguard-pilot-fixture",
  S3_ACCESS_KEY_ID: fixture.PILOT_FIXTURE_STORAGE_ID,
  S3_SECRET_ACCESS_KEY: fixture.PILOT_FIXTURE_STORAGE_SECRET,
};
if (service === "worker") {
  settings.WORKER_DATABASE_URL = database("jobguard_pilot_worker_login", fixture.PILOT_FIXTURE_WORKER_PASSWORD);
  settings.GRAPHILE_DATABASE_URL = database("jobguard_pilot_queue_login", fixture.PILOT_FIXTURE_QUEUE_PASSWORD, "jobguard_pilot_queue");
}
const pins = Object.fromEntries(Object.entries(settings).map(([key, value]) => [
  key, createHash("sha256").update(value).digest("hex"),
]));
const { pilotApprovalFixture } = await import("../../packages/config/dist/policy-gates.pilot-test-fixture.js");
const { approval, env } = pilotApprovalFixture();
// Keep the isolated test receipt valid for the duration of a supervisor restart.
approval.expiresAt = new Date(Date.now() + 60 * 60_000).toISOString();
Object.assign(process.env, env, settings, {
  JOBGUARD_PILOT_21_APPROVAL: JSON.stringify(approval),
  JOBGUARD_PILOT_RESOURCES: JSON.stringify({ version: "pilot-resources.v1", sha256: pins }),
});

if (service === "exercise") {
  const { exercise } = await import("./fixture-exercise.mjs");
  await exercise(database("jobguard_pilot_queue_login", fixture.PILOT_FIXTURE_QUEUE_PASSWORD, "jobguard_pilot_queue"));
} else if (service === "web") {
  process.chdir(new URL("../../apps/web", import.meta.url).pathname);
  process.argv.splice(2, 1, "start", "--hostname", "0.0.0.0");
  await import("../../apps/web/node_modules/next/dist/bin/next");
} else if (service === "api") {
  await import("../../apps/api/dist/main.js");
} else {
  await import("../../apps/api/dist/worker.js");
}
