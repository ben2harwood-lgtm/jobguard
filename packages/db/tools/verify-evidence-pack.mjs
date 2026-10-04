#!/usr/bin/env node
// Standalone, offline verification of an exported text file. No database or application server.
import { readFile } from "node:fs/promises";
import { EvidencePackVerificationError, verifyStandalonePack } from "@jobguard/core";

const usage = "Usage: node packages/db/tools/verify-evidence-pack.mjs <pack.txt> [--trusted-manifest-sha256 <independently obtained SHA-256>]";
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--help") {
  console.log(`${usage}\nDefault inspection does not independently trust the checkpoint. Exit 0: complete against supplied checkpoint; 1: findings; 2: invalid input.\nDo not copy the digest out of the same untrusted file and treat it as independent evidence.`);
} else if ((args.length !== 1 && args.length !== 3) || !args[0] || args[0].startsWith("--") ||
  (args.length === 3 && (args[1] !== "--trusted-manifest-sha256" || !/^[a-f0-9]{64}$/.test(args[2])))) {
  console.error(usage);
  process.exitCode = 2;
} else {
  try {
    const text = await readFile(args[0], "utf8");
    const report = verifyStandalonePack(text, args[2] ? { trustedManifestDigest: args[2] } : {});
    console.log(JSON.stringify({ version: "evidence-pack-verification.v1", ...report }, null, 2));
    process.exitCode = report.complete ? 0 : 1;
  } catch (error) {
    console.error(JSON.stringify({
      version: "evidence-pack-verification.v1",
      code: error instanceof EvidencePackVerificationError ? error.code : "EVIDENCE_PACK_UNREADABLE",
      message: error instanceof EvidencePackVerificationError ? error.message : "The evidence pack file could not be read",
    }));
    process.exitCode = 2;
  }
}
