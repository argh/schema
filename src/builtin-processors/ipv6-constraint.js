import { ConstraintError, ResolverError } from '../errors.js';

const IPV6_REGEX = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;

const IPV4_TAIL_REGEX = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/**
 * Expand an IPv6 string (possibly compressed, possibly with zone id or IPv4 tail)
 * into exactly 8 16-bit groups as a BigInt.
 * @param {string} ip
 * @returns {bigint}
 */
function ipv6ToBigInt(ip) {
  // strip zone identifier (e.g. %eth0)
  let addr = ip.replace(/%.*$/, '');

  // handle IPv4-mapped tail: convert dotted-decimal to two hex groups
  const v4Match = IPV4_TAIL_REGEX.exec(addr);
  if (v4Match) {
    const [a, b, c, d] = [v4Match[1], v4Match[2], v4Match[3], v4Match[4]].map(Number);
    const hi = ((a << 8) | b).toString(16);
    const lo = ((c << 8) | d).toString(16);
    addr = addr.slice(0, v4Match.index) + `${hi}:${lo}`;
  }

  // expand :: shorthand
  if (addr.includes('::')) {
    const [left, right] = addr.split('::');
    const leftGroups = left ? left.split(':') : [];
    const rightGroups = right ? right.split(':') : [];
    const missing = 8 - leftGroups.length - rightGroups.length;
    const fill = Array(missing).fill('0');
    addr = [...leftGroups, ...fill, ...rightGroups].join(':');
  }

  const groups = addr.split(':');
  let result = 0n;
  for (const group of groups) {
    result = (result << 16n) | BigInt(parseInt(group, 16));
  }
  return result;
}

/**
 * Parse an IPv6 CIDR string into network and mask as BigInt.
 * @param {string} cidr
 * @returns {{ network: bigint, mask: bigint }}
 */
function parseCIDR(cidr) {
  const slashIdx = cidr.lastIndexOf('/');
  if (slashIdx === -1) {
    throw new ResolverError(`Invalid IPv6 CIDR notation: ${cidr}`);
  }
  const ip = cidr.slice(0, slashIdx);
  const bits = Number(cidr.slice(slashIdx + 1));
  if (!IPV6_REGEX.test(ip) || !Number.isInteger(bits) || bits < 0 || bits > 128) {
    throw new ResolverError(`Invalid IPv6 CIDR notation: ${cidr}`);
  }
  const mask = bits === 0 ? 0n : ((1n << 128n) - 1n) << BigInt(128 - bits);
  const network = ipv6ToBigInt(ip) & mask;
  return { network, mask };
}

/**
 * Check whether an IPv6 BigInt falls within a CIDR range.
 * @param {bigint} ip
 * @param {{ network: bigint, mask: bigint }} cidr
 * @returns {boolean}
 */
function isInCIDR(ip, cidr) {
  return (ip & cidr.mask) === cidr.network;
}

/** @type {Record<string, { network: bigint, mask: bigint }[]>} */
const NAMED_RANGES = {
  loopback: [
    parseCIDR('::1/128'),
  ],
  'link-local': [
    parseCIDR('fe80::/10'),
  ],
  'unique-local': [
    parseCIDR('fc00::/7'),
  ],
  multicast: [
    parseCIDR('ff00::/8'),
  ],
};

NAMED_RANGES['non-routable'] = [
  ...NAMED_RANGES.loopback,
  ...NAMED_RANGES['link-local'],
  ...NAMED_RANGES['unique-local'],
];

/**
 * Resolve an `in` parameter value to an array of CIDR ranges.
 * Accepts a named range or a CIDR string.
 * @param {string} spec
 * @returns {{ network: bigint, mask: bigint }[]}
 */
function resolveRange(spec) {
  const named = NAMED_RANGES[spec.toLowerCase()];
  if (named) return named;
  if (spec.includes('/')) return [parseCIDR(spec)];
  throw new ResolverError(`Unknown IPv6 range: "${spec}" (expected CIDR or one of: ${Object.keys(NAMED_RANGES).join(', ')})`);
}

/**
 * ## $ipv6
 *
 * Validates that a string is a properly formatted IPv6 address. Supports all standard
 * notation formats including full, compressed (::), link-local with zone identifiers,
 * and IPv4-mapped addresses.
 *
 * ### Parameters
 * - `in` (string, optional): Network range to validate against. Accepts CIDR
 *   notation (e.g. `'fe80::/10'`) or a named range: `loopback`, `link-local`,
 *   `unique-local`, `multicast`, `non-routable`.
 * - `min` (string, optional): Minimum IPv6 address (inclusive).
 * - `max` (string, optional): Maximum IPv6 address (inclusive).
 *
 * Use either `in` OR `min`/`max`, not both.
 *
 * ### Example
 * ```js
 * // Format-only validation
 * new Schema('string').validator('$ipv6')
 *
 * // CIDR range (positional `in`)
 * new Schema('string').validator({$ipv6: '2001:db8::/32'})
 *
 * // Named range
 * new Schema('string').validator({$ipv6: 'unique-local'})
 *
 * // Explicit min/max
 * new Schema('string').validator({$ipv6: {min: '2001:db8::1', max: '2001:db8::ffff'}})
 * ```
 *
 * @type {import("../value-processor/value-processor.js").ValueProcessorDefinition}
 */
export const IPV6_CONSTRAINT = {
  keyword: 'ipv6',

  parameters: [
    { parameter: 'in',  default: undefined, type: 'string' },
    { parameter: 'min', default: undefined, type: 'string' },
    { parameter: 'max', default: undefined, type: 'string' },
  ],

  process: (value, _target, _location, options) => {
    if (!IPV6_REGEX.test(value)) {
      throw new ConstraintError('Invalid IPv6 address');
    }

    const { in: inRange, min, max } = options?.args ?? {};

    if (inRange !== undefined && (min !== undefined || max !== undefined)) {
      throw new ResolverError('$ipv6: "in" and "min"/"max" are mutually exclusive');
    }

    if (min !== undefined && !IPV6_REGEX.test(min)) {
      throw new ResolverError(`$ipv6: invalid "min" address: ${min}`);
    }
    if (max !== undefined && !IPV6_REGEX.test(max)) {
      throw new ResolverError(`$ipv6: invalid "max" address: ${max}`);
    }

    const ip = ipv6ToBigInt(value);

    if (inRange !== undefined) {
      const ranges = resolveRange(inRange);
      if (!ranges.some(cidr => isInCIDR(ip, cidr))) {
        throw new ConstraintError(`IPv6 address not in range "${inRange}"`);
      }
    }

    if (min !== undefined && ip < ipv6ToBigInt(min)) {
      throw new ConstraintError(`IPv6 address below minimum ${min}`);
    }
    if (max !== undefined && ip > ipv6ToBigInt(max)) {
      throw new ConstraintError(`IPv6 address above maximum ${max}`);
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
