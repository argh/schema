
import { strict as assert } from 'assert';
import { Schema } from '../src/schema.js';
import { SchemaResolver } from '../src/schema-resolver.js';
import { SchemaError, ValidationError } from '../src/errors.js';

describe('Processor: data-size', function() {
  /** @type {SchemaResolver} */
  let resolver;

  beforeEach(function() {
    resolver = new SchemaResolver();
  });

  it('should reject invalid configuration at runtime', async function() {
    const badStandard = await resolver.compile(
      new Schema('any').normalizer({'$data-size': {standard: 'bogus'}})
    );
    await assert.rejects(() => badStandard.normalizeValue('1KiB'), SchemaError);

    const badFormat = await resolver.compile(
      new Schema('any').normalizer({'$data-size': {format: 'bogus'}})
    );
    await assert.rejects(() => badFormat.normalizeValue('1KiB'), SchemaError);
  });

  it('should parse data-size strings to byte counts', async function() {
    const compiled = await resolver.compile(
      new Schema().normalizer(['$data-size']).validator('$is-number')
    );

    // bare numbers pass through
    assert.strictEqual(await compiled.normalizeValue(1024), 1024);
    assert.strictEqual(await compiled.normalizeValue(0), 0);

    // numeric strings without suffix — bytes
    assert.strictEqual(await compiled.normalizeValue('512'), 512);

    // IEC units
    assert.strictEqual(await compiled.normalizeValue('1KiB'), 1024);
    assert.strictEqual(await compiled.normalizeValue('2 MiB'), 2 * 1024 ** 2);
    assert.strictEqual(await compiled.normalizeValue('1.5GiB'), 1.5 * 1024 ** 3);

    // SI units
    assert.strictEqual(await compiled.normalizeValue('1KB'), 1000);
    assert.strictEqual(await compiled.normalizeValue('20 MB'), 20 * 1000 ** 2);
    assert.strictEqual(await compiled.normalizeValue('1.5GB'), 1.5 * 1000 ** 3);

    // bytes suffix (shared by both standards)
    assert.strictEqual(await compiled.normalizeValue('100B'), 100);
  });

  it('should reject invalid data-size inputs', async function() {
    const compiled = await resolver.compile(new Schema('any').normalizer('$data-size'));

    await assert.rejects(() => compiled.normalizeValue('abc'), SchemaError);
    await assert.rejects(() => compiled.normalizeValue('20XB'), SchemaError);
    await assert.rejects(() => compiled.normalizeValue(''), SchemaError);
    await assert.rejects(() => compiled.normalizeValue(-5), SchemaError);
    await assert.rejects(() => compiled.normalizeValue(Infinity), SchemaError);
  });

  it('should enforce strict standard when specified', async function() {
    const iec = await resolver.compile(
      new Schema('any').normalizer({'$data-size': {standard: 'iec'}})
    );
    // IEC accepted
    assert.strictEqual(await iec.normalizeValue('1KiB'), 1024);
    // SI rejected under IEC standard
    await assert.rejects(() => iec.normalizeValue('1KB'), SchemaError);

    const si = await resolver.compile(
      new Schema('any').normalizer({'$data-size': {standard: 'si'}})
    );
    // SI accepted
    assert.strictEqual(await si.normalizeValue('1KB'), 1000);
    // IEC rejected under SI standard
    await assert.rejects(() => si.normalizeValue('1KiB'), SchemaError);
  });

  it('should format output when format parameter is set', async function() {
    const iecFmt = await resolver.compile(
      new Schema('any').normalizer({'$data-size': {format: 'iec'}})
    );
    assert.strictEqual(await iecFmt.normalizeValue('1048576'), '1 MiB');
    assert.strictEqual(await iecFmt.normalizeValue(1024), '1 KiB');
    assert.strictEqual(await iecFmt.normalizeValue('1.5GiB'), '1.5 GiB');

    const siFmt = await resolver.compile(
      new Schema('any').normalizer({'$data-size': {format: 'si'}})
    );
    assert.strictEqual(await siFmt.normalizeValue('1000000'), '1 MB');
    assert.strictEqual(await siFmt.normalizeValue(1000), '1 KB');
    assert.strictEqual(await siFmt.normalizeValue('500'), '500 B');
  });

  it('should work as normalizer ahead of number validation', async function() {
    const compiled = await resolver.compile(
      new Schema().normalizer(['$data-size']).validator('$is-number')
    );

    // full pipeline: string → bytes (number) → validated number
    const result = await compiled.process('20KiB');
    assert.strictEqual(result, 20 * 1024);
  });
});
