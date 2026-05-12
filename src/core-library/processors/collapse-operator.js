/**
 * ## $collapse
 *
 * Collapses runs of whitespace within a string to a single space, and trims
 * leading and trailing whitespace. Useful for normalizing messy user input
 * from forms, textareas, and configuration values.
 *
 * Compared to `$trim` (edges only) and `$compact` (removes all formatting),
 * `$collapse` preserves word boundaries while normalizing irregular spacing.
 *
 * ### Example
 * ```js
 * // Clean up messy form input
 * new Schema('string').normalizer('$collapse')
 * // '  hello   world\n' → 'hello world'
 *
 * // Normalize a multi-line address to single line
 * new Schema('string').normalizer('$collapse')
 * // '123 Main St\n  Apt 4\n' → '123 Main St Apt 4'
 * ```
 *
 * @type {import("../../value-processor/value-processor.js").ValueProcessorDefinition}
 */
export const COLLAPSE_OPERATOR = {
  keyword: 'collapse',
  process: (value) => {
    return String(value).replace(/\s+/g, ' ').trim();
  }
};
