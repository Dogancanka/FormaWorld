import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker copies a self-contained server out of .next/standalone.
  output: "standalone",
  // The reader-state store resolves its directory from an environment variable
  // at run time. Turbopack sees dynamic filesystem access and, to be safe,
  // traces the whole project into the standalone bundle — which pulled every
  // source and test file into the image. None of it is needed at run time.
  outputFileTracingExcludes: {
    "**": ["src/**/*", "*.md", "*.tsbuildinfo", "eslint.config.mjs", "vitest.config.ts"],
  },
  transpilePackages: ["three"],
  experimental: {
    // Static-generation worker threads crash on some Windows/AV setups
    // (STATUS_CONTROL_C_EXIT); child processes are more stable here.
    workerThreads: false,
  },
};

export default nextConfig;
