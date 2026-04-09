
import { isObject, isPlainObject } from './object.js';

/**
 * @param {object} target
 * @param {...object} sources
 * @returns {object}
 */
export function deepMerge(target, ...sources) {
  if (!sources.length) {
    return target;
  }

  const source = sources.shift();

  if (isObject(target) && isObject(source)) {
    for (const key in source) {
      if (isPlainObject(source[key])) {
        if (!target[key]) {
          Object.assign(target, {[key]: {}});
        }
        deepMerge(target[key], source[key]);
      }
      else {
        Object.assign(target, {[key]: source[key]});
      }
    }
  }

  return deepMerge(target, ...sources);
}

/**
 * deep comparison
 * @param {any} a
 * @param {any} b
 * @returns {boolean}
 * @internal
 */
export function deepEquals(a, b) {
  if (a === b) {
    return true;
  }
  if (a == null || b == null) {
    return false;
  }
  if (typeof a !== typeof b) {
    return false;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; ++i) {
      if (!deepEquals(a[i], b[i])) {
        return false;
      }
    }
    return true;
  }

  if (typeof a === 'object' && typeof b === 'object') {
    if (Array.isArray(a) || Array.isArray(b)) {
      return false;
    }
    const keys = Object.keys(a);
    if (keys.length !== Object.keys(b).length) {
      return false;
    }
    for (const k of keys) {
      if (!b.hasOwnProperty(k) || !deepEquals(a[k], b[k])) {
        return false;
      }
    }
    return true;
  }

  return false;
}

/**
 * @param {object|undefined}target
 * @param {string} path
 * @param {any} value
 * @returns {object}
 */
export function deepAssign(target, path, value) {
  if (path === '' && target) {
    throw new Error('Top level path but target is already set');
  }
  if (path === '') {
    if (Array.isArray(value)) {
      return [...value];
    }
    else if (isPlainObject(value)) {
      return {...value};
    }
    return value;
  }
  // Handle edge cases
  if (!path || typeof path !== 'string') {
    throw new Error('Path must be a non-empty string');
  }

  // Split the path by dots and filter out empty segments
  const segments = path.split('.').filter(segment => segment !== '');

  if (segments.length === 0) {
    throw new Error('Path must contain at least one valid segment');
  }

  if (target !== null && target !== undefined && typeof target !== 'object') {
    throw new Error('Target must be an object, an array, or null/undefined');
  }

  // Auto-synthesize target if null
  if (target === null || target === undefined) {
    const firstSegment = segments[0];
    const isFirstArrayIndex = /^\d+$/.test(firstSegment);
    target = isFirstArrayIndex ? [] : {};
  }

  let current = target;

  // Navigate to the parent of the target property
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    const nextSegment = segments[i + 1];

    // Check if current segment is an array index
    const isArrayIndex = /^\d+$/.test(segment);
    const nextIsArrayIndex = /^\d+$/.test(nextSegment);

    if (isArrayIndex) {
      const index = parseInt(segment, 10);

      // Ensure current is an array
      if (!Array.isArray(current)) {
        throw new Error(
          `Expected array at path segment '${segments.slice(0, i).join('.')}', but found ${typeof current}`);
      }

      // Extend array if necessary
      while (current.length <= index) {
        current.push(undefined);
      }

      // Create the next level if it doesn't exist
      if (current[index] === undefined || current[index] === null) {
        current[index] = nextIsArrayIndex ? [] : {};
      }

      current = current[index];
    }
    else {
      // Handle object property
      if (current[segment] === undefined || current[segment] === null) {
        current[segment] = nextIsArrayIndex ? [] : {};
      }

      current = current[segment];
    }
  }

  // Set the final value
  const finalSegment = segments[segments.length - 1];
  const isFinalArrayIndex = /^\d+$/.test(finalSegment);

  if (isFinalArrayIndex) {
    const index = parseInt(finalSegment, 10);

    // Ensure current is an array
    if (!Array.isArray(current)) {
      throw new Error(
        `Expected array at path segment '${segments.slice(0, -1).join('.')}', but found ${typeof current}`);
    }

    // Extend array if necessary
    while (current.length <= index) {
      current.push(undefined);
    }

    current[index] = value;
  }
  else {
    current[finalSegment] = value;
  }

  return target;
}

/**
 *
 * @param {object} object
 * @param {string} path
 * @returns {undefined|any}
 */
export function deepValue(object, path) {
  if (path === '') {
    return object;
  }

  // Handle null/undefined object
  if (!object || typeof object !== 'object') {
    return undefined;
  }


  // Handle empty or invalid path
  if (typeof path !== 'string') {
    return undefined;
  }

  // Split the path and filter out empty strings
  const keys = path.split('.').filter(key => key.length > 0);

  // If no valid keys, return undefined
  if (keys.length === 0) {
    return undefined;
  }

  // Traverse the object following the path
  let current = object;
  for (const key of keys) {
    // Check if current is null/undefined or not an object
    if (!current || typeof current !== 'object') {
      return undefined;
    }

    // Move to the next level
    if (/^\d+$/.test(key)) {
      current = current[Number(key)]
    }
    else {
      current = current[key];
    }
  }

  return current;
}

/**
 * @param {any} value
 * @returns {any}
 */
export function deepPrune(value) {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (isPlainObject(value)) {
    for (const key of Object.keys(value)) {
      if (deepPrune(value[key]) === undefined) {
        delete value[key];
      }
    }
    return Object.keys(value).length ? value : undefined;
  }
  else if (Array.isArray(value)) {
    for (let i = value.length - 1; i >= 0; i--) {
      const v = deepPrune(value[i]);
      if (v === undefined) {
        if (i === value.length - 1) {
          value.pop();
        }
        else {
          delete value[i];
        }
      }
      else if (v !== value[i]) {
        // avoid reassigning unless actually changed (e.g. proxy)
        value[i] = v;
      }
    }
    return value.length ? value : undefined;
  }
  else {
    return value;
  }
}