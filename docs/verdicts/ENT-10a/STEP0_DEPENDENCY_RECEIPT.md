# ENT-10a step 0 — dependency receipt: `@node-saml/node-saml`

Branch `codex/sandbox/ent-10a`, based on `origin/main` ff072c7. Date of work: 2026-10-11.
Builder: Claude Sonnet (step-0 helper). Scope: add the one approved SAML library and prove how a test identity provider can use it. Nothing else changed.

## 1. Authority

- Ben (founder), 8 Oct: "Approve a library" — one free, open-source library for SAML sign-in, named in the receipt, must pass the repo's fail-closed dependency audit.
- Coordinator, 11 Oct: the ONE approved library is `@node-saml/node-saml` (MIT). SAML only. No second library. No hand-written signature verification code anywhere.

## 2. What was added

| Item | Value |
|---|---|
| Package | `@node-saml/node-saml` |
| Exact version (pinned, `--save-exact`) | `5.1.0` (npm `latest`; newest stable) |
| Published | 2025-07-21T23:28:29Z (447 days before 2026-10-11; the 14-day rule is met) |
| Licence | MIT |
| Tarball integrity | `sha512-t3cJnZ4aC7HhPZ6MGylGZULvUtBOZ6FzuUndaHGXjmIZHXnLfC/7L8a57O9Q9V7AxJGKAiRM5zu2wNm9EsvQpw==` |
| Where | `apps/api/package.json` `dependencies` (one line added, existing formatting kept) |
| Engines | node >= 18 (repo runs Node 24) |

Tracked files changed: `apps/api/package.json` (+1 line), `pnpm-lock.yaml` (+119 lines). `pnpm-workspace.yaml` is unchanged; `onlyBuiltDependencies` is still only `@embedded-postgres/linux-x64`.

## 3. New packages the lockfile gained (15 entries = the library + 14 transitive)

Read from the installed copies' own `package.json`. None has a `preinstall`/`install`/`postinstall` script or a `binding.gyp`; the lockfile diff contains no `requiresBuild`; pnpm's "ignored build scripts" warning lists the same four packages as before (none of the new ones).

| Package | Version | Licence |
|---|---|---|
| @node-saml/node-saml | 5.1.0 | MIT |
| @xmldom/xmldom | 0.8.15 | MIT |
| @xmldom/is-dom-node | 1.0.1 | MIT |
| xml-crypto | 6.3.3 | MIT |
| xml-encryption | 3.1.0 | MIT |
| xml2js | 0.6.2 | MIT |
| xmlbuilder | 15.1.1 | MIT |
| xmlbuilder (second copy, via xml2js) | 11.0.1 | MIT |
| sax | 1.6.1 | BlueOak-1.0.0 (permissive, OSI-approved) |
| xpath | 0.0.34 | MIT |
| xpath (via xml-crypto) | 0.0.33 | MIT |
| xpath (via xml-encryption) | 0.0.32 | MIT |
| @types/qs | 6.15.1 | MIT |
| @types/xml-encryption | 1.2.4 | MIT |
| @types/xml2js | 0.4.14 | MIT |

`debug`, `@types/debug`, `escape-html` and `@types/node` were already in the lockfile. The `@types/*` packages are type-only. Note: `sax` is not MIT (BlueOak-1.0.0); it is a permissive licence but a reviewer may want to note it. The repo's audit is a vulnerability scan only, not a licence review, so the licences above were checked by hand.

`xml-crypto` is a dependency of the library, not of `apps/api`: under pnpm's strict layout it cannot be imported from `apps/api` (confirmed: `require("xml-crypto")` fails from `apps/api`). It was not added.

## 4. Commands and exits (run in the worktree)

| Command | Exit | Result |
|---|---|---|
| `pnpm install --frozen-lockfile` (before) | 0 | clean |
| baseline `node tools/dependency-audit.mjs` (before change) | 0 | 587 deps, 0 findings |
| `pnpm --filter @jobguard/api add --save-exact @node-saml/node-saml@5.1.0` | 0 | pnpm also re-sorted package.json; that was reverted by hand to a one-line add |
| `pnpm install --frozen-lockfile` (after hand edit) | 0 | lockfile consistent with the one-line package.json change |
| `node tools/dependency-audit.mjs` | 0 | 602 deps, info/low/moderate/high/critical all 0 |
| `node --test tools/dependency-audit.test.mjs` | 0 | 11 pass, 0 fail |
| `pnpm typecheck` | 0 | 7 of 7 turbo tasks successful |

## 5. Settings a builder must use (real option names, version 5.1.0)

`new SAML({...})` — all names below exist in `lib/types.d.ts` 5.1.0.

| Option | Use | Why |
|---|---|---|
| `idpCert` | the IdP's signing certificate (base64 or PEM; an array allows key rotation) | trust anchor; the library verifies only against these |
| `callbackUrl` | our ACS URL | required |
| `issuer` | our SP entity ID | required; also the default audience |
| `audience` | set explicitly to the SP entity ID; never `false` | `false` switches the audience check off |
| `wantAssertionsSigned` | `true` (also the default) | assertion must carry a valid signature |
| `wantAuthnResponseSigned` | `true` (default) unless a reviewed IdP-specific decision says otherwise | with both `true`, an unsigned Response or unsigned Assertion is rejected (proved, x2/x3). Relaxing only this one was not exercised. |
| `acceptedClockSkewMs` | a small positive value, e.g. `30000` (default `0`) | tolerance for clock difference. **`-1` switches off all time checks; never use.** |
| `maxAssertionAgeMs` | e.g. `600000` (default `0` = no limit) | caps age from IssueInstant, but only runs when `<Conditions>` carries NotOnOrAfter (see gaps) |
| `validateInResponseTo` | `ValidateInResponseTo.always` (**default is `never`**) | rejects unsolicited and replayed request IDs; rejects IdP-initiated responses |
| `cacheProvider` | our own `CacheProvider` (`saveAsync/getAsync/removeAsync`), database-backed | the default is an in-memory cache per process, which fails across instances/restarts |
| `requestIdExpirationPeriodMs` | e.g. `600000` (default 8 hours) | how long an issued request ID stays valid |
| `signatureAlgorithm`, `digestAlgorithm` | `"sha256"` for anything we sign (defaults are `sha1`) | only affects what WE sign |
| `idpIssuer` | set it, but do not rely on it | in 5.1.0 it is checked only on logout messages, not on login responses (see gaps) |

Sign-in call: `await saml.validatePostResponseAsync({ SAMLResponse })` returns `{ profile, loggedOut }`; it throws on any failure. Treat every throw as "deny".

### Things the library does NOT check on a login response (proved by the script, rows y1–y5)

These are claim checks on already-verified data, not signature verification, so they are allowed. Use `profile.issuer` and the verified assertion text from `profile.getAssertionXml()` (it is the signed assertion element; it includes `Recipient`).

1. The Assertion `Issuer` is not compared to `idpIssuer`. A response validly signed by a trusted key with a different issuer string was accepted (y1). Compare `profile.issuer` to the expected IdP entity ID.
2. `SubjectConfirmationData/@Recipient` is not compared to our ACS URL (y3, accepted). Check it.
3. `<Conditions>` with no NotBefore/NotOnOrAfter is accepted (y4), and then `maxAssertionAgeMs` does not run either. Require both attributes yourself.
4. Replay: when the assertion's `SubjectConfirmationData` has no `InResponseTo`, the same response was accepted twice (y5a/y5b). When it does have one, the second use was rejected (x6). Require `SubjectConfirmationData/@InResponseTo` and also record assertion IDs as one-time-use in the database.
5. RSA-SHA1 signatures and digests are accepted (y2). The library has no option to forbid them.
6. The inbound `AuthnContext` is not checked; `authnContext`/`racComparison` only shape the outgoing request.

## 6. Signing a test Response with only this library and Node built-ins

Public exports (`SAML`, `generateServiceProviderMetadata`, …) contain no XML signer. The library's own signer is `signXml`, in `lib/xml.js`. The package has no `exports` map, so the deep import works in Node ESM and under this repo's `NodeNext` TypeScript settings (checked with a throwaway tsc probe outside the repo, exit 0):

```ts
import { signXml } from "@node-saml/node-saml/lib/xml.js";   // test code only
const A = "//*[local-name(.)='Assertion']";
const R = "/*[local-name(.)='Response']";
export function signTestResponse(xml: string, privatePem: string): string {
  const opts = { privateKey: privatePem, signatureAlgorithm: "sha256" as const, digestAlgorithm: "sha256" };
  // 1) sign the Assertion (enveloped, placed right after its <Issuer>)
  xml = signXml(xml, A, { reference: `${A}/*[local-name(.)='Issuer']`, action: "after" }, opts);
  // 2) sign the whole Response the same way
  return signXml(xml, R, { reference: `${R}/*[local-name(.)='Issuer']`, action: "after" }, opts);
}
// Keys: crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }); export privateKey as pkcs8 PEM.
// Trust anchor for the SP under test: idpCert = publicKey.export({type:"spki",format:"pem"})  (a PEM PUBLIC KEY is accepted)
// Send:  { SAMLResponse: Buffer.from(signedXml).toString("base64") }
```

Rules found while doing it: the Response and Assertion elements need an attribute spelled exactly `ID`; omit `publicCert` so no KeyInfo is written; pass `sha256` for both algorithms; the XML must be built as a string (no extra library).

**Certificate question.** Node built-ins cannot create an X.509 certificate (`crypto.X509Certificate` only parses). Two working options, both proved: (1) pass the PEM public key as `idpCert` (simplest); (2) hand-assemble a minimal self-signed DER certificate with `crypto.sign` (about 20 lines of ASN.1 byte-wrapping); Node parsed it and the library accepted it as `idpCert` in base64, PEM CERTIFICATE and PEM PUBLIC KEY forms. Option 2 is not signature verification code. Option 1 is recommended unless a test must exercise certificate handling.

## 7. Accept/reject proof (throwaway script, outside the repo)

Script: `/private/tmp/claude-501/ent10a-step0/proof.mjs`, run as `cd apps/api && node /private/tmp/claude-501/ent10a-step0/proof.mjs`. It is not committed (macOS clears `/tmp` after a few days). Strict settings from section 5 were used. Result: **22 of 22 cases behaved as expected, exit 0.**

| Case | Outcome | Library message |
|---|---|---|
| Valid, Response + Assertion signed (cert as base64 / PEM cert / PEM public key) | ACCEPT x3 | profile returned |
| (a) one attribute value changed after signing | REJECT | Invalid document signature |
| (a2) NameID changed after signing | REJECT | Invalid document signature |
| (b) unsigned copy | REJECT | Invalid document signature |
| (c) wrong audience, validly signed | REJECT | SAML assertion audience mismatch |
| (d) expired Conditions, validly signed, confirmation still valid | REJECT | SAML assertion expired: clocks skewed too much |
| (d2) both Conditions and confirmation expired | REJECT | No valid subject confirmation found |
| (x1) signed with a different key | REJECT | Invalid document signature |
| (x2) only Assertion signed / (x3) only Response signed | REJECT / REJECT | Invalid document signature / Invalid signature |
| (x4) NotBefore in the future | REJECT | SAML assertion not yet valid |
| (x5) InResponseTo never issued | REJECT | InResponseTo is not valid |
| (x6) same valid response used twice | ACCEPT then REJECT | InResponseTo is not valid |
| (y1)–(y5) the gaps in section 5 | accepted (the gap) | — |

## 8. Not done

No application code, no SAML endpoints, no test files, no IdP configuration were written. The proof script was not added to the repo. No second library. Nothing pushed.

Step-0 builder receipt only — not independently verified, not accepted.
