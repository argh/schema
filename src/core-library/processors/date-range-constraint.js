
import { ConstraintError } from '../../errors.js';
import { parseDate } from '../../helpers/parse-date.js';

/**
 * ## $date-range
 *
 * Validates that a date value falls within the specified range (inclusive).
 * Can specify minimum, maximum, or both bounds.  Bounds are parsed using
 * the same rules as the `date` schema normalizer, so strings, numbers,
 * and Date objects are all accepted.
 *
 * ### Parameters
 * - `min` (optional): Minimum date (inclusive). If omitted, no lower bound.
 * - `max` (optional): Maximum date (inclusive). If omitted, no upper bound.
 *
 * ### Example
 * ```js
 * // Object form with named parameters
 * new Schema('date').validator({'$date-range': {min: '2024-01-01', max: '2024-12-31'}})
 *
 * // Cross-reference: end date must be >= start date
 * new Schema('object')
 *   .property('start', new Schema('date'))
 *   .property('end', new Schema('date').validator({'$date-range': {min: {$reference: '^start'}}}))
 * ```
 *
 * @type {import("../../value-processor/value-processor.js").ValueProcessorDefinition}
 */
export const DATE_RANGE_CONSTRAINT = {
  keyword: 'date-range',
  parameters: [
    { parameter: 'min', default: undefined },
    { parameter: 'max', default: undefined },
  ],

  process: (value, _target, _location, options) => {
    const { min, max } = options.args;

    const dateMs = (value instanceof Date ? value : parseDate(value)).getTime();

    if (min !== undefined) {
      const minMs = (min instanceof Date ? min : parseDate(min)).getTime();
      if (dateMs < minMs) {
        throw new ConstraintError(`Date must not be before ${new Date(minMs).toISOString()}`);
      }
    }
    if (max !== undefined) {
      const maxMs = (max instanceof Date ? max : parseDate(max)).getTime();
      if (dateMs > maxMs) {
        throw new ConstraintError(`Date must not be after ${new Date(maxMs).toISOString()}`);
      }
    }
    return value;
  },

  describe: (args) => {
    if (!args) {
      return undefined;
    }

    const minProcessor = (Array.isArray(args) ? args[0] : args.min);
    const maxProcessor = (Array.isArray(args) ? args[1] : args.max);

    const min = minProcessor?.description;
    const max = maxProcessor?.description;

    return min !== undefined && max !== undefined
           ? `${min}..${max}`
           : min !== undefined
             ? `>=${min}`
             : max !== undefined
               ? `<=${max}`
               : undefined;
  }
};
