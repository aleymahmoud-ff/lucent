import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: '/lucent',
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/api/:path*',
          destination: 'http://localhost:8000/api/:path*',
          basePath: false,
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
