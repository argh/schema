
import { strict as assert } from 'assert';
import { Schema } from '../src/schema.js';
import { SchemaResolver } from '../src/schema-resolver.js';

import { SchemaError } from '../src/errors.js';

describe('Processor: $lookup', function() {
  /** @type {SchemaResolver} */
  let resolver;

  beforeEach(function() {
    resolver = new SchemaResolver();
  });

  it('should reject invalid configuration at compile time', async function() {
    // array arg is not valid (wrong number of parameters)
    await assert.rejects(
      () => resolver.compile(new Schema('any').transformer({$lookup: ['apple', 'banana', 'grape']})),
      SchemaError
    );
  });

  it('should reject invalid configuration at compile time (not obj)', async function() {
    // array arg is not valid (wrong number of parameters)
    await assert.rejects(
      () => resolver.compile(new Schema('any').transformer({$lookup: 'grape'})),
      SchemaError
    );
  });

  it('should reject invalid configuration at compile time (bad param name)', async function() {
    // array arg is not valid (wrong number of parameters)
    await assert.rejects(
      () => resolver.compile(new Schema('any').transformer({$lookup: {literal: {grape:1}}})),
      SchemaError
    );
  });



  it('should return the table value corresponding to the pipeline key', async function() {
    const schema = await resolver.compile(
      new Schema('any').transformer({$lookup: {$literal: {apple: 1, banana: 2, cherry: 3}}})
    );
    assert.strictEqual(await schema.transformValue('apple'), 1);
    assert.strictEqual(await schema.transformValue('cherry'), 3);
    // key not in table returns undefined (does not throw)
    assert.strictEqual(await schema.transformValue('grape'), undefined);
  });

  it('should work as a dispatch table in a pipeline', async function() {
    // Demonstrates the discriminator use case: extract a type key, look up a label
    const schema = await resolver.compile(
      new Schema('any')
        .transformer({$get: {path: 'type'}})
        .transformer({$lookup: {$literal: {fruit: 'produce', meat: 'protein', grain: 'carb'}}})
    );
    assert.strictEqual(await schema.transformValue({type: 'fruit', name: 'apple'}), 'produce');
    assert.strictEqual(await schema.transformValue({type: 'meat', name: 'chicken'}), 'protein');
    assert.strictEqual(await schema.transformValue({type: 'unknown'}), undefined);
  });
});
