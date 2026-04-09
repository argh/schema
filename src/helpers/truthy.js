/**
 * Return true if the provided value is one of the magic truthy keywords
 * @param {string} value
 * @returns {boolean}
 */
export function isTruthyKeyword(value) {
  return (value === 'true' || value === '1' || value === 'yes' || value === 'enabled' || value === 'active' || value === 'on');
}

/**
 * Return true if the provided value is one of the magic falsey keywords
 * @param {string} value
 * @returns {boolean}
 */
export function isFalseyKeyword(value) {
  return (value === 'false' || value === '0' || value === 'no' || value === 'disabled' || value === 'inactive' || value === 'off' || value === '' || value === 'undefined' || value === 'null');
}

/**
 * This library has a slightly extended notion of truthiness that includes human-friendly string representations
 *
 * @param {any} value
 * @returns {boolean}
 */
export function isTruthy(value) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim();
    if (isTruthyKeyword(lower)) { return true }
    if (isFalseyKeyword(lower)) { return false }
  }
  if (value instanceof Error) { return false }
  return Boolean(value);
}