const localV2Api = process.env.JOBGUARD_LOCAL_V2 === "1" && process.env.NEXT_PUBLIC_API_URL === "/api/v2-backend";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // V2-F1 browser proofs inspect only product content, with dev chrome disabled.
  ...(process.env.JOBGUARD_LOCAL_V2 === "1" ? { devIndicators: false } : {}),
  // OpenNext copies the full external package, including its workerd exports.
  // Next's Node trace otherwise includes only pg-cloudflare's empty fallback.
  serverExternalPackages: ["pg-cloudflare"],
  // V2 only: lets the quote screen ask for "don't forget" prompts. Outside V2
  // the flag is absent, so the browser makes no extra request.
  ...(process.env.JOBGUARD_LOCAL_V2 === "1" ? { env: { NEXT_PUBLIC_JOBGUARD_V2_QUOTE_PROMPTS: "1" } } : {}),
  ...(localV2Api ? {
    allowedDevOrigins: [new URL(process.env.AUTH_ALLOWED_ORIGIN).hostname],
    async rewrites() {
      // Existing Next API routes still handle sign-in and the web workflow.
      return { fallback: [{ source: "/api/v2-backend/:path*", destination: "http://127.0.0.1:3401/:path*" }] };
    },
  } : {}),
};

export default nextConfig;
