import { Executor, toExecutor } from './executor.js';
import { isTruthy } from '../helpers/truthy.js';

/**
 * Call a sequence of executors on the input until one returns a truthy value.  Exceptions/rejections are caught and
 * interpreted as a falsey value.  Return the first successful truthy result, or undefined on failure.
 *
 * @template T
 * @augments {Executor<T>}
 */
export class SequenceExecutor extends Executor {
  #executors;

  #criteriaBehavior;
  #checkBehavior;
  #returnBehavior;
  #errorBehavior;

  /**
   * @param {Array<any>|any} [executors]
   * @param {symbol[]} [flags]
   */
  constructor(executors = [], flags = []) {
    if (!Array.isArray(executors)) {
      executors = [executors];
    }
    super();
    this.#executors = executors.map((/** @type {any} */ item) => toExecutor(item));

    for (const flag of flags) {
      if (flag === SequenceExecutor.ALL_CRITERIA) {
        this.#criteriaBehavior = flag;
      }
      else if (flag === SequenceExecutor.ANY_CRITERIA) {
        this.#criteriaBehavior = flag;
      }
      else if (flag === SequenceExecutor.EXCLUSIVE_CRITERIA) {
        this.#criteriaBehavior = flag;
      }
      else if (flag === SequenceExecutor.SUCCESS_CHECK) {
        this.#checkBehavior = flag;
      }
      else if (flag === SequenceExecutor.DEFINED_CHECK) {
        this.#checkBehavior = flag;
      }
      else if (flag === SequenceExecutor.TRUTHY_CHECK) {
        this.#checkBehavior = flag;
      }
      else if (flag === SequenceExecutor.INPUT_RETURN) {
        this.#returnBehavior = flag;
      }
      else if (flag === SequenceExecutor.RESULT_RETURN) {
        this.#returnBehavior = flag;
      }
      else if (flag === SequenceExecutor.RETHROW_ERRORS) {
        this.#errorBehavior = flag;
      }
      else if (flag === SequenceExecutor.CAPTURE_ERRORS) {
        this.#errorBehavior = flag;
      }
      else {
        throw new Error(`Unknown flag`);
      }
    }

    this.#criteriaBehavior ??= SequenceExecutor.ALL_CRITERIA;
    this.#checkBehavior ??= SequenceExecutor.SUCCESS_CHECK;
    this.#returnBehavior ??= SequenceExecutor.INPUT_RETURN;
    this.#errorBehavior ??= SequenceExecutor.RETHROW_ERRORS;
  }
  /**
   * @param {any} input
   * @param {...any} extra
   * @returns {T|null|undefined|Promise<T|null|undefined>}
   */
  execute(input, ...extra) {
    let lastResult = undefined;
    let successCount = 0;
    let failureCount = 0;
    let current = 0;

    const criteriaSatisfied = () => {
      switch(this.#criteriaBehavior) {
        case SequenceExecutor.ANY_CRITERIA:       return successCount > 0;
        case SequenceExecutor.EXCLUSIVE_CRITERIA: return successCount === 1 && current === this.#executors.length;
        case SequenceExecutor.ALL_CRITERIA:       return successCount === this.#executors.length;
      }
      return false;
    }

    const criteriaFailed = () => {
      switch (this.#criteriaBehavior) {
        case SequenceExecutor.ANY_CRITERIA:       return successCount === 0 && current === this.#executors.length;
        case SequenceExecutor.EXCLUSIVE_CRITERIA: return successCount > 1;
        case SequenceExecutor.ALL_CRITERIA:       return failureCount > 0;
      }
      return false;
    }
    /**
     * @returns {Promise<any>}
     */
    const resume = async () => {
      while (current < this.#executors.length) {
        if (criteriaFailed() || criteriaSatisfied()) {
          break;
        }
        try {
          const result = await this.#executors[current++].execute(input, ...extra);
          handleResult(result);
        }
        catch (error) {
          if (this.#checkBehavior === SequenceExecutor.SUCCESS_CHECK) {
            return undefined;
          }
          handleFailure(error);
        }
      }
      return finalResult();
    }


    /** @param {any} result */
    const handleResult = (result) => {
      const success = this.#checkBehavior === SequenceExecutor.TRUTHY_CHECK
                      ? isTruthy(result)
                      : this.#checkBehavior === SequenceExecutor.DEFINED_CHECK
                        ? result !== undefined
                        : true;

      if (success) {
        successCount++;
      }
      else {
        failureCount++;
      }

      if (!criteriaFailed()) {
        lastResult = result;
      }
    }
    /** @param {Error} error */
    const handleFailure = (error) => {
      if (this.#errorBehavior === SequenceExecutor.RETHROW_ERRORS) {
        throw error;
      }
      // an exception/rejection fails all three check types.
      failureCount++;
    }

    const finalResult = () => {
      if (criteriaSatisfied()) {
        return this.#returnBehavior === SequenceExecutor.RESULT_RETURN ? lastResult : input;
      }
      return undefined;
    }

    const executors = this.#executors;

    while (current < executors.length) {
      let result;
      try {
        result = executors[current++].execute(input, ...extra);
        if (result instanceof Promise) {
          return result.then(
            resolved => {
              handleResult(resolved);
              return resume();
            },
            rejected => {
              handleFailure(rejected);
              return resume();
            })
        }
        handleResult(result);
      }
      catch (error) {
        handleFailure(error);
        if (this.#checkBehavior === SequenceExecutor.SUCCESS_CHECK) {
          return undefined;
        }
      }

      if (criteriaFailed() || criteriaSatisfied()) {
        break;
      }
    }
    return finalResult();
  }


  static ANY_CRITERIA = Symbol('ANY-CRITERIA');
  static ALL_CRITERIA = Symbol('ALL-CRITERIA');
  static EXCLUSIVE_CRITERIA = Symbol('EXCLUSIVE-CRITERIA');

  static TRUTHY_CHECK = Symbol('TRUTHY-CHECK');
  static DEFINED_CHECK = Symbol('DEFINED-CHECK');
  static SUCCESS_CHECK = Symbol('SUCCESS-CHECK');

  static RESULT_RETURN = Symbol('RESULT-RETURN');
  static INPUT_RETURN = Symbol('INPUT-RETURN');

//  static THROW_ERRORS = Symbol('THROW-ERRORS');  // todo - consider throwing on undefined in handleResult?
  static RETHROW_ERRORS = Symbol('RETHROW-ERRORS');
  static CAPTURE_ERRORS = Symbol('CAPTURE-ERRORS');

}
