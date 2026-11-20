/* JobGuard local speech bootstrap. No PCM persistence or network egress. */
'use strict';
const originalFetch = self.fetch.bind(self);
const send = self.postMessage.bind(self);
let modelURL, runtimeURL, verifiedWasm, booted = false, staticAssetsOpen = true;
const digest = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
// The only network operation permitted is a bodyless GET for named static assets.
self.fetch = async (input, options) => {
  const url = new URL(String(input), self.location.href);
  if (url.href === modelURL && !options?.body) return originalFetch(url);
  if (!staticAssetsOpen || url.origin !== self.location.origin || !/^\/local-speech\/(manifest\.json|vosk-worker\.js|vosk\.wasm|model\.part-[01])$/.test(url.pathname) || url.search || (options?.method && options.method !== 'GET') || options?.body) throw Error('Speech network request refused');
  return originalFetch(url, {method:'GET', credentials:'omit', redirect:'error'});
};
self.XMLHttpRequest = class { constructor() { throw Error('Speech XHR refused'); } };
self.WebSocket = class { constructor() { throw Error('Speech socket refused'); } };
self.WebTransport = self.WebSocket;
self.postMessage = (message, ...args) => {
  if (message?.event === 'load') {
    URL.revokeObjectURL(modelURL); URL.revokeObjectURL(runtimeURL);
    // Engine is now ready: no more fetches, including static or blob requests.
    self.fetch = async () => { throw Error('Speech network closed'); };
  }
  send(message ?? {event:"recognizer-ready"}, ...args);
};
self.addEventListener('unhandledrejection', () => send({event:'error', error:'worker-failed'}));
self.onmessage = async event => {
  if (event.data?.action !== 'boot' || booted) return;
  booted = true;
  try {
    const response = await self.fetch('/local-speech/manifest.json');
    if (!response.ok) throw Error('Manifest unavailable');
    const manifest = await response.json();
    // Independent name/size/hash pins; the fetched manifest cannot substitute an asset.
    const pinned = {
      'vosk-worker.js': {bytes:167398, sha256:'30d5725b11558ec365395f8f3e7cae14cb64a2cf5380e8a80251f03243fe1f35'},
      'vosk.wasm': {bytes:3122379, sha256:'0f13920e74cb122d3f879b9bbfc9ad36b5f3d979a5f0510b7e2622767300a4ef'},
      'model.part-0': {bytes:25165824, sha256:'badc817d9ae2a963674d774ceb4ec476da783d9fb91e5759d187e85538bc4d36'},
      'model.part-1': {bytes:16019038, sha256:'00ebe6ebb3189ee71567b02095d50216ac3946078e5c3c7015358dc74a056620'},
    };
    if (manifest.model.sha256 !== 'f0b24bb92a48ca575b6a96500d6b543f0f079c573dfe85bbe16001fc0404e1d8' || manifest.model.bytes !== 41184862 || manifest.model.parts?.length !== 2) throw Error('Manifest changed');
    const listed = [manifest.runtime, manifest.wasm, ...manifest.model.parts];
    for (const [index,file] of Object.keys(pinned).entries()) {
      const entry = listed[index], expected = pinned[file];
      if (entry?.file !== file || entry.bytes !== expected.bytes || entry.sha256 !== expected.sha256) throw Error('Invalid asset layout');
    }
    const total = Object.values(pinned).reduce((sum, entry) => sum + entry.bytes, 0);
    let loaded = 0;
    async function asset(file, expected) {
      const response = await self.fetch('/local-speech/' + file);
      if (!response.ok || !response.body) throw Error('Asset unavailable');
      const reader = response.body.getReader(), chunks = []; let length = 0;
      for (;;) {
        const {value,done} = await reader.read(); if (done) break;
        length += value.length; if (length > expected.bytes) throw Error('Asset too large');
        chunks.push(value); loaded += value.length; send({event:'progress', loaded, total});
      }
      const bytes = new Uint8Array(length); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      if (length !== expected.bytes || await digest(bytes) !== expected.sha256) throw Error('Asset integrity failure');
      return bytes;
    }
    const runtime = await asset('vosk-worker.js', pinned['vosk-worker.js']);
    verifiedWasm = await asset('vosk.wasm', pinned['vosk.wasm']);
    const parts = [];
    for (const part of manifest.model.parts) parts.push(await asset(part.file, part));
    const model = new Uint8Array(manifest.model.bytes); let offset = 0;
    for (const part of parts) { model.set(part,offset); offset += part.length; }
    if (offset !== model.length || await digest(model) !== manifest.model.sha256) throw Error('Model integrity failure');
    modelURL = URL.createObjectURL(new Blob([model]));
    runtimeURL = URL.createObjectURL(new Blob([runtime], {type:'application/javascript'}));
    staticAssetsOpen = false; // Instantiation can use only the verified binary, never a fallback fetch.
    importScripts(runtimeURL);
    self.dispatchEvent(new MessageEvent('message',{data:{action:'set',key:'logLevel',value:-1}}));
    self.dispatchEvent(new MessageEvent('message',{data:{action:'load',modelUrl:modelURL}}));
  } catch { send({event:'error',error:'model-load-failed'}); }
};
