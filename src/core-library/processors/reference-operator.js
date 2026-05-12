import { deepValue } from '../../helpers/deep.js';

import { SchemaError } from '../../errors.js';

/**
 * ## $reference
 *
 * Returns the value at the referenced path (relative to the current schema) in the target data, or undefined if not set.
 *
 * Throws a `SchemaError` if the specified path is not defined in the schema.
 *
 * ### Parameters
 * - `path` (string, required): path from the current schema into the top-level target object; must be a valid
 *   schema path (dot-separated, supports / for absolute or ^ for parents).
 * - `pending` (boolean, optional, default: false): If true will fall back to any pending value not yet in the target data.
 * - `completed` (boolean, optional, default: false): If true, will only return a value if the reference is completed (useful for checking if all children are handled).
 *
 * ### Example
 * ```js
 * // Validate 'port' is within range only when 'ssl' is enabled at the top level
 * new Schema('object', {
 *   ssl: new Schema('boolean'),
 *   port: new Schema('number').validator({
 *     $if: [{$reference: 'ssl'}, {$range: {min: 443, max: 443}}]
 *   }),
 * })
 *
 * // Cross-field consistency: confirm 'passwordConfirm' matches 'password'
 * new Schema('object', {
 *   password: new Schema('string'),
 *   passwordConfirm: new Schema('string').validator(
 *     (value, target) => value === target.password || undefined
 *   ),
 * })
 * ```
 * ### See Also
 * - Use `$property` for getting a named child value.
 * - Use `$get` for getting values under the input value (without the path needing to be in the schema.)
 *
 * @type {import("../../value-processor/value-processor.js").ValueProcessorDefinition}
 */
export const REFERENCE_OPERATOR = {
  keyword: 'reference',
  parameters: [{parameter: 'path', required: true}, {parameter: 'pending', required: false, default: false}, {parameter: 'completed', required: false, type: 'boolean', default: false}],
  process: (_, target, location, options) => {
    const path = options.args.path;
    if (path === undefined) {
      throw new SchemaError('$reference expects a path')
    }
    const state = options.state.getRelativeState(path);

    const requireCompleted = options.args.completed;

    if (state === undefined) {
      if (requireCompleted) {
        return undefined;  // welp.
      }
      // We're lost.  Maybe we can find it in the target data?
      const resolvedLocation = location.relative(path);
      return resolvedLocation? deepValue(target, resolvedLocation.path) : undefined;
    }
    if (requireCompleted && !state.completed) {
      return undefined;
    }
    if (state.value !== undefined) {
      return state.value;
    }
    if (options.args.pending) {
      return state.pending;
    }
    return undefined;
  },
  /*
      description: `${path}`
    };
  }

   */
};
