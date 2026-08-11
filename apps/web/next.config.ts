import type { NextConfig } from 'next';
import path from 'path';
import fs from 'fs';
import webpack from 'webpack';

// Read NEXT_PUBLIC_* from the root .env (lowest precedence, secrets never imported).
const rootEnvPath = path.join(__dirname, '../../.env');
if (fs.existsSync(rootEnvPath)) {
  for (const line of fs.readFileSync(rootEnvPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*(NEXT_PUBLIC_[A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
}

// Desktop packaging sets EKASCRIBE_STATIC_EXPORT=false → Next standalone
// (consumed by prepare-ekascribe-runtime). Web/API deploy leaves it unset/true →
// static export served by FastAPI (apps/api web_static.py).
const useStaticExport = process.env.EKASCRIBE_STATIC_EXPORT !== 'false';

const nextConfig: NextConfig = {
  // Pin the workspace root so Next ignores stray lockfiles in parent dirs
  // (e.g. a ~/yarn.lock) when detecting the monorepo root.
  outputFileTracingRoot: path.join(__dirname, '../../'),
  experimental: {
    typedRoutes: true,
  },
  // Static export: the bundle in out/ is served by the FastAPI api container
  // (apps/api web_static.py), which also owns the cache headers the old
  // headers() block set here. Export doesn't support headers()/rewrites().
  output: useStaticExport ? 'export' : 'standalone',
  // Lint never gated builds before (the old eslint config crashed and was
  // skipped); keep it advisory via `npm run lint` until violations are fixed.
  eslint: { ignoreDuringBuilds: true },
  // The export pipeline has no image-optimizer server; all images are local
  // /assets/* files, so plain <img> behavior is fine.
  images: { unoptimized: true },
  // StrictMode's dev double-mount fires the AG-UI run POST twice, creating ghost documents
  reactStrictMode: false,
  // API proxy for same-origin backend paths. hosts.ts normally makes these absolute, but
  // anything still emitting a relative path is forwarded here so it can't escape the
  // intended backend.
  //
  // Web dev: `next dev` on :3000 forwards to the local API on :8000.
  // Desktop (standalone): forwards to the Electron main process's Express proxy, keeping
  // the "all traffic leaves through the main process" invariant intact.
  // `next build` with output:'export' ignores rewrites entirely.
  async rewrites() {
    const apiTarget = useStaticExport
      ? 'http://localhost:8000'
      : (process.env.EKASCRIBE_API_PROXY_ORIGIN ?? 'http://localhost:6087');

    return [
      { source: '/voice/:path*', destination: `${apiTarget}/voice/:path*` },
      {
        source: '/connect-auth/:path*',
        destination: `${apiTarget}/connect-auth/:path*`,
      },
      { source: '/healthz', destination: `${apiTarget}/healthz` },
    ];
  },
  ...(useStaticExport
    ? {}
    : {
      // Standalone (desktop) — force fresh content; export can't use headers().
      async headers() {
        return [
          {
            source: '/((?!_next/static|_next/image|favicon.ico).*)',
            headers: [
              {
                key: 'Cache-Control',
                value: 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
              },
            ],
          },
        ];
      },
    }),

  webpack: (config, { isServer }) => {
    // ui-lib lives outside apps/web (monorepo packages/ui-lib) — make its
    // imports resolve against this app's node_modules.
    config.resolve.modules = [
      ...(config.resolve.modules || ['node_modules']),
      path.resolve(__dirname, 'node_modules'),
    ];
    // Platform Capability Layer: select the implementation family at build time so the
    // non-target family is tree-shaken out. Defaults to web. See
    // .claude/docs/architecture/implementation-guide.md §2.
    const platformFamily =
      (process.env.NEXT_PUBLIC_APP_SOURCE ?? 'web') === 'web' ? 'web' : 'electron';

    console.log('[next.config] NEXT_PUBLIC_APP_SOURCE:', process.env.NEXT_PUBLIC_APP_SOURCE, '| platformFamily:', platformFamily);

    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname, 'src'),
      '@ui': path.resolve(__dirname, '../../packages/ui-lib'),
      '@eka-ui': path.resolve(__dirname, '../../packages/ui-lib/src/eka-ui'),
      '@/components': path.resolve(__dirname, '../../packages/ui-lib/src/shadcn-ui/components'),
      '@/lib': path.resolve(__dirname, '../../packages/ui-lib/src/shadcn-ui/lib'),
      '@/hooks': path.resolve(__dirname, '../../packages/ui-lib/src/shadcn-ui/hooks'),
      '@platform-impl': path.resolve(__dirname, `src/platform/${platformFamily}`),
    };

    // Backstop: NormalModuleReplacementPlugin has higher priority than tsconfig-paths plugins,
    // ensuring `@platform-impl` always resolves to the correct family even if the tsconfig
    // path (hardcoded to `web` for IDE type-checking) overrides the alias above.
    config.plugins = config.plugins ?? [];
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(
        /^@platform-impl$/,
        path.resolve(__dirname, `src/platform/${platformFamily}`)
      )
    );

    // ekascribe-ts-sdk bundles onnxruntime-web which references `self` (browser-only).
    // Inject a polyfill at the top of each server chunk so prerendering doesn't crash.
    if (isServer) {
      config.plugins.push(
        new webpack.BannerPlugin({
          banner: 'if(typeof self==="undefined"){globalThis.self=globalThis;}',
          raw: true,
          entryOnly: false,
        })
      );
    }

    return config;
  },
};

export default nextConfig;
