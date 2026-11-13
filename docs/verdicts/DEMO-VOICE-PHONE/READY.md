# DEMO-VOICE-PHONE — READY, PR #682 binary-WASM repair

9 November 2026. **Artifact repair READY; CI-HISTORY and physical-iPhone holds remain.**
This is builder evidence, not independent acceptance or a green-CI claim.
Branch: `codex/sandbox/demo-voice-phone` only. Original main base: `9df9c2626`.
This repair fast-forwards and builds on router head **`1eb4f8942`**, preserving
its Step-2 wait and longer walkthrough test timeouts.

Ben's explicit instruction authorizes the binary asset and branch push. No PR
creation, main push, deployment, scanner configuration/allowlist, provider,
account or spending change. No migrations or business persistence changes.

## Repair and reproducibility

The original **vosk-browser 0.0.8, Apache-2.0** runtime and **Vosk small English
0.15, Apache-2.0** model are unchanged versions. No new runtime package or model
is added. `tools/prepare-local-speech.mjs` extracts the original WASM bytes into
**vosk.wasm (3,122,379 bytes)** and replaces the embedded data URI with a named
asset reference. The runtime now receives the verified binary via Emscripten's
`wasmBinary` option. The extracted bytes were compared byte-for-byte with the
base64 payload at router head `1eb4f8942`; they are identical.

WASM SHA-256:
`0f13920e74cb122d3f879b9bbfc9ad36b5f3d979a5f0510b7e2622767300a4ef`

Source npm archive:
https://registry.npmjs.org/vosk-browser/-/vosk-browser-0.0.8.tgz

- Archive SHA-256: `fd16fc7e64c935d7a79cf07c8f67d84232b6485376a59144af8a234979a9a4b4`.
- Original dist/vosk.js SHA-256: `29504515526e974f4cb053cf08811c4de5fb2a74007c0a5a957db50eaa8d5d0c`.
- Reassembled model SHA-256: `f0b24bb92a48ca575b6a96500d6b543f0f079c573dfe85bbe16001fc0404e1d8`.
- Model source: the immutable GitHub URL in manifest.json at upstream commit
  `a4b0d0fe60359e5ea9800f810f6b6f6c1d2b03c6`.

The runtime's three persistent model filesystem calls remain replaced with
MEMFS. COPYING and the full upstream NOTICE remain shipped; NOTICE records both
MEMFS and binary-extraction modifications. Reproduce from the pinned inputs:

```sh
node tools/prepare-local-speech.mjs <unpacked-package> <model.tar.gz>
```

The preparation tool refuses different input hashes and validates WASM magic.
It writes the binary, patched runtime, unchanged model parts and manifest. No
base64 WASM payload remains in shipped JavaScript or other text files. The model
is small general English, not a UK-only acoustic model; phone/site-noise accuracy
still needs Ben's rehearsal.

## Privacy and loading invariants

Real-browser work starts only on the user's tap: AudioContext creation/resume,
microphone permission, then lazy worker/model load. The deterministic adapter hook
still works unchanged; real native SpeechRecognition is never used. Configuration
remains `{language:"en-GB",processLocally:true,remoteFallback:false}`.

The dedicated bootstrap has an independent hard-coded **name, byte length and
SHA-256** list for vosk-worker.js, vosk.wasm and both model parts. It validates
the fetched manifest against those pins and checks actual bytes before use,
including the complete reassembled model hash. Every static asset fetch is a
bodyless same-origin GET of a named path, with no query, credentials or redirects.
The binary is SHA-256 verified before instantiation. Static fetching closes
before runtime import/instantiation, so an engine fallback cannot fetch a second,
unverified binary. The only remaining fetch reads the already verified local
model Blob. Once the model is ready, fetch is disabled completely. XHR,
WebSocket and WebTransport remain disabled. No CDN or third-party runtime fetch.

Model and decoder setup finish before Listening or PCM capture begins. PCM is
transferred only in memory, with at most 64 × 4096 float samples (1 MiB) in flight.
No MediaRecorder, audio file, audio persistence, audio upload or beacon is used.
The worker's filesystem is memory-only and PCM is never written to it. Stop,
cancel, use, navigation and failures release microphone tracks/graph/worker.
The HTTP cache may hold model/runtime assets; it never receives microphone audio.

The first-download label/progress now reflects **42.4 MiB** (actual nominal bytes
below). Hash/load/worker failures retain the plain typed fallback. Words remain
editable before Use these words and Make my draft. Existing callers, guided
prepared-example switch, saved-source contracts and reviewed-text-only persistence
are preserved. The test hook, VOICE-1, WALK-3 and capture-journey helper are unchanged;
the new regression retains its exact same-origin/bodyless/no-speech-socket assertions.

## Repair verification

Environment: Node 24.19.0, pnpm 10.28.1 through Corepack, Chromium 154.0.8037.57.
The installed Chromium uses the existing workspace browser-path symlinks and
PLAYWRIGHT_BROWSERS_PATH; no browser/test/scanner configuration change.
Production Next and real embedded PostgreSQL synthetic harness; fictional data only.

| Command/check | Result |
|---|---|
| `pnpm --filter @jobguard/web build` | exit 0; production build and TypeScript pass |
| `pnpm --filter @jobguard/web typecheck` | exit 0 |
| `CI=1 pnpm --filter @jobguard/web exec playwright test DEMO-VOICE-PHONE.spec.ts VOICE-1.spec.ts WALK-3.spec.ts --project=mobile-360 --project=desktop --workers=2` | exit 0; **32 passed**, 5.5 minutes |
| `git grep -I -l -E 'AKIA[0-9A-Z]{16}'` | exit 1 = zero matches in tracked working-tree text; gitleaks CLI is not installed, so this is the user-authorized fallback check |
| `LANE_BASE_REF=9df9c2626 pnpm lint:lanes` | exit 0; task paths only |
| Asset audit | all sizes/hashes match manifest; binary equals prior embedded bytes; each asset ≤25 MiB |

The real-worker positive test confirms an actual vosk.wasm request, no injected
adapter, editable words, human-edited browser-local capture with audioByteLength 0,
no audio upload/storage, a separate prepared job, canonical saved-report navigation
and persisted report amounts after reload. Both viewports observe six static GETs
(worker, manifest, JS runtime, WASM, two model parts) and two verified local Blob
GETs: **every request has zero request-body bytes and the JobGuard origin**.
No speech socket is contacted. The no-audio-egress assertion is unchanged.

Existing unsupported-getUserMedia and model-load-failure cases pass. A new
negative test changes one byte of the WASM while retaining its exact size;
SHA-256 rejects it, typing survives, and no model download occurs. This is static
asset fault injection, not a recognizer adapter or mocked application success API.
The harness intentionally SIGTERMs its synthetic worker at teardown; test exit is 0.

The initial implementation's full Vitest run (208 files / 2,342 tests) and ENT-3
coverage are historical evidence in the prior receipt/commit, not rerun claims
for this binary-only transport repair. No model, prompt, extraction, DB or money
policy changes. The follow-up's requested checks are the table above.

### Current Chromium memory observations

Sum of renderer process RSS sampled every 100 ms from tap through model/decoder
loading and dictation, using CDP process IDs and /proc status. Includes the page
and WASM worker, excludes browser/GPU/Playwright processes. Viewports are Chromium,
not physical phones; this is a sampled peak, not an iOS measurement.

| Viewport | Peak renderer RSS | MiB |
|---|---:|---:|
| mobile-360 | 613,612 KiB | 599.23 |
| desktop | 647,880 KiB | 632.70 |

Synthetic Scottish-voice output observations (the fake microphone file loops
while model loading, so capture can begin mid-file):

- mobile-360: “please the wooden door this is a fictional practice job paying the kitchen goals and replace the wooden door”.
- desktop: “job paying the kitchen world and replace the wooden door this is a fictional practice job”.

Review/editing remains necessary; these samples do not certify UK/site-noise
accuracy. Measurements and request lists are attached as local-speech-evidence
in the local Playwright HTML report.

## Named holds

- **CI-HISTORY:** the shipped text has zero AWS-pattern matches, but the branch
  still contains `41d0ade32`, which introduced the old embedded payload. The
  configured gitleaks-action v2.3.7 gets all PR commits and scans
  `--no-merges --first-parent <first-PR-commit>^..<head>`, so an append-only repair
  cannot remove the reported historical findings. Scanner config and
  .gitleaksignore are unchanged. Clearing this requires a separate authorized
  history rewrite/squash preserving the router's timing fix and final source tree.
  BUILD_PLAN.md §2.1 says **“Never force-push”**; no such exception is inferred
  from this ordinary repair/push instruction. No green-CI claim is made.
- **IPHONE-BEN:** after landing, Ben must open Tommy's exact shared HTTPS link
  on a physical iPhone, allow the mic, speak fictional quote text, stop, review
  and edit, save/check the draft, follow the distinctly labelled prepared example
  to its saved report, and reopen/reload the canonical report. Record the actual
  URL, phone/iOS/Safari version, progress/download experience, transcript edits,
  interruptions and result. This environment supplies no physical-iPhone pass.
  Tested entry path is `/practice-company?name=Tommy`, then Walk your first practice job.
- **IOS-FLOOR:** expected iOS/Safari 16.4+ on a modern iPhone, e.g. iPhone 12+
  with at least 4 GB RAM. Requires secure-context getUserMedia, unprefixed
  AudioContext, workers, WebAssembly, transferable arrays, Blob URLs, fetch
  streams and SubtleCrypto. No GPU/SIMD/SharedArrayBuffer requirement. Device
  compatibility and site-noise/UK accuracy remain unverified. Workers isolate
  heavy JavaScript and catch engine failures; an OS killing the whole tab cannot
  be caught. Safari free-memory APIs are insufficient to certify a phone here.
- **INDEPENDENT-CHECK:** no independent acceptance, deployment, real-data,
  provider or release approval is claimed.

## Static asset inventory

Under apps/web/public/local-speech/. Runtime JS and WASM derive from vosk-browser
0.0.8 (Apache-2.0); the model is 0.15 (Apache-2.0). COPYING/NOTICE retain upstream
attributions and embedded-component licences. Bootstrap/manifest are project
code/metadata. Every asset is below 25 MiB.

| File | Bytes | SHA-256 |
|---|---:|---|
| COPYING | 10173 | `bb618af833c817ab01c1564bd3ec75ba4b4f9cf30910a4a2168e30a674ee8cc6` |
| NOTICE | 10787 | `5f2f94bb05715f652f9e0c36e3642b7a473735829fa44fb43a9bf3ee39b3bee5` |
| manifest.json | 1243 | `86530e7bf16672b670720d06d029827ebd128a04847a2dd19477bc588970eff6` |
| model.part-0 | 25165824 | `badc817d9ae2a963674d774ceb4ec476da783d9fb91e5759d187e85538bc4d36` |
| model.part-1 | 16019038 | `00ebe6ebb3189ee71567b02095d50216ac3946078e5c3c7015358dc74a056620` |
| vosk-worker.js | 167398 | `30d5725b11558ec365395f8f3e7cae14cb64a2cf5380e8a80251f03243fe1f35` |
| vosk.wasm | 3122379 | `0f13920e74cb122d3f879b9bbfc9ad36b5f3d979a5f0510b7e2622767300a4ef` |
| worker.js | 5138 | `7050ab0ac93c299565d80beb1c8e1f70cef22e30f1c3e724fdce47b48cd3cf5a` |

Nominal first speech download: **44,481,020 bytes (42.420 MiB)**, excluding HTTP headers/app shell and licence documents not fetched during recognition. HTTP compression can reduce transfer bytes; cache eviction can require re-download.

The 7.18-second test-only waveform (5.18 seconds of locally generated Flite 2.2 Scottish AWB speech plus two seconds silence) has SHA-256 `4f633d48390e441bf4acdcab7283b6a4ecec0f26d528cf958ab6271741c4afdd`. It says “This is a fictional practice job. Paint the kitchen walls and replace the wooden door.” No recorded person or runtime synthesis dependency.

The lane allowlist equals the 14 task paths other than its own lane JSON, which the validator grants implicitly and forbids listing in allow. All 15 changed PR paths are exact, without wildcard grants.
