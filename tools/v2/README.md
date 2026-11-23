# JobGuard V2 local rehearsal

From a separate V2 checkout with Node 24 and Corepack:

```sh
node tools/v2/start.mjs
```

When Docker is absent, the launcher starts its own embedded PostgreSQL 16.10 on
`127.0.0.1:56432`. Set `JOBGUARD_V2_BACKEND=embedded` to use it on a machine
that also has Docker. PostgreSQL data and the private filesystem object store
live under `.jobguard/v2/postgres` and `.jobguard/v2/objects`. Generated proof
uses immutable, exact versions on disk. The web app transfers the generated
bytes on the server, so the store needs no listening port. Ctrl-C stops
PostgreSQL, the API, web app and worker. Restart from the same checkout to keep
the data and object versions.

With a local Docker socket, the existing Compose path uses the
`jobguard-v2_pgdata` volume on port 56432 and the private, versioned
`jobguard-v2-evidence` MinIO bucket on port 16900. Stop those containers in
Docker Desktop before switching to embedded mode. The two backends keep
separate state.

Open the printed sign-in page. Use `builder@jobguard-v2.invalid` and enter
the practice code shown on the page. If the seed prints an accepted quote link,
open it after signing in. On the base with the empty seed hook, choose
**Start a new business** the first time to create the fictional owner.
On this base, opening the linked practice workspace after sign-in returns 401.
Its database guard accepts the demo database name only, and V2 requires a
different database name.

## Open on a phone

Connect the Mac and phone to the same private home network. Set
`JOBGUARD_V2_PHONE_HOST` to the Mac's private IPv4 address and supply a local
certificate and key via `JOBGUARD_V2_PHONE_CERT` and
`JOBGUARD_V2_PHONE_KEY`. The certificate must include the IP as a subject
alternative name. Alternatively, let the launcher create a self-signed
certificate with the system OpenSSL:

```sh
JOBGUARD_V2_PHONE_HOST=192.168.1.24 JOBGUARD_V2_PHONE_SELF_SIGNED=1 node tools/v2/start.mjs
```

Replace the example IP with the Mac's address. The generated key and certificate
stay in `.jobguard/v2` and are reused on restart. The phone may show a certificate
warning. You can choose whether to trust the certificate on the phone. The
launcher makes no trust-store or keychain changes.

Open the printed HTTPS URL on the phone. The web app and API use this one
origin. Next serves its existing `/api` routes and forwards
`/api/v2-backend/*` to the Nest API on `127.0.0.1:3401`. PostgreSQL and
the Nest API listen on loopback only.

The launcher rejects inherited deployment endpoints and proxies, framework
dotenv files, and alternate database or storage targets. Use a clean V2
checkout and shell. Email, text, merchant and payment adapters capture
fictional deliveries in the local terminal. Dependencies may be downloaded
during setup.

## Verify the launcher

```sh
node --test tools/v2-local.test.mjs tools/v2-mac.test.mjs
V2_TEST_ORIGIN=https://192.168.1.24:3400 V2_TEST_SCREENSHOTS=.jobguard/v2/screenshots node --test tools/v2/phone.test.mjs
```

Run the browser test against the running V2 launcher with Playwright Chromium
installed, or set `V2_TEST_CHROMIUM` to a local Chromium executable. The test
uses two viewports, checks the HTTPS route to Nest and verifies that the
fictional sign-in survives a reload without any browser request to another
origin.
