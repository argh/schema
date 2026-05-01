import { ConstraintError } from '../errors.js';
import { isFalsey } from '../helpers/truthy.js';

// Username: letters, digits, and limited special chars (._%+-)
// No leading/trailing dot, no consecutive dots
// Domain: 2+ dot-separated labels of letters/digits/hyphens, ending with 2+ letter TLD
// No consecutive dots, no leading/trailing hyphens in labels
const EMAIL_REGEX =
  /^[a-zA-Z0-9_%+-](?:[a-zA-Z0-9_%+.-]*[a-zA-Z0-9_%+-])?@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

// Additional check: no consecutive dots in local part
const CONSECUTIVE_DOTS = /\.\./;

/**
 * ## $email
 *
 * Validates that a string matches a practical email address format (local-part@domain.tld).
 *
 * **Username (local part):**
 * - Allowed characters: letters, digits, `.`, `_`, `%`, `+`, `-`
 * - Must not start or end with a dot
 * - Must not contain consecutive dots
 *
 * **Domain:**
 * - Must consist of at least two dot-separated labels (e.g. `example.com`)
 * - Labels may contain letters, digits, and hyphens (no leading/trailing hyphens)
 * - Must not contain consecutive dots
 * - Must end in a TLD of 2+ letters
 *
 * **Not supported (by design):** quoted local parts, comments, IP address literals, emoji,
 * non-ASCII characters.  This processor is intended to handle addresses as they are typically
 * used.  If you need to support all the madness that the official RFC allows, you'll need to
 * write your own version.
 *
 * The default behavior is to convert the address to lower case for consistency, but this
 * can be overridden.
 *
 * ### Parameters
 * - `case` (string, default `'lower'`): Case conversion applied to the domain portion,
 *   and (unless overridden by `case-sensitive`) to the username portion as well.
 *   Accepts `'lower'` or `'upper'`, or if falsey, doesn't do any conversion.
 * - `case-sensitive` (boolean, default `false`): When `true`, preserve the original case of
 *   the username portion. When `false`, the username is converted using the `case` parameter.
 *   (Rationale: RFC 5321 technically allows case-sensitive local parts, but virtually all
 *   providers treat them as case-insensitive.)
 * - `filter` (boolean, default `false`): When `true`, strip plus-addressing
 *   (e.g. `user+tag@` becomes `user@`), and for `gmail.com` domains, additionally remove
 *   all dots from the username (since Gmail ignores them).
 *
 * ### Example
 * ```js
 * // Basic validation only
 * new Schema('string').validator('$email')
 *
 * // Normalize to lowercase, strip plus-addressing
 * new Schema('string').validator({'$email': {filter: true}})
 *
 * // Preserve username case
 * new Schema('string').validator({'$email': {'case-sensitive': true}})
 *
 * // Work for the government and like to shout at people?
 * new Schema('string').validator({'$email': {'case': 'upper'}}
 * ```
 *
 * @type {import("../value-processor/value-processor.js").ValueProcessorDefinition}
 */
export const EMAIL_CONSTRAINT = {
  keyword: 'email',
  parameters: [
    { parameter: 'case', default: 'lower' },
    { parameter: 'case-sensitive', type: 'boolean', default: false },
    { parameter: 'filter', type: 'boolean', default: false },
  ],

  process: (value, _target, _location, options) => {
    const { 'case': caseParam, 'case-sensitive': caseSensitive, filter } = options.args;

    if (!EMAIL_REGEX.test(value)) {
      throw new ConstraintError('Invalid email format');
    }

    const atIndex = value.lastIndexOf('@');
    let username = value.slice(0, atIndex);
    let domain = value.slice(atIndex + 1);

    // Reject consecutive dots in local part (regex alone can't catch all combos cleanly)
    if (CONSECUTIVE_DOTS.test(username)) {
      throw new ConstraintError('Invalid email format');
    }

    // Apply filter: strip plus-addressing and gmail dot normalization
    if (filter) {
      const plusIndex = username.indexOf('+');
      if (plusIndex !== -1) {
        username = username.slice(0, plusIndex);
      }
      if (domain.toLowerCase() === 'gmail.com') {
        username = username.replace(/\./g, '');
      }
    }

    // Apply case conversion

    const applyCase = isFalsey(caseParam)? (s) => s : (caseParam === 'upper' ? (s) => s.toUpperCase() : (s) => s.toLowerCase());
    domain = applyCase(domain);
    if (!caseSensitive) {
      username = applyCase(username);
    }

    return `${username}@${domain}`;
  }
};
