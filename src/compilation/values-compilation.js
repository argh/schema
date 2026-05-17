import { CompiledSchema } from '../compiled-schema.js';
import { SchemaCompiler } from '../schema-compiler.js';
import { SchemaLocation } from '../schema-location.js';
import { SchemaCompilationError } from '../errors.js';
import { isEmpty } from '../helpers/object.js';
/**
 *
 * @param {CompiledSchema} cs
 * @param {any} _
 * @param {SchemaLocation} location
 * @returns {CompiledSchema|Promise<CompiledSchema>}
 * @this {SchemaCompiler}
 */
export function normalizeValues(cs, _, location) {
  const values = cs.options.values ?? [];
  if (isEmpty(cs.options.values)) {
    return cs;
  }

  const valueSet = new Set();

  let vi = 0;

  while (vi < values.length) {
    const value = cs._normalizeValue(values[vi++], undefined, undefined, {sync:true});
    if (value === undefined) {
      throw new SchemaCompilationError(`Undefined after normalizing`, {value, location});
    }
    valueSet.add(value);
  }
  if (valueSet.size) {
    cs.options.values = [...valueSet];
  }
  return cs;
}