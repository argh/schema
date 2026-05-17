
import { strict as assert } from 'assert';
import { Schema } from '../src/schema.js';
import { SchemaResolver } from '../src/schema-resolver.js';
import { SchemaError, ValidationError } from '../src/errors.js';

/**
 * $phone constraint — canary test approach.
 *
 * Core concerns:
 *   1. Compile-time rejection of bad configuration
 *   2. Valid US numbers in various input formats → normalized national output
 *   3. Invalid US numbers rejected (NANP rules, length)
 *   4. International mode: acceptance, formatting, and rejection of unknowns
 *   5. Country parameter override
 *   6. Custom countries rules
 */
describe('Processor: phone', function() {
  /** @type {SchemaResolver} */
  let resolver;

  beforeEach(function() {
    resolver = new SchemaResolver();
  });

  it('should reject invalid configuration at compile time', async function() {
    // unknown parameter
    assert.throws(
      () => resolver.compile(new Schema('string').validator({'$phone': {unexpected: true}})),
      SchemaError
    );

    // excess positional parameters
    assert.throws(
      () => resolver.compile(new Schema('string').validator({'$phone': [1, 2, 3, 4]})),
      SchemaError
    );
  });

  it('should accept valid US numbers and normalize to national format by default', async function() {
    const schema = await resolver.compile(new Schema('string').validator('$phone'));

    // 10-digit bare
    assert.strictEqual(await schema.validateValue('2125551234'), '(212) 555-1234');

    // dashed
    assert.strictEqual(await schema.validateValue('212-555-1234'), '(212) 555-1234');

    // dotted
    assert.strictEqual(await schema.validateValue('212.555.1234'), '(212) 555-1234');

    // parenthesized area code
    assert.strictEqual(await schema.validateValue('(212) 555-1234'), '(212) 555-1234');

    // spaced
    assert.strictEqual(await schema.validateValue('212 555 1234'), '(212) 555-1234');

    // with leading country code (no +)
    assert.strictEqual(await schema.validateValue('12125551234'), '(212) 555-1234');
    assert.strictEqual(await schema.validateValue('1-212-555-1234'), '(212) 555-1234');

    // with + prefix and country code
    assert.strictEqual(await schema.validateValue('+12125551234'), '(212) 555-1234');
    assert.strictEqual(await schema.validateValue('+1 (212) 555-1234'), '(212) 555-1234');
    assert.strictEqual(await schema.validateValue('+1-212-555-1234'), '(212) 555-1234');

    // mixed formatting
    assert.strictEqual(await schema.validateValue('(212)555.1234'), '(212) 555-1234');

    // 800 number
    assert.strictEqual(await schema.validateValue('800-555-0199'), '(800) 555-0199');
  });

  it('should reject invalid US numbers', async function() {
    const schema = await resolver.compile(new Schema('string').validator('$phone'));

    // too short (6 digits)
    await assert.rejects(() => schema.validateValue('555123'), ValidationError);

    // too long (12 digits, doesn't match 10 or 11)
    await assert.rejects(() => schema.validateValue('121234567890'), ValidationError);

    // area code starts with 0
    await assert.rejects(() => schema.validateValue('012-555-1234'), ValidationError);

    // area code starts with 1
    await assert.rejects(() => schema.validateValue('112-555-1234'), ValidationError);

    // exchange starts with 0
    await assert.rejects(() => schema.validateValue('212-055-1234'), ValidationError);

    // exchange starts with 1
    await assert.rejects(() => schema.validateValue('212-155-1234'), ValidationError);

    // empty string
    await assert.rejects(() => schema.validateValue(''), ValidationError);

    // letters (vanity numbers not supported)
    await assert.rejects(() => schema.validateValue('800-FLOWERS'), ValidationError);

    // international number rejected when international=false
    await assert.rejects(() => schema.validateValue('+44 20 7946 0958'), ValidationError);

    // just a +
    await assert.rejects(() => schema.validateValue('+'), ValidationError);

    // all punctuation
    await assert.rejects(() => schema.validateValue('(---) --- ----'), ValidationError);
  });

  it('should accept and format international numbers when international=true', async function() {
    const schema = await resolver.compile(
      new Schema('string').validator({'$phone': {international: true}})
    );

    // US number → international format
    assert.strictEqual(await schema.validateValue('2125551234'), '+1 212 555 1234');
    assert.strictEqual(await schema.validateValue('+1 212 555 1234'), '+1 212 555 1234');
    assert.strictEqual(await schema.validateValue('+12125551234'), '+1 212 555 1234');

    // US number with leading 1 (no +)
    assert.strictEqual(await schema.validateValue('12125551234'), '+1 212 555 1234');

    // Unknown country code — passes generic E.164, returned as +digits
    assert.strictEqual(await schema.validateValue('+33123456789'), '+33123456789');
    assert.strictEqual(await schema.validateValue('+442079460958'), '+442079460958');
  });

  it('should reject invalid international numbers', async function() {
    const schema = await resolver.compile(
      new Schema('string').validator({'$phone': {international: true}})
    );

    // Too short for E.164 (total < 7 digits)
    await assert.rejects(() => schema.validateValue('+33123'), ValidationError);

    // Too long for E.164 (total > 15 digits)
    await assert.rejects(() => schema.validateValue('+331234567890123456'), ValidationError);

    // US number with bad NANP (still validated when country rules exist)
    await assert.rejects(() => schema.validateValue('+1 012 555 1234'), ValidationError);
  });

  it('should support country parameter to change default country', async function() {
    // Country 44 with custom rules
    const schema = await resolver.compile(
      new Schema('string').validator({'$phone': {
        country: '44',
        countries: {
          '44': {
            lengths: [10],
            national: '#### ### ####',
            international: '#### ### ####',
          }
        }
      }})
    );

    // National input → national format
    assert.strictEqual(await schema.validateValue('2079460958'), '2079 460 958');

    // With country code prefix (no +)
    assert.strictEqual(await schema.validateValue('442079460958'), '2079 460 958');

    // With + prefix
    assert.strictEqual(await schema.validateValue('+442079460958'), '2079 460 958');

    // Wrong length
    await assert.rejects(() => schema.validateValue('12345'), ValidationError);

    // US number rejected (not international mode)
    await assert.rejects(() => schema.validateValue('+12125551234'), ValidationError);
  });

  it('should support custom countries with international mode', async function() {
    const schema = await resolver.compile(
      new Schema('string').validator({'$phone': {
        international: true,
        countries: {
          '44': {
            lengths: [10],
            national: '#### ### ####',
            international: '#### ### ####',
          }
        }
      }})
    );

    // UK number → international format with template
    assert.strictEqual(await schema.validateValue('+442079460958'), '+44 2079 460 958');

    // US number still works (built-in rules preserved)
    assert.strictEqual(await schema.validateValue('+12125551234'), '+1 212 555 1234');

    // Unknown country → generic E.164
    assert.strictEqual(await schema.validateValue('+33123456789'), '+33123456789');
  });

  it('should allow custom countries to override built-in rules', async function() {
    // Override NANP with a simpler format
    const schema = await resolver.compile(
      new Schema('string').validator({'$phone': {
        countries: {
          '1': {
            lengths: [10],
            national: '###-###-####',
            international: '###-###-####',
          }
        }
      }})
    );

    // No NANP validation (no validate regex in override)
    assert.strictEqual(await schema.validateValue('0125551234'), '012-555-1234');

    // Custom national format
    assert.strictEqual(await schema.validateValue('2125551234'), '212-555-1234');
  });
});
