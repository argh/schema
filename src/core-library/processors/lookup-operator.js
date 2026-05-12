import { ComposedValueProcessor } from '../../value-processor/composed-value-processor.js';
import { FunctionValueProcessor } from '../../value-processor/function-value-processor.js';
import { ObjectExecutor } from '../../executor/object-executor.js';
import { SchemaError } from '../../errors.js';
import { deepValue } from '../../helpers/deep.js';

/**
 * ## $lookup
 *
 * Uses the pipeline value as a key to look up a corresponding value from the argument
 * collection. This is the inverse of `$get`: the input value is the key, the argument is the
 * collection.
 *
 * Returns `undefined` if the key is not found in the collection.
 *
 * ### Parameters
 * - Object collection (object, required): The key/value lookup table.
 *
 * ### Example
 * ```js
 * // Map a string value to a numeric code
 * new Schema('string').transformer({$lookup: {low: 1, medium: 2, high: 3}})
 * // 'medium' → 2
 *
 * // Use a role name to look up its permission set
 * new Schema('string').transformer({
 *   $lookup: {$literal: {
 *     admin: ['read', 'write', 'delete'],
 *     editor: ['read', 'write'],
 *     viewer: ['read'],
 *   }}
 * })
 *
 * // Validate that a key exists in the table (require a defined result)
 * new Schema('string').validator({
 *   $require: {$lookup: {$literal: {us: 'United States', uk: 'United Kingdom', ca: 'Canada'}}}
 * })
 * ```
 *
 * @type {import('../../value-processor/value-processor.js').ValueProcessorDefinition}
 */
export const LOOKUP_OPERATOR = {
  keyword: 'lookup',
  parameters: [{parameter: 'from', required: true, type: 'object'}, {parameter: 'path', type: 'string'}],
  process: (value, target, location, options) => {
    // We have a single optional parameter "path", so we know it will automatically get populated with the input value if no argument was supplied
    const {from, path} = options.args;

    if (from === undefined || path === undefined) {
      // we enforce argument passing during compilation; since this is an operator, receiving an undefined
      // collection or path should just be interpreted as "not available".
      return undefined;
    }

    // but we do enforce proper typing!
    if (typeof from !== 'object') {
      throw new SchemaError('$lookup requires an object argument for "from"', {location});
    }
    if (typeof path !== 'string') {
      throw new SchemaError('$lookup requires a string argument for "path"', {location});
    }
    return deepValue(from, path);
  }
}
const LOOKUP_OPERATOR1 = {
  keyword: 'lookup',

  build: (args) => {
    if (typeof args !== 'object' || args === null || Array.isArray(args)) {
      throw new SchemaError('$lookup requires an object argument (the lookup table)');
    }

    const argsSpec = Object.fromEntries(
      Object.entries(args).map(([k, v]) => [k, v?.spec ?? v])
    );

    return new FunctionValueProcessor(
      (value, _target, _location, options) => {
        return options.args?.[value];
      },
      new ComposedValueProcessor(new ObjectExecutor(args), {$lookup: argsSpec})
    );
  }
};
