/**
 * ## $compact
 *
 * Strips common formatting characters from a string: whitespace, hyphens,
 * dots, parentheses, and forward slashes. Useful for producing storage-ready
 * representations of formatted values like phone numbers and card numbers.
 *
 * Characters removed: `\\s`, `-`, `.`, `(`, `)`, `/`
 *
 * Characters preserved: `+`, digits, letters, and all other characters.
 *
 * ### Example
 * ```js
 * // Compact a formatted phone number for storage
 * new Schema('string').normalizer(['$phone', '$compact'])
 * // '(212) 555-1234' → '2125551234'
 *
 * // Compact an international phone number (preserves +)
 * new Schema('string').normalizer([{'$phone': {international: true}}, '$compact'])
 * // '+1 212 555 1234' → '+12125551234'
 *
 * // Compact a card number for storage
 * new Schema('string').normalizer(['$cardnum', '$compact'])
 * // '4111 1111 1111 1111' → '4111111111111111'
 * ```
 *
 * @type {import("../../value-processor/value-processor.js").ValueProcessorDefinition}
 */
export const COMPACT_OPERATOR = {
  keyword: 'compact',
  process: (value) => {
    return String(value).replace(/[\s()\-./]/g, '');
  }
};
