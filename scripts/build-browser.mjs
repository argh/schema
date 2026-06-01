// Builds the browser distribution: the main esbuild bundle of the universal
// core, plus thin re-export proxies for the `./helpers` and `./errors`
// subpaths. The proxies point back at the main bundle so consumers loading
// multiple subpaths share one cached download instead of each subpath
// pulling its own copy of the dependency closure.
//
// The proxy name lists are discovered by importing the source modules —
// no manual sync needed when the surface area changes.

import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const BANNER = '/* @versionzero/schema | Apache-2.0 | github.com/argh */';

await mkdir(DIST, { recursive: true });

// ── main bundle ────────────────────────────────────────────────────────────
// `keepNames` preserves class + function identifiers under minification — the
// library's error classes (`ValidationError`, `ConstraintError`, …) carry
// meaning that user code introspects via `.name` / `instanceof`. The size cost
// is modest; the UX win for downstream debugging is significant.
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

// ── subpath proxies ────────────────────────────────────────────────────────
async function namedExportsOf(absSrc) {
  // Importing the source ESM gives us the real set of public names without
  // regex-parsing brittleness; any rename/addition/removal flows through.
  const mod = await import(absSrc);
  return Object.keys(mod).filter((k) => k !== 'default');
}

async function writeProxy(outFile, srcFile, label) {
  const names = await namedExportsOf(join(ROOT, srcFile));
  const body =
    `${BANNER}\n` +
    `// Browser proxy for \`@versionzero/schema/${label}\`. Re-exports the public\n` +
    `// surface from the main bundle so importing this subpath shares one cached\n` +
    `// HTTP request with the main bundle. Names mirror \`${srcFile}\`.\n` +
    `export {\n  ${names.join(',\n  ')},\n} from './schema.browser.mjs';\n`;
  await writeFile(outFile, body);
  return names.length;
}

const h = await writeProxy(join(DIST, 'helpers.browser.mjs'), 'src/helpers/index.js', 'helpers');
console.log(`  ✓ dist/helpers.browser.mjs (proxy, ${h} names)`);

const e = await writeProxy(join(DIST, 'errors.browser.mjs'), 'src/errors.js', 'errors');
console.log(`  ✓ dist/errors.browser.mjs (proxy, ${e} names)`);
