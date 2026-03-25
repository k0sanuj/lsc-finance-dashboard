import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(dirname, "../.."),
  transpilePackages: ["@lsc/db"],
  serverExternalPackages: ["@swc/helpers"],
  outputFileTracingExcludes: {
    "*": ["node_modules/@swc/helpers/**/*"]
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' https://generativelanguage.googleapis.com; font-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
          }
        ]
      }
    ];
  }
};

export default nextConfig;
