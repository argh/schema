import { deepEquals } from "../helpers/deep.js";
import { formatValue } from '../errors.js';
import { ConstraintError } from '../errors.js';

/**
 * ## $eq
 *
 * Do a deep equality check between the value and the provided constraint value.
 *
 * ### Parameters
 * - `value` (any, required): The value to compare against using deep equality.
 *
 * ### Example
 * ```js
 * // Ensure a status field can only be 'active'
 * new Schema('string').validator({$eq: 'active'})
 *
 * // Ensure an object matches an exact structure
 * new Schema('object').validator({$eq: {type: 'config', version: 1}})
 * ```
 *
 * @type {import("../value-processor/value-processor.js").ValueProcessorDefinition}*
 */
export const EQ_CONSTRAINT = {
  keyword: 'eq',
  parameters: [ { parameter: 'value', required: true }, { parameter: 'compare' } ],

  process: (value, _target, location, options) => {
    const eqValue = options.args['value'];
    const compare = options.args['compare'] ?? value;

    if (!deepEquals(eqValue, compare)) {
      throw new ConstraintError(`Value ${formatValue(value)} was not equal to constraint`, {value, location});
    }
    return value;
  }
}
