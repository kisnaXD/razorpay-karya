import type { NextConfig } from "next";

const apiRewriteTarget =
  process.env.NEXT_PUBLIC_API_URL === ""
    ? null
    : (process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000");

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    // Same-origin Docker/Caddy serves /v1 and /a2a — no Next rewrites.
    if (!apiRewriteTarget) return [];
    return [
      {
        source: "/v1/:path*",
        destination: `${apiRewriteTarget}/v1/:path*`,
      },
      {
        source: "/a2a/:path*",
        destination: `${apiRewriteTarget}/a2a/:path*`,
      },
      { source: "/health", destination: `${apiRewriteTarget}/health` },
    ];
  },
};

export default nextConfig;
