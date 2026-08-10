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

const nextConfig: NextConfig = {
  // Pin the workspace root so Next ignores stray lockfiles in parent dirs
  // (e.g. a ~/yarn.lock) when detecting the monorepo root.
  outputFileTracingRoot: path.join(__dirname, '../../'),
  experimental: {
    typedRoutes: true,
  },
  output: 'standalone',
  transpilePackages: ['@eka-care/medical-records-ui'],
  // StrictMode's dev double-mount fires the AG-UI run POST twice, creating ghost documents
  reactStrictMode: false,
  // Prevent browser caching - forces fresh content on every load
  async headers() {
    return [
      {
        // exclude static files and images from caching to avoid re-rendering of the page by browser on every click
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

    console.log('[next.config] NEXT_PUBLIC_APP_SOURCE:', process.env.NEXT_PUBLIC_APP_SOURCE, '| platformFamily:', platformFamily, '| NEXT_PUBLIC_API_HOST:', process.env.NEXT_PUBLIC_API_HOST);

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
