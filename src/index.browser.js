// Copyright 2026 Version Zero | github.com/argh
// SPDX-License-Identifier: Apache-2.0

/**
 * @module
 * @mergeModuleWith <project>
 *
 * Browser entry point. Registers only the universal core library and omits the
 * Node-only library (and its `node:*` dependencies), so the module graph can be
 * bundled into a single artifact with no conditional/dynamic imports. This is
 * the source for `dist/schema.browser.mjs`; see the `browser` export condition.
 *
 * Also re-exports the `helpers` and `errors` public surface, so this single
 * bundle serves all three subpaths (`.`, `./helpers`, `./errors`). The
 * `dist/helpers.browser.mjs` and `dist/errors.browser.mjs` artifacts are thin
 * re-export proxies pointing back at this bundle — one cached HTTP fetch covers
 * any subset of the public surface a consumer needs.
 */

import { registerCoreLibrary } from './schema-resolver.js';
import coreLibrary from './core-library/index.js';

registerCoreLibrary(coreLibrary);

export { CompiledSchema } from './compiled-schema.js';
export { Schema, SchemaPolicy } from './schema.js';
export { SchemaResolver } from './schema-resolver.js';
export { SchemaLocation } from './schema-location.js';
export { EMPTY } from './constants.js';

// Subpath surface — served by the same bundle; the `./{helpers,errors}` proxy
// files re-export from here. Explicit `SchemaError` export below is redundant
// (it's in `errors.js`) but kept for parity with the original headline list.
export { SchemaError } from './errors.js';
export * from './helpers/index.js';
export * from './errors.js';
