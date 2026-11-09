# DEMO-VOICE-PHONE — builder receipt, 9 November 2026

Status: **READY for review and branch-only push; physical-iPhone pass held for Ben after landing.** This is builder evidence, not independent acceptance.
Base: origin/main `9df9c2626`. Branch: `codex/sandbox/demo-voice-phone` only.
Authority: Ben's explicit 9 November work order authorizes the local recognizer,
its binary model assets, package installation, and branch-only push; no PR,
main push, deployment, provider, account or spending change.

## Implementation and data flow

One vendored runtime package: **vosk-browser 0.0.8, Apache-2.0**. No package is
added to the application's dependency graph. The bundled WASM worker is extracted
from the pinned npm distribution, with three persistent-filesystem calls removed.
The worker uses MEMFS and is terminated after stop, cancel, error, use, or navigation.
Upstream notices (including embedded components) and Apache licence are shipped.
The npm archive SHA-256 is
`fd16fc7e64c935d7a79cf07c8f67d84232b6485376a59144af8a234979a9a4b4`;
its original dist/vosk.js SHA-256 is
`29504515526e974f4cb053cf08811c4de5fb2a74007c0a5a957db50eaa8d5d0c`.
Source: https://registry.npmjs.org/vosk-browser/-/vosk-browser-0.0.8.tgz.

One model: **vosk-model-small-en-us 0.15, Apache-2.0**, from Vosk Browser's
GitHub model mirror at commit `a4b0d0fe60359e5ea9800f810f6b6f6c1d2b03c6`.
Exact source URL is in `apps/web/public/local-speech/manifest.json`.
This is the small general English model, not a UK-only acoustic model. The
application contract remains `{language:"en-GB",processLocally:true,remoteFallback:false}`.
Scottish-accent synthetic speech exercises the real recognizer; general UK accent,
building vocabulary and site-noise accuracy still need the physical-phone rehearsal.
It is smaller and streaming, with no GPU, SIMD, SharedArrayBuffer or cross-origin
isolation requirement. No additional recognizer or remote fallback is included.

No real-browser capability probe, mic permission, worker, or model work happens
on mount. The existing deterministic `window.__JOBGUARD_SPEECH_ADAPTER__` test
hook is still queried on mount to preserve the unchanged contract suites. Real
capture starts only on the user's tap. AudioContext creation/resume is kept in
that gesture for Safari; microphone permission precedes any worker download.
The UI shows the first-download size and byte-based progress. Both model and
recognizer initialization finish before Listening is shown or PCM is transferred.
The in-flight PCM queue is bounded to 64 × 4096 float samples (1 MiB); no MediaRecorder, audio file, audio cache,
IndexedDB audio, fetch/XHR/socket/beacon audio upload, or native SpeechRecognition
is used. Model assets alone may be cached by the browser's ordinary HTTP cache.
Audio capture uses the broadly supported ScriptProcessorNode (deprecated, but
still available in the tested Chromium); recognition runs entirely in the Worker.
Repeated sessions re-extract the model in a fresh worker; cache eviction or
revalidation may cause a repeat download.

The worker permits only bodyless same-origin GETs for named static speech assets
(no redirects or credentials), disables XHR/WebSocket/WebTransport, checks each
part and the reassembled archive with SHA-256, and independently pins the runtime
and full model hash. Its sole blob fetch reads the already verified in-memory
model archive. Verified runtime bytes execute via a local blob, with no CDN.
All worker fetches are disabled once the model is ready. PCM is consumed directly
from memory by WASM, never written to its filesystem. On failure the microphone
tracks, audio graph and worker are released and typing stays available.

Words remain editable before Use these words and Make my draft. Only that reviewed
text and its original text transcript use the existing save contract. The guided
journey still saves the user's own draft before switching to its distinctly
labelled prepared example and saved report. Both existing callers reuse the same
component; no server contract, business persistence, migration or provider changes.

## Reproduce assets and fictional fixture

Unpack the pinned npm archive, download the model at the manifest's immutable
GitHub URL, then run:

```sh
node tools/prepare-local-speech.mjs <unpacked-package> <model.tar.gz>
```

The preparation tool refuses other runtime/model input hashes, extracts the bundled
worker, applies the three MEMFS substitutions, writes parts of at most 24 MiB and
the manifest. `worker.js` is the separately reviewed JobGuard bootstrap.

The test waveform is 7.18 seconds (5.18 seconds of speech plus two seconds of silence), generated locally with the environment's Flite
2.2 `cmu_us_awb` synthetic Scottish voice (no recorded person or service). It says:
“This is a fictional practice job. Paint the kitchen walls and replace the wooden
door.” It is test-only, never fetched by the product or shipped as a synthesis
runtime. SHA-256:
`4f633d48390e441bf4acdcab7283b6a4ecec0f26d528cf958ab6271741c4afdd`.

## Verification

All final checks passed locally against the production Next build and real embedded
PostgreSQL synthetic harness. Browser viewports are **Chromium**, not iPhones.

| Command | Result |
|---|---|
| `pnpm --filter @jobguard/web typecheck` | exit 0 |
| `pnpm --filter @jobguard/web exec vitest run --maxWorkers=2` | exit 0; 208 files, 2,342 tests; 352.13 seconds |
| `pnpm --filter @jobguard/web build` | exit 0; optimized production build and TypeScript pass |
| `CI=1 pnpm --filter @jobguard/web exec playwright test DEMO-VOICE-PHONE.spec.ts VOICE-1.spec.ts WALK-3.spec.ts ENT-3.spec.ts --project=mobile-360 --project=desktop --workers=2` | exit 0; **52 passed**, 6.2 minutes |
| `LANE_BASE_REF=9df9c2626 pnpm lint:lanes` | exit 0; exact task files only |
| Static asset audit | every public speech file ≤25 MiB; runtime, both parts and reassembled archive match SHA-256 |

VOICE-1, WALK-3, ENT-3 and helpers/capture-journey.ts are unchanged. The new
regression deliberately avoids the helper that injects an unavailable adapter;
it asserts the hook is absent and uses real getUserMedia with Chromium's
`--use-fake-ui-for-media-stream`, `--use-fake-device-for-media-stream` and the
fictional WAV via `--use-file-for-fake-audio-capture`. It saves reviewed words,
verifies the distinct prepared job, completes its report, opens the canonical
`/jobs/<prepared-id>/value` route and reloads the persisted report. Both fallback
cases pass: absent getUserMedia and an aborted model download preserving typed work.

During real dictation each viewport observed exactly five same-origin static GETs
(worker, manifest, runtime, two model parts) and two local Blob GETs (verified
runtime/model bytes). Every request had **zero request-body bytes**; no other host
or speech socket was contacted. No adapter was injected. Reviewed capture records
assert `audioByteLength:0`, `audioUploaded:false`, `audioStored:false`, and
`humanEdited:true`.

### Chromium memory and accuracy observations

Chromium **154.0.8037.57**, Linux, Node 24.19.0. Measured from tap through model
loading, decoder creation and dictation: sum of renderer process RSS from
CDP SystemInfo process IDs and `/proc/<pid>/status`, sampled every 100 ms. This
includes the page and WASM worker, rather than only JS heap; it excludes browser,
GPU and Playwright processes. It is a sampled peak, not an iOS measurement.

| Viewport | Peak renderer RSS | MiB |
|---|---:|---:|
| mobile-360 | 646,788 KiB | 631.63 |
| desktop | 637,392 KiB | 622.45 |

Observed synthetic Scottish-voice results (punctuation/case omitted by Vosk):

- mobile-360: “this is a fictional practice job **paying** the kitchen **goals** and replace the wooden door”. Two substitutions against “paint” / “walls”; review is necessary.
- desktop: “this is a fictional practice job paint the kitchen walls and replace the wooden door”.

These are one fictional phrase, not a claim of general UK/site-noise accuracy.
The regression edits the words before saving and inspects the real persisted
source. Both measurements/transcripts are attached as `local-speech-evidence`
in the local Playwright HTML report.

The environment's default pnpm is 11; checks use repository-pinned **10.28.1**
through Corepack. `@jobguard/db...` and `@jobguard/api...` dependency builds passed.
The installed Chromium is selected using workspace-local browser-path symlinks
and `PLAYWRIGHT_BROWSERS_PATH`; Playwright's browser download was denied by the
network policy. No test/browser configuration is changed in the commit.

Earlier diagnostic runs: Vitest before dependency builds failed on missing dist
exports, then passed after building them. A dev-server run was interrupted
(exit 130) because blocked HMR/cold compilation kept the app reloading. Production
diagnostics exposed an empty recognizer-creation acknowledgement and capture
starting before cold decoder setup; both were repaired. Another assertion targeted
the walkthrough's transient open-report panel after reload; the final assertion
uses the existing canonical report route and verifies the same saved amounts.
Final checks above passed without changing existing regressions or product report
behaviour. The harness intentionally SIGTERMs its synthetic worker at teardown;
the final Playwright command exited 0. No migrations, provider, prompt, extraction
policy or business persistence changes; repository-wide DB/migration/evaluation
suites were not additionally run for this client-only speech change.

## Named holds

- **IPHONE-BEN:** after landing, Ben must open Tommy's exact shared HTTPS link
  on a physical iPhone, allow the microphone, speak a fictional quote, stop,
  edit/review it, make and check the saved draft, follow the prepared example
  through to the saved report, and reload that report. Record the full URL,
  iPhone model, iOS/Safari version, download/progress behaviour, transcript edits,
  interruptions and result. This environment cannot supply that physical-device
  observation. The repository path tested is `/practice-company?name=Tommy`
  followed by Walk your first practice job; the actual shared deployment URL
  must be used for Ben's pass. No deployment or landing is performed here.
- **IOS-FLOOR:** expected baseline **iOS/Safari 16.4+ on a modern iPhone
  (e.g. iPhone 12 or later with at least 4 GB RAM)**. This is an expectation,
  not a device certification: secure-context getUserMedia, unprefixed AudioContext,
  dedicated workers, WebAssembly, transferable typed arrays, Blob URLs, fetch
  streams and SubtleCrypto are required. Runtime capability checks and model/load
  errors preserve typing on older or constrained devices. Safari has no reliable
  free-memory API. An OS killing the entire tab cannot be caught by JavaScript;
  a Worker prevents main-thread model work but is not a separate OS-process
  guarantee. Actual iOS peak memory and site-noise/UK accent accuracy remain held.
- **INDEPENDENT-CHECK:** no independent checker verdict or technical acceptance
  is claimed by this builder receipt. G1/real data/provider/release gates remain.

## Static asset inventory

Every file below is under `apps/web/public/local-speech/`. Runtime/model licensing
is Apache-2.0; JobGuard bootstrap/manifest are project code/metadata; COPYING and
NOTICE preserve upstream licences and attributions. Each is below 25 MiB.

| File | Bytes | SHA-256 |
|---|---:|---|
| COPYING | 10173 | `bb618af833c817ab01c1564bd3ec75ba4b4f9cf30910a4a2168e30a674ee8cc6` |
| NOTICE | 10390 | `a46218146c597670f8bcab47312ba1d7f9811a505938c80f636def5326167312` |
| manifest.json | 1039 | `d0363de1f20365c0cca3f9a7a966100f2257cf81b17ce29e50724489d81488a1` |
| model.part-0 | 25165824 | `badc817d9ae2a963674d774ceb4ec476da783d9fb91e5759d187e85538bc4d36` |
| model.part-1 | 16019038 | `00ebe6ebb3189ee71567b02095d50216ac3946078e5c3c7015358dc74a056620` |
| vosk-worker.js | 4330572 | `afbc53cb3f6942f99f913dd18ae5c1c7b4792f433a45613935d03feddd0610bb` |
| worker.js | 4333 | `4592dd5795ba169ad16e38749e91b013c6cd33dc7d5380f91f8bf2d1a5261788` |

Total first speech download: **45,520,806 bytes (43.412 MiB)**, excluding HTTP headers and the normal application shell. Licence/notice documents are shipped but not downloaded during recognition.

The lane allowlist equals the 13 changed task paths other than its own lane JSON; the lane validator grants that JSON implicitly and forbids listing it in `allow`. No wildcard grants.
