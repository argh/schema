import { SchemaError } from '../errors.js';

/**
 * IEC (binary) units: 1 KiB = 1024 bytes.
 * @type {[string, number][]}
 */
const IEC_UNITS = [
  ['B',   1],
  ['KiB', 1024],
  ['MiB', 1024 ** 2],
  ['GiB', 1024 ** 3],
  ['TiB', 1024 ** 4],
  ['PiB', 1024 ** 5],
];

/**
 * SI (decimal) units: 1 KB = 1000 bytes.
 * @type {[string, number][]}
 */
const SI_UNITS = [
  ['B',  1],
  ['KB', 1000],
  ['MB', 1000 ** 2],
  ['GB', 1000 ** 3],
  ['TB', 1000 ** 4],
  ['PB', 1000 ** 5],
];

/**
 * Suffix-to-multiplier lookup.
 * When standard is unspecified, both IEC and SI suffixes are accepted.
 * IEC suffixes (KiB, MiB, ...) always resolve to binary multipliers.
 * SI suffixes (KB, MB, ...) always resolve to decimal multipliers.
 * The bare "B" suffix is unambiguous (1 byte in both standards).
 * @type {Map<string, number>}
 */
const SUFFIX_MAP = new Map();
for (const [unit, mult] of IEC_UNITS) SUFFIX_MAP.set(unit.toLowerCase(), mult);
for (const [unit, mult] of SI_UNITS)  SUFFIX_MAP.set(unit.toLowerCase(), mult);

/**
 * IEC-only suffix set for strict mode.
 * @type {Set<string>}
 */
const IEC_SUFFIXES = new Set(IEC_UNITS.map(([u]) => u.toLowerCase()));

/**
 * SI-only suffix set for strict mode.
 * @type {Set<string>}
 */
const SI_SUFFIXES = new Set(SI_UNITS.map(([u]) => u.toLowerCase()));

/**
 * Parse pattern: digits with optional decimal, optional whitespace, optional unit suffix.
 * Captures: [1] = number, [2] = unit suffix (may be empty for bare numbers).
 */
const PARSE_RE = /^\s*(\d+(?:\.\d+)?)\s*([a-z]*)\s*$/i;

/**
 * Parse a data-size string into a byte count.
 *
 * Accepts numeric values (treated as bytes), or strings like `'20KiB'`, `'1.5 MB'`, `'512'`.
 * When `standard` is omitted, both IEC and SI suffixes are accepted.
 * When `standard` is `'iec'` or `'si'`, only that standard's suffixes are accepted.
 *
 * @package
 * @param {string|number} value
 * @param {string} [standard] - `'iec'` or `'si'`; omit to accept either
 * @returns {number} byte count
 */
export function parseDataSize(value, standard) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) {
      throw new SchemaError(`Invalid data size: ${value}`);
    }
    return value;
  }

  if (typeof value !== 'string') {
    throw new SchemaError(`Invalid data size: expected string or number, got ${typeof value}`);
  }

  const match = value.match(PARSE_RE);
  if (!match) {
    throw new SchemaError(`Invalid data size: "${value}"`);
  }

  const [, numStr, suffix] = match;
  const num = parseFloat(numStr);

  // bare number — treat as bytes
  if (!suffix) return num;

  const key = suffix.toLowerCase();
  const multiplier = SUFFIX_MAP.get(key);

  if (multiplier === undefined) {
    throw new SchemaError(`Unknown data size unit: "${suffix}"`);
  }

  // strict standard enforcement
  if (standard) {
    const std = standard.toLowerCase();
    if (std === 'iec' && !IEC_SUFFIXES.has(key)) {
      throw new SchemaError(`Unit "${suffix}" is not an IEC unit (expected B, KiB, MiB, GiB, TiB, PiB)`);
    }
    if (std === 'si' && !SI_SUFFIXES.has(key)) {
      throw new SchemaError(`Unit "${suffix}" is not an SI unit (expected B, KB, MB, GB, TB, PB)`);
    }
  }

  return num * multiplier;
}


/**
 * Format a byte count into a human-readable data-size string.
 *
 * Selects the largest unit where the value is >= 1 and formats with up to
 * two decimal places (trailing zeros stripped).
 *
 * @package
 * @param {number} bytes
 * @param {string} [standard='iec'] - `'iec'` or `'si'`
 * @returns {string|undefined}
 */
export function formatDataSize(bytes, standard = 'iec') {
  if (!Number.isFinite(bytes) || bytes < 0) {
    throw new SchemaError(`Invalid byte count: ${bytes}`);
  }

  const units = standard.toLowerCase() === 'si' ? SI_UNITS : IEC_UNITS;

  // walk from largest to smallest
  for (let i = units.length - 1; i >= 0; i--) {
    const [unit, mult] = units[i];
    if (bytes >= mult || i === 0) {
      const val = bytes / mult;
      const formatted = val % 1 === 0 ? String(val) : parseFloat(val.toFixed(2)).toString();
      return `${formatted} ${unit}`;
    }
  }
  return undefined;
}
