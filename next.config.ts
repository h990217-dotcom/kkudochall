import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',basePath: '/kkudochall',assetPrefix: '/kkudochall',
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
