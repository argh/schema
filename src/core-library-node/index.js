import { BUFFER_SCHEMA } from './schemas/buffer-schema.js';

/** @import { ValueProcessorDefinition } from '../value-processor/value-processor.js' */
/** @import { SchemaResolver } from '../schema-resolver.js' */

let modules;
try {
  modules ??= await Promise.all([
    import('./processors/base64-decode-operator.js'),
    import('./processors/base64-encode-operator.js'),
    import('./processors/buffer-operator.js'),
    import('./processors/directory-constraint.js'),
    import('./processors/executable-constraint.js'),
    import('./processors/file-constraint.js'),
    import('./processors/file-size-constraint.js'),
    import('./processors/is-buffer-constraint.js'),
    import('./processors/readable-constraint.js'),
    import('./processors/reachable-constraint.js'),
    import('./processors/writable-constraint.js'),
  ]);
}
catch (error) {
  throw new Error('Failed to load Node.js processors', { cause: error });
}

/** @type {ValueProcessorDefinition[]} */
const NODE_PROCESSORS = modules.flatMap(
  ns => Object.values(ns).filter(v => v && typeof v.keyword === 'string')
);

/**
 * Node.js-specific schemas and processors.
 *
 * Loaded automatically when running under Node.js.  Registers the `buffer`
 * schema type and processors that depend on `node:fs`, `node:dns`, or the
 * Node.js `Buffer` global.
 *
 * @param {SchemaResolver} resolver
 * @param {object} options
 */
export default function coreLibraryNode(resolver, options) {
  resolver.registerSchema('buffer', BUFFER_SCHEMA);

  for (const definition of NODE_PROCESSORS) {
    resolver.registerValueProcessorDefinition(definition);
  }
}
