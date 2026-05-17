
import { strict as assert } from 'assert';
import { Schema } from '../src/schema.js';
import { SchemaResolver } from '../src/schema-resolver.js';

import { SchemaError } from '../src/errors.js';

describe('Processor: $metadata', function() {
  /** @type {SchemaResolver} */
  let resolver;

  beforeEach(function() {
    resolver = new SchemaResolver();
  });

  it('should reject missing required "name" parameter at compile time', async function() {
    assert.throws(
      () => resolver.compile(new Schema('any').transformer('$metadata')),
      SchemaError
    );
    assert.throws(
      () => resolver.compile(new Schema('any').transformer({$metadata: {schema: 'irrelevant'}})),
      SchemaError
    );
  });

  it('should extract named metadata from the current schema', async function() {
    const schema = await resolver.compile(
      new Schema('string')
        .meta('flavor', 'grape')
        .transformer({$metadata: 'flavor'})
    );
    // The transformer ignores the input and returns the schema metadata
    assert.strictEqual(await schema.transformValue('anything'), 'grape');
  });

  it('should return undefined for metadata keys that do not exist', async function() {
    const schema = await resolver.compile(
      new Schema('string').transformer({$metadata: 'no-such-key'})
    );
    assert.strictEqual(await schema.transformValue('anything'), undefined);
  });

  it('should throw when an explicit schema arg is not a CompiledSchema', async function() {
    const schema = await resolver.compile(
      new Schema('string').transformer({$metadata: {name: 'flavor', schema: '$input'}})
    );
    // $input returns the string input value — not a CompiledSchema — so $metadata should throw
    await assert.rejects(() => schema.transformValue('not-a-schema'), SchemaError);
  });

  it('should extract metadata from a sibling schema via $find-schema', async function() {
    // A child property uses [$find-schema, $metadata] to read metadata defined on a sibling.
    const schema = await resolver.compile(
      new Schema('object')
        .property('fruit', new Schema('string').meta('color', 'red'))
        .property('fruit-color', new Schema('any')
          .transformer([{'$find-schema': '^.fruit'}, {'$metadata': {name: 'color', schema: '$input'}}])
        )
    );
    const result = await schema.process({fruit: 'apple', 'fruit-color': 'placeholder'});
    assert.strictEqual(result['fruit-color'], 'red');
  });

  it('should inherit metadata from parent schema by default', async function() {
    const schema = await resolver.compile(
      new Schema('object')
        .meta('flavor', 'grape')
        .property('taste', new Schema('any').transformer({$metadata: 'flavor'}))
    );
    // 'taste' has no 'flavor' metadata of its own; should walk up and find it on the parent
    const result = await schema.process({taste: 'placeholder'});
    assert.strictEqual(result.taste, 'grape');

    // child metadata shadows parent
    const shadowSchema = await resolver.compile(
      new Schema('object')
        .meta('flavor', 'grape')
        .property('taste', new Schema('any')
          .meta('flavor', 'cherry')
          .transformer({$metadata: 'flavor'})
        )
    );
    const shadowResult = await shadowSchema.process({taste: 'placeholder'});
    assert.strictEqual(shadowResult.taste, 'cherry');
  });

  it('should suppress inheritance when inherit is false', async function() {
    const schema = await resolver.compile(
      new Schema('object')
        .meta('flavor', 'grape')
        .property('taste', new Schema('any')
          .transformer({$metadata: {name: 'flavor', inherit: false}})
        )
    );
    // parent has 'flavor' but inherit:false should prevent the walk
    const result = await schema.process({taste: 'placeholder'});
    assert.strictEqual(result.taste, undefined);

    // same schema but with inherit left at default (true) — should find it
    const inheritSchema = await resolver.compile(
      new Schema('object')
        .meta('flavor', 'grape')
        .property('taste', new Schema('any')
          .transformer({$metadata: {name: 'flavor', inherit: true}})
        )
    );
    const inheritResult = await inheritSchema.process({taste: 'placeholder'});
    assert.strictEqual(inheritResult.taste, 'grape');
  });

  it('should resolve a path-based schema and inherit from its location', async function() {
    // Direct metadata on the path target
    const schema = await resolver.compile(
      new Schema('object')
        .property('fruit', new Schema('string').meta('color', 'red'))
        .property('fruit-color', new Schema('any')
          .transformer({$metadata: {name: 'color', schema: '^.fruit'}})
        )
    );
    const result = await schema.process({fruit: 'apple', 'fruit-color': 'placeholder'});
    assert.strictEqual(result['fruit-color'], 'red');

    // Inheritance through the path: 'fruit' lacks 'season' but the root has it
    const inheritSchema = await resolver.compile(
      new Schema('object')
        .meta('season', 'autumn')
        .property('fruit', new Schema('string'))
        .property('fruit-season', new Schema('any')
          .transformer({$metadata: {name: 'season', schema: '^.fruit'}})
        )
    );
    const inheritResult = await inheritSchema.process({fruit: 'apple', 'fruit-season': 'placeholder'});
    assert.strictEqual(inheritResult['fruit-season'], 'autumn');
  });

  it('should suppress inheritance on path-based lookup when inherit is false', async function() {
    const schema = await resolver.compile(
      new Schema('object')
        .meta('season', 'autumn')
        .property('fruit', new Schema('string'))
        .property('fruit-season', new Schema('any')
          .transformer({$metadata: {name: 'season', schema: '^.fruit', inherit: false}})
        )
    );
    // 'fruit' has no 'season'; parent does, but inherit:false prevents the walk
    const result = await schema.process({fruit: 'apple', 'fruit-season': 'placeholder'});
    assert.strictEqual(result['fruit-season'], undefined);
  });

  it('should throw SchemaError for an unresolvable path', async function() {
    const schema = await resolver.compile(
      new Schema('object')
        .property('taste', new Schema('any')
          .transformer({$metadata: {name: 'flavor', schema: '^.nonexistent'}})
        )
    );
    await assert.rejects(() => schema.process({taste: 'placeholder'}), SchemaError);
  });
});
