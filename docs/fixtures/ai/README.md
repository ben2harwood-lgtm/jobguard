# AI gateway fixtures — M0-12

`@jobguard/ai` is the sole provider boundary. Feature code supplies versioned request, prompt and output-schema identifiers plus immutable source content and hashes. Provider output is untrusted: the gateway validates its envelope, structured output, and every citation source/span before returning it with provider/model/deployment and source provenance.

M0-12 permits only `FixtureAiProvider`. It reads caller-supplied recorded fixtures, has no network or vendor SDK, always reports zero cost, and cannot execute model-directed tools or commercial actions. Malformed output may receive at most one caller-supplied deterministic repair attempt.

`createLiveAiProvider()` marks the future adapter seam but always throws `live_route_disabled`. No credential, endpoint, fallback, live model, speech route, or paid API is configured. D04 remains `proposed`; its eventual approval evidence and a separately implemented approved-region adapter are prerequisites to any real-data route. This contract does not approve D04 or claim provider/residency verification.
