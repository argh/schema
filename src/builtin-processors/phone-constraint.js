import { ConstraintError } from '../errors.js';

/**
 * Built-in country rules. Each entry maps a country calling code to:
 * - `lengths` — accepted subscriber digit counts (after country code)
 * - `validate` — optional regex applied to subscriber digits
 * - `national` — `#`-template for national formatting
 * - `international` — `#`-template for international formatting (after `+CC `)
 *
 * Users can extend via the `countries` parameter; custom entries are merged
 * over these defaults (allowing override). Custom entries do not require
 * `validate` — only `lengths` and templates are needed.
 */
const DEFAULT_COUNTRY_RULES = {
  // NANP: area code (NPA) and exchange (NXX) cannot start with 0 or 1
  '1': {
    lengths: [10],
    validate: /^[2-9]\d{2}[2-9]\d{6}$/,
    national: '(###) ###-####',
    international: '### ### ####',
  },
};

/**
 * Strip characters commonly used as phone number formatting.
 * Preserves digits and a leading `+`.
 * @param {string} value
 * @returns {string}
 */
function stripFormatting(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('+')) {
    return '+' + trimmed.slice(1).replace(/\D/g, '');
  }
  return trimmed.replace(/\D/g, '');
}

/**
 * Replace each `#` in a template with the next digit from `digits`.
 * @param {string} digits
 * @param {string} template
 * @returns {string}
 */
function applyTemplate(digits, template) {
  let i = 0;
  return template.replace(/#/g, () => digits[i++] ?? '');
}

/**
 * ## $phone
 *
 * Validates and normalizes a phone number string.
 *
 * Strips common formatting (spaces, dashes, dots, parentheses, slashes) and
 * validates the remaining digits against country-specific rules when available,
 * or generic E.164 length rules otherwise.
 *
 * **Output format** is controlled by the `international` parameter:
 * - When `false` (default): national format for the default country
 *   (e.g. `(212) 555-1234` for country code `1`).
 * - When `true`: international format with country code prefix
 *   (e.g. `+1 212 555 1234`).
 *
 * Numbers without a `+` prefix are assumed to belong to the default `country`.
 * A leading country code without `+` is recognized when it produces a valid
 * subscriber length (e.g. `12125551234` is treated as `+1 2125551234`).
 *
 * **NANP validation (country code `1`):** area codes and exchanges must not
 * start with `0` or `1`, matching North American Numbering Plan rules.
 *
 * **Not supported:** extensions, vanity letters (1-800-FLOWERS), international
 * dialing prefixes (`00`, `011`), short codes, or emergency numbers. This
 * processor targets typical subscriber phone numbers as entered in forms or
 * configuration files.
 *
 * ### Parameters
 * - `international` (boolean, default `false`): When `false`, only numbers
 *   matching the default `country` code are accepted, and output uses the
 *   national format. When `true`, any valid international number is accepted,
 *   and output uses the international format with `+CC` prefix.
 * - `country` (string, default `'1'`): Default country calling code applied
 *   to numbers entered without a `+` prefix.
 * - `countries` (object, default `null`): Optional map of country calling
 *   codes to rule objects, merged over the built-in rules.  Each rule object
 *   may contain:
 *   - `lengths` (number[]) — accepted subscriber digit counts
 *   - `validate` (RegExp, optional) — pattern the subscriber digits must match
 *   - `national` (string) — `#`-template for national formatting
 *   - `international` (string) — `#`-template for international formatting
 *
 * ### Example
 * ```js
 * // Basic US number validation and national formatting
 * new Schema('string').validator('$phone')
 *
 * // Accept international numbers
 * new Schema('string').validator({'$phone': {international: true}})
 *
 * // Default to UK numbers
 * new Schema('string').validator({'$phone': {
 *   country: '44',
 *   countries: {
 *     '44': {lengths: [10], national: '#### ### ####', international: '#### ### ####'}
 *   }
 * }})
 *
 * // Compact storage: compose with space/punctuation stripping
 * new Schema('string').normalizer({$pipeline: ['$trim', '$phone']})
 * ```
 *
 * @type {import("../value-processor/value-processor.js").ValueProcessorDefinition}
 */
export const PHONE_CONSTRAINT = {
  keyword: 'phone',
  parameters: [
    { parameter: 'international', type: 'boolean', default: false },
    { parameter: 'country', default: '1' },
    { parameter: 'countries', default: null },
  ],

  process: (value, _target, _location, options) => {
    const { international, country, countries: customCountries } = options.args;
    const rules = customCountries
      ? { ...DEFAULT_COUNTRY_RULES, ...customCountries }
      : DEFAULT_COUNTRY_RULES;

    const stripped = stripFormatting(value);

    // After stripping, must be digits with optional leading +
    if (!stripped || !/^\+?\d+$/.test(stripped)) {
      throw new ConstraintError('Invalid phone number format');
    }

    let countryCode;
    let subscriber;

    if (stripped.startsWith('+')) {
      const digits = stripped.slice(1);

      // Match known country codes (ITU codes are prefix-free, 1-3 digits)
      let matched = false;
      for (const len of [1, 2, 3]) {
        if (len > digits.length) break;
        const candidate = digits.slice(0, len);
        if (rules[candidate]) {
          countryCode = candidate;
          subscriber = digits.slice(len);
          matched = true;
          break;
        }
      }

      if (!matched) {
        if (!international) {
          throw new ConstraintError(
            `Phone number country code does not match +${country}`
          );
        }
        // Unknown country — generic E.164 validation (total 7-15 digits)
        if (digits.length < 7 || digits.length > 15) {
          throw new ConstraintError('Invalid phone number length');
        }
        return '+' + digits;
      }
    }
    else {
      // No + prefix — match against default country
      const countryRules = rules[country];
      countryCode = country;

      if (countryRules) {
        const withCC = countryRules.lengths.map(l => l + country.length);
        if (withCC.includes(stripped.length) && stripped.startsWith(country)) {
          // Leading country code without + (e.g. 12125551234)
          subscriber = stripped.slice(country.length);
        }
        else if (countryRules.lengths.includes(stripped.length)) {
          // National number (e.g. 2125551234)
          subscriber = stripped;
        }
        else {
          throw new ConstraintError(
            `Invalid phone number length for country code +${country}`
          );
        }
      }
      else {
        // No rules for default country — accept digits as subscriber
        subscriber = stripped;
      }
    }

    // Reject international numbers when not accepted
    if (!international && countryCode !== country) {
      throw new ConstraintError(
        `International numbers not accepted; expected country code +${country}`
      );
    }

    // Country-specific validation
    const countryRules = rules[countryCode];
    if (countryRules) {
      if (!countryRules.lengths.includes(subscriber.length)) {
        throw new ConstraintError(
          `Invalid phone number length for country code +${countryCode}`
        );
      }
      if (countryRules.validate && !countryRules.validate.test(subscriber)) {
        throw new ConstraintError(
          `Invalid phone number for country code +${countryCode}`
        );
      }
    }
    else {
      // Generic E.164: total digits (cc + subscriber) must be 7-15
      const total = countryCode.length + subscriber.length;
      if (total < 7 || total > 15) {
        throw new ConstraintError('Invalid phone number length');
      }
    }

    // Format output
    if (international) {
      if (countryRules?.international) {
        return `+${countryCode} ${applyTemplate(subscriber, countryRules.international)}`;
      }
      return `+${countryCode}${subscriber}`;
    }

    if (countryRules?.national) {
      return applyTemplate(subscriber, countryRules.national);
    }
    return subscriber;
  }
};
