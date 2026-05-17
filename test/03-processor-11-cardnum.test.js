
import { strict as assert } from 'assert';
import { Schema } from '../src/schema.js';
import { SchemaResolver } from '../src/schema-resolver.js';
import { SchemaError, ValidationError } from '../src/errors.js';

/**
 * $cardnum constraint — canary test approach.
 *
 * Core concerns:
 *   1. Compile-time rejection of bad configuration
 *   2. Valid card numbers in various formats → network-appropriate formatting
 *   3. Invalid card numbers rejected (non-digits, bad length, Luhn failure)
 *   4. IIN-based network detection and grouping
 *   5. Mask and reveal parameters
 */
describe('Processor: cardnum', function() {
  /** @type {SchemaResolver} */
  let resolver;

  beforeEach(function() {
    resolver = new SchemaResolver();
  });

  it('should reject invalid configuration at compile time', async function() {
    assert.throws(
      () => resolver.compile(new Schema('string').validator({'$cardnum': {unexpected: true}})),
      SchemaError
    );

    assert.throws(
      () => resolver.compile(new Schema('string').validator({'$cardnum': [1, 2, 3]})),
      SchemaError
    );
  });

  it('should accept valid card numbers and format by detected network', async function() {
    const schema = await resolver.compile(new Schema('string').validator('$cardnum'));

    // Visa 16-digit: 4-4-4-4
    assert.strictEqual(await schema.validateValue('4111111111111111'), '4111 1111 1111 1111');

    // Visa with formatting stripped
    assert.strictEqual(await schema.validateValue('4111 1111 1111 1111'), '4111 1111 1111 1111');
    assert.strictEqual(await schema.validateValue('4111-1111-1111-1111'), '4111 1111 1111 1111');
    assert.strictEqual(await schema.validateValue('4111.1111.1111.1111'), '4111 1111 1111 1111');

    // Mastercard (51-55 range): 4-4-4-4
    assert.strictEqual(await schema.validateValue('5500000000000004'), '5500 0000 0000 0004');

    // Mastercard (2-series, 2221-2720 range): 4-4-4-4
    assert.strictEqual(await schema.validateValue('2223000048400011'), '2223 0000 4840 0011');

    // Amex (34): 4-6-5
    assert.strictEqual(await schema.validateValue('340000000000009'), '3400 000000 00009');

    // Amex (37): 4-6-5
    assert.strictEqual(await schema.validateValue('378282246310005'), '3782 822463 10005');

    // Discover (6011): 4-4-4-4
    assert.strictEqual(await schema.validateValue('6011111111111117'), '6011 1111 1111 1117');

    // Discover (65): 4-4-4-4
    assert.strictEqual(await schema.validateValue('6500000000000002'), '6500 0000 0000 0002');

    // Diners Club (305): 4-6-4
    assert.strictEqual(await schema.validateValue('30569309025904'), '3056 930902 5904');

    // JCB (3530): 4-4-4-4
    assert.strictEqual(await schema.validateValue('3530111333300000'), '3530 1113 3330 0000');
  });

  it('should reject invalid card numbers', async function() {
    const schema = await resolver.compile(new Schema('string').validator('$cardnum'));

    // Luhn failure (last digit changed)
    await assert.rejects(() => schema.validateValue('4111111111111112'), ValidationError);

    // Too short (11 digits)
    await assert.rejects(() => schema.validateValue('41111111111'), ValidationError);

    // Too long (20 digits)
    await assert.rejects(() => schema.validateValue('41111111111111111111'), ValidationError);

    // Contains letters
    await assert.rejects(() => schema.validateValue('4111abcd11111111'), ValidationError);

    // Empty string
    await assert.rejects(() => schema.validateValue(''), ValidationError);

    // All zeros (fails Luhn — sum is 0 but length check catches most)
    await assert.rejects(() => schema.validateValue('0000000000000001'), ValidationError);

    // Single digit
    await assert.rejects(() => schema.validateValue('4'), ValidationError);
  });

  it('should handle unrecognized prefixes with default 4-4-4-4 grouping', async function() {
    const schema = await resolver.compile(new Schema('string').validator('$cardnum'));

    // Prefix 9 is unrecognized — uses default grouping if Luhn passes
    // 9999999999999995: let's compute — need a Luhn-valid 16-digit number starting with 9
    // Use a known approach: 9000000000000007
    // Verify: 9,0,0,0,0,0,0,0,0,0,0,0,0,0,0,7
    // From right, double every other: 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9
    // doubled: 0,0,0,0,0,0,0,0,0,0,0,0,0,0 → sum = 7+0+0+0+0+0+0+0+0+0+0+0+0+0+0+9*2=18→9
    // Wait, let me do this properly: from right (pos 1 = rightmost)
    // pos16=9, pos15=0, ..., pos2=0, pos1=7
    // double even positions from right (2,4,6,...,16):
    // pos2=0→0, pos4=0→0, ..., pos16=9→18→9
    // sum = 7 + 0 + 0 + ... + 0 + 9 = 16. Not 0. Hmm.
    // Let me just find one: 9000000000000000 → Luhn?
    // sum odd positions: 0+0+0+0+0+0+0+9 = 9
    // sum doubled even: 0+0+0+0+0+0+0+0 = 0
    // total = 9. Not valid. Try 9000000000000001:
    // pos1=1, rest same. odd: 1+0+0+0+0+0+0+9=10, even: 0. total=10. Valid!
    assert.strictEqual(await schema.validateValue('9000000000000001'), '9000 0000 0000 0001');
  });

  // Masking tests use serializer — masking is a lossy presentation transform
  // for output, not an internal representation concern.

  it('should support mask parameter via serializer', async function() {
    const schema = await resolver.compile(
      new Schema('string').serializer({'$cardnum': {mask: true}})
    );

    // Visa: last 4 revealed, rest masked with bullet
    assert.strictEqual(
      await schema.serializeValue('4111111111111111'),
      '\u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 1111'
    );

    // Amex: 4-6-5 grouping preserved
    assert.strictEqual(
      await schema.serializeValue('378282246310005'),
      '\u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022\u2022\u2022 \u20220005'
    );

    // Diners: 4-6-4 grouping preserved
    assert.strictEqual(
      await schema.serializeValue('30569309025904'),
      '\u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022\u2022\u2022 5904'
    );
  });

  it('should support custom mask character via serializer', async function() {
    const schema = await resolver.compile(
      new Schema('string').serializer({'$cardnum': {mask: '*'}})
    );

    assert.strictEqual(
      await schema.serializeValue('4111111111111111'),
      '**** **** **** 1111'
    );
  });

  it('should support reveal parameter to control visible digits', async function() {
    // Reveal 6 digits
    const schema = await resolver.compile(
      new Schema('string').serializer({'$cardnum': {mask: '*', reveal: 6}})
    );

    assert.strictEqual(
      await schema.serializeValue('4111111111111111'),
      '**** **** **11 1111'
    );

    // Reveal 0 — mask everything
    const full = await resolver.compile(
      new Schema('string').serializer({'$cardnum': {mask: '*', reveal: 0}})
    );

    assert.strictEqual(
      await full.serializeValue('4111111111111111'),
      '**** **** **** ****'
    );
  });

  it('should strip mixed formatting before validation', async function() {
    const schema = await resolver.compile(new Schema('string').validator('$cardnum'));

    // Tabs, multiple spaces, mixed separators
    assert.strictEqual(
      await schema.validateValue('  4111  1111  1111  1111  '),
      '4111 1111 1111 1111'
    );

    assert.strictEqual(
      await schema.validateValue('4111 - 1111 - 1111 - 1111'),
      '4111 1111 1111 1111'
    );
  });
});
