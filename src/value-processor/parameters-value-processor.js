import { ConstantExecutor, Executor, toExecutor } from '../executor/executor.js';
import { ObjectExecutor } from '../executor/object-executor.js';
import { ValueProcessor } from './value-processor.js';
import { SchemaLocation } from "../schema-location.js";
import { ComposedValueProcessor } from './composed-value-processor.js';
import { formatValue, SchemaError } from '../errors.js';
import { map } from '../helpers/object.js';

/** @typedef {[key:string, executor:Executor]} ObjectExecutorEntry */

/**
 * ParametersValueProcessor is an Executor that uses a list of parameter definitions to validate and execute
 * provided argument Executors.
 *
 * Parameters are managed as follows:
 * - The first optional parameter without an explicit default will use the pipeline value as its default.
 * - If a type option is specified, that argument will be validated against that type.
 * - Constant executors will be checked at construction.
 * - If all parameters are passed constant executor arguments, the entire executor will be constant.
 * - Receiving "undefined" as an argument value at runtime should not be interpreted as a missing argument,
 *   as it may simply indicate that the value is not yet available (but may become available later.)
 *
 * @augments {ValueProcessor}
 */
export class ParametersValueProcessor extends ValueProcessor {

  /** @type {Executor} */
  #executor;

  /** @type {object[]} */
  #parameters;

  /** @type {any} */
  #constantValue;

  /**
   * @param {object[]} [parameters]
   * @param {ValueProcessor[]|{[parameter:string]:ValueProcessor}} [argsProcessors]
   */
  constructor(parameters = [], argsProcessors = {}) {

    super();

    const processorObject = {};

    if (Array.isArray(argsProcessors)) {
      if (argsProcessors.length > parameters.length) {
        throw new SchemaError(`Too many arguments`);
      }
      for (let p = 0; p < parameters.length; ++p) {
        if (p < argsProcessors.length) {
          processorObject[parameters[p].parameter] = argsProcessors[p];
        }
      }
    }
    else {
      if (Object.keys(argsProcessors).length > parameters.length) {
        throw new SchemaError('Too many arguments');
      }
      for (let p = 0; p < parameters.length; ++p) {
        const arg = argsProcessors[parameters[p].parameter];
        if (arg) {
          processorObject[parameters[p].parameter] = arg;
        }
      }
      for (const parameter of Object.keys(argsProcessors)) {
        if (processorObject[parameter] === undefined) {
          throw new SchemaError(`Unknown parameter ${parameter}`);
        }
      }
    }

    // Parameter sequence matters!
    let considerUsingInput = true;
    let handlingUndefaultedOptionals = false;

    for (let p = 0; p < parameters.length; ++p) {
      const hasDefault = parameters[p].hasOwnProperty('default');  // we want to be able to explicitly have an undefined default
      if (parameters[p].required) {
        if (handlingUndefaultedOptionals) {
          throw new SchemaError(`Required parameter ${parameters[p].parameter} cannot follow optional parameter`);
        }
      }
      else if (!hasDefault) {
        if (handlingUndefaultedOptionals) {
          considerUsingInput = false;
        }
        handlingUndefaultedOptionals = true;
      }
      if (processorObject[parameters[p].parameter] === undefined && hasDefault) {
        processorObject[parameters[p].parameter] = new ComposedValueProcessor(new ConstantExecutor(parameters[p].default), parameters[p].default);
      }

      if (processorObject[parameters[p].parameter] === undefined) {
        if (parameters[p].required) {
          throw new SchemaError(`Missing required argument for parameter ${parameters[p].parameter}`);
        }
        if (handlingUndefaultedOptionals && considerUsingInput && !hasDefault) {
          processorObject[parameters[p].parameter] = new ComposedValueProcessor(new Executor(), '$input');
          considerUsingInput = false;
        }
      }

      if (processorObject[parameters[p].parameter]?.isConstant && parameters[p].type !== undefined) {
        const value = processorObject[parameters[p].parameter].execute(true);
        if (parameters[p].type !== undefined && value !== undefined && typeof value !== parameters[p].type) {
          throw new SchemaError(`Invalid ${parameters[p].type} type for parameter "${parameters[p].parameter}"`, {value});
        }
      }
    }
    this.#executor = new ObjectExecutor(processorObject);
    this.#parameters = parameters;
    if (this.#executor.isConstant) {
       const args = this.#executor.execute(true);
       this.#constantValue = this.#check(args);

       let d='';
       for (const [p,v] of Object.entries(args)) {
         if (d.length) {
           d += ','
         }
         d += `${p}=${v}`
       }
       this.description=`[${d}]`
    }
    this.spec = map(processorObject, param => param.spec);

  }

  // Note: required / default are compilation checks, not runtime!
  // All processors should expect they may receive undefined argument values, as sometimes they are resolved
  // dynamically and may not have a value yet.  Some processors may treat this as an error and throw, others
  // may simply return undefined.  If an argument having an undefined value might lead to surprising results,
  // it should be guarded externally.  For example:
  //
  // .validator({$length: {min: {$reference: '^^.settings.minimum'}}})
  //
  // It may be the case that the reference value is not set, which would result in $length not enforcing
  // a minimum at all.  To ensure it only gets set when the dependency is available, it should be written as:
  //
  // .validator({$require: {$reference: '^^.settings.minimum'}})

  #check(args) {
    for (const p of this.#parameters) {
      if (args[p.parameter] !== undefined) {
        if (p.type && (typeof args[p.parameter] !== p.type)) {
          throw new SchemaError(`Invalid type for parameter ${p.parameter}, expected ${p.type}`)
        }
      }
    }
    return args;
  }


  /**
   * @param {object} args
   * @param {any} target
   * @param {SchemaLocation} location
   * @param {object} options
   * @returns {object|Promise<object>}
   */
  execute(args, target, location, options) {
    if (this.#constantValue !== undefined) {
      return this.#constantValue;
    }
    const result = this.#executor.execute(args, target, location, options);

    if (result instanceof Promise) {
      return result.then(resolved => this.#check(resolved))
    }
    return this.#check(result);
  }

  get isConstant() {
    return this.#constantValue !== undefined;
  }
}
