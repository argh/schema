
import { strict as assert } from 'assert';
import { Schema } from '../src/schema.js';
import { SchemaResolver } from '../src/schema-resolver.js';
import { SchemaError, ValidationError } from '../src/errors.js';

describe('Processor: instanceof', function() {
  /** @type {SchemaResolver} */
  let resolver;

  class Parrot {}
  class Macaw extends Parrot {}

  beforeEach(function() {
    resolver = new SchemaResolver();
  });

  it('should reject invalid configuration at compile time', async function() {
    // missing required clazz parameter
    assert.throws(() => resolver.compile(new Schema('any').validator('$instanceof')), SchemaError);

    // non-function argument
    assert.throws(() => resolver.compile(new Schema('any').validator({$instanceof: 'Parrot'})), SchemaError);
    assert.throws(() => resolver.compile(new Schema('any').validator({$instanceof: 42})), SchemaError);
  });

  it('should pass through the input when it is an instance of the target', async function() {
    const schema = await resolver.compile(new Schema('any').validator({$instanceof: Parrot}));

    // direct instance
    const parrot = new Parrot();
    assert.strictEqual(await schema.validateValue(parrot), parrot);

    // subclass satisfies instanceof
    const macaw = new Macaw();
    assert.strictEqual(await schema.validateValue(macaw), macaw);

    // builtin constructors
    const mapSchema = await resolver.compile(new Schema('any').validator({$instanceof: Map}));
    const m = new Map();
    assert.strictEqual(await mapSchema.validateValue(m), m);
  });

  it('should throw for values that are not instances of the target', async function() {
    const schema = await resolver.compile(new Schema('any').validator({$instanceof: Parrot}));

    await assert.rejects(() => schema.validateValue('not a parrot'), ValidationError);
    await assert.rejects(() => schema.validateValue(42), ValidationError);
    await assert.rejects(() => schema.validateValue({}), ValidationError);
    await assert.rejects(() => schema.validateValue(new Map()), ValidationError);
  });
});
