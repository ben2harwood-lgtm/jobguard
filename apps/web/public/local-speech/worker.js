/* JobGuard local speech bootstrap. No PCM persistence or network egress. */
'use strict';
const originalFetch = self.fetch.bind(self);
const send = self.postMessage.bind(self);
let modelURL, runtimeURL, booted = false;
const digest = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
// The only network operation permitted is a bodyless GET for named static assets.
self.fetch = async (input, options) => {
  const url = new URL(String(input), self.location.href);
  if (url.href === modelURL && !options?.body) return originalFetch(url);
  if (url.origin !== self.location.origin || !/^\/local-speech\/(manifest\.json|vosk-worker\.js|model\.part-[01])$/.test(url.pathname) || url.search || (options?.method && options.method !== 'GET') || options?.body) throw Error('Speech network request refused');
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
    // Pinned independently of the downloaded manifest (not trust-on-first-use).
    if (manifest.runtime.sha256 !== 'afbc53cb3f6942f99f913dd18ae5c1c7b4792f433a45613935d03feddd0610bb' || manifest.model.sha256 !== 'f0b24bb92a48ca575b6a96500d6b543f0f079c573dfe85bbe16001fc0404e1d8') throw Error('Manifest changed');
    if (manifest.runtime.bytes !== 4330572 || manifest.model.bytes !== 41184862 || manifest.model.parts?.length !== 2 || manifest.model.parts.some((part,index) => part.file !== `model.part-${index}` || part.bytes !== [25165824,16019038][index])) throw Error('Invalid asset layout');
    const total = manifest.runtime.bytes + manifest.model.bytes;
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
    const runtime = await asset('vosk-worker.js', manifest.runtime);
    const parts = [];
    for (const part of manifest.model.parts) parts.push(await asset(part.file, part));
    const model = new Uint8Array(manifest.model.bytes); let offset = 0;
    for (const part of parts) { model.set(part,offset); offset += part.length; }
    if (offset !== model.length || await digest(model) !== manifest.model.sha256) throw Error('Model integrity failure');
    modelURL = URL.createObjectURL(new Blob([model]));
    runtimeURL = URL.createObjectURL(new Blob([runtime], {type:'application/javascript'}));
    importScripts(runtimeURL);
    self.dispatchEvent(new MessageEvent('message',{data:{action:'set',key:'logLevel',value:-1}}));
    self.dispatchEvent(new MessageEvent('message',{data:{action:'load',modelUrl:modelURL}}));
  } catch { send({event:'error',error:'model-load-failed'}); }
};
