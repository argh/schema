import { ConstraintError, ResolverError } from '../../errors.js';
import { parseDataSize, formatDataSize } from '../../helpers/data-size.js';

const VALID_STANDARDS = new Set(['iec', 'si', 'any']);
const VALID_FORMATS = new Set(['iec', 'si']);

/**
 * ## $data-size
 *
 * Parses data-size strings (e.g. `'20KiB'`, `'1.5 MB'`, `'512'`) into byte
 * counts. Bare numbers and numeric strings without a suffix are treated as bytes.
 *
 * ### Parameters
 * - `standard` (string, optional): Which unit standard to accept when parsing.
 *   `'iec'` (binary: KiB, MiB, ...), `'si'` (decimal: KB, MB, ...), or
 *   `'any'` (both). Default: `'any'`.
 * - `format` (string, optional): When set, returns a formatted string instead
 *   of a byte count. Accepts `'iec'` or `'si'` to control the output standard.
 *
 * ### Example
 * ```js
 * // Parse to bytes (normalizer)
 * new Schema().normalizer('$data-size')
 *
 * // Strict IEC only
 * new Schema().normalizer({'$data-size': {standard: 'iec'}})
 *
 * // Parse and format back as SI string
 * new Schema().normalizer({'$data-size': {format: 'si'}})
 *
 * // Use as normalizer ahead of number validation
 * new Schema().normalizer(['$data-size']).validator('$is-number')
 * ```
 *
 * @type {import("../../value-processor/value-processor.js").ValueProcessorDefinition}
 */
export const DATA_SIZE_OPERATOR = {
  keyword: 'data-size',

  parameters: [
    { parameter: 'standard', default: 'any', type: 'string' },
    { parameter: 'format',   default: undefined, type: 'string' },
  ],

  process: (value, _target, _location, options) => {
    const { standard, format } = options?.args ?? {};

    if (standard !== undefined && !VALID_STANDARDS.has(standard)) {
      throw new ResolverError(`$data-size: unknown standard "${standard}" (expected iec, si, or any)`);
    }
    if (format !== undefined && !VALID_FORMATS.has(format)) {
      throw new ResolverError(`$data-size: unknown format "${format}" (expected iec or si)`);
    }

    // passthrough numbers when no format is requested
    if (typeof value === 'number' && format === undefined) {
      if (!Number.isFinite(value) || value < 0) {
        throw new ConstraintError(`Invalid data size: ${value}`);
      }
      return value;
    }

    const bytes = parseDataSize(value, standard === 'any' ? undefined : standard);

    if (format !== undefined) {
      return formatDataSize(bytes, format);
    }

    return bytes;
  },

  describe: (args) => {
    if (!args) return undefined;

    const standardProcessor = (Array.isArray(args) ? args[0] : args.standard);
    const formatProcessor = (Array.isArray(args) ? args[1] : args.format);

    const standard = standardProcessor?.description;
    const format = formatProcessor?.description;

    const parts = [];
    if (standard !== undefined && standard !== 'any') parts.push(standard.toUpperCase());
    if (format !== undefined) parts.push(`\u2192 ${format.toUpperCase()}`);
    return parts.length ? parts.join(', ') : undefined;
  }
};
