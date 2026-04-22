
import { ConditionalExecutor } from '../executor/conditional-executor.js';
import { ValueProcessor } from '../value-processor/value-processor.js';
import { ComposedValueProcessor } from '../value-processor/composed-value-processor.js';
import { SequenceExecutor } from '../executor/sequence-executor.js';
import { formatValue } from '../errors.js';
import { ConstraintError, ResolverError } from '../errors.js';

/**
 * @import {ValueProcessorDefinition} from '../value-processor/value-processor.js'
 */

/**
 *
 * @param {string} keyword
 * @param {string} joiner
 * @param {(processors:ValueProcessor[], spec:any, description:string) => ValueProcessor} builder
 * @returns {function(*): *}
 * @package
 */
function generateBuilderFunction(keyword, joiner, builder) {
  return (args) => {

    let processors;
    if (Array.isArray(args)) {
      processors = args;
    }
    else if (typeof args === 'object' && args !== null) {
      processors = Object.values(args);
    }
    if (!Array.isArray(processors)) {
      throw new ResolverError(`${keyword} requires an array of processors`);
    }
    const spec = {[keyword]: processors.map(a => a.spec)};
    const descriptions = processors.map(c => c.description).filter((d) => d !== undefined);
    const description = descriptions.length > 1
                        ? descriptions.map(d => d.includes('&') ? `(${d})` : d).join(joiner)
                        : descriptions[0]

    return builder(processors, spec, description);
  }
}


/**
 * ## $or
 *
 * A constraint that checks whether any of the provided processors return a truthy value.
 *
 * Returns the first truthy value from the processors, or throws if none are truthy.
 * Be careful to not use this in a situation where the provided processors may require late-resolved values!
 * This works best in finalizers, validators, or in opaque schema transformers.
 *
 * See `$any` if you want to check for success (defined value) instead of truthiness
 *
 * ### Parameters
 * - `processors` (`Array<ProcessorSpec>`, required): Array of processor specifications, at least one of which must return a truthy value.
 *
 * ### Example
 * ```js
 * // Accept either a valid hostname or a valid IPv4 address
 * new Schema('string').validator({$or: ['$hostname', '$ipv4']})
 *
 * // Accept a port number OR the string 'auto'
 * new Schema('any').validator({
 *   $or: [
 *     {$range: {min: 1, max: 65535}},
 *     {$eq: 'auto'},
 *   ]
 * })
 * ```
 *
 * @type {ValueProcessorDefinition}
 */
export const OR_CONSTRAINT = {
  keyword: 'or',
  build: generateBuilderFunction('$or', ' | ',
    (processors, spec, description) => (
      new ComposedValueProcessor(
        new ConditionalExecutor(
          new SequenceExecutor(processors, [
            SequenceExecutor.TRUTHY_CHECK,
            SequenceExecutor.ANY_CRITERIA,
            SequenceExecutor.RESULT_RETURN,
            SequenceExecutor.CAPTURE_ERRORS
          ]),
          {
            failure: (value) => {
              throw new ConstraintError(`None of the $or conditions ${formatValue(description)} matched`,{value});
            }
          },
          [ConditionalExecutor.CHECK_TRUTHY]
        ), spec, description)
    )
  )
};

/**
 * ## $and
 *
 * A constraint that checks whether all the provided processors return a truthy value.
 *
 * Returns the last truthy value from the processors, or throws if any are falsey.
 * Be careful to not use this in a situation where the provided processors may require late-resolved values!
 * This works best in finalizers, validators, or in opaque schema transformers.
 *
 * See `$all` if you want to check for success (defined value) instead of truthiness
 *
 * ### Parameters
 * - `processors` (`Array<ProcessorSpec>`, required): Array of processor specifications, all of which must return a truthy value.
 *
 * ### Example
 * ```js
 * // Require a string to be both non-empty and a valid email
 * new Schema('string').validator({$and: ['$non-empty', '$email']})
 *
 * // Require a number to be positive and within range
 * new Schema('number').validator({
 *   $and: ['$positive', {$range: {max: 1000}}]
 * })
 * ```
 *
 * @type {ValueProcessorDefinition}
 */
export const AND_CONSTRAINT = {
  keyword: 'and',
  build: generateBuilderFunction('$and', ' & ',
    (processors, spec, description) => (
      new ComposedValueProcessor(
        new ConditionalExecutor(
          new SequenceExecutor(processors, [
            SequenceExecutor.TRUTHY_CHECK,
            SequenceExecutor.ALL_CRITERIA,
            SequenceExecutor.RESULT_RETURN,
            SequenceExecutor.CAPTURE_ERRORS
          ]),
          {
            failure: (value) => {
              throw new ConstraintError(`Not all $and conditions ${formatValue(description)} matched`, {value});
            }
          },
          [ConditionalExecutor.CHECK_TRUTHY]
        ), spec, description)
    )
  )
};

/**
 * ## $any
 *
 * A constraint that checks whether any of the provided processors return a defined value.
 * (Not to be confused with the unrelated "any" schema!)
 *
 * Returns the first defined value from the processors, or throws if none returned a defined value.
 * Be careful to not use this in a situation where the provided processors may require late-resolved values!
 * This works best in finalizers, validators, or in opaque schema transformers.
 *
 * See `$or` if you want to check for truthiness instead of a defined value.
 *
 * ### Parameters
 * - `processors` (`Array<ProcessorSpec>`, required): Array of processor specifications, at least one of which must return a defined value.
 *
 * ### Example
 * ```js
 * // Accept a value that matches any of several pattern-based normalizations
 * new Schema('string').normalizer({
 *   $any: [
 *     {$match: /^\d+$/},
 *     {$match: /^[a-f0-9]+$/i},
 *   ]
 * })
 *
 * // Require a value that can be processed by at least one schema
 * new Schema('any').validator({$any: ['$numeric', '$boolean', '$date']})
 * ```
 *
 * @type {ValueProcessorDefinition}
 */
export const ANY_CONSTRAINT = {
  keyword: 'any',
  build: generateBuilderFunction('$any', ' ∧ ',
    (processors, spec, description) => (
      new ComposedValueProcessor(
        new ConditionalExecutor(
          new SequenceExecutor(processors, [
            SequenceExecutor.DEFINED_CHECK,
            SequenceExecutor.ANY_CRITERIA,
            SequenceExecutor.RESULT_RETURN,
            SequenceExecutor.CAPTURE_ERRORS
          ]),
        {
          failure: (value) => {
            throw new ConstraintError(`None of the $any conditions ${formatValue(description)} succeeded`, {value});
          }
        },
        [ConditionalExecutor.CHECK_DEFINED]
        ), spec, description)
    )
  )
};

/**
 * ## $all
 *
 * A constraint that checks whether all the provided processors return a defined value.
 *
 * Returns the last defined value returned from the processors, or throws if any returned undefined or threw an error.
 * Be careful to not use this in a situation where the provided processors may require late-resolved values!
 * This works best in finalizers, validators, or in opaque schema transformers.
 *
 * See `$and` if you want to check for truthiness instead of defined values.
 *
 * ### Parameters
 * - `processors` (`Array<ProcessorSpec>`, required): Array of processor specifications, all of which must return a defined value.
 *
 * ### Example
 * ```js
 * // Validate that all normalizations succeed for a value that must satisfy multiple constraints
 * new Schema('string').validator({
 *   $all: ['$non-empty', '$email', {$matches: /\.com$/}]
 * })
 *
 * // Ensure a value passes both a type check and a range constraint
 * new Schema('any').validator({$all: ['$numeric', {$range: {min: 0, max: 100}}]})
 * ```
 *
 * @type {ValueProcessorDefinition}
 */
export const ALL_CONSTRAINT = {
  keyword: 'all',
  build: generateBuilderFunction('$all', ' · ',
    (processors, spec, description) => (
      new ComposedValueProcessor(
        new ConditionalExecutor(
          new SequenceExecutor(processors, [
            SequenceExecutor.DEFINED_CHECK,
            SequenceExecutor.ALL_CRITERIA,
            SequenceExecutor.RESULT_RETURN,
            SequenceExecutor.CAPTURE_ERRORS
          ]),
          {
            failure: (value) => {
              throw new ConstraintError(`Not all $all conditions ${formatValue(description)} succeeded`, {value})
            }
          },
          [ConditionalExecutor.CHECK_DEFINED]
        ), spec, description)
    )
  )

};


/**
 * ## $exclusive
 *
 * A constraint that checks whether exactly one of the provided processors returns a truthy value.
 *
 * Returns the single truthy value, or throws if zero or more than one are truthy.
 * Be careful to not use this in a situation where the provided processors may require late-resolved values!
 * This works best in finalizers, validators, or in opaque schema transformers.

 * See `$one` if you want to check for success (defined value) instead of truthiness.
 *
 * ### Parameters
 * - `processors` (`Array<ProcessorSpec>`, required): Array of processor specifications, exactly one of which must return a truthy value.
 *
 * ### Example
 * ```js
 * // A form field must have either an email or a phone number, but not both
 * new Schema('object').validator({
 *   $exclusive: [
 *     {$property: 'email'},
 *     {$property: 'phone'},
 *   ]
 * })
 * ```
 *
 * @type {ValueProcessorDefinition}
 */
export const EXCLUSIVE_CONSTRAINT = {
  keyword: 'exclusive',
  build: generateBuilderFunction('$exclusive', ' ⊕ ',
    (processors, spec, description) => (
      new ComposedValueProcessor(
        new ConditionalExecutor(
          new SequenceExecutor(processors, [
            SequenceExecutor.TRUTHY_CHECK,
            SequenceExecutor.EXCLUSIVE_CRITERIA,
            SequenceExecutor.RESULT_RETURN,
            SequenceExecutor.CAPTURE_ERRORS
          ]),
          {
            failure: (value) => {
              throw new ConstraintError(`Exactly one of the $exclusive conditions ${formatValue(description)} must match`, {value});
            }
          },
          [ConditionalExecutor.CHECK_TRUTHY]
        ), spec, description)
    )
  )
};

/**
 * ## $one
 *
 * A constraint that checks whether exactly one of the provided processors returns a defined value.
 *
 * Returns the single defined value, or throws if zero or more than one succeed.
 * Be careful to not use this in a situation where the provided processors may require late-resolved values!
 * This works best in finalizers, validators, or in opaque schema transformers.

 * See `$exclusive` if you want to check for truthiness instead of a defined value.
 *
 * ### Parameters
 * - `processors` (`Array<ProcessorSpec>`, required): Array of processor specifications, exactly one of which must return a defined value.
 *
 * ### Example
 * ```js
 * // Exactly one authentication method must be configured
 * new Schema('object').validator({
 *   $one: [
 *     {$property: 'apiKey'},
 *     {$property: 'oauth'},
 *     {$property: 'basicAuth'},
 *   ]
 * })
 * ```
 *
 * @type {ValueProcessorDefinition}
 */
export const ONE_CONSTRAINT = {
  keyword: 'one',
  build: generateBuilderFunction('$one', ' ⊕ ',
    (processors, spec, description) => (
      new ComposedValueProcessor(
        new ConditionalExecutor(
          new SequenceExecutor(processors, [
            SequenceExecutor.DEFINED_CHECK,
            SequenceExecutor.EXCLUSIVE_CRITERIA,
            SequenceExecutor.RESULT_RETURN,
            SequenceExecutor.CAPTURE_ERRORS
          ]),
          {
            failure: (value) => {
              throw new ConstraintError(`Exactly one of the $one conditions ${formatValue(description)} must succeed`, {value});
            }
          },
          [ConditionalExecutor.CHECK_DEFINED]
        ), spec, description)
    )
  )
};
/**
 * ## $first
 *
 * An operator that returns the first defined value successfully returned from a sequence of processors.
 *
 * Unlike `$any`, no exception is thrown if there are no defined results, it simply returns `undefined`.
 * Be careful to not use this in a situation where the provided processors may require late-resolved values!
 * This works best in finalizers, validators, or in opaque schema transformers.
 *
 * There is no truthy variant of `$first`, as there generally isn't much value in differentiating which
 * truthy value to return; use constructs like `{$if: {$or: [...]}}` to wrap truthy sequence constraints as operators.
 * `$first` is basically an alias for `{$gate: {$any: [...]}}`.
 *
 * ### Parameters
 * - `processors` (`Array<ProcessorSpec>`, required): Array of processor specifications to try in order.
 *
 * ### Example
 * ```js
 * // Try several environment variable names and return the first one that has a value
 * new Schema('object').transformer({
 *   $first: [
 *     {$reference: 'DATABASE_URL'},
 *     {$reference: 'DB_URL'},
 *     {$reference: 'POSTGRES_URL'},
 *   ]
 * })
 *
 * // Return the first successfully parsed format
 * new Schema('string').normalizer({
 *   $first: ['$number', '$date', '$boolean']
 * })
 * ```
 *
 * @type {ValueProcessorDefinition}
 */
export const FIRST_OPERATOR = {
  keyword: 'first',
  build: generateBuilderFunction('$first', ' ?? ',
    (processors, spec, description) => (
      new ComposedValueProcessor(
        new ConditionalExecutor(
          new SequenceExecutor(processors, [
            SequenceExecutor.DEFINED_CHECK,
            SequenceExecutor.ANY_CRITERIA,
            SequenceExecutor.RESULT_RETURN,
            SequenceExecutor.CAPTURE_ERRORS
          ]),
          {},
          [ConditionalExecutor.CHECK_DEFINED, ConditionalExecutor.PASS_RESULT]
        ), spec, description)
    )
  )
};