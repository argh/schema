// Copyright 2026 Version Zero | github.com/argh
// SPDX-License-Identifier: Apache-2.0

/**
 * @module
 * @mergeModuleWith <project>
 */

// Register core libraries before any SchemaResolver is constructed.
// The node library is conditionally loaded based on runtime detection.
import { registerCoreLibrary } from './schema-resolver.js';
import coreLibrary from './core-library/index.js';

registerCoreLibrary(coreLibrary);

const IS_NODE = typeof globalThis.process !== 'undefined'
  && typeof globalThis.process.versions?.node === 'string';

if (IS_NODE) {
  const { default: coreLibraryNode } = await import('./core-library-node/index.js');
  registerCoreLibrary(coreLibraryNode);
}

export { CompiledSchema } from './compiled-schema.js';
export { Schema, SchemaPolicy } from './schema.js';
export { SchemaError } from './errors.js'
export { SchemaResolver } from './schema-resolver.js';
export { SchemaLocation } from './schema-location.js';
export { EMPTY } from './constants.js';
