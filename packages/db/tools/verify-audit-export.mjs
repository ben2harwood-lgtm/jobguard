#!/usr/bin/env node
// Offline verifier: only an export file and independently supplied PUBLIC material; no DB, credentials or server.
import { readFile } from "node:fs/promises";
import { verifySignedAuditExport } from "../dist/audit-export-repository.js";
const usage = "Usage: node packages/db/tools/verify-audit-export.mjs <export.json> [--trusted-public-key <public.pem>]";
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--help") {
  console.log(`${usage}\nExit 0: integrity verified against independently obtained public key; 1: invalid integrity or signer not independently trusted; 2: invalid input/unreadable file. The signature proves export integrity only. A key copied from the same untrusted export does not independently establish trust. Checkpoint origin is asserted by the export signer, not externally timestamped.`);
} else if ((args.length !== 1 && args.length !== 3) || !args[0] || args[0].startsWith("--") || (args.length === 3 && (args[1] !== "--trusted-public-key" || !args[2]))) {
  console.error(usage); process.exitCode = 2;
} else {
  let raw, publicKey;
  try {
    raw = JSON.parse(await readFile(args[0], "utf8"));
    publicKey = args[2] ? await readFile(args[2], "utf8") : undefined;
  } catch { console.error(JSON.stringify({ code: "AUDIT_EXPORT_UNREADABLE" })); process.exitCode = 2; }
  if (process.exitCode !== 2) {
    try {
      const { payload, ...report } = verifySignedAuditExport(raw, publicKey);
      console.log(JSON.stringify({ ...report, tenantId: payload.tenantId, exportId: payload.exportId, entryCount: payload.entryCount, headHash: payload.headHash }, null, 2));
      process.exitCode = report.complete ? 0 : 1;
    } catch { console.log(JSON.stringify({ version: "audit-export-verification.v1", integrityValid: false, complete: false, code: "AUDIT_EXPORT_INVALID" })); process.exitCode = 1; }
  }
}
