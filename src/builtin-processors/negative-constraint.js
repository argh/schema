import { ConstraintError } from '../errors.js';

/**
 * ## $negative
 *
 * Validates that a numeric value is negative (less than 0).
 * Input must already be a number; use `$number` in a prior normalizer if coercion from string is needed.
 *
 * See also
 * - `$positive` for the opposite constraint
 * - `$range` for more explicit control (e.g. "non-positive, less than or equal to 0")
 *
 * @type {import("../value-processor/value-processor.js").ValueProcessorDefinition}
 */
export const NEGATIVE_CONSTRAINT = {
  keyword: 'negative',
  process: (value) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value >= 0) {
      throw new ConstraintError('Must be a negative number');
    }
    return value;
  }
};
