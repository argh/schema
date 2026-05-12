import { ConstraintError, ResolverError } from '../../errors.js';

const IPV4_REGEX = /^((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)\.?\b){4}$/;

/**
 * Parse a dotted-decimal IPv4 string into a 32-bit unsigned integer.
 * @param {string} ip
 * @returns {number}
 */
function ipToUint32(ip) {
  const [a, b, c, d] = ip.split('.').map(Number);
  return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
}

/**
 * Parse a CIDR string (e.g. '192.168.1.0/24') into network and mask as uint32.
 * @param {string} cidr
 * @returns {{ network: number, mask: number }}
 */
function parseCIDR(cidr) {
  const [ip, bitsStr] = cidr.split('/');
  const bits = Number(bitsStr);
  if (!IPV4_REGEX.test(ip) || !Number.isInteger(bits) || bits < 0 || bits > 32) {
    throw new ResolverError(`Invalid CIDR notation: ${cidr}`);
  }
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  const network = ipToUint32(ip) & mask;
  return { network, mask };
}

/**
 * Check whether an IPv4 uint32 falls within a CIDR range.
 * @param {number} ip
 * @param {{ network: number, mask: number }} cidr
 * @returns {boolean}
 */
function isInCIDR(ip, cidr) {
  return (ip & cidr.mask) === cidr.network;
}

/** @type {Record<string, { network: number, mask: number }[]>} */
const NAMED_RANGES = {
  rfc1918: [
    parseCIDR('10.0.0.0/8'),
    parseCIDR('172.16.0.0/12'),
    parseCIDR('192.168.0.0/16'),
  ],
  loopback: [
    parseCIDR('127.0.0.0/8'),
  ],
  'link-local': [
    parseCIDR('169.254.0.0/16'),
  ],
  rfc6598: [
    parseCIDR('100.64.0.0/10'),
  ],
  multicast: [
    parseCIDR('224.0.0.0/4'),
  ],
};

NAMED_RANGES['non-routable'] = [
  ...NAMED_RANGES.rfc1918,
  ...NAMED_RANGES.loopback,
  ...NAMED_RANGES['link-local'],
  ...NAMED_RANGES.rfc6598,
];

/**
 * Resolve an `in` parameter value to an array of CIDR ranges.
 * Accepts a named range (e.g. 'rfc1918') or a CIDR string (e.g. '10.0.0.0/8').
 * @param {string} spec
 * @returns {{ network: number, mask: number }[]}
 */
function resolveRange(spec) {
  const named = NAMED_RANGES[spec.toLowerCase()];
  if (named) return named;
  if (spec.includes('/')) return [parseCIDR(spec)];
  throw new ResolverError(`Unknown IPv4 range: "${spec}" (expected CIDR or one of: ${Object.keys(NAMED_RANGES).join(', ')})`);
}

/**
 * ## $ipv4
 *
 * Validates that a string is a valid IPv4 address in dotted-decimal notation.
 *
 * ### Parameters
 * - `in` (string, optional): Network range to validate against. Accepts CIDR
 *   notation (e.g. `'192.168.1.0/24'`) or a named range: `rfc1918`, `loopback`,
 *   `link-local`, `rfc6598`, `multicast`, `non-routable`.
 * - `min` (string, optional): Minimum IPv4 address (inclusive).
 * - `max` (string, optional): Maximum IPv4 address (inclusive).
 * - `format` (string, optional): Output format — `'integer'` emits the address
 *   as a uint32. Default passes through the original dotted-decimal string.
 *
 * Use either `in` OR `min`/`max`, not both.
 *
 * ### Example
 * ```js
 * // Format-only validation
 * new Schema('string').validator('$ipv4')
 *
 * // CIDR range (positional `in`)
 * new Schema('string').validator({$ipv4: '192.168.1.0/24'})
 *
 * // Named range
 * new Schema('string').validator({$ipv4: 'rfc1918'})
 *
 * // Explicit min/max
 * new Schema('string').validator({$ipv4: {min: '192.168.1.1', max: '192.168.1.254'}})
 *
 * // Output as uint32
 * new Schema('string').validator({$ipv4: {in: 'rfc1918', format: 'integer'}})
 * ```
 *
 * @type {import("../../value-processor/value-processor.js").ValueProcessorDefinition}
 */
export const IPV4_CONSTRAINT = {
  keyword: 'ipv4',

  parameters: [
    { parameter: 'in',     default: undefined, type: 'string' },
    { parameter: 'min',    default: undefined, type: 'string' },
    { parameter: 'max',    default: undefined, type: 'string' },
    { parameter: 'format', default: undefined, type: 'string' },
  ],

  process: (value, _target, _location, options) => {
    if (!IPV4_REGEX.test(value)) {
      throw new ConstraintError('Invalid IPv4 address');
    }

    const { in: inRange, min, max, format } = options?.args ?? {};

    // mutual exclusivity check
    if (inRange !== undefined && (min !== undefined || max !== undefined)) {
      throw new ResolverError('$ipv4: "in" and "min"/"max" are mutually exclusive');
    }

    // validate min/max are valid IPv4 if provided
    if (min !== undefined && !IPV4_REGEX.test(min)) {
      throw new ResolverError(`$ipv4: invalid "min" address: ${min}`);
    }
    if (max !== undefined && !IPV4_REGEX.test(max)) {
      throw new ResolverError(`$ipv4: invalid "max" address: ${max}`);
    }

    const ip = ipToUint32(value);

    if (inRange !== undefined) {
      const ranges = resolveRange(inRange);
      if (!ranges.some(cidr => isInCIDR(ip, cidr))) {
        throw new ConstraintError(`IPv4 address not in range "${inRange}"`);
      }
    }

    if (min !== undefined && ip < ipToUint32(min)) {
      throw new ConstraintError(`IPv4 address below minimum ${min}`);
    }
    if (max !== undefined && ip > ipToUint32(max)) {
      throw new ConstraintError(`IPv4 address above maximum ${max}`);
    }

    if (format === 'integer') {
      return ip;
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
