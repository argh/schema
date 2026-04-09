/**
 * @param {any} obj
 * @returns {boolean}
 */
export function isPlainObject(obj) {
  if (obj == null || typeof obj !== 'object') {
    return false;
  }

  const proto = Object.getPrototypeOf(obj);
  return proto === Object.prototype || proto === null;
}

/**
 * @param {any} item
 * @returns {boolean}
 */
export function isObject(item) {
  // todo - should we allow 'function'?
  return item && typeof item === 'object' && !Array.isArray(item);
}

/**
 * @param {any} value
 * @returns {boolean}
 */
export function isEmpty(value) {
  return value === undefined || value === null
         || (Array.isArray(value) && value.length === 0)
         || (isPlainObject(value) && Object.keys(value).length === 0)
}

/**
 * @param {any} item
 * @returns {boolean}
 */
export function isPrimitive(item) {
  if (item === undefined || item === null) {
    return false; // these values have special meaning for this library and are thus not assignable primitives!
  }
  const type = typeof item;
  return type !== 'object' && type !== 'function';
}

/**
 * @param {any} f
 * @returns {boolean}
 * @deprecated - usually want isConstructible instead
 */
export function isConstructor(f) {
  if (typeof f !== 'function') {
    return false;
  }
  if (f.prototype?.constructor === f) {
    return true;
  }
  try {
    class test
      extends f {}    // oops, turns out that simple functions can be extended (!)
  }
  catch (err) {
    return false;
  }
  return true;
}

/**
 * @param {any} f
 * @returns {boolean}
 */
export function isConstructible(f) {
  if (typeof f !== 'function') {
    return false;
  }

  try {
    Reflect.construct(Function, [], f);
    return true;
  }
  catch {
    return false;
  }
}

/**
 * @param {any} f
 * @returns {boolean}
 */
export function isNativeClass(f) {
  return typeof f === 'function' &&
         /^class\s/.test(Function.prototype.toString.call(f));
}

/**
 *
 * @param {object|any[]|any} collection
 * @param {(value:any) => any} callback
 * @returns {object|any[]}
 */
export function map(collection, callback) {
  if (Array.isArray(collection)) {
    return collection.map(callback);
  }
  else if (isPlainObject(collection)) {
    return Object.fromEntries(Object.entries(collection).map(([k, v]) => [k, callback(v)]))
  }
  else {
    return [callback(collection)];
  }
}