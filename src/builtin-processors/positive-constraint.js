import { ConstraintError } from '../errors.js';

/**
 * ## $positive
 *
 * Validates that a numeric value is positive (greater than 0).
 * Input must already be a number; use `$number` in a prior normalizer if coercion from string is needed.
 *
 * See also:
 * - `$negative` to enforce the opposite constraint
 * - `$range` if you want "non-negative" ( greater than or equal to 0) semantics.
 *
 * @type {import("../value-processor/value-processor.js").ValueProcessorDefinition}
 */
export const POSITIVE_CONSTRAINT = {
  keyword: 'positive',
  process: (value) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      throw new ConstraintError('Must be a positive number');
    }
    return value;
  }
};
