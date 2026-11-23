/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return {
      beforeFiles: [
        "/northside", "/contractor/work-orders", "/contractor/work-orders/:workOrderId", "/site/extra", "/approvals/extras",
        "/contractor/jobs/:id/billing", "/contractor/statements", "/contractor/dashboard",
      ].map(source => ({
        source,
        has: [{ type: "query", key: "designed", value: "1" }],
        destination: `/designed${source}`,
      })),
      afterFiles: [],
      fallback: [],
    };
  },
  // OpenNext copies the full external package, including its workerd exports.
  // Next's Node trace otherwise includes only pg-cloudflare's empty fallback.
  serverExternalPackages: ["pg-cloudflare"],
};

export default nextConfig;
