# JobGuard V2 local rehearsal

From a separate V2 checkout with Node 24, Corepack and Docker Desktop running:

```sh
node tools/v2/start.mjs
```

Open [V2 sign-in](http://127.0.0.1:3400/sign-in). Use `builder@jobguard-v2.invalid` or `second-builder@jobguard-v2.invalid` and enter the practice code shown on the page. V2-a2 will add the fictional job through [the seed hook](seed.mjs).

The API listens on loopback port 3401. Docker Compose keeps PostgreSQL on port 56432 in the `jobguard-v2_pgdata` volume. MinIO uses port 16900, the `jobguard-v2_objects` volume and the private, versioned `jobguard-v2-evidence` bucket. Ctrl-C stops the API, web app and worker. The Docker services and volumes remain available for the next launch. To stop the services, select the `jobguard-v2` project in Docker Desktop.

The launcher checks inherited settings before installing dependencies or starting services. Use a clean worktree without existing `.env` files and a shell without exported deployment endpoints or proxies. [V2 settings](settings.mjs) specify the exact database and storage targets. The worker and web server use fictional email, text, merchant and payment adapters and report captured delivery metadata in the local terminal. Errors are logged locally. The API, web server and worker open outbound TCP connections only to the listed loopback services. The launcher may download pinned packages and container images during setup.

For a phone on the same home network, set `JOBGUARD_V2_PHONE_HOST` to the Mac's private IPv4 address and set `JOBGUARD_V2_PHONE_CERT` and `JOBGUARD_V2_PHONE_KEY` to a local certificate and key. The certificate must include that IP in its subject alternative names and be trusted by the phone. Run the same command and open the HTTPS address it prints. PostgreSQL, storage and the API stay on loopback.
