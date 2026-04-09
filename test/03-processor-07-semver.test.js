
import { strict as assert } from 'assert';
import { Schema } from '../src/schema.js';
import { SchemaResolver } from '../src/schema-resolver.js';
import { SchemaError, ValidationError } from '../src/errors.js';

describe('Processor: semver', function() {
  /** @type {SchemaResolver} */
  let resolver;

  beforeEach(function() {
    resolver = new SchemaResolver();
  });

  // --- format-only validation (no parameters) ---

  it('should accept valid semver strings without parameters', async function() {
    const compiled = await resolver.compile(new Schema('string').validator('$semver'));

    assert.strictEqual(await compiled.validateValue('1.0.0'), '1.0.0');
    assert.strictEqual(await compiled.validateValue('0.0.0'), '0.0.0');
    assert.strictEqual(await compiled.validateValue('12.345.678'), '12.345.678');
    assert.strictEqual(await compiled.validateValue('1.0.0-alpha'), '1.0.0-alpha');
    assert.strictEqual(await compiled.validateValue('1.0.0-alpha.1'), '1.0.0-alpha.1');
    assert.strictEqual(await compiled.validateValue('1.0.0+build.123'), '1.0.0+build.123');
    assert.strictEqual(await compiled.validateValue('1.0.0-beta.2+build.456'), '1.0.0-beta.2+build.456');
  });

  it('should reject invalid semver strings', async function() {
    const compiled = await resolver.compile(new Schema('string').validator('$semver'));

    await assert.rejects(() => compiled.validateValue('1.0'), ValidationError);          // missing patch
    await assert.rejects(() => compiled.validateValue('1'), ValidationError);            // missing minor+patch
    await assert.rejects(() => compiled.validateValue('v1.0.0'), ValidationError);       // leading v
    await assert.rejects(() => compiled.validateValue('1.0.0.0'), ValidationError);      // extra segment
    await assert.rejects(() => compiled.validateValue('01.0.0'), ValidationError);       // leading zero
    await assert.rejects(() => compiled.validateValue('1.0.0-'), ValidationError);       // trailing dash
    await assert.rejects(() => compiled.validateValue(''), ValidationError);
    await assert.rejects(() => compiled.validateValue('not.a.version'), ValidationError);
  });

  // --- caret ranges via "in" parameter ---

  it('should accept versions within a caret range', async function() {
    // ^1.2.3 means >=1.2.3 <2.0.0
    const compiled = await resolver.compile(new Schema('string').validator({$semver: '^1.2.3'}));

    assert.strictEqual(await compiled.validateValue('1.2.3'), '1.2.3');
    assert.strictEqual(await compiled.validateValue('1.9.99'), '1.9.99');
    assert.strictEqual(await compiled.validateValue('1.2.4'), '1.2.4');
  });

  it('should reject versions outside a caret range', async function() {
    const compiled = await resolver.compile(new Schema('string').validator({$semver: '^1.2.3'}));

    await assert.rejects(() => compiled.validateValue('1.2.2'), ValidationError);  // below floor
    await assert.rejects(() => compiled.validateValue('2.0.0'), ValidationError);  // next major
    await assert.rejects(() => compiled.validateValue('0.9.0'), ValidationError);
  });

  it('should handle caret range for 0.x correctly', async function() {
    // ^0.2.3 means >=0.2.3 <0.3.0
    const compiled = await resolver.compile(new Schema('string').validator({$semver: '^0.2.3'}));

    assert.strictEqual(await compiled.validateValue('0.2.3'), '0.2.3');
    assert.strictEqual(await compiled.validateValue('0.2.99'), '0.2.99');
    await assert.rejects(() => compiled.validateValue('0.3.0'), ValidationError);
    await assert.rejects(() => compiled.validateValue('0.2.2'), ValidationError);

    // ^0.0.3 means >=0.0.3 <0.0.4
    const pinned = await resolver.compile(new Schema('string').validator({$semver: '^0.0.3'}));
    assert.strictEqual(await pinned.validateValue('0.0.3'), '0.0.3');
    await assert.rejects(() => pinned.validateValue('0.0.4'), ValidationError);
  });

  // --- tilde ranges ---

  it('should accept versions within a tilde range', async function() {
    // ~1.2.3 means >=1.2.3 <1.3.0
    const compiled = await resolver.compile(new Schema('string').validator({$semver: '~1.2.3'}));

    assert.strictEqual(await compiled.validateValue('1.2.3'), '1.2.3');
    assert.strictEqual(await compiled.validateValue('1.2.99'), '1.2.99');
    await assert.rejects(() => compiled.validateValue('1.3.0'), ValidationError);
    await assert.rejects(() => compiled.validateValue('1.2.2'), ValidationError);
  });

  // --- comparator ranges ---

  it('should accept versions matching comparator expressions', async function() {
    const gte = await resolver.compile(new Schema('string').validator({$semver: '>=1.0.0'}));
    assert.strictEqual(await gte.validateValue('1.0.0'), '1.0.0');
    assert.strictEqual(await gte.validateValue('99.0.0'), '99.0.0');
    await assert.rejects(() => gte.validateValue('0.99.99'), ValidationError);

    const lt = await resolver.compile(new Schema('string').validator({$semver: '<2.0.0'}));
    assert.strictEqual(await lt.validateValue('1.99.99'), '1.99.99');
    assert.strictEqual(await lt.validateValue('0.0.0'), '0.0.0');
    await assert.rejects(() => lt.validateValue('2.0.0'), ValidationError);

    // exact match
    const eq = await resolver.compile(new Schema('string').validator({$semver: '=1.5.0'}));
    assert.strictEqual(await eq.validateValue('1.5.0'), '1.5.0');
    await assert.rejects(() => eq.validateValue('1.5.1'), ValidationError);

    // bare version is treated as exact match
    const bare = await resolver.compile(new Schema('string').validator({$semver: '1.5.0'}));
    assert.strictEqual(await bare.validateValue('1.5.0'), '1.5.0');
    await assert.rejects(() => bare.validateValue('1.5.1'), ValidationError);
  });

  it('should support space-separated AND of comparators', async function() {
    const compiled = await resolver.compile(new Schema('string').validator({$semver: '>=1.0.0 <2.0.0'}));

    assert.strictEqual(await compiled.validateValue('1.0.0'), '1.0.0');
    assert.strictEqual(await compiled.validateValue('1.99.99'), '1.99.99');
    await assert.rejects(() => compiled.validateValue('0.99.99'), ValidationError);
    await assert.rejects(() => compiled.validateValue('2.0.0'), ValidationError);
  });

  // --- pre-release ordering ---

  it('should order pre-release versions below their release per spec', async function() {
    // >=1.0.0 should reject 1.0.0-alpha (prerelease < release)
    const gte = await resolver.compile(new Schema('string').validator({$semver: '>=1.0.0'}));
    await assert.rejects(() => gte.validateValue('1.0.0-alpha'), ValidationError);
    assert.strictEqual(await gte.validateValue('1.0.0'), '1.0.0');

    // >=1.0.0-alpha should accept 1.0.0-beta (beta > alpha lexicographically)
    const gteAlpha = await resolver.compile(new Schema('string').validator({$semver: '>=1.0.0-alpha'}));
    assert.strictEqual(await gteAlpha.validateValue('1.0.0-beta'), '1.0.0-beta');
    assert.strictEqual(await gteAlpha.validateValue('1.0.0'), '1.0.0');
  });

  // --- explicit {in: ...} object form ---

  it('should accept explicit {in: ...} object form', async function() {
    const compiled = await resolver.compile(new Schema('string').validator({$semver: {in: '^2.0.0'}}));

    assert.strictEqual(await compiled.validateValue('2.1.0'), '2.1.0');
    await assert.rejects(() => compiled.validateValue('3.0.0'), ValidationError);
  });

  // --- min/max range (inclusive) ---

  it('should accept versions within min/max bounds (inclusive)', async function() {
    const compiled = await resolver.compile(new Schema('string').validator({$semver: {min: '1.0.0', max: '2.0.0'}}));

    assert.strictEqual(await compiled.validateValue('1.0.0'), '1.0.0');     // min boundary
    assert.strictEqual(await compiled.validateValue('1.5.0'), '1.5.0');     // mid-range
    assert.strictEqual(await compiled.validateValue('2.0.0'), '2.0.0');     // max boundary (inclusive)
  });

  it('should reject versions outside min/max bounds', async function() {
    const compiled = await resolver.compile(new Schema('string').validator({$semver: {min: '1.0.0', max: '2.0.0'}}));

    await assert.rejects(() => compiled.validateValue('0.99.99'), ValidationError);
    await assert.rejects(() => compiled.validateValue('2.0.1'), ValidationError);
  });

  it('should support min-only and max-only bounds', async function() {
    const minOnly = await resolver.compile(new Schema('string').validator({$semver: {min: '1.0.0'}}));
    assert.strictEqual(await minOnly.validateValue('1.0.0'), '1.0.0');
    assert.strictEqual(await minOnly.validateValue('99.0.0'), '99.0.0');
    await assert.rejects(() => minOnly.validateValue('0.99.99'), ValidationError);

    const maxOnly = await resolver.compile(new Schema('string').validator({$semver: {max: '3.0.0'}}));
    assert.strictEqual(await maxOnly.validateValue('0.0.0'), '0.0.0');
    assert.strictEqual(await maxOnly.validateValue('3.0.0'), '3.0.0');
    await assert.rejects(() => maxOnly.validateValue('3.0.1'), ValidationError);
  });

  // --- invalid configuration ---

  it('should reject mutually exclusive "in" and "min"/"max" at runtime', async function() {
    const compiled = await resolver.compile(new Schema('string').validator({$semver: {in: '^1.0.0', min: '1.0.0'}}));
    await assert.rejects(() => compiled.validateValue('1.0.0'), SchemaError);
  });

  it('should reject invalid range expressions at runtime', async function() {
    const compiled = await resolver.compile(new Schema('string').validator({$semver: 'not-a-range'}));
    await assert.rejects(() => compiled.validateValue('1.0.0'), SchemaError);
  });

  // --- description metadata ---

  it('should generate description for "in" parameter', async function() {
    const compiled = await resolver.compile(new Schema('string').validator({$semver: '^1.2.0'}));
    assert.strictEqual(compiled.metadata.valueDescription, '[in ^1.2.0]');
  });

  it('should generate description for min/max', async function() {
    const both = await resolver.compile(new Schema('string').validator({$semver: {min: '1.0.0', max: '2.0.0'}}));
    assert.strictEqual(both.metadata.valueDescription, '[1.0.0–2.0.0]');

    const minOnly = await resolver.compile(new Schema('string').validator({$semver: {min: '1.0.0'}}));
    assert.strictEqual(minOnly.metadata.valueDescription, '[≥1.0.0]');

    const maxOnly = await resolver.compile(new Schema('string').validator({$semver: {max: '2.0.0'}}));
    assert.strictEqual(maxOnly.metadata.valueDescription, '[≤2.0.0]');
  });
});
