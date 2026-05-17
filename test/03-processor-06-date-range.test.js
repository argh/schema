
import { strict as assert } from 'assert';
import { Schema } from '../src/schema.js';
import { SchemaResolver } from '../src/schema-resolver.js';
import { SchemaError, ValidationError } from '../src/errors.js';

/**
 * $date-range constraint — canary test approach (see 03-processor-04-eq for rationale).
 *
 * Three concerns:
 *   1. Compile-time rejection of bad configuration
 *   2. Canary set of valid dates across parameter forms (object, min-only, max-only, dynamic $reference)
 *   3. Canary set of invalid dates that should be rejected
 */
describe('Processor: date-range', function() {
  /** @type {SchemaResolver} */
  let resolver;

  beforeEach(function() {
    resolver = new SchemaResolver();
  });

  it('should reject invalid configuration at compile time', async function() {
    // unknown parameter
    assert.throws(() => resolver.compile(new Schema('date').validator({'$date-range': {unexpected: 1}})), SchemaError);

    // excess positional parameters
    assert.throws(() => resolver.compile(new Schema('date').validator({'$date-range': [1, 2, 3]})), SchemaError);
  });

  it('should pass through dates within the specified range', async function() {
    const jan1 = new Date('2025-01-01T00:00:00Z');
    const jun15 = new Date('2025-06-15T00:00:00Z');
    const dec31 = new Date('2025-12-31T23:59:59Z');

    // both bounds — named object form
    const bothSchema = await resolver.compile(new Schema('date').validator({'$date-range': {min: jan1, max: dec31}}));
    assert.deepStrictEqual(await bothSchema.validateValue(jun15), jun15);
    assert.deepStrictEqual(await bothSchema.validateValue(jan1), jan1);   // inclusive min boundary
    assert.deepStrictEqual(await bothSchema.validateValue(dec31), dec31); // inclusive max boundary

    // min-only — ISO string as bound (exercises parseDate coercion in the parameter)
    const minSchema = await resolver.compile(new Schema('date').validator({'$date-range': {min: '2025-01-01T00:00:00Z'}}));
    assert.deepStrictEqual(await minSchema.validateValue(jun15), jun15);
    assert.deepStrictEqual(await minSchema.validateValue(dec31), dec31);

    // max-only — named object form
    const maxSchema = await resolver.compile(new Schema('date').validator({'$date-range': {max: dec31}}));
    assert.deepStrictEqual(await maxSchema.validateValue(jan1), jan1);
    assert.deepStrictEqual(await maxSchema.validateValue(jun15), jun15);
  });

  it('should reject dates outside the specified range', async function() {
    const jan1 = new Date('2025-01-01T00:00:00Z');
    const dec31 = new Date('2025-12-31T23:59:59Z');

    const schema = await resolver.compile(new Schema('date').validator({'$date-range': {min: jan1, max: dec31}}));

    // before min
    await assert.rejects(() => schema.validateValue(new Date('2024-12-31T23:59:59Z')), ValidationError);

    // after max
    await assert.rejects(() => schema.validateValue(new Date('2026-01-01T00:00:00Z')), ValidationError);

    // min-only rejects earlier
    const minSchema = await resolver.compile(new Schema('date').validator({'$date-range': {min: jan1}}));
    await assert.rejects(() => minSchema.validateValue(new Date('2024-06-01T00:00:00Z')), ValidationError);
  });

  it('should support dynamic bounds via $reference for cross-field validation', async function() {
    const schema = await resolver.compile(
      new Schema('object')
        .property('start', new Schema('date').required())
        .property('end', new Schema('date').required()
          .validator({'$date-range': {min: {$reference: '^start'}}})
        )
    );

    // end after start — valid
    const valid = await schema.process({ start: '2025-03-01T09:00:00Z', end: '2025-03-01T10:00:00Z' });
    assert.ok(valid.end >= valid.start);

    // end equal to start — valid (inclusive)
    const equal = await schema.process({ start: '2025-03-01T09:00:00Z', end: '2025-03-01T09:00:00Z' });
    assert.ok(equal.end >= equal.start);

    // end before start — invalid
    await assert.rejects(
      () => schema.process({ start: '2025-03-01T10:00:00Z', end: '2025-03-01T09:00:00Z' }),
      ValidationError
    );
  });
});
