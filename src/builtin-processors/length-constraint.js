
import { SchemaLocation } from "../schema-location.js";
import { ConstraintError, ResolverError } from '../errors.js';

/**
 * ## $length
 *
 * Validates that the length of a string or array falls within specified bounds (inclusive).
 * Can specify minimum, maximum, exact length, or any combination of min/max.
 *
 * For strings, length is measured in characters. For arrays, length is measured in elements.
 *
 * ### Parameters
 * - `exact` (number, optional): Exact required length. If specified, min/max are ignored.
 * - `min` (number, optional): Minimum length (inclusive). If omitted, no lower bound.
 * - `max` (number, optional): Maximum length (inclusive). If omitted, no upper bound.
 *
 * - With `{min: 3, max: 10}`: strings "abc" to "abcdefghij", arrays with 3-10 elements
 * - With `{exact: 5}`: string "hello", array [1,2,3,4,5]
 *
 * - With `{min: 3, max: 10}`: string "ab" (too short), array with 11 elements (too long)
 * - With `{exact: 5}`: string "hi" (wrong length), array [1,2,3] (wrong length)
 *
 * ### Example
 * ```js
 * // Validate a username is between 3 and 32 characters
 * new Schema('string').validator({$length: {min: 3, max: 32}})
 *
 * // Require an exact number of elements in an array
 * new Schema('array').validator({$length: 3})
 *
 * // Validate a fixed-length code (e.g., ISO country code)
 * new Schema('string').normalizer('$uppercase').validator({$length: {exact: 2}})
 * ```
 *
 * @type {import("../value-processor/value-processor.js").ValueProcessorDefinition}
 */
export const LENGTH_CONSTRAINT = {
  keyword: 'length',
  parameters: [ { parameter: 'exact', default: undefined, type: 'number' }, { parameter: 'min', default: undefined, type: 'number' }, { parameter: 'max', default: undefined, type: 'number' } ],

  process: (value, _target, _location, options) => {
    const { min, max, exact } = options.args;
    const length = Array.isArray(value) ? value.length : String(value).length;
    const unit = Array.isArray(value) ? 'elements' : 'characters';

    if (exact !== undefined) {
      if (length !== exact) {
        throw new ConstraintError(`Length must be exactly ${exact} ${unit}`);
      }
      return value;
    }
    if (min !== undefined && length < min) {
      throw new ConstraintError(`Length must be at least ${min} ${unit}`);
    }
    if (max !== undefined && length > max) {
      throw new ConstraintError(`Length must be at most ${max} ${unit}`);
    }
    return value;
  },
  describe: (args) => {

    if (!args) {
      return undefined;  // should never happen
    }

    const minProcessor = (Array.isArray(args)? args[0] : args.min);
    const maxProcessor = (Array.isArray(args)? args[1] : args.max);
    const exactProcessor = (Array.isArray(args)? args[2] : args.exact);

    const min = minProcessor?.description;
    const max = maxProcessor?.description;
    const exact = exactProcessor?.description;

    return exact !== undefined
           ? `len=${exact}`
           : min !== undefined && max !== undefined
             ? `len=${min}-${max}`
             : min !== undefined
               ? `len≥${min}`
               : max !== undefined
                 ? `len≤${max}`
                 : undefined
  }
};
