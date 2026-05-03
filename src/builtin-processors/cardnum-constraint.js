import { ConstraintError } from '../errors.js';

/**
 * IIN (Issuer Identification Number) network definitions.
 * Used for output formatting only — detection does not affect validation.
 * Ordered from most specific prefix to least specific to avoid false matches.
 */
const CARD_NETWORKS = [
  {
    name: 'amex',
    match: (d) => d.startsWith('34') || d.startsWith('37'),
    groups: [4, 6, 5],
  },
  {
    name: 'diners',
    match: (d) => {
      const p3 = +d.slice(0, 3);
      return (p3 >= 300 && p3 <= 305) || d.startsWith('36') || d.startsWith('38');
    },
    groups: [4, 6, 4],
  },
  {
    name: 'jcb',
    match: (d) => {
      const p4 = +d.slice(0, 4);
      return p4 >= 3528 && p4 <= 3589;
    },
    groups: [4, 4, 4, 4],
  },
  {
    name: 'discover',
    match: (d) => {
      const p3 = +d.slice(0, 3);
      const p6 = +d.slice(0, 6);
      return d.startsWith('6011') || d.startsWith('65')
        || (p3 >= 644 && p3 <= 649)
        || (p6 >= 622126 && p6 <= 622925);
    },
    groups: [4, 4, 4, 4],
  },
  {
    name: 'mastercard',
    match: (d) => {
      const p2 = +d.slice(0, 2);
      const p4 = +d.slice(0, 4);
      return (p2 >= 51 && p2 <= 55) || (p4 >= 2221 && p4 <= 2720);
    },
    groups: [4, 4, 4, 4],
  },
  {
    name: 'visa',
    match: (d) => d.startsWith('4'),
    groups: [4, 4, 4, 4],
  },
];

const DEFAULT_GROUPS = [4, 4, 4, 4];

/**
 * Luhn checksum validation.
 * @param {string} digits
 * @returns {boolean}
 */
function luhnCheck(digits) {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = +digits[i];
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * Format a character sequence using group sizes, with overflow in an extra group.
 * @param {string} chars
 * @param {number[]} groups
 * @returns {string}
 */
function formatWithGroups(chars, groups) {
  const parts = [];
  let pos = 0;
  for (const size of groups) {
    if (pos >= chars.length) break;
    parts.push(chars.slice(pos, pos + size));
    pos += size;
  }
  if (pos < chars.length) {
    parts.push(chars.slice(pos));
  }
  return parts.join(' ');
}

/**
 * ## $cardnum
 *
 * Validates a payment card number (PAN) using the Luhn algorithm and normalizes
 * its formatting based on the detected card network.
 *
 * **Processing steps:**
 * 1. Strip formatting characters (spaces, dashes, dots)
 * 2. Validate: digits only, length 12–19 (ISO 7812), Luhn checksum
 * 3. Detect card network from IIN (Issuer Identification Number) prefix
 * 4. Format with network-appropriate digit grouping
 *
 * **Recognized networks and their grouping:**
 * - **Amex** (34, 37): `#### ###### #####`
 * - **Diners Club** (300–305, 36, 38): `#### ###### ####`
 * - **JCB** (3528–3589): `#### #### #### ####`
 * - **Discover** (6011, 65, 644–649, 622126–622925): `#### #### #### ####`
 * - **Mastercard** (51–55, 2221–2720): `#### #### #### ####`
 * - **Visa** (4): `#### #### #### ####`
 * - **Unrecognized**: `#### #### #### ####` (default grouping)
 *
 * Network detection is best-effort and does not affect validation — any number
 * that passes the Luhn check with a valid length is accepted. Unrecognized
 * prefixes receive default 4-4-4-4 grouping.
 *
 * ### Parameters
 * - `mask` (boolean or string, default `false`): When truthy, replaces leading
 *   digits with a mask character, revealing only the trailing digits.
 *   `true` uses `'•'`; a string value uses its first character.
 * - `reveal` (number, default `4`): Number of trailing digits to leave visible
 *   when `mask` is enabled.
 *
 * ### Example
 * ```js
 * // Validate and format
 * new Schema('string').validator('$cardnum')
 * // '4111111111111111' → '4111 1111 1111 1111'
 * // '378282246310005'  → '3782 822463 10005'
 *
 * // Masked for output (serializer — masking is a lossy presentation transform)
 * new Schema('string').serializer({'$cardnum': {mask: true}})
 * // '4111111111111111' → '•••• •••• •••• 1111'
 *
 * // Custom mask character, reveal 6 digits
 * new Schema('string').serializer({'$cardnum': {mask: '*', reveal: 6}})
 * // '4111111111111111' → '**** **** **11 1111'
 * ```
 *
 * @type {import("../value-processor/value-processor.js").ValueProcessorDefinition}
 */
export const CARDNUM_CONSTRAINT = {
  keyword: 'cardnum',
  parameters: [
    { parameter: 'mask', default: false },
    { parameter: 'reveal', default: 4 },
  ],

  process: (value, _target, _location, options) => {
    const { mask, reveal } = options.args;

    // Strip formatting
    const digits = value.replace(/[\s\-.]/g, '');

    if (!/^\d+$/.test(digits)) {
      throw new ConstraintError('Invalid card number format');
    }

    if (digits.length < 12 || digits.length > 19) {
      throw new ConstraintError('Invalid card number length');
    }

    if (!luhnCheck(digits)) {
      throw new ConstraintError('Invalid card number (checksum failed)');
    }

    // Detect network for formatting (best-effort, does not gate validation)
    let groups = DEFAULT_GROUPS;
    for (const network of CARD_NETWORKS) {
      if (network.match(digits)) {
        groups = network.groups;
        break;
      }
    }

    // Apply masking
    if (mask) {
      const maskChar = (typeof mask === 'string' ? mask[0] : null) || '\u2022';
      const visible = Math.min(Math.max(0, reveal), digits.length);
      const masked = maskChar.repeat(digits.length - visible) + digits.slice(digits.length - visible);
      return formatWithGroups(masked, groups);
    }

    return formatWithGroups(digits, groups);
  }
};
