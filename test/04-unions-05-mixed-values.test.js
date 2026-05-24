
import { strict as assert } from 'assert';
import { Schema } from '../src/schema.js';
import { SchemaResolver } from '../src/schema-resolver.js';
import { ValidationError } from '../src/errors.js';

describe('Unions: Mixed Values (some members define .values(), others do not)', function() {
  /** @type {SchemaResolver} */
  let resolver;

  // One union member accepts named strings with .values() and transforms them
  // to integers; the other accepts raw integers directly with no .values().
  // Both members output integers 1-10 via a shared base schema.
  //
  // Because scalar union members don't re-normalize after discrimination (the
  // parent's normalize step runs before resolveUnion swaps in the member schema),
  // normalizers must be compatible across members.  Member-specific input
  // conversion belongs in the transformer, not the normalizer.

  const nameToNumber = {
    one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10
  };
  const names = Object.keys(nameToNumber);

  const oneToTenInteger = new Schema()
    .validator(['$integer', {$range: [1, 10]}]);

  beforeEach(function() {
    resolver = new SchemaResolver();
    resolver.registerValueProcessor('name-to-number', v => {
      const result = nameToNumber[String(v).toLowerCase()];
      if (result === undefined) {
        throw new Error(`Unknown name: ${v}`);
      }
      return result;
    });
  });

  // -- Scalar union with $type discriminator ----------------------------------

  describe('scalar union with $type discriminator', function() {
    /** @type {import('../src/compiled-schema.js').CompiledSchema} */
    let compiled;

    beforeEach(async function() {
      compiled = await resolver.compile(
        new Schema()
          .unionDiscriminator('$type')
          .unionSchema('string', new Schema(oneToTenInteger)
            .values(names)
            .transformer('$name-to-number')
          )
          .unionSchema('number', new Schema(oneToTenInteger))
      );
    });

    it('should compile and identify as a union', function() {
      assert.ok(compiled.isUnion);
      assert.strictEqual(Object.keys(compiled.unionSchemas).length, 2);
    });

    it('should discriminate strings to the named member and numbers to the numeric member', async function() {
      const strResult = await compiled.discriminateUnion('two');
      assert.strictEqual(compiled.findUnionKey(strResult), 'string');

      const numResult = await compiled.discriminateUnion(3);
      assert.strictEqual(compiled.findUnionKey(numResult), 'number');
    });

    it('should process string names into integers and pass integers through', async function() {
      assert.strictEqual(await compiled.process('one'), 1);
      assert.strictEqual(await compiled.process('ten'), 10);
      assert.strictEqual(await compiled.process(5), 5);
      assert.strictEqual(await compiled.process(1), 1);
      assert.strictEqual(await compiled.process(10), 10);
    });

    it('should reject invalid values in both members', async function() {
      await assert.rejects(compiled.process('eleventy'));
      await assert.rejects(compiled.process(20), ValidationError);
      await assert.rejects(compiled.process(3.5), ValidationError);
    });
  });

  // -- Object property union with $type discriminator -------------------------

  describe('object property union with $type discriminator', function() {
    /** @type {import('../src/compiled-schema.js').CompiledSchema} */
    let compiled;

    beforeEach(async function() {
      compiled = await resolver.compile(
        new Schema('object')
          .property('rating', new Schema()
            .unionDiscriminator('$type')
            .unionSchema('string', new Schema(oneToTenInteger)
              .values(names)
              .transformer('$name-to-number')
            )
            .unionSchema('number', new Schema(oneToTenInteger))
          )
      );
    });

    it('should compile with mixed-values members under an object property', function() {
      assert.ok(compiled.properties.rating.isUnion);
    });

    it('should process string names through the named member and transform to integers', async function() {
      assert.strictEqual((await compiled.process({rating: 'three'})).rating, 3);
      assert.strictEqual((await compiled.process({rating: 'seven'})).rating, 7);
    });

    it('should process raw integers through the numeric member unchanged', async function() {
      assert.strictEqual((await compiled.process({rating: 5})).rating, 5);
      assert.strictEqual((await compiled.process({rating: 1})).rating, 1);
      assert.strictEqual((await compiled.process({rating: 10})).rating, 10);
    });

    it('should reject invalid values regardless of member', async function() {
      await assert.rejects(compiled.process({rating: 'eleventy'}));
      await assert.rejects(compiled.process({rating: 20}), ValidationError);
      await assert.rejects(compiled.process({rating: 3.5}), ValidationError);
    });
  });

  // -- Object property union with custom function discriminator ---------------

  describe('object property union with custom function discriminator', function() {
    /** @type {import('../src/compiled-schema.js').CompiledSchema} */
    let compiled;

    beforeEach(async function() {
      compiled = await resolver.compile(
        new Schema('object')
          .property('rating', new Schema()
            .unionDiscriminator((value, _target, location) => {
              const union = location.schema;
              if (typeof value === 'string') return union.unionSchemas.named;
              if (typeof value === 'number') return union.unionSchemas.numeric;
              return undefined;
            })
            .unionSchema('named', new Schema(oneToTenInteger)
              .values(names)
              .transformer('$name-to-number')
            )
            .unionSchema('numeric', new Schema(oneToTenInteger))
          )
      );
    });

    it('should compile with a custom discriminator function', function() {
      assert.ok(compiled.properties.rating.isUnion);
    });

    it('should process string names via the named member', async function() {
      assert.strictEqual((await compiled.process({rating: 'five'})).rating, 5);
    });

    it('should process integers via the numeric member', async function() {
      assert.strictEqual((await compiled.process({rating: 7})).rating, 7);
    });

    it('should reject invalid values', async function() {
      await assert.rejects(compiled.process({rating: 'nope'}));
      await assert.rejects(compiled.process({rating: 42}), ValidationError);
    });
  });

  // -- Soft values: hoisting and wildcard expansion ----------------------------

  describe('soft values (allowUnknownValues)', function() {
    it('should hoist known values with allowUnknownValues when not all members define values', async function() {
      const compiled = await resolver.compile(
        new Schema()
          .unionDiscriminator('$type')
          .unionSchema('string', new Schema(oneToTenInteger)
            .values(names)
            .transformer('$name-to-number')
          )
          .unionSchema('number', new Schema(oneToTenInteger))
      );

      // Values should be hoisted from the member that defines them
      assert.ok(compiled.hasValues,
        'Union should hoist known values even when some members lack them');
      assert.deepStrictEqual(compiled.values.sort(), [...names].sort());

      // But the union should allow unknown values (from the unconstrained member)
      assert.strictEqual(compiled.options.allowUnknownValues, true);
    });

    it('should not set allowUnknownValues when all members define values', async function() {
      const compiled = await resolver.compile(
        new Schema()
          .unionDiscriminator('$type')
          .unionSchema('string', new Schema('string')
            .values(['a', 'b'])
          )
          .unionSchema('number', new Schema('number')
            .values([1, 2])
          )
      );

      assert.ok(compiled.hasValues);
      assert.ok(!compiled.options.allowUnknownValues);
    });

    it('should not gate ensureAccepts when allowUnknownValues is set', async function() {
      const compiled = await resolver.compile(
        new Schema()
          .unionDiscriminator('$type')
          .unionSchema('string', new Schema(oneToTenInteger)
            .values(names)
            .transformer('$name-to-number')
          )
          .unionSchema('number', new Schema(oneToTenInteger))
      );

      // Integer 5 is not in the string values list, but should pass
      // ensureAccepts because the union allows unknown values
      assert.doesNotThrow(() => compiled.ensureAccepts(5));
      assert.ok(compiled.checkAccepts(5));
    });

    it('should expand "*" to known values in an array with mixed-values union wildcard', async function() {
      // The loadPlugins use case: array of unions where one member has known
      // names and the other accepts arbitrary instances
      const compiled = await resolver.compile(
        new Schema('object')
          .property('plugins', new Schema('array')
            .property('*', new Schema()
              .unionDiscriminator('$type')
              .unionSchema('string', new Schema('string')
                .values(['auth', 'cache', 'logger'])
              )
              .unionSchema('object', new Schema('object'))
            )
          )
      );

      const assignments = new Map([
        ['plugins', '*']
      ]);

      const result = await compiled.processAssignments(assignments);
      assert.deepStrictEqual(result, {
        plugins: ['auth', 'cache', 'logger']
      });
    });
  });
});
