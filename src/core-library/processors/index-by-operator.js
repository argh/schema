
import { FunctionValueProcessor } from '../../value-processor/function-value-processor.js';
import { ComposedValueProcessor } from '../../value-processor/composed-value-processor.js';
import { EachExecutor } from '../../executor/each-executor.js';
import { ConstraintError, SchemaError } from '../../errors.js';
import { Executor } from '../../executor/executor.js';
import { ParametersValueProcessor } from "../../value-processor/parameters-value-processor.js";
import { ConditionalExecutor } from '../../executor/conditional-executor.js';
import { formatValue } from '../../helpers/format.js';

/**
 * ## $index-by
 *
 * Groups an array of objects by a unique key, returning an object whose value is the single array element value
 * that has that key.  If the keys are not unique, throws an error.
 *
 * - `{'$index-by': 'key'}` — indexes by the named property on each element
 * - `{'$index-by': processor}` — indexes by the result of executing the processor against each element
 *
 * Elements where the extracted key is `undefined` are omitted from the result.
 *
 * ### Parameters
 * - `key` (string): Property name to group by, or a processor that extracts
 *   the grouping key from each element.  If you use a bare argument or a single element array,
 *   it is assumed to be the key.
 * - `processor`: Must be passed via object parameter.  Must be a processor that will parse the provided
 *   element and return the index key.  The outer collection is passed to the processor as `options.input`.
 *
 * ### Example
 * ```js
 * // TODO
 * ```
 *
 * @type {import('../../value-processor/value-processor.js').ValueProcessorDefinition}
 */
export const INDEX_BY_OPERATOR = {
  keyword: 'index-by',
  parameters: [{parameter: 'processor', required: true}],
  build: (args) => {

    let processor;
    let keyProcessor;

    if (Array.isArray(args)) {
      if (args.length !== 1) {
        throw new SchemaError(`$index-by requires only a single key, or extended arguments with a processor`);
      }
      keyProcessor = args[0];
    }
    else if (typeof args === 'object') {
      keyProcessor = args.key;
      processor = args.processor;
    }
    if (keyProcessor) {
      if (processor) {
        throw new SchemaError(`$index-by requires only a key or a processor, not both`);
      }
      processor = new FunctionValueProcessor((value, target, location, options) => {
        const result = keyProcessor.execute(value, target, location, {...options, input: value});

        if (result instanceof Promise) {
          return result.then(resolved => (resolved !== undefined)? value?.[resolved] : undefined)
        }
        return result !== undefined ? value?.[result] : undefined;
      })
    }

    if (!processor) {
      throw new SchemaError(`$index-by requires a key or processor argument`);
    }

    return new ComposedValueProcessor(
      new EachExecutor(
        processor,
        (input) => {
          if (!Array.isArray(input)) {
            throw new ConstraintError(`$index-by requires an array, got ${formatValue(input)}`);
          }
          return input;
        },
        (keys, input) => {
          const result = {};
          for (let i = 0; i < input.length; i++) {
            const key = keys[i];
            if (key === undefined) continue;
            if (result[String(key)] !== undefined) {
              // todo - add a conflict policy argument, e.g. "first", "last", "error"
              throw new ConstraintError(`$index-by requires unique keys, got duplicate key ${key}`);
            }
            result[String(key)] = input[i];
          }
          return result;
        }
      ),
      {'$index-by': args}
    );
  }
};
