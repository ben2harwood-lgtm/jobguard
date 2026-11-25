import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const refused = () => { throw new Error("PILOT_RESTORE_BINDING_REFUSED"); };
const digest = value => createHash("sha256").update(value).digest("hex");

/** Preflight only. The later restore task owns copying data and reconciling outbox state. */
export function requirePilotRestoreTarget(env) {
  if (env.JOBGUARD_ENV !== "pilot_no_charge" || env.JOBGUARD_COMMERCIAL_OUTBOUND !== "paused") refused();
  const keys = ["PILOT_RUNTIME_DATABASE_URL", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY",
    "PILOT_RESTORE_DATABASE_URL", "PILOT_RESTORE_BUCKET", "PILOT_RESTORE_S3_ENDPOINT",
    "PILOT_RESTORE_S3_ACCESS_KEY_ID", "PILOT_RESTORE_S3_SECRET_ACCESS_KEY"];
  let pins;
  try { pins = JSON.parse(env.JOBGUARD_PILOT_RESOURCES ?? ""); } catch { refused(); }
  if (pins?.version !== "pilot-resources.v1" ||
      keys.some(key => !env[key] || pins.sha256?.[key] !== digest(env[key]))) refused();
  let restore, runtime, endpoint;
  try {
    restore = new URL(env.PILOT_RESTORE_DATABASE_URL);
    runtime = new URL(env.PILOT_RUNTIME_DATABASE_URL);
    endpoint = new URL(env.PILOT_RESTORE_S3_ENDPOINT);
  } catch { refused(); }
  if (!["postgres:", "postgresql:"].includes(restore.protocol) ||
      !restore.hostname || restore.hostname === runtime.hostname ||
      (restore.search !== "" && restore.search !== "?sslmode=verify-full") || restore.hash ||
      restore.username !== "jobguard_pilot_restore_login" || !restore.password || restore.password === runtime.password ||
      !/^\/jobguard_pilot_restore(?:_[a-z0-9]+)*$/u.test(restore.pathname) ||
      !/^\/jobguard_pilot(?:_[a-z0-9]+)*$/u.test(runtime.pathname) ||
      /^\/jobguard_pilot_(?:queue|restore)(?:_|$)/u.test(runtime.pathname) || runtime.username !== "jobguard_runtime" ||
      endpoint.protocol !== "https:" || endpoint.username || endpoint.password ||
      endpoint.pathname !== "/" || endpoint.search || endpoint.hash ||
      !/^jobguard-pilot-restore-[a-z0-9-]+$/u.test(env.PILOT_RESTORE_BUCKET) ||
      !/^jobguard-pilot-(?!restore-)[a-z0-9-]+$/u.test(env.S3_BUCKET) ||
      env.PILOT_RESTORE_S3_ACCESS_KEY_ID === env.S3_ACCESS_KEY_ID ||
      env.PILOT_RESTORE_S3_SECRET_ACCESS_KEY === env.S3_SECRET_ACCESS_KEY) refused();
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try { requirePilotRestoreTarget(process.env); console.log("PILOT_RESTORE_BINDING_VERIFIED"); }
  catch { console.error("PILOT_RESTORE_BINDING_REFUSED"); process.exitCode = 1; }
}
