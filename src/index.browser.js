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
 */

import { registerCoreLibrary } from './schema-resolver.js';
import coreLibrary from './core-library/index.js';

registerCoreLibrary(coreLibrary);

export { CompiledSchema } from './compiled-schema.js';
export { Schema, SchemaPolicy } from './schema.js';
export { SchemaError } from './errors.js'
export { SchemaResolver } from './schema-resolver.js';
export { SchemaLocation } from './schema-location.js';
export { EMPTY } from './constants.js';
