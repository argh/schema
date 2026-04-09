
import { strict as assert } from 'assert';
import { Schema } from '../src/schema.js';
import { SchemaResolver } from '../src/schema-resolver.js';
import { SchemaError, ValidationError } from '../src/errors.js';

describe('Processor: ipv4', function() {
  /** @type {SchemaResolver} */
  let resolver;

  beforeEach(function() {
    resolver = new SchemaResolver();
  });

  // --- format-only validation (no parameters, backward compat) ---

  it('should accept valid IPv4 addresses without parameters', async function() {
    const compiled = await resolver.compile(new Schema('string').validator('$ipv4'));

    assert.strictEqual(await compiled.validateValue('192.168.1.1'), '192.168.1.1');
    assert.strictEqual(await compiled.validateValue('0.0.0.0'), '0.0.0.0');
    assert.strictEqual(await compiled.validateValue('255.255.255.255'), '255.255.255.255');
    assert.strictEqual(await compiled.validateValue('127.0.0.1'), '127.0.0.1');
    assert.strictEqual(await compiled.validateValue('10.0.0.1'), '10.0.0.1');
  });

  it('should reject invalid IPv4 addresses', async function() {
    const compiled = await resolver.compile(new Schema('string').validator('$ipv4'));

    await assert.rejects(() => compiled.validateValue('256.1.1.1'), ValidationError);
    await assert.rejects(() => compiled.validateValue('-1.1.1.1'), ValidationError);
    await assert.rejects(() => compiled.validateValue('192.168.1'), ValidationError);
    await assert.rejects(() => compiled.validateValue('192.168.1.1.1'), ValidationError);
    await assert.rejects(() => compiled.validateValue('192.168.a.1'), ValidationError);
    await assert.rejects(() => compiled.validateValue(''), ValidationError);
  });

  // --- CIDR / named range via "in" parameter ---

  it('should accept addresses within a CIDR range', async function() {
    // positional string form — single arg maps to "in"
    const compiled = await resolver.compile(new Schema('string').validator({$ipv4: '192.168.1.0/24'}));

    assert.strictEqual(await compiled.validateValue('192.168.1.0'), '192.168.1.0');
    assert.strictEqual(await compiled.validateValue('192.168.1.128'), '192.168.1.128');
    assert.strictEqual(await compiled.validateValue('192.168.1.255'), '192.168.1.255');
  });

  it('should reject addresses outside a CIDR range', async function() {
    const compiled = await resolver.compile(new Schema('string').validator({$ipv4: '192.168.1.0/24'}));

    await assert.rejects(() => compiled.validateValue('192.168.2.1'), ValidationError);
    await assert.rejects(() => compiled.validateValue('10.0.0.1'), ValidationError);
  });

  it('should accept addresses matching named ranges', async function() {
    // rfc1918 covers 10/8, 172.16/12, 192.168/16
    const rfc1918 = await resolver.compile(new Schema('string').validator({$ipv4: 'rfc1918'}));
    assert.strictEqual(await rfc1918.validateValue('10.255.0.1'), '10.255.0.1');
    assert.strictEqual(await rfc1918.validateValue('172.16.0.1'), '172.16.0.1');
    assert.strictEqual(await rfc1918.validateValue('192.168.0.1'), '192.168.0.1');

    // loopback
    const loopback = await resolver.compile(new Schema('string').validator({$ipv4: 'loopback'}));
    assert.strictEqual(await loopback.validateValue('127.0.0.1'), '127.0.0.1');
    assert.strictEqual(await loopback.validateValue('127.255.255.254'), '127.255.255.254');

    // multicast 224.0.0.0/4
    const multicast = await resolver.compile(new Schema('string').validator({$ipv4: 'multicast'}));
    assert.strictEqual(await multicast.validateValue('224.0.0.1'), '224.0.0.1');
    assert.strictEqual(await multicast.validateValue('239.255.255.255'), '239.255.255.255');
  });

  it('should reject addresses outside named ranges', async function() {
    const rfc1918 = await resolver.compile(new Schema('string').validator({$ipv4: 'rfc1918'}));

    // public addresses
    await assert.rejects(() => rfc1918.validateValue('8.8.8.8'), ValidationError);
    await assert.rejects(() => rfc1918.validateValue('172.32.0.1'), ValidationError); // just outside 172.16/12

    // loopback should not match rfc1918
    await assert.rejects(() => rfc1918.validateValue('127.0.0.1'), ValidationError);
  });

  it('should treat non-routable as the union of rfc1918, loopback, link-local, rfc6598', async function() {
    const compiled = await resolver.compile(new Schema('string').validator({$ipv4: 'non-routable'}));

    // one canary per constituent range
    assert.strictEqual(await compiled.validateValue('10.0.0.1'), '10.0.0.1');          // rfc1918
    assert.strictEqual(await compiled.validateValue('127.0.0.1'), '127.0.0.1');        // loopback
    assert.strictEqual(await compiled.validateValue('169.254.1.1'), '169.254.1.1');    // link-local
    assert.strictEqual(await compiled.validateValue('100.64.0.1'), '100.64.0.1');      // rfc6598

    // public address should fail
    await assert.rejects(() => compiled.validateValue('8.8.8.8'), ValidationError);

    // multicast is routable, not in non-routable
    await assert.rejects(() => compiled.validateValue('224.0.0.1'), ValidationError);
  });

  it('should accept named ranges case-insensitively', async function() {
    const compiled = await resolver.compile(new Schema('string').validator({$ipv4: 'RFC1918'}));
    assert.strictEqual(await compiled.validateValue('10.0.0.1'), '10.0.0.1');
  });

  it('should accept explicit {in: ...} object form', async function() {
    const compiled = await resolver.compile(new Schema('string').validator({$ipv4: {in: '10.0.0.0/8'}}));

    assert.strictEqual(await compiled.validateValue('10.1.2.3'), '10.1.2.3');
    await assert.rejects(() => compiled.validateValue('11.0.0.1'), ValidationError);
  });

  // --- min/max range ---

  it('should accept addresses within min/max bounds (inclusive)', async function() {
    const compiled = await resolver.compile(new Schema('string').validator({$ipv4: {min: '192.168.1.1', max: '192.168.1.254'}}));

    assert.strictEqual(await compiled.validateValue('192.168.1.1'), '192.168.1.1');     // min boundary
    assert.strictEqual(await compiled.validateValue('192.168.1.100'), '192.168.1.100'); // mid-range
    assert.strictEqual(await compiled.validateValue('192.168.1.254'), '192.168.1.254'); // max boundary
  });

  it('should reject addresses outside min/max bounds', async function() {
    const compiled = await resolver.compile(new Schema('string').validator({$ipv4: {min: '192.168.1.1', max: '192.168.1.254'}}));

    await assert.rejects(() => compiled.validateValue('192.168.1.0'), ValidationError);   // below min
    await assert.rejects(() => compiled.validateValue('192.168.1.255'), ValidationError); // above max
    await assert.rejects(() => compiled.validateValue('10.0.0.1'), ValidationError);      // entirely different network
  });

  it('should support min-only and max-only bounds', async function() {
    const minOnly = await resolver.compile(new Schema('string').validator({$ipv4: {min: '192.168.0.0'}}));
    assert.strictEqual(await minOnly.validateValue('192.168.0.0'), '192.168.0.0');
    assert.strictEqual(await minOnly.validateValue('255.255.255.255'), '255.255.255.255');
    await assert.rejects(() => minOnly.validateValue('192.167.255.255'), ValidationError);

    const maxOnly = await resolver.compile(new Schema('string').validator({$ipv4: {max: '10.0.0.255'}}));
    assert.strictEqual(await maxOnly.validateValue('0.0.0.0'), '0.0.0.0');
    assert.strictEqual(await maxOnly.validateValue('10.0.0.255'), '10.0.0.255');
    await assert.rejects(() => maxOnly.validateValue('10.0.1.0'), ValidationError);
  });

  // --- format parameter ---

  it('should emit uint32 when format is "integer"', async function() {
    // format conversion is a transform, so use it as a transformer on 'any' to isolate
    const compiled = await resolver.compile(new Schema('any').transformer({$ipv4: {format: 'integer'}}));

    // 192.168.1.1 = (192 << 24) | (168 << 16) | (1 << 8) | 1 = 3232235777
    assert.strictEqual(await compiled.transformValue('192.168.1.1'), 3232235777);
    // 0.0.0.0 = 0
    assert.strictEqual(await compiled.transformValue('0.0.0.0'), 0);
    // 255.255.255.255 = 4294967295
    assert.strictEqual(await compiled.transformValue('255.255.255.255'), 4294967295);
    // 10.0.0.1 = 167772161
    assert.strictEqual(await compiled.transformValue('10.0.0.1'), 167772161);
  });

  it('should combine format with range checking', async function() {
    const compiled = await resolver.compile(new Schema('any').transformer({$ipv4: {in: 'rfc1918', format: 'integer'}}));

    assert.strictEqual(await compiled.transformValue('10.0.0.1'), 167772161);
    await assert.rejects(() => compiled.transformValue('8.8.8.8'), SchemaError);
  });

  // --- invalid configuration ---

  it('should reject mutually exclusive "in" and "min"/"max" at runtime', async function() {
    const compiled = await resolver.compile(new Schema('string').validator({$ipv4: {in: 'rfc1918', min: '10.0.0.0'}}));
    await assert.rejects(() => compiled.validateValue('10.0.0.1'), SchemaError);

    const compiled2 = await resolver.compile(new Schema('string').validator({$ipv4: {in: 'rfc1918', max: '10.255.255.255'}}));
    await assert.rejects(() => compiled2.validateValue('10.0.0.1'), SchemaError);
  });

  it('should reject unknown named ranges at runtime', async function() {
    const compiled = await resolver.compile(new Schema('string').validator({$ipv4: 'bogus'}));
    await assert.rejects(() => compiled.validateValue('10.0.0.1'), SchemaError);
  });

  // --- description metadata ---

  it('should generate description for "in" parameter', async function() {
    const compiled = await resolver.compile(new Schema('string').validator({$ipv4: 'rfc1918'}));
    assert.strictEqual(compiled.metadata.valueDescription, '[in rfc1918]');
  });

  it('should generate description for min/max', async function() {
    const both = await resolver.compile(new Schema('string').validator({$ipv4: {min: '10.0.0.0', max: '10.0.0.255'}}));
    assert.strictEqual(both.metadata.valueDescription, '[10.0.0.0–10.0.0.255]');

    const minOnly = await resolver.compile(new Schema('string').validator({$ipv4: {min: '10.0.0.0'}}));
    assert.strictEqual(minOnly.metadata.valueDescription, '[≥10.0.0.0]');

    const maxOnly = await resolver.compile(new Schema('string').validator({$ipv4: {max: '10.0.0.255'}}));
    assert.strictEqual(maxOnly.metadata.valueDescription, '[≤10.0.0.255]');
  });
});
