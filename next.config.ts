import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(import.meta.url));

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co blob:",
  "worker-src 'self' blob:",
  "media-src 'self' blob: https://*.supabase.co",
  "manifest-src 'self'",
].join("; ");

const globalSecurityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1"],
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: globalSecurityHeaders,
      },
      {
        source: "/owner/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0, must-revalidate" }],
      },
      {
        source: "/student/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0, must-revalidate" }],
      },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0, must-revalidate" }],
      },
    ];
  },
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
