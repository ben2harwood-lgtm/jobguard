import * as client from "openid-client";
import { oidcConfigV1, oidcRequestV1, oidcClaimsV1, OidcError, type OidcConfig, type OidcRequest, type OidcClaims } from "./oidc.contracts.js";

const MAX_RESPONSE_BYTES = 65_536;
const TIMEOUT_MS = 500;

/** Not registered in application composition. Caller supplies an in-process fixture handler, never fetch. */
export class OidcAdapter {
  private readonly config: OidcConfig;
  private readonly transport: client.CustomFetch;
  constructor(config: unknown, localIssuer: client.CustomFetch) {
    try { this.config = oidcConfigV1.parse(config); } catch { throw new OidcError(); }
    const issuer = this.config.issuer;
    const endpoints = new Map([
      [`${issuer}/.well-known/openid-configuration`, "GET"], [`${issuer}/token`, "POST"], [`${issuer}/jwks`, "GET"],
    ]);
    this.transport = async (url, options) => {
      if (endpoints.get(url) !== options.method || options.redirect !== "manual") throw new OidcError();
      const abort = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      try {
        return await Promise.race([
          new Promise<never>((_, reject) => { timer = setTimeout(() => { abort.abort(); void reader?.cancel().catch(() => {}); reject(new OidcError()); }, TIMEOUT_MS); }),
          (async () => {
            const response = await localIssuer(url, { ...options, signal: abort.signal });
            if (abort.signal.aborted || response.redirected || (response.url && response.url !== url) || response.status >= 300 || response.status < 200 || !response.body) throw new OidcError();
            reader = response.body.getReader();
            const chunks: Uint8Array[] = [];
            let bytes = 0;
            while (true) {
              const chunk = await reader.read();
              if (chunk.done) break;
              bytes += chunk.value.byteLength;
              if (bytes > MAX_RESPONSE_BYTES || abort.signal.aborted) throw new OidcError();
              chunks.push(chunk.value);
            }
            return new Response(Buffer.concat(chunks), { status: response.status, headers: response.headers });
          })(),
        ]);
      } catch { abort.abort(); void reader?.cancel().catch(() => {}); throw new OidcError(); }
      finally { clearTimeout(timer); }
    };
  }

  private async discover(): Promise<client.Configuration> {
    const configuration = await client.discovery(new URL(this.config.issuer), this.config.clientId,
      { id_token_signed_response_alg: "RS256", [client.clockTolerance]: 0 }, client.None(),
      { [client.customFetch]: this.transport, execute: [client.enableNonRepudiationChecks], timeout: 1 });
    const metadata = configuration.serverMetadata();
    for (const [key, path] of [["authorization_endpoint", "/authorize"], ["token_endpoint", "/token"], ["jwks_uri", "/jwks"]] as const) {
      if (metadata[key] !== `${this.config.issuer}${path}`) throw new OidcError();
    }
    if (metadata.issuer !== this.config.issuer) throw new OidcError();
    return configuration;
  }

  async start(browserBinding: string): Promise<{ authorizationUrl: string; request: OidcRequest }> {
    try {
      const request = oidcRequestV1.parse({
        version: "oidc-request.v1", tenantId: this.config.tenantId, connectionId: this.config.connectionId,
        issuer: this.config.issuer, clientId: this.config.clientId, redirectUri: this.config.redirectUri,
        state: client.randomState(), nonce: client.randomNonce(), verifier: client.randomPKCECodeVerifier(), browserBinding, createdAt: Date.now(),
      });
      const configuration = await this.discover();
      const authorizationUrl = client.buildAuthorizationUrl(configuration, {
        response_type: "code", scope: "openid email groups", redirect_uri: request.redirectUri,
        state: request.state, nonce: request.nonce, code_challenge: await client.calculatePKCECodeChallenge(request.verifier), code_challenge_method: "S256",
      }).href;
      return { authorizationUrl, request };
    } catch { throw new OidcError(); }
  }

  /** A request must eventually come from B's trusted durable store, never from callback input. No session or grant is returned. */
  async validate(callback: string, storedRequest: unknown, browserBinding: string): Promise<OidcClaims> {
    try {
      const request = oidcRequestV1.parse(storedRequest);
      for (const key of ["tenantId", "connectionId", "issuer", "clientId", "redirectUri"] as const) {
        if (request[key] !== this.config[key]) throw new OidcError();
      }
      if (request.browserBinding !== browserBinding || request.createdAt > Date.now() || Date.now() - request.createdAt > 300_000) throw new OidcError();
      if (typeof callback !== "string" || callback.length > 4096) throw new OidcError();
      const url = new URL(callback);
      const redirect = new URL(url); redirect.search = "";
      if (redirect.href !== request.redirectUri || url.hash) throw new OidcError();
      const params = url.searchParams;
      for (const key of params.keys()) {
        if (!["code", "state", "iss"].includes(key) || params.getAll(key).length !== 1) throw new OidcError();
      }
      if (!params.get("code") || params.get("code")!.length > 1024 || params.get("state") !== request.state || params.get("iss") !== request.issuer) throw new OidcError();
      // A fresh per-exchange configuration bounds JWKS lookup to this exchange and allows immediate test-key rotation.
      const configuration = await this.discover();
      const tokens = await client.authorizationCodeGrant(configuration, url, {
        pkceCodeVerifier: request.verifier, expectedState: request.state, expectedNonce: request.nonce, idTokenExpected: true,
      });
      const claims = tokens.claims();
      if (!claims || typeof claims.iat !== "number" || claims.iat > Math.floor(Date.now() / 1000) || claims.exp - claims.iat > 300) throw new OidcError();
      return oidcClaimsV1.parse({
        version: "oidc-claims.v1", tenantId: request.tenantId, connectionId: request.connectionId, issuer: claims.iss,
        subject: claims.sub, email: claims.email, emailVerified: claims.email_verified, groups: claims.groups ?? [],
      });
    } catch { throw new OidcError(); }
  }
}
