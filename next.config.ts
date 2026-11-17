import type { NextConfig } from "next";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * Version shown in the toolbar, fixed at build time.
 * - Release builds (CI) pass the tag via NEXT_PUBLIC_APP_VERSION, e.g. v0.4.0 or v0.4.0-p.
 * - Local builds use the nearest release tag on the branch (`git describe --tags --abbrev=0`), e.g. v0.3.9.
 * - Without git, falls back to the package.json version.
 */
function resolveAppVersion(): string {
  if (process.env.NEXT_PUBLIC_APP_VERSION) return process.env.NEXT_PUBLIC_APP_VERSION;
  try {
    return execSync("git describe --tags --abbrev=0", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    const pkg = JSON.parse(readFileSync("./package.json", "utf8")) as { version: string };
    return `v${pkg.version}`;
  }
}

const nextConfig: NextConfig = {
  output: "export",
  env: {
    NEXT_PUBLIC_APP_VERSION: resolveAppVersion(),
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };
    }
    return config;
  },
};

export default nextConfig;
