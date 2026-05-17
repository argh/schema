import { ConstraintError } from '../../errors.js';
import { formatValue } from '../../helpers/format.js';

/**
 * ## $instanceof
 *
 * Validates that the input is an instance of the specified constructor.
 *
 * ### Parameters
 * - `clazz` (Function, required): The constructor function to test against.
 *
 * ### Example
 * ```js
 * // Validate that a value is an instance of a custom class
 * new Schema('any').validator({$instanceof: MyClass})
 *
 * // Validate that a value is a Map
 * new Schema('any').validator({$instanceof: Map})
 *
 * // Validate that a value is an Error
 * new Schema('any').validator({$instanceof: Error})
 * ```
 *
 * @type {import("../../value-processor/value-processor.js").ValueProcessorDefinition}
 */
export const INSTANCEOF_CONSTRAINT = {
  keyword: 'instanceof',
  parameters: [ { parameter: 'clazz', type: 'function', required: true } ],

  process: (value, _target, location, options) => {
    const ctor = options.args['clazz'];
    if (!(value instanceof ctor)) {
      const name = ctor.name || 'anonymous';
      throw new ConstraintError(`Expected instance of ${name}, got ${formatValue(value)}`, {location});
    }
    return value;
  }
}
