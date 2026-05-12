import { ANY_SCHEMA } from './schemas/any-schema.js';
import { STRING_SCHEMA } from './schemas/string-schema.js';
import { NUMBER_SCHEMA } from './schemas/number-schema.js';
import { BOOLEAN_SCHEMA } from './schemas/boolean-schema.js';
import { OBJECT_SCHEMA } from './schemas/object-schema.js';
import { ARRAY_SCHEMA } from './schemas/array-schema.js';
import { DATE_SCHEMA } from './schemas/date-schema.js';
import { FUNCTION_SCHEMA } from './schemas/function-schema.js';
import { ROOT_SCHEMA } from './schemas/root-schema.js';
import { getBuiltinProcessors } from './processors/index.js';

/** @import { SchemaResolver } from '../schema-resolver.js' */

/**
 * @param {SchemaResolver} resolver
 * @param {object} options
 */
export default function coreLibrary(resolver, options) {
  resolver.registerSchema('root-schema', ROOT_SCHEMA);
  resolver.registerSchema('any', ANY_SCHEMA);
  resolver.registerSchema('string', STRING_SCHEMA);
  resolver.registerSchema('number', NUMBER_SCHEMA);
  resolver.registerSchema('boolean', BOOLEAN_SCHEMA);
  resolver.registerSchema('object', OBJECT_SCHEMA);
  resolver.registerSchema('array', ARRAY_SCHEMA);
  resolver.registerSchema('date', DATE_SCHEMA);
  resolver.registerSchema('function', FUNCTION_SCHEMA);

  for (const definition of getBuiltinProcessors()) {
    resolver.registerValueProcessorDefinition(definition);
  }
}
