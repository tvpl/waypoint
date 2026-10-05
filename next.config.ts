import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The app itself must never be framed by third parties.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

// The desktop app (desktop/) bundles the self-contained server that `output: "standalone"` emits.
const standalone = process.env.NEXT_OUTPUT === "standalone";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  ...(standalone && {
    output: "standalone",
    outputFileTracingIncludes: {
      // Migrations are read from disk at startup; better-sqlite3 picks its prebuilt binary at runtime.
      "/*": ["drizzle/**/*", "node_modules/better-sqlite3/prebuilds/**/*"],
    },
  }),
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
