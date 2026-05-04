import { SchemaError } from '../errors.js';

/**
 * Parse potentially delimited regexps
 *
 * @param {string|RegExp} rx
 * @returns {RegExp|undefined}
 */
export function parseRegExp(rx) {
  if (rx instanceof RegExp) {
    return rx;
  }
  if (typeof rx === 'string' && rx.startsWith('/') && rx.lastIndexOf('/') > 0) {
      const lastSlash = rx.lastIndexOf('/');
      return new RegExp(rx.slice(1, lastSlash), rx.slice(lastSlash + 1));
  }
  throw new SchemaError('Unable to parse RegExp', {value: rx})
}