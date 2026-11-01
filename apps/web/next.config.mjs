/** @type {import('next').NextConfig} */
const nextConfig = {
  // OpenNext copies the full external package, including its workerd exports.
  // Next's Node trace otherwise includes only pg-cloudflare's empty fallback.
  serverExternalPackages: ["pg-cloudflare"],
};

export default nextConfig;
