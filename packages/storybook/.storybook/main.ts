import * as path from 'path';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
const { dirname, resolve } = path;

const root = resolve();

/** @type { import('@storybook/svelte-vite').StorybookConfig } */
export default {
  framework: {
    name: "@storybook/svelte-vite",
    options: {}
  },

  stories: [
    // Look for *.stories.* anywhere *inside* ui (monorepo safe)
    '../../ui/src/**/*.stories.@(js|ts|svelte)'
  ],

  addons: [
    '@storybook/addon-links',
    {
      name: '@storybook/addon-essentials',
      options: {
        // Disable Docs to avoid React-based blocks in preview
        docs: false,
        // Disable Controls to avoid type parser pulling jsdoc-type-pratt-parser in preview
        controls: false,
        // Enable support for legacy Template API used by some stories
        legacyTemplate: true,
        // Disable Svelte docgen to avoid rollup parse errors on Svelte 5 syntax
        svelteDocgen: false,
      },
    },
    {
      name: '@storybook/addon-svelte-csf',
      options: {
        // Enable support for legacy Template API used by some stories
        legacyTemplate: true,
        // Disable Svelte docgen to avoid rollup parse errors on Svelte 5 syntax
        svelteDocgen: false,
      },
    },
  ],

  viteFinal: async (config: any, { configType }: any) => {
    const require = createRequire(import.meta.url);
    // Resolve Storybook core files to absolute paths to avoid pnpm symlink/URL 404s
    let sbPreviewRuntimePath: string | undefined;
    let sbCoreCsfPath: string | undefined;
    let sbCorePkgDir: string | undefined;
    try {
      sbPreviewRuntimePath = require.resolve('@storybook/core/preview/runtime');
    } catch {}
    try {
      sbCoreCsfPath = require.resolve('@storybook/core/csf');
    } catch {}
    try {
      sbCorePkgDir = path.dirname(require.resolve('@storybook/core/package.json'));
    } catch {}

    // Probe common dist locations because some subpaths are not listed in package exports
    const probe = (parts: string[]) => {
      if (!sbCorePkgDir) return undefined;
      const p = path.join(sbCorePkgDir, ...parts);
      return fs.existsSync(p) ? p : undefined;
    };
    const sbPreviewRuntimeDist =
      sbPreviewRuntimePath ||
      probe(['dist', 'preview', 'runtime.js']) ||
      probe(['preview', 'dist', 'runtime.js']) ||
      probe(['dist', 'preview', 'runtime', 'index.js']);
    const sbCoreCsfDist =
      sbCoreCsfPath ||
      probe(['dist', 'csf.js']) ||
      probe(['dist', 'csf', 'index.js']);
    // Ensure Svelte plugin is present and runs early
    if (!config.plugins?.some((p: any) => p?.name?.includes('svelte'))) {
      const { svelte } = await import('@sveltejs/vite-plugin-svelte');
      config.plugins = [svelte(), ...(config.plugins || [])];
    }
    // Pre-resolve Storybook core IDs that escape aliasing during import analysis
    const csfShim = resolve(root, '.storybook', 'sb-core-csf-shim.js');
    const previewRuntimeResolved = sbPreviewRuntimeDist || sbPreviewRuntimePath || '@storybook/core/preview/runtime';
    const storybookPkgDir = (() => {
      try {
        return path.dirname(require.resolve('storybook/package.json'));
      } catch {
        return undefined;
      }
    })();
    config.plugins = [
      {
        name: 'sb-core-id-redirect',
        enforce: 'pre',
        resolveId(id: string) {
          // Normalize id for matching
          const bare = id.replace(/^\u0000/, '');
          // Handle unscoped shimmed paths
          if (bare.includes('storybook/core/csf')) return '\u0000sb-csf-shim';
          if (bare.includes('storybook/core/preview/runtime')) return previewRuntimeResolved;
          // Handle scoped subpaths
          if (bare === '@storybook/core/preview/runtime' && previewRuntimeResolved) return previewRuntimeResolved;
          if (bare === '@storybook/core/csf' && sbCoreCsfDist) return '\u0000sb-csf-shim';
          // Avoid force-resolving arbitrary @storybook/core subpaths to file paths (may yield CJS)
          // Let Vite handle them via normal bare ID resolution so it can transform as needed
          if (bare.startsWith('@storybook/core/')) {
            return null;
          }
          return null;
        },
        load(id: string) {
          if (id === '\u0000sb-csf-shim') {
            const coreCsfFile = (sbCoreCsfDist && fs.existsSync(sbCoreCsfDist))
              ? sbCoreCsfDist
              : (sbCorePkgDir && fs.existsSync(path.join(sbCorePkgDir, 'dist', 'csf.js')))
                ? path.join(sbCorePkgDir, 'dist', 'csf.js')
                : undefined;
            if (coreCsfFile) {
              const viteFsPath = '/@fs/' + coreCsfFile;
              const src = `export * from '${viteFsPath}';\nexport const isPreview = true;\n`;
              return src;
            }
            // Fallback to static shim file if probing fails
            return fs.readFileSync(csfShim, 'utf8');
          }
          return null;
        },
        configureServer(server: any) {
          server.middlewares.use((req: any, res: any, next: any) => {
            const url = (req.url || '').split('?')[0];
            // csf shim: catch any path under /node_modules/storybook/core/csf
            if (url.includes('/node_modules/storybook/core/csf')) {
              console.log('[sb-core-id-redirect] middleware serve csf shim (via /@id) for', req.url);
              res.setHeader('Content-Type', 'application/javascript');
              const src = `import * as M from '/@id/@storybook/core/csf';\nexport * from '/@id/@storybook/core/csf';\nexport const isPreview = true;\nexport default M;\n`;
              res.end(src);
              return;
            }
            // Generic: map any /node_modules/storybook/<rest> to ESM wrapper that re-exports from /@id/@storybook/<rest>
            if (url.startsWith('/node_modules/storybook/')) {
              let rest = url.replace('/node_modules/storybook/', '');
              // Avoid requesting raw CJS files directly; let Vite resolve package entry
              if (rest.endsWith('.cjs')) rest = rest.slice(0, -4);
              console.log('[sb-core-id-redirect] generic @storybook wrapper for', req.url, '->', `@storybook/${rest}`);
              res.setHeader('Content-Type', 'application/javascript');
              const src = `import * as M from '/@id/@storybook/${rest}';\nexport * from '/@id/@storybook/${rest}';\nexport default M;\n`;
              res.end(src);
              return;
            }
            // Scoped: map any /node_modules/@storybook/<rest> similarly
            if (url.startsWith('/node_modules/@storybook/')) {
              let rest = url.replace('/node_modules/@storybook/', '');
              if (rest.endsWith('.cjs')) rest = rest.slice(0, -4);
              console.log('[sb-core-id-redirect] scoped @storybook wrapper for', req.url, '->', `@storybook/${rest}`);
              res.setHeader('Content-Type', 'application/javascript');
              const src = `import * as M from '/@id/@storybook/${rest}';\nexport * from '/@id/@storybook/${rest}';\nexport default M;\n`;
              res.end(src);
              return;
            }
            // Serve a tiny inline favicon to squelch 404 noise
            if (url === '/favicon.svg') {
              res.setHeader('Content-Type', 'image/svg+xml');
              const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="#ff4785"/><text x="8" y="12" text-anchor="middle" font-size="10" fill="#fff">SB</text></svg>`;
              res.end(svg);
              return;
            }
            // preview runtime: match /node_modules/storybook/core/preview/runtime(.m)?js
            if (/^\/node_modules\/storybook\/core\/preview\/runtime(\.m)?js$/.test(url)) {
              console.log('[sb-core-id-redirect] middleware serve preview runtime (via /@id) for', req.url);
              res.setHeader('Content-Type', 'application/javascript');
              const src = `import * as M from '/@id/@storybook/core/preview/runtime';\nexport * from '/@id/@storybook/core/preview/runtime';\nexport default M;\n`;
              res.end(src);
              return;
            }
            // Fallback: emit ESM wrapper via /@id for preview runtime
            if (url.includes('/node_modules/storybook/core/preview/runtime')) {
              console.log('[sb-core-id-redirect] fallback preview runtime via /@id for', req.url);
              res.setHeader('Content-Type', 'application/javascript');
              const src = `import * as M from '/@id/@storybook/core/preview/runtime';\nexport * from '/@id/@storybook/core/preview/runtime';\nexport default M;\n`;
              res.end(src);
              return;
            }
            // Do not generically serve other @storybook/core paths to avoid leaking raw CJS into browser
            next();
          });
        },
      },
      ...(config.plugins || []),
    ];
    // Make `ui` resolve to source, not dist, and add robust Storybook core aliases
    const existingAliases = config.resolve.alias;
    const existingArray = Array.isArray(existingAliases)
      ? existingAliases
      : Object.entries(existingAliases || {}).map(([find, replacement]) => ({ find, replacement }));
    const aliases = [
      { find: 'ui', replacement: resolve(root, '..', 'ui', 'src') },
      { find: '$lib', replacement: resolve(root, '..', 'ui', 'src', 'lib') },
      // Keep only direct shims as simple strings; path rewrites handled by plugin
      { find: '@storybook/core/preview/runtime', replacement: previewRuntimeResolved },
      { find: 'esm-env', replacement: resolve(root, '.storybook', 'esm-env-shim.js') },
      { find: 'clsx', replacement: resolve(root, '.storybook', 'clsx-shim.js') },
    ];
    config.resolve.alias = [...existingArray, ...aliases];
    // Avoid duplicated Svelte instances across symlinks
    config.resolve.dedupe = Array.from(new Set([...(config.resolve.dedupe || []), 'svelte']));
    // Prefer Svelte condition exports
    config.resolve.conditions = Array.from(new Set([...(config.resolve.conditions || []), 'svelte']));
    // Be friendly to pnpm symlinks when resolving files
    config.resolve.preserveSymlinks = true;
    // Add .svelte to resolution list for import analysis
    config.resolve.extensions = Array.from(new Set([ 
      ...((config.resolve && config.resolve.extensions) || []),
      '.svelte'
    ]));
    // Ensure node_modules Svelte files are handled by Vite/Svelte
    // Disable deps discovery so esbuild doesn't prebundle packages with .svelte files
    config.optimizeDeps = {
      ...(config.optimizeDeps || {}),
      noDiscovery: true,
      include: [],
      exclude: Array.from(new Set([...
        (((config.optimizeDeps as any)?.exclude) || []),
        'storybook',
        'storybook/*',
        '@storybook/*',
        'svelte',
        '@storybook/svelte',
        '@storybook/addon-svelte-csf',
        'esm-env',
        'clsx',
      ])),
      esbuildOptions: {
        ...((config.optimizeDeps as any)?.esbuildOptions || {}),
        external: Array.from(new Set([...
          ((((config.optimizeDeps as any)?.esbuildOptions || {}).external) || []),
          'esm-env'
        ]))
      }
    } as any;
    config.ssr = {
      ...(config.ssr || {}),
      noExternal: [
        ...((config.ssr && config.ssr.noExternal) || []),
        '@storybook/svelte',
        '@storybook/addon-svelte-csf',
      ],
    };
    // Allow serving files from the monorepo root and explicit pnpm store paths
    config.server = {
      ...(config.server || {}),
      fs: {
        ...((config.server && (config.server as any).fs) || {}),
        allow: Array.from(new Set([
          ...(((config.server as any)?.fs?.allow) || []),
          resolve(root),
          resolve(root, '..'),
          resolve(root, '..', '..'),
          resolve(root, 'node_modules'),
          resolve(root, 'node_modules', '.pnpm'),
        ]))
      }
    } as any;
    return config;
  },

  docs: {
    autodocs: false
  }
};
