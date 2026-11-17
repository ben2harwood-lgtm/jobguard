#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { verifyEvidenceBundle } from '../dist/evidence-bundle.js';
const usage = 'Usage: node packages/db/tools/verify-evidence-bundle.mjs <bundle.zip> [--trusted-manifest-sha256 <sha256>] [--trusted-checkpoints <independent.json>]';
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--help') {
  console.log(`${usage}\nOffline synthetic export inspection. Exit 0: export integrity and independent references agree; 1: findings; 2: invalid input.\nExternal claims remain unverified. Trust material must come from an independent channel.`);
} else {
  try {
    if (!args[0] || args[0].startsWith('--') || args.length % 2 !== 1) throw new Error();
    const options = {}, used = new Set();
    for (let i = 1; i < args.length; i += 2) {
      const name = args[i], value = args[i + 1];
      if (used.has(name)) throw new Error(); used.add(name);
      if (name === '--trusted-manifest-sha256' && /^[a-f0-9]{64}$/u.test(value)) options.trustedManifestDigest = value;
      else if (name === '--trusted-checkpoints' && value && !value.startsWith('--')) options.trustedCheckpoints = JSON.parse(await readFile(value, 'utf8'));
      else throw new Error();
    }
    const report = verifyEvidenceBundle(await readFile(args[0]), options);
    console.log(JSON.stringify(report, null, 2)); process.exitCode = report.exportIntegrityComplete ? 0 : 1;
  } catch {
    console.error(JSON.stringify({ code: 'EVIDENCE_BUNDLE_INVALID', message: 'Unreadable or invalid bundle or independent trust material', usage })); process.exitCode = 2;
  }
}
