
import { strict as assert } from 'assert';
import { Schema } from '../src/schema.js';
import { SchemaResolver } from '../src/schema-resolver.js';
import { ValidationError } from '../src/errors.js';

describe('Processor: exclusive', function() {
  /** @type {SchemaResolver} */
  let resolver;

  beforeEach(function() {
    resolver = new SchemaResolver();
  });

  it('should accept when exactly one condition is truthy', async function() {
    const compiled = await resolver.compile(
      new Schema('string').validator({
        $exclusive: [{$matches: /^cat/}, {$matches: /^dog/}]
      })
    );

    // only first matches
    assert.strictEqual(await compiled.validateValue('catfish'), 'catfish');
    // only second matches
    assert.strictEqual(await compiled.validateValue('dogwood'), 'dogwood');
  });

  it('should reject when no conditions are truthy', async function() {
    const compiled = await resolver.compile(
      new Schema('string').validator({
        $exclusive: [{$matches: /^cat/}, {$matches: /^dog/}]
      })
    );

    await assert.rejects(() => compiled.validateValue('bird'), ValidationError);
  });

  it('should reject when multiple conditions are truthy', async function() {
    const compiled = await resolver.compile(
      new Schema('string').validator({
        $exclusive: [{$matches: /fish/}, {$matches: /cat/}]
      })
    );

    // 'catfish' matches both /fish/ and /cat/
    await assert.rejects(() => compiled.validateValue('catfish'), ValidationError);
  });

  it('should return the single matching result', async function() {
    // $exclusive returns the truthy result from whichever branch matched
    const compiled = await resolver.compile(
      new Schema('string').validator({
        $exclusive: [{$matches: /^cat/}, {$matches: /^dog/}]
      })
    );

    // the matching result should be the original value (passed through the successful processor)
    const result = await compiled.validateValue('catfish');
    assert.strictEqual(result, 'catfish');
  });

  it('should short-circuit on second match without evaluating remaining', async function() {
    // three conditions, first two match — should fail without needing the third
    const compiled = await resolver.compile(
      new Schema('string').validator({
        $exclusive: [{$matches: /a/}, {$matches: /a/}, '$never']
      })
    );

    // both /a/ match, so fails on the second — $never is never reached
    await assert.rejects(() => compiled.validateValue('abc'), ValidationError);
  });

  it('should generate combined description', async function() {
    const compiled = await resolver.compile(
      new Schema('string').validator({
        $exclusive: [{$matches: /^cat/}, {$matches: /^dog/}]
      })
    );

    assert.strictEqual(compiled.metadata.valueDescription, '[/^cat/ ⊕ /^dog/]');
  });
});

describe('Processor: one', function() {
  /** @type {SchemaResolver} */
  let resolver;

  beforeEach(function() {
    resolver = new SchemaResolver();
  });

  it('should accept when exactly one condition succeeds (returns defined value)', async function() {
    const compiled = await resolver.compile(
      new Schema('string').validator({
        $one: ['$numeric', '$alpha']
      })
    );

    // only $numeric succeeds
    assert.strictEqual(await compiled.validateValue('123'), '123');
    // only $alpha succeeds
    assert.strictEqual(await compiled.validateValue('abc'), 'abc');
  });

  it('should reject when no conditions succeed', async function() {
    const compiled = await resolver.compile(
      new Schema('string').validator({
        $one: ['$numeric', '$alpha']
      })
    );

    // neither $numeric nor $alpha succeeds for mixed input
    await assert.rejects(() => compiled.validateValue('12ab!'), ValidationError);
  });

  it('should reject when multiple conditions succeed', async function() {
    // $nonempty and $alpha both succeed for a pure-alpha string
    const compiled = await resolver.compile(
      new Schema('string').validator({
        $one: ['$non-empty', '$alpha']
      })
    );

    await assert.rejects(() => compiled.validateValue('abc'), ValidationError);
  });

  it('should treat thrown errors as non-matching (captured)', async function() {
    // $ipv4 throws for non-IPs, $numeric throws for non-numbers — both fail, zero matches
    const compiled = await resolver.compile(
      new Schema('string').validator({
        $one: ['$ipv4', '$numeric']
      })
    );

    await assert.rejects(() => compiled.validateValue('hello'), ValidationError);

    // only $ipv4 succeeds
    assert.strictEqual(await compiled.validateValue('192.168.1.1'), '192.168.1.1');
  });
});
