import type { NextConfig } from "next";

const supabaseUrl = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL) : null;
  } catch {
    return null;
  }
})();
const supabaseHost = supabaseUrl?.hostname ?? null;
// Local development stack (scripts/local-stack) serves storage from localhost over http
const isLocalSupabase = supabaseHost === "localhost" || supabaseHost === "127.0.0.1";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" },
      ...(supabaseHost && !supabaseHost.endsWith(".supabase.co")
        ? [
            {
              protocol: (isLocalSupabase ? "http" : "https") as "http" | "https",
              hostname: supabaseHost,
              ...(supabaseUrl?.port ? { port: supabaseUrl.port } : {}),
              pathname: "/storage/v1/object/public/**",
            },
          ]
        : []),
    ],
    ...(isLocalSupabase ? { dangerouslyAllowLocalIP: true } : {}),
  },
  experimental: {
    serverActions: {
      // product photos are compressed in the browser before upload
      bodySizeLimit: "6mb",
    },
  },
  async redirects() {
    // Categories reorganised in the catalogue expansion (old URLs keep working)
    return [{ source: "/categorias/discos-faciais", destination: "/categorias/tonicos-e-discos", permanent: true }];
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/admin/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ];
  },
};

export default nextConfig;
