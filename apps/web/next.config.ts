import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/v1/:path*", destination: "http://127.0.0.1:4000/v1/:path*" },
    ];
  },
};

export default nextConfig;
