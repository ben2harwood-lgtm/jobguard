# DEPS-VITE-737-R3 builder receipt

HOLD — DO NOT COMMIT. Initial clean-checkout gate failed.

Recorded 2026-10-23T16:21:35.993244+00:00.

Issued scope: execute approved two-phase Vite-only plan, stopping on any failed gate. No commit, push, PR, independent review or acceptance performed. MON7b remains parked; no demo work performed.

## Preflight result

- Checkout: `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/deps-vite-737-r3`
- Branch: `codex/sandbox/deps-vite-737-r3`
- HEAD: `dc5721230fd8aedbf2d9d0457789074b66b48765`
- origin/main (local remote-tracking ref, no fetch): `dc5721230fd8aedbf2d9d0457789074b66b48765`; matches required target.
- Clean checkout: FAIL, as observed by the first command before any write by this session. All eight manifests and lock were already modified.
- Parsed manifests show seven existing Vitest direct pins changed from 4.1.11 to 4.1.12, contrary to the approved retention requirement; root already contains the final Vite override.
- Existing lane had a wider allowlist and the old receipt destination. Its original bytes are preserved below; only this task's lane and new receipt are written by this session. Existing manifest/lock changes and old verdict directory are preserved untouched.
- R2 checkout was not accessed.

## Execution boundaries

Step 1 stopped at initial cleanliness failure. Steps 2–6 NOT RUN. Resolver commands: 0 of maximum 2. No dependency edits, temporary seed, cleanup, install, audit, typecheck, lint, lane lint, unit test, build or OpenAPI check executed. Heavy-slot acquisition, codex-pick-home verification, resource gates, effective pnpm configuration and pnpm version execution were not reached. Node observation: `v24.17.0` (exit 0). Runtime file hash is an observation only, not proof of an executed pinned pnpm. Actual model/runtime dispatch is not independently verified here.

No intermediate/final candidate hashes or complete semantic lock comparison exist because no candidate was generated. Below are original HEAD and initially observed hashes, parsed manifest differences, and lock reference counts; counts are not a graph acceptance verdict. Saved Vite provenance/tarball verification was not reached. No claim of installed patched-graph proof or independent verification is made. Full final-head GitHub CI (including PostgreSQL/browser), two independent Claude PASSes and separate acceptance remain pending; no technical acceptance is granted.

## Command log

1. `pwd && git status --short && git rev-parse HEAD origin/main && cat AGENTS.md && cat ~/.local/share/full-steam/jg-orders/DEPS-VITE-737-v5-r1.txt` — exit 0. This revealed the initial gate failure.
2. `git status --porcelain=v1 && git diff --stat && git diff -- package.json apps/api/package.json && cat config/lanes/deps-vite-737-r3.json && rg -n 'dependency|pinned|M0|2\.2' BUILD_PLAN.md | head -45 && cat config/lanes/deps-vite-737.json 2>/dev/null` — exit 1 because the old lane file was absent in this checkout; preceding read-only observations succeeded.
3. Python stdlib evidence capture: read-only `git show HEAD:<path>`, `git status --porcelain=v1`, `git diff --no-ext-diff -- <eight manifests and lock>`, `git branch --show-current`, `git rev-parse HEAD`, `git rev-parse origin/main`, `node --version`; SHA256 and JSON comparisons; writes own lane, this receipt and the requested scratch commit-message file. Exit recorded in tool result.

## Initial status

```text
 M apps/api/package.json
 M apps/web/package.json
 M package.json
 M packages/ai/package.json
 M packages/config/package.json
 M packages/core/package.json
 M packages/db/package.json
 M packages/storage/package.json
 M pnpm-lock.yaml
?? config/lanes/deps-vite-737-r3.json
?? docs/verdicts/DEPS-VITE-737/
```

## SHA256 evidence

```json
[
  {
    "path": "package.json",
    "HEAD_sha256": "fa4702713c4e2401017a7b4edde569ccaaccb086f5c65bb38c88daa171745da0",
    "observed_sha256": "adff559f0d3ce18b0c517451421b6ff1c02bfa9098973b0a18be104a5e3b273e",
    "equal": false
  },
  {
    "path": "apps/api/package.json",
    "HEAD_sha256": "c04ac6057c19e2847a2866e444aa25adec04a5d0334f9e4eb4c27281f104697f",
    "observed_sha256": "907300e24928e1d881e2169057918b291d3691ab038c8306516fb472dc2d2264",
    "equal": false
  },
  {
    "path": "apps/web/package.json",
    "HEAD_sha256": "67e65ca9460e61c8056cde02afde9a662a7186c85181094d3a91eb6493f0a0e1",
    "observed_sha256": "f19c2539364fbf542cc1c14360c42b56110ea0f76b6674761094daa18d686a65",
    "equal": false
  },
  {
    "path": "packages/ai/package.json",
    "HEAD_sha256": "4d7610dbaa5dd1a44563bfeb3e44e79c640b6bbc7bd2cca951d0497d05862b5d",
    "observed_sha256": "55c5e62aaba377a3ebd07543b1fd8b914b9f3eb39c5d9f250a35bfcbdd43b648",
    "equal": false
  },
  {
    "path": "packages/config/package.json",
    "HEAD_sha256": "34896f1801ba22adf2687168a0e4f0bebb1fa9b801a509881ee1bd0ab1cc9a9e",
    "observed_sha256": "dfad3a10af4a74ca6932f6731c339992d5700117ca0112e8abeb66eb59f53214",
    "equal": false
  },
  {
    "path": "packages/core/package.json",
    "HEAD_sha256": "e7e165541045e64337d89802e6993af879ed4e92631d5064e67566d2a916590a",
    "observed_sha256": "67974cf57660a9b46c4b950a17925778822ba9066af51298ada6b162f030642e",
    "equal": false
  },
  {
    "path": "packages/db/package.json",
    "HEAD_sha256": "0b7ef73a71699a68e65754fccf859a9d7ede1b7718f54ffb54d0e24c33207f0e",
    "observed_sha256": "b9e9b280dd98f1a183ef37faf7d31aa01ee60ae4cb79872de99113ae09ba9179",
    "equal": false
  },
  {
    "path": "packages/storage/package.json",
    "HEAD_sha256": "b340d44dd49e418cb1aabd7507ad435622e34c4af75a6eda98cba77c6a5f0c8b",
    "observed_sha256": "edc0f2d83a9b504ff2ea2602066e609b44460963904d9a42a12397f44570c5b4",
    "equal": false
  },
  {
    "path": "pnpm-lock.yaml",
    "HEAD_sha256": "e459271ae68845cfa6c59e6816e3a25d599b5777273d8e06625e692330b316b0",
    "observed_sha256": "ea75691f79cd7047065e63cb9e0761b08ff6641199f47b43ebac451393de392e",
    "equal": false
  },
  {
    "path": "pnpm-workspace.yaml",
    "HEAD_sha256": "07c46e38b70df86a20bb4f15d3b075a359e9b8d8ac75c0e4e786e11fffa68a25",
    "observed_sha256": "07c46e38b70df86a20bb4f15d3b075a359e9b8d8ac75c0e4e786e11fffa68a25",
    "equal": true
  }
]
```

Source order SHA256: `679e149b973dbab4e14a536323887526d5bbdb2100dc6ce3b1b5101520bf34af`.

Pinned runtime observation:
```json
{
  "path": "/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/dist/pnpm.cjs",
  "sha256": "0f3afc1f8b98493ca2d97c8b1c0105d05e9414b55d6dc48dac4c2605c9bd76e9"
}
```

## Parsed manifest differences

```json
[
  {
    "path": "package.json",
    "section": "pnpm",
    "base": {
      "overrides": {
        "multer@>=2.0.0 <2.4.0": "2.4.0",
        "postcss@<8.5.23": "8.5.28",
        "sharp@>=0.34.0 <0.35.5": "0.35.5",
        "js-yaml@>=4.0.0 <4.3.2": "4.3.2",
        "lodash@>=4.0.0 <4.18.0": "4.18.1",
        "glob@>=11.0.0 <11.1.0": "11.1.0",
        "ajv@>=8.0.0 <8.18.0": "8.18.0",
        "file-type@>=21.0.0 <21.3.2": "21.3.2",
        "picomatch@>=4.0.0 <4.0.4": "4.0.4",
        "picomatch@>=3.0.0 <3.0.2": "3.0.2",
        "picomatch@>=2.0.0 <2.3.2": "2.3.2",
        "path-to-regexp@>=8.0.0 <8.4.0": "8.4.0",
        "fast-xml-parser@>=5.0.0 <5.7.0": "5.7.0",
        "webpack@>=5.49.0 <5.104.1": "5.104.1",
        "brace-expansion@>=1.0.0 <1.1.21": "1.1.21",
        "brace-expansion@>=4.0.0 <5.0.12": "5.0.12",
        "fast-uri@>=3.0.0 <3.1.8": "3.1.8",
        "js-yaml@>=5.0.0 <5.4.1": "5.4.1",
        "proxy-addr@>=2.0.0 <2.0.8": "2.0.8",
        "source-map-js@>=1.0.0 <1.2.2": "1.2.2"
      }
    },
    "observed": {
      "overrides": {
        "multer@>=2.0.0 <2.4.0": "2.4.0",
        "postcss@<8.5.23": "8.5.28",
        "sharp@>=0.34.0 <0.35.5": "0.35.5",
        "js-yaml@>=4.0.0 <4.3.2": "4.3.2",
        "lodash@>=4.0.0 <4.18.0": "4.18.1",
        "glob@>=11.0.0 <11.1.0": "11.1.0",
        "ajv@>=8.0.0 <8.18.0": "8.18.0",
        "file-type@>=21.0.0 <21.3.2": "21.3.2",
        "picomatch@>=4.0.0 <4.0.4": "4.0.4",
        "picomatch@>=3.0.0 <3.0.2": "3.0.2",
        "picomatch@>=2.0.0 <2.3.2": "2.3.2",
        "path-to-regexp@>=8.0.0 <8.4.0": "8.4.0",
        "fast-xml-parser@>=5.0.0 <5.7.0": "5.7.0",
        "webpack@>=5.49.0 <5.104.1": "5.104.1",
        "brace-expansion@>=1.0.0 <1.1.21": "1.1.21",
        "brace-expansion@>=4.0.0 <5.0.12": "5.0.12",
        "fast-uri@>=3.0.0 <3.1.8": "3.1.8",
        "js-yaml@>=5.0.0 <5.4.1": "5.4.1",
        "proxy-addr@>=2.0.0 <2.0.8": "2.0.8",
        "source-map-js@>=1.0.0 <1.2.2": "1.2.2",
        "vite@>=7.0.0 <=7.3.6": "7.3.7"
      }
    }
  },
  {
    "path": "apps/api/package.json",
    "section": "devDependencies",
    "base": {
      "@nestjs/cli": "11.0.24",
      "@nestjs/testing": "11.2.3",
      "@types/node": "24.0.3",
      "@types/pg": "8.15.5",
      "@types/supertest": "6.0.3",
      "supertest": "7.1.1",
      "tsx": "4.20.3",
      "typescript": "5.8.3",
      "vitest": "4.1.11"
    },
    "observed": {
      "@nestjs/cli": "11.0.24",
      "@nestjs/testing": "11.2.3",
      "@types/node": "24.0.3",
      "@types/pg": "8.15.5",
      "@types/supertest": "6.0.3",
      "supertest": "7.1.1",
      "tsx": "4.20.3",
      "typescript": "5.8.3",
      "vitest": "4.1.12"
    }
  },
  {
    "path": "apps/web/package.json",
    "section": "devDependencies",
    "base": {
      "@playwright/test": "1.55.1",
      "@types/node": "24.0.3",
      "@types/pg": "8.15.5",
      "@types/react": "19.1.8",
      "@types/react-dom": "19.1.6",
      "embedded-postgres": "16.10.0-beta.15",
      "typescript": "5.8.3",
      "vitest": "4.1.11"
    },
    "observed": {
      "@playwright/test": "1.55.1",
      "@types/node": "24.0.3",
      "@types/pg": "8.15.5",
      "@types/react": "19.1.8",
      "@types/react-dom": "19.1.6",
      "embedded-postgres": "16.10.0-beta.15",
      "typescript": "5.8.3",
      "vitest": "4.1.12"
    }
  },
  {
    "path": "packages/ai/package.json",
    "section": "devDependencies",
    "base": {
      "typescript": "5.8.3",
      "vitest": "4.1.11",
      "@types/node": "24.0.3"
    },
    "observed": {
      "typescript": "5.8.3",
      "vitest": "4.1.12",
      "@types/node": "24.0.3"
    }
  },
  {
    "path": "packages/config/package.json",
    "section": "devDependencies",
    "base": {
      "typescript": "5.8.3",
      "vitest": "4.1.11"
    },
    "observed": {
      "typescript": "5.8.3",
      "vitest": "4.1.12"
    }
  },
  {
    "path": "packages/core/package.json",
    "section": "devDependencies",
    "base": {
      "typescript": "5.8.3",
      "vitest": "4.1.11"
    },
    "observed": {
      "typescript": "5.8.3",
      "vitest": "4.1.12"
    }
  },
  {
    "path": "packages/db/package.json",
    "section": "devDependencies",
    "base": {
      "@types/pg": "8.15.5",
      "embedded-postgres": "16.10.0-beta.15",
      "typescript": "5.8.3",
      "vitest": "4.1.11"
    },
    "observed": {
      "@types/pg": "8.15.5",
      "embedded-postgres": "16.10.0-beta.15",
      "typescript": "5.8.3",
      "vitest": "4.1.12"
    }
  },
  {
    "path": "packages/storage/package.json",
    "section": "devDependencies",
    "base": {
      "@types/node": "24.0.3",
      "typescript": "5.8.3",
      "vitest": "4.1.11"
    },
    "observed": {
      "@types/node": "24.0.3",
      "typescript": "5.8.3",
      "vitest": "4.1.12"
    }
  }
]
```

## Lock reference counts (diagnostic only)

```json
{
  "HEAD": {
    "vite@7.3.6": 12,
    "vite@7.3.7": 0,
    "vitest@4.1.11": 2,
    "vitest@4.1.12": 0,
    "rollup@4.63.2": 2
  },
  "observed": {
    "vite@7.3.6": 0,
    "vite@7.3.7": 12,
    "vitest@4.1.11": 0,
    "vitest@4.1.12": 2,
    "rollup@4.63.2": 2
  }
}
```

## Original pre-existing lane (preserved before correction)

SHA256: `c031a5c90b25fae43ed629b7918d57aa36c13a84daebc6e5ffbe4cdd6bd59319`

```json
{
  "version": 2,
  "lanes": {
    "deps-vite-737-r3": {
      "branches": [
        "codex/sandbox/deps-vite-737-r3"
      ],
      "allow": [
        "package.json",
        "pnpm-lock.yaml",
        "docs/verdicts/DEPS-VITE-737/BUILDER_RECEIPT.md",
        "apps/api/package.json",
        "apps/web/package.json",
        "packages/ai/package.json",
        "packages/config/package.json",
        "packages/core/package.json",
        "packages/db/package.json",
        "packages/storage/package.json"
      ],
      "receipt": "docs/verdicts/DEPS-VITE-737/BUILDER_RECEIPT.md",
      "note": "Exact Vite security patch; no web workflow (C1). Temporary root Vite seed must be removed by phase two. Exclusive package/lock ownership; no demo changes."
    }
  }
}
```

## Initial tracked diff (pre-existing; not authored by this session)

```diff
diff --git a/apps/api/package.json b/apps/api/package.json
index 0e306634..0a035dfb 100644
--- a/apps/api/package.json
+++ b/apps/api/package.json
@@ -101,6 +101,6 @@
     "supertest": "7.1.1",
     "tsx": "4.20.3",
     "typescript": "5.8.3",
-    "vitest": "4.1.11"
+    "vitest": "4.1.12"
   }
 }
diff --git a/apps/web/package.json b/apps/web/package.json
index fd5d3565..22dfed59 100644
--- a/apps/web/package.json
+++ b/apps/web/package.json
@@ -29,6 +29,6 @@
     "@types/react-dom": "19.1.6",
     "embedded-postgres": "16.10.0-beta.15",
     "typescript": "5.8.3",
-    "vitest": "4.1.11"
+    "vitest": "4.1.12"
   }
 }
diff --git a/package.json b/package.json
index 1931fcc9..e673e9b9 100644
--- a/package.json
+++ b/package.json
@@ -51,7 +51,8 @@
       "fast-uri@>=3.0.0 <3.1.8": "3.1.8",
       "js-yaml@>=5.0.0 <5.4.1": "5.4.1",
       "proxy-addr@>=2.0.0 <2.0.8": "2.0.8",
-      "source-map-js@>=1.0.0 <1.2.2": "1.2.2"
+      "source-map-js@>=1.0.0 <1.2.2": "1.2.2",
+      "vite@>=7.0.0 <=7.3.6": "7.3.7"
     }
   }
 }
diff --git a/packages/ai/package.json b/packages/ai/package.json
index 4e0b06c3..8777b619 100644
--- a/packages/ai/package.json
+++ b/packages/ai/package.json
@@ -22,7 +22,7 @@
   },
   "devDependencies": {
     "typescript": "5.8.3",
-    "vitest": "4.1.11",
+    "vitest": "4.1.12",
     "@types/node": "24.0.3"
   }
 }
diff --git a/packages/config/package.json b/packages/config/package.json
index 4413ea68..17e20f3a 100644
--- a/packages/config/package.json
+++ b/packages/config/package.json
@@ -18,7 +18,7 @@
   },
   "devDependencies": {
     "typescript": "5.8.3",
-    "vitest": "4.1.11"
+    "vitest": "4.1.12"
   },
   "dependencies": {
     "zod": "3.25.67"
diff --git a/packages/core/package.json b/packages/core/package.json
index f429c8c5..2f5c088e 100644
--- a/packages/core/package.json
+++ b/packages/core/package.json
@@ -18,7 +18,7 @@
   },
   "devDependencies": {
     "typescript": "5.8.3",
-    "vitest": "4.1.11"
+    "vitest": "4.1.12"
   },
   "dependencies": {
     "zod": "3.25.67"
diff --git a/packages/db/package.json b/packages/db/package.json
index 6dc8b0d9..bdbdf7cb 100644
--- a/packages/db/package.json
+++ b/packages/db/package.json
@@ -22,7 +22,7 @@
     "@types/pg": "8.15.5",
     "embedded-postgres": "16.10.0-beta.15",
     "typescript": "5.8.3",
-    "vitest": "4.1.11"
+    "vitest": "4.1.12"
   },
   "dependencies": {
     "drizzle-orm": "0.45.2",
diff --git a/packages/storage/package.json b/packages/storage/package.json
index 03bd8854..44e1de82 100644
--- a/packages/storage/package.json
+++ b/packages/storage/package.json
@@ -24,6 +24,6 @@
   "devDependencies": {
     "@types/node": "24.0.3",
     "typescript": "5.8.3",
-    "vitest": "4.1.11"
+    "vitest": "4.1.12"
   }
 }
diff --git a/pnpm-lock.yaml b/pnpm-lock.yaml
index 55a09f0e..1d2256f0 100644
--- a/pnpm-lock.yaml
+++ b/pnpm-lock.yaml
@@ -25,6 +25,7 @@ overrides:
   js-yaml@>=5.0.0 <5.4.1: 5.4.1
   proxy-addr@>=2.0.0 <2.0.8: 2.0.8
   source-map-js@>=1.0.0 <1.2.2: 1.2.2
+  vite@>=7.0.0 <=7.3.6: 7.3.7
 
 importers:
 
@@ -113,8 +114,8 @@ importers:
         specifier: 5.8.3
         version: 5.8.3
       vitest:
-        specifier: 4.1.11
-        version: 4.1.11(@types/node@24.0.3)(vite@7.3.6(@types/node@24.0.3)(terser@5.51.2)(tsx@4.20.3))
+        specifier: 4.1.12
+        version: 4.1.12(@types/node@24.0.3)(vite@7.3.7(@types/node@24.0.3)(terser@5.51.2)(tsx@4.20.3))
 
   apps/web:
     dependencies:
@@ -168,8 +169,8 @@ importers:
         specifier: 5.8.3
         version: 5.8.3
       vitest:
-        specifier: 4.1.11
-        version: 4.1.11(@types/node@24.0.3)(vite@7.3.6(@types/node@24.0.3)(terser@5.51.2)(tsx@4.20.3))
+        specifier: 4.1.12
+        version: 4.1.12(@types/node@24.0.3)(vite@7.3.7(@types/node@24.0.3)(terser@5.51.2)(tsx@4.20.3))
 
   packages/ai:
     dependencies:
@@ -187,8 +188,8 @@ importers:
         specifier: 5.8.3
         version: 5.8.3
       vitest:
-        specifier: 4.1.11
-        version: 4.1.11(@types/node@24.0.3)(vite@7.3.6(@types/node@24.0.3)(terser@5.51.2)(tsx@4.20.3))
+        specifier: 4.1.12
+        version: 4.1.12(@types/node@24.0.3)(vite@7.3.7(@types/node@24.0.3)(terser@5.51.2)(tsx@4.20.3))
 
   packages/config:
     dependencies:
@@ -200,8 +201,8 @@ importers:
         specifier: 5.8.3
         version: 5.8.3
       vitest:
-        specifier: 4.1.11
-        version: 4.1.11(@types/node@24.0.3)(vite@7.3.6(@types/node@24.0.3)(terser@5.51.2)(tsx@4.20.3))
+        specifier: 4.1.12
+        version: 4.1.12(@types/node@24.0.3)(vite@7.3.7(@types/node@24.0.3)(terser@5.51.2)(tsx@4.20.3))
 
   packages/core:
     dependencies:
@@ -213,8 +214,8 @@ importers:
         specifier: 5.8.3
         version: 5.8.3
       vitest:
-        specifier: 4.1.11
-        version: 4.1.11(@types/node@24.0.3)(vite@7.3.6(@types/node@24.0.3)(terser@5.51.2)(tsx@4.20.3))
+        specifier: 4.1.12
+        version: 4.1.12(@types/node@24.0.3)(vite@7.3.7(@types/node@24.0.3)(terser@5.51.2)(tsx@4.20.3))
 
   packages/db:
     dependencies:
@@ -244,8 +245,8 @@ importers:
         specifier: 5.8.3
         version: 5.8.3
       vitest:
-        specifier: 4.1.11
-        version: 4.1.11(@types/node@24.0.3)(vite@7.3.6(@types/node@24.0.3)(terser@5.51.2)(tsx@4.20.3))
+        specifier: 4.1.12
+        version: 4.1.12(@types/node@24.0.3)(vite@7.3.7(@types/node@24.0.3)(terser@5.51.2)(tsx@4.20.3))
 
   packages/storage:
     dependencies:
@@ -266,8 +267,8 @@ importers:
         specifier: 5.8.3
         version: 5.8.3
       vitest:
-        specifier: 4.1.11
-        version: 4.1.11(@types/node@24.0.3)(vite@7.3.6(@types/node@24.0.3)(terser@5.51.2)(tsx@4.20.3))
+        specifier: 4.1.12
+        version: 4.1.12(@types/node@24.0.3)(vite@7.3.7(@types/node@24.0.3)(terser@5.51.2)(tsx@4.20.3))
 
 packages:
 
@@ -1509,34 +1510,34 @@ packages:
   '@types/xml2js@0.4.14':
     resolution: {integrity: sha512-4YnrRemBShWRO2QjvUin8ESA41rH+9nQGLUGZV/1IDhi3SL9OhdpNC/MrulTWuptXKwhx/aDxE7toV0f/ypIXQ==}
 
-  '@vitest/expect@4.1.11':
-    resolution: {integrity: sha512-VX2x5vNJXET47KAFzwERI+KRMtTTCSWTfSMKsW7JsUsXV4psq++e3DvZpuTDOpHcxytiDs6p2nhVb2tVDiiUYw==}
+  '@vitest/expect@4.1.12':
+    resolution: {integrity: sha512-vFlTt+YEu9WBpNjdGayNmlMVzrWPi1+sv853/7t2FU7hpO5gAFBKHzQmkCq5Xjpr+evegF2994LQT3hF3mRlqQ==}
 
-  '@vitest/mocker@4.1.11':
-    resolution: {integrity: sha512-2XJVD55d1o5AZous5CCGKS74g/riOj9odEt2bQpCVZeblHyHdnMeFl4jl0XjU21stf4mbjUkew2eXQZt65g5CQ==}
+  '@vitest/mocker@4.1.12':
+    resolution: {integrity: sha512-fKShNpKZzupWZuY0z7egydvL0sqW4INEZBEExMBMAa6izlENEVHwoXgdaTCaBZ5fwlr4xf2o1wXC83n9RpO+NA==}
     peerDependencies:
       msw: ^2.4.9
-      vite: ^6.0.0 || ^7.0.0 || ^8.0.0
+      vite: 7.3.7
     peerDependenciesMeta:
       msw:
         optional: true
       vite:
         optional: true
 
-  '@vitest/pretty-format@4.1.11':
-    resolution: {integrity: sha512-yiZzPbGTS9Sr/JpFl8zHrcIkAofNbFV6k21vIgQN/cY/oxZeXhJv5sc/MBJ5jFKWmWs+oJHw0UXLZjmf931+Vw==}
+  '@vitest/pretty-format@4.1.12':
+    resolution: {integrity: sha512-XW9O8+Mxx4VpCtkYdMJLZQQwsVryP9wk7cPKDxtXFfwSak6yRh5+2fep/Y0XF/ElBvJHq8bcYdi6aeuai0opZA==}
 
-  '@vitest/runner@4.1.11':
-    resolution: {integrity: sha512-LztvUgdwMNJMIkj3hQnnxiC2Xy1zNxq928W/xhjCLaNCzqTZOudjwbQf6v9IntZGPw132i2Lq2rgTRZHD3JHNw==}
+  '@vitest/runner@4.1.12':
+    resolution: {integrity: sha512-NKlVKCr5QnCe8jijdMnmkpHHU+WTqiLFR6G0pHji9uRjXK9xJl1k1nTw6F3pOOj2PDcsDt2GKQMI7wIsaT491w==}
 
-  '@vitest/snapshot@4.1.11':
-    resolution: {integrity: sha512-pN7ikn1ON7h8ee4gIAp4AzyK+zBtJPzVbqOgu5LCEh4VaJVbPQcgYQYJIMGQPXVeJJq1fnfazis7a5pFNPahog==}
+  '@vitest/snapshot@4.1.12':
+    resolution: {integrity: sha512-ko1y1Qgb/slzQ9mr+b89Cuqud8WG1TKtsPD8r7ZUBdvVOGt85Af2HwCqHujrhwJq95hs/9RM7fcAPg57o1vlzw==}
 
-  '@vitest/spy@4.1.11':
-    resolution: {integrity: sha512-apNa/prQy2qCeywhnixOHPRCgGNhvg7T4Dapfl1GahLp/R+uhBm5cPyFoNVyqsNd2h1nJxL6BqqdIjiABL60YA==}
+  '@vitest/spy@4.1.12':
+    resolution: {integrity: sha512-RGq9x4JNGNTZHEJxvN0oSiJjeSCExm0n2gZKKJZHY9cX5AVA6M7VJILBT3ZJ/tJ/0J9uWT7fETV9/btoi//vSg==}
 
-  '@vitest/utils@4.1.11':
-    resolution: {integrity: sha512-zTCVGpyFsGWBhllOyKlTw/vnr6D9qxsfSDyfbyZmTyjHw5N/VuvzHpHoQjm2ZJzn4RJgx5w4r7V0er69CmLgPQ==}
+  '@vitest/utils@4.1.12':
+    resolution: {integrity: sha512-Q3awXrwOfEV+qc3WmO5ONyE0yO7Q1gQ9/oyHxGLZ/pl7N3NO/ZztqQwKLuwMkV+CA1JYSIeO3gkHnRDIo4AVaA==}
 
   '@webassemblyjs/ast@1.14.1':
     resolution: {integrity: sha512-nuBEDgQfm1ccRp/8bCQrx1frohyufl4JlbMMZ4P1wpeOfDhF6FQkxZJ1b/e+PLwr6X1Nhw6OLme5usuBWYBvuQ==}
@@ -2974,8 +2975,8 @@ packages:
     resolution: {integrity: sha512-BNGbWLfd0eUPabhkXUVm0j8uuvREyTh5ovRa/dyow/BqAbZJyC+5fU+IzQOzmAKzYqYRAISoRhdQr3eIZ/PXqg==}
     engines: {node: '>= 0.8'}
 
-  vite@7.3.6:
-    resolution: {integrity: sha512-4XP60spRGjSZFf1qYH+dJIkK2znL3zQfl9KkOV9MkkRR/3Dls0dxaBsQPTloEc5BLXWPL9vsOxopxyKoMmDueg==}
+  vite@7.3.7:
+    resolution: {integrity: sha512-AHEzTORMbi7/7aXp7w7KZ5+DCUdSeLsJz0grY8xHpc9DHdYb0vQu6DqJfm2tOw3gDExNgPgnJTXxM6syYFHaCA==}
     engines: {node: ^20.19.0 || >=22.12.0}
     hasBin: true
     peerDependencies:
@@ -3014,23 +3015,23 @@ packages:
       yaml:
         optional: true
 
-  vitest@4.1.11:
-    resolution: {integrity: sha512-fhACrNXUidIbGSBr5FlbuBkO7VWC1ZyLl0DO4CU2DrQoAPxX84Ysxs+HeGQpii5lZWV1Q4gBZTTu49mF+A6Edw==}
+  vitest@4.1.12:
+    resolution: {integrity: sha512-5eWdz2yb3ajxWF3C8C4TjkXl7FGm3n2E/VlazALrQHzK7nYMSGFnCZto0bbPNl77AwkOZVLk0YnBAejUu0NiWA==}
     engines: {node: ^20.0.0 || ^22.0.0 || >=24.0.0}
     hasBin: true
     peerDependencies:
       '@edge-runtime/vm': '*'
       '@opentelemetry/api': ^1.9.0
       '@types/node': ^20.0.0 || ^22.0.0 || >=24.0.0
-      '@vitest/browser-playwright': 4.1.11
-      '@vitest/browser-preview': 4.1.11
-      '@vitest/browser-webdriverio': 4.1.11
-      '@vitest/coverage-istanbul': 4.1.11
-      '@vitest/coverage-v8': 4.1.11
-      '@vitest/ui': 4.1.11
+      '@vitest/browser-playwright': 4.1.12
+      '@vitest/browser-preview': 4.1.12
+      '@vitest/browser-webdriverio': ^4.1.11
+      '@vitest/coverage-istanbul': 4.1.12
+      '@vitest/coverage-v8': 4.1.12
+      '@vitest/ui': 4.1.12
       happy-dom: '*'
       jsdom: '*'
-      vite: ^6.0.0 || ^7.0.0 || ^8.0.0
+      vite: 7.3.7
     peerDependenciesMeta:
       '@edge-runtime/vm':
         optional: true
@@ -4242,44 +4243,44 @@ snapshots:
     dependencies:
       '@types/node': 24.0.3
 
-  '@vitest/expect@4.1.11':
+  '@vitest/expect@4.1.12':
     dependencies:
       '@standard-schema/spec': 1.1.0
       '@types/chai': 5.2.3
-      '@vitest/spy': 4.1.11
-      '@vitest/utils': 4.1.11
+      '@vitest/spy': 4.1.12
+      '@vitest/utils': 4.1.12
       chai: 6.2.2
       tinyrainbow: 3.1.1
 
-  '@vitest/mocker@4.1.11(vite@7.3.6(@types/node@24.0.3)(terser@5.51.2)(tsx@4.20.3))':
+  '@vitest/mocker@4.1.12(vite@7.3.7(@types/node@24.0.3)(terser@5.51.2)(tsx@4.20.3))':
     dependencies:
-      '@vitest/spy': 4.1.11
+      '@vitest/spy': 4.1.12
       estree-walker: 3.0.3
       magic-string: 0.30.21
     optionalDependencies:
-      vite: 7.3.6(@types/node@24.0.3)(terser@5.51.2)(tsx@4.20.3)
+      vite: 7.3.7(@types/node@24.0.3)(terser@5.51.2)(tsx@4.20.3)
 
-  '@vitest/pretty-format@4.1.11':
+  '@vitest/pretty-format@4.1.12':
     dependencies:
       tinyrainbow: 3.1.1
 
-  '@vitest/runner@4.1.11':
+  '@vitest/runner@4.1.12':
     dependencies:
-      '@vitest/utils': 4.1.11
+      '@vitest/utils': 4.1.12
       pathe: 2.0.3
 
-  '@vitest/snapshot@4.1.11':
+  '@vitest/snapshot@4.1.12':
     dependencies:
-      '@vitest/pretty-format': 4.1.11
-      '@vitest/utils': 4.1.11
+      '@vitest/pretty-format': 4.1.12
+      '@vitest/utils': 4.1.12
       magic-string: 0.30.21
       pathe: 2.0.3
 
-  '@vitest/spy@4.1.11': {}
+  '@vitest/spy@4.1.12': {}
 
-  '@vitest/utils@4.1.11':
+  '@vitest/utils@4.1.12':
     dependencies:
-      '@vitest/pretty-format': 4.1.11
+      '@vitest/pretty-format': 4.1.12
       convert-source-map: 2.0.0
       tinyrainbow: 3.1.1
 
@@ -5712,7 +5713,7 @@ snapshots:
 
   vary@1.1.2: {}
 
-  vite@7.3.6(@types/node@24.0.3)(terser@5.51.2)(tsx@4.20.3):
+  vite@7.3.7(@types/node@24.0.3)(terser@5.51.2)(tsx@4.20.3):
     dependencies:
       esbuild: 0.28.2
       fdir: 6.5.0(picomatch@4.0.4)
@@ -5726,15 +5727,15 @@ snapshots:
       terser: 5.51.2
       tsx: 4.20.3
 
-  vitest@4.1.11(@types/node@24.0.3)(vite@7.3.6(@types/node@24.0.3)(terser@5.51.2)(tsx@4.20.3)):
+  vitest@4.1.12(@types/node@24.0.3)(vite@7.3.7(@types/node@24.0.3)(terser@5.51.2)(tsx@4.20.3)):
     dependencies:
-      '@vitest/expect': 4.1.11
-      '@vitest/mocker': 4.1.11(vite@7.3.6(@types/node@24.0.3)(terser@5.51.2)(tsx@4.20.3))
-      '@vitest/pretty-format': 4.1.11
-      '@vitest/runner': 4.1.11
-      '@vitest/snapshot': 4.1.11
-      '@vitest/spy': 4.1.11
-      '@vitest/utils': 4.1.11
+      '@vitest/expect': 4.1.12
+      '@vitest/mocker': 4.1.12(vite@7.3.7(@types/node@24.0.3)(terser@5.51.2)(tsx@4.20.3))
+      '@vitest/pretty-format': 4.1.12
+      '@vitest/runner': 4.1.12
+      '@vitest/snapshot': 4.1.12
+      '@vitest/spy': 4.1.12
+      '@vitest/utils': 4.1.12
       es-module-lexer: 2.3.2
       expect-type: 1.4.0
       magic-string: 0.30.21
@@ -5746,7 +5747,7 @@ snapshots:
       tinyexec: 1.3.1
       tinyglobby: 0.2.17
       tinyrainbow: 3.1.1
-      vite: 7.3.6(@types/node@24.0.3)(terser@5.51.2)(tsx@4.20.3)
+      vite: 7.3.7(@types/node@24.0.3)(terser@5.51.2)(tsx@4.20.3)
       why-is-node-running: 2.3.0
     optionalDependencies:
       '@types/node': 24.0.3
```

No migration, commercial behavior, operational alert or release-gate change. Dispatcher must resolve the initial-state mismatch under a new explicit instruction before this attempt can proceed. Do not commit this checkout as a successful Vite R3 candidate.
