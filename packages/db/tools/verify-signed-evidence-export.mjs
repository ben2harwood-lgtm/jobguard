#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { verifySignedEvidenceExport } from "../dist/signed-evidence-export.js";

const args = process.argv.slice(2);
const usage = "Usage: node packages/db/tools/verify-signed-evidence-export.mjs <bundle.json> <independent-context.json>";
if (args.length === 1 && args[0] === "--help") {
  console.log(`${usage}\nContext supplies expected tenant/job/case/export, verification time and independently trusted public key versions. Exit 0: integrity checked against the independently trusted fixture key and expected scope; 1: verification failed; 2: unreadable input. Timestamp trust remains unverified; no commercial truth is established.`);
} else if (args.length !== 2 || args.some(a => a.startsWith("--"))) {
  console.error(usage); process.exitCode = 2;
} else {
  let bundle, context;
  try {
    bundle = JSON.parse(await readFile(args[0], "utf8"));
    context = JSON.parse(await readFile(args[1], "utf8"));
  } catch { console.error(JSON.stringify({ code: "SIGNED_EVIDENCE_EXPORT_UNREADABLE" })); process.exitCode = 2; }
  if (process.exitCode !== 2) {
    try {
      const report = verifySignedEvidenceExport(bundle, context);
      console.log(JSON.stringify(report, null, 2));
      process.exitCode = report.syntheticIntegrityComplete ? 0 : 1;
    } catch {
      console.log(JSON.stringify({ version: "signed-evidence-verification.v1", integrityValid: false,
        complete: false, code: "SIGNED_EVIDENCE_EXPORT_INVALID" }));
      process.exitCode = 1;
    }
  }
}
