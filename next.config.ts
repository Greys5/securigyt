import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

function localDevOrigins(): string[] {
  const configured = process.env.SECURIGIT_DEV_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) ?? [];
  const localAddresses = Object.values(networkInterfaces())
    .flatMap((addresses) => addresses ?? [])
    .filter((address) => address.family === "IPv4" && !address.internal)
    .map((address) => address.address);

  return [...new Set([...configured, ...localAddresses])];
}

const nextConfig: NextConfig = {
  // better-sqlite3 is a native module; keep it out of the bundler.
  serverExternalPackages: ["better-sqlite3"],
  // Keep client-side controls working when the dev UI is opened from another
  // device through this machine's LAN address.
  allowedDevOrigins: localDevOrigins(),
};

export default nextConfig;
