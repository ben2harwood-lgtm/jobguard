#!/usr/bin/env node
// V2-SQ-B: the exact command for a Worker preview version that trusts only its own address.
// A preview alias gives a stable address (<alias>-<worker>.<subdomain>.workers.dev) known before the upload, so the
// version can carry that one origin in JOBGUARD_ALLOWED_ORIGINS. Nothing here trusts a request header or a pattern,
// and nothing changes what the public address serves: `versions upload` never moves traffic.
import { pathToFileURL } from "node:url";

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,40}[a-z0-9])?$/u;

export function previewOrigin({ alias, worker = "jobguard-demo", subdomain }) {
  for (const [name, value] of Object.entries({ alias, worker, subdomain })) {
    if (typeof value !== "string" || !LABEL.test(value)) throw new Error(`PREVIEW_${name.toUpperCase()}_INVALID`);
  }
  if (alias.length + worker.length + 1 > 63) throw new Error("PREVIEW_ALIAS_TOO_LONG");
  return `https://${alias}-${worker}.${subdomain}.workers.dev`;
}

export function previewUploadArgs({ alias, worker = "jobguard-demo", subdomain, message }) {
  const origin = previewOrigin({ alias, worker, subdomain });
  return { origin, args: ["exec", "wrangler", "versions", "upload", "--preview-alias", alias,
    "--var", `JOBGUARD_ALLOWED_ORIGINS:${origin}`, "--message", message ?? `Preview ${alias}`] };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const option = name => { const at = process.argv.indexOf(`--${name}`); return at > 0 ? process.argv[at + 1] : undefined; };
  const { origin, args } = previewUploadArgs({ alias: option("alias"), worker: option("worker") ?? "jobguard-demo", subdomain: option("subdomain"), message: option("message") });
  process.stdout.write(`Share: ${origin}/jobs/new\nRun in apps/web: pnpm ${args.map(a => (/[\s:]/u.test(a) ? JSON.stringify(a) : a)).join(" ")}\n`);
}
