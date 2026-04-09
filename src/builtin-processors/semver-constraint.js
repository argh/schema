import { ConstraintError, ResolverError } from '../errors.js';

/**
 * Strict semver regex per semver.org 2.0.0 spec.
 * Groups: 1=major, 2=minor, 3=patch, 4=prerelease (optional), 5=build (optional)
 */
const SEMVER_REGEX = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

/**
 * @typedef {{ major: number, minor: number, patch: number, prerelease: string[], build: string[] }} SemVer
 */

/**
 * Parse a semver string into its components.
 * @param {string} str
 * @returns {SemVer}
 */
function parseSemVer(str) {
  const m = SEMVER_REGEX.exec(str.trim());
  if (!m) {
    throw new ResolverError(`Invalid semver: "${str}"`);
  }
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] ? m[4].split('.') : [],
    build: m[5] ? m[5].split('.') : [],
  };
}

/**
 * Compare two pre-release identifier arrays per semver 2.0.0 §11.
 * Returns negative if a < b, 0 if equal, positive if a > b.
 * @param {string[]} a
 * @param {string[]} b
 * @returns {number}
 */
function comparePrerelease(a, b) {
  // no prerelease on either — equal
  if (a.length === 0 && b.length === 0) return 0;
  // a version with prerelease has lower precedence than the release version
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;

  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    // fewer fields = lower precedence
    if (i >= a.length) return -1;
    if (i >= b.length) return 1;

    const ai = a[i];
    const bi = b[i];
    if (ai === bi) continue;

    const aNum = /^\d+$/.test(ai);
    const bNum = /^\d+$/.test(bi);

    // numeric identifiers always have lower precedence than alphanumeric
    if (aNum && !bNum) return -1;
    if (!aNum && bNum) return 1;

    if (aNum && bNum) {
      const diff = Number(ai) - Number(bi);
      if (diff !== 0) return diff;
    } else {
      // both alphanumeric — lexicographic
      if (ai < bi) return -1;
      if (ai > bi) return 1;
    }
  }
  return 0;
}

/**
 * Compare two parsed semver objects. Build metadata is ignored per spec.
 * Returns negative if a < b, 0 if equal, positive if a > b.
 * @param {SemVer} a
 * @param {SemVer} b
 * @returns {number}
 */
function compareSemVer(a, b) {
  return (a.major - b.major)
      || (a.minor - b.minor)
      || (a.patch - b.patch)
      || comparePrerelease(a.prerelease, b.prerelease);
}

// --- range parsing ---

/** @typedef {(v: SemVer) => boolean} SemVerPredicate */

/** Matches a single comparator: optional operator + semver */
const COMPARATOR_REGEX = /^(>=|<=|>|<|=)?\s*((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+(?:[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?)$/;

/**
 * Parse a single comparator (e.g. '>=1.0.0', '<2.0.0', '1.2.3') into a predicate.
 * @param {string} comp
 * @returns {SemVerPredicate}
 */
function parseComparator(comp) {
  const m = COMPARATOR_REGEX.exec(comp.trim());
  if (!m) {
    throw new ResolverError(`Invalid semver comparator: "${comp}"`);
  }
  const op = m[1] || '=';
  const target = parseSemVer(m[2]);

  switch (op) {
    case '=':  return (v) => compareSemVer(v, target) === 0;
    case '>':  return (v) => compareSemVer(v, target) > 0;
    case '>=': return (v) => compareSemVer(v, target) >= 0;
    case '<':  return (v) => compareSemVer(v, target) < 0;
    case '<=': return (v) => compareSemVer(v, target) <= 0;
    default:   throw new ResolverError(`Unknown semver operator: "${op}"`);
  }
}

/**
 * Parse a caret range (^1.2.3) into a predicate.
 * ^major.minor.patch means >=major.minor.patch and:
 *   major > 0: < (major+1).0.0
 *   major === 0, minor > 0: < 0.(minor+1).0
 *   major === 0, minor === 0: < 0.0.(patch+1)
 * @param {string} version
 * @returns {SemVerPredicate}
 */
function parseCaret(version) {
  const min = parseSemVer(version);
  /** @type {SemVer} */
  let max;
  if (min.major > 0) {
    max = { major: min.major + 1, minor: 0, patch: 0, prerelease: [], build: [] };
  } else if (min.minor > 0) {
    max = { major: 0, minor: min.minor + 1, patch: 0, prerelease: [], build: [] };
  } else {
    max = { major: 0, minor: 0, patch: min.patch + 1, prerelease: [], build: [] };
  }
  return (v) => compareSemVer(v, min) >= 0 && compareSemVer(v, max) < 0;
}

/**
 * Parse a tilde range (~1.2.3) into a predicate.
 * ~major.minor.patch means >=major.minor.patch <major.(minor+1).0
 * @param {string} version
 * @returns {SemVerPredicate}
 */
function parseTilde(version) {
  const min = parseSemVer(version);
  /** @type {SemVer} */
  const max = { major: min.major, minor: min.minor + 1, patch: 0, prerelease: [], build: [] };
  return (v) => compareSemVer(v, min) >= 0 && compareSemVer(v, max) < 0;
}

/**
 * Parse a semver range expression into a predicate.
 * Supports: comparators (>=, >, <=, <, =), caret (^), tilde (~),
 * and space-separated AND of comparators.
 * @param {string} range
 * @returns {SemVerPredicate}
 */
function parseRange(range) {
  const trimmed = range.trim();

  if (trimmed.startsWith('^')) {
    return parseCaret(trimmed.slice(1));
  }
  if (trimmed.startsWith('~')) {
    return parseTilde(trimmed.slice(1));
  }

  // space-separated AND of comparators
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return parseComparator(parts[0]);
  }
  const predicates = parts.map(parseComparator);
  return (v) => predicates.every(p => p(v));
}

/**
 * ## $semver
 *
 * Validates that a string is a valid semantic version per the semver 2.0.0 spec.
 *
 * ### Parameters
 * - `in` (string, optional): Semver range expression. Supports comparators
 *   (`>=1.0.0`, `<2.0.0`), caret (`^1.2.3`), tilde (`~1.2.3`), and
 *   space-separated AND (`>=1.0.0 <2.0.0`).
 * - `min` (string, optional): Minimum version (inclusive).
 * - `max` (string, optional): Maximum version (inclusive).
 *
 * Use either `in` OR `min`/`max`, not both.
 *
 * ### Example
 * ```js
 * // Format-only validation
 * new Schema('string').validator('$semver')
 *
 * // Caret range (positional `in`)
 * new Schema('string').validator({$semver: '^1.2.0'})
 *
 * // Tilde range
 * new Schema('string').validator({$semver: '~1.2.0'})
 *
 * // Comparator range
 * new Schema('string').validator({$semver: '>=1.0.0 <2.0.0'})
 *
 * // Explicit min/max (inclusive)
 * new Schema('string').validator({$semver: {min: '1.0.0', max: '2.0.0'}})
 * ```
 *
 * @type {import("../value-processor/value-processor.js").ValueProcessorDefinition}
 */
export const SEMVER_CONSTRAINT = {
  keyword: 'semver',

  parameters: [
    { parameter: 'in',  default: undefined, type: 'string' },
    { parameter: 'min', default: undefined, type: 'string' },
    { parameter: 'max', default: undefined, type: 'string' },
  ],

  process: (value, _target, _location, options) => {
    const parsed = SEMVER_REGEX.exec(value);
    if (!parsed) {
      throw new ConstraintError('Invalid semver');
    }

    const { in: inRange, min, max } = options?.args ?? {};

    if (inRange !== undefined && (min !== undefined || max !== undefined)) {
      throw new ResolverError('$semver: "in" and "min"/"max" are mutually exclusive');
    }

    const ver = {
      major: Number(parsed[1]),
      minor: Number(parsed[2]),
      patch: Number(parsed[3]),
      prerelease: parsed[4] ? parsed[4].split('.') : [],
      build: parsed[5] ? parsed[5].split('.') : [],
    };

    if (inRange !== undefined) {
      const predicate = parseRange(inRange);
      if (!predicate(ver)) {
        throw new ConstraintError(`Version not in range "${inRange}"`);
      }
    }

    if (min !== undefined) {
      if (compareSemVer(ver, parseSemVer(min)) < 0) {
        throw new ConstraintError(`Version below minimum ${min}`);
      }
    }
    if (max !== undefined) {
      if (compareSemVer(ver, parseSemVer(max)) > 0) {
        throw new ConstraintError(`Version above maximum ${max}`);
      }
    }

    return value;
  },

  describe: (args) => {
    if (!args) return undefined;

    const inProcessor = (Array.isArray(args) ? args[0] : args.in);
    const minProcessor = (Array.isArray(args) ? args[1] : args.min);
    const maxProcessor = (Array.isArray(args) ? args[2] : args.max);

    const inVal = inProcessor?.description;
    const min = minProcessor?.description;
    const max = maxProcessor?.description;

    if (inVal !== undefined) return `in ${inVal}`;
    if (min !== undefined && max !== undefined) return `${min}–${max}`;
    if (min !== undefined) return `≥${min}`;
    if (max !== undefined) return `≤${max}`;
    return undefined;
  }
};
