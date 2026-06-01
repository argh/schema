// Builds the browser distribution: a single self-hosted bundle of the universal
// core, for direct/import-map use without a CDN's per-module request fan-out.
// The bundle re-exports the full public surface (schema, helpers, errors) so one
// download covers everything a consumer needs.
//
// Bundlers (webpack/vite/rollup) and CDN auto-resolvers (jsDelivr `/+esm`,
// esm.sh) do NOT consume this file — they resolve the `browser`/`default` export
// conditions to raw source and do their own bundling. See package.json exports.

import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const BANNER = '/* @versionzero/schema | Apache-2.0 | github.com/argh */';

await mkdir(DIST, { recursive: true });

// `keepNames` preserves class + function identifiers under minification — the
// library's error classes (`ValidationError`, `ConstraintError`, …) carry
// meaning that user code and diagnostics introspect via `.name` / `instanceof`.
// The size cost is negligible; the debugging UX win is significant.
await build({
  entryPoints: [join(ROOT, 'src/index.browser.js')],
  outfile: join(DIST, 'schema.browser.mjs'),
  bundle: true,
  format: 'esm',
  minify: true,
  keepNames: true,
  legalComments: 'none',
  banner: { js: BANNER },
});
console.log('  ✓ dist/schema.browser.mjs (bundle)');
