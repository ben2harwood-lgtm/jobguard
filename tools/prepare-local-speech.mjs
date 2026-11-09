// Offline, reproducible extraction from the pinned npm archive and upstream model archive.
// Usage: node tools/prepare-local-speech.mjs <unpacked npm package> <model.tar.gz>
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const hash = b => createHash('sha256').update(b).digest('hex');
const [pkg, modelPath] = process.argv.slice(2);
const root = 'apps/web/public/local-speech/';
const source = readFileSync(`${pkg}/dist/vosk.js`, 'utf8');
if (hash(source) !== '29504515526e974f4cb053cf08811c4de5fb2a74007c0a5a957db50eaa8d5d0c') throw Error('Unexpected runtime version');
let worker = Buffer.from(source.match(/var WorkerFactory = createBase64WorkerFactory\('([^']+)'/)[1], 'base64').toString();
// Only model data would be persisted upstream; use MEMFS instead. PCM is never written.
for (const text of ['this.Vosk.FS.mount(this.Vosk.IDBFS, {}, storagePath);', 'return this.Vosk.syncFilesystem(true);', 'return this.Vosk.syncFilesystem(false);']) {
  if (!worker.includes(text)) throw Error('Pinned runtime layout changed');
  worker = worker.replace(text, '/* JobGuard: memory-only filesystem */');
}
writeFileSync(root + 'vosk-worker.js', worker);
const model = readFileSync(modelPath);
if (hash(model) !== 'f0b24bb92a48ca575b6a96500d6b543f0f079c573dfe85bbe16001fc0404e1d8') throw Error('Unexpected model version');
const parts = [];
for (let offset = 0; offset < model.length; offset += 24 * 1024 * 1024) {
  const bytes = model.subarray(offset, offset + 24 * 1024 * 1024), file = `model.part-${parts.length}`;
  writeFileSync(root + file, bytes); parts.push({file, bytes:bytes.length, sha256:hash(bytes)});
}
const manifest = {runtime:{name:'vosk-browser',version:'0.0.8',licence:'Apache-2.0',upstreamSha256:hash(readFileSync(`${pkg}/dist/vosk.js`)),file:'vosk-worker.js',bytes:Buffer.byteLength(worker),sha256:hash(worker)},model:{name:'vosk-model-small-en-us',version:'0.15',licence:'Apache-2.0',source:'https://raw.githubusercontent.com/ccoreilly/vosk-browser/a4b0d0fe60359e5ea9800f810f6b6f6c1d2b03c6/models/vosk-model-small-en-us-0.15.tar.gz',bytes:model.length,sha256:hash(model),parts}};
writeFileSync(root + 'manifest.json', JSON.stringify(manifest,null,2)+'\n');
