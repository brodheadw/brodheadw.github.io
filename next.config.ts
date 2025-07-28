import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/brodheadw.github.io",
  assetPrefix: "/brodheadw.github.io/",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
