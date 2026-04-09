
import { strict as assert } from 'assert';
import { Schema } from '../src/schema.js';
import { SchemaResolver } from '../src/schema-resolver.js';
import { SchemaError, ValidationError } from '../src/errors.js';

describe('Processor: ipv6', function() {
  /** @type {SchemaResolver} */
  let resolver;

  beforeEach(function() {
    resolver = new SchemaResolver();
  });

  // --- format-only validation (no parameters, backward compat) ---

  it('should accept valid IPv6 addresses without parameters', async function() {
    const compiled = await resolver.compile(new Schema('string').validator('$ipv6'));

    assert.strictEqual(await compiled.validateValue('2001:0db8:0000:0000:0000:ff00:0042:8329'), '2001:0db8:0000:0000:0000:ff00:0042:8329');
    assert.strictEqual(await compiled.validateValue('2001:db8::ff00:42:8329'), '2001:db8::ff00:42:8329');
    assert.strictEqual(await compiled.validateValue('::1'), '::1');
    assert.strictEqual(await compiled.validateValue('::'), '::');
    assert.strictEqual(await compiled.validateValue('fe80::1%eth0'), 'fe80::1%eth0');
    assert.strictEqual(await compiled.validateValue('::ffff:192.0.2.1'), '::ffff:192.0.2.1');
  });

  it('should reject invalid IPv6 addresses', async function() {
    const compiled = await resolver.compile(new Schema('string').validator('$ipv6'));

    await assert.rejects(() => compiled.validateValue('gggg::1'), ValidationError);
    await assert.rejects(() => compiled.validateValue('12345::1'), ValidationError);
    await assert.rejects(() => compiled.validateValue(''), ValidationError);
    await assert.rejects(() => compiled.validateValue('192.168.1.1'), ValidationError);
    await assert.rejects(() => compiled.validateValue('not-an-address'), ValidationError);
  });

  // --- CIDR / named range via "in" parameter ---

  it('should accept addresses within a CIDR range', async function() {
    const compiled = await resolver.compile(new Schema('string').validator({$ipv6: '2001:db8::/32'}));

    assert.strictEqual(await compiled.validateValue('2001:0db8:0000:0000:0000:0000:0000:0001'), '2001:0db8:0000:0000:0000:0000:0000:0001');
    assert.strictEqual(await compiled.validateValue('2001:db8::1'), '2001:db8::1');
    assert.strictEqual(await compiled.validateValue('2001:db8:ffff:ffff:ffff:ffff:ffff:ffff'), '2001:db8:ffff:ffff:ffff:ffff:ffff:ffff');
  });

  it('should reject addresses outside a CIDR range', async function() {
    const compiled = await resolver.compile(new Schema('string').validator({$ipv6: '2001:db8::/32'}));

    await assert.rejects(() => compiled.validateValue('2001:db9::1'), ValidationError);
    await assert.rejects(() => compiled.validateValue('::1'), ValidationError);
  });

  it('should accept addresses matching named ranges', async function() {
    // loopback — ::1 only
    const loopback = await resolver.compile(new Schema('string').validator({$ipv6: 'loopback'}));
    assert.strictEqual(await loopback.validateValue('::1'), '::1');
    assert.strictEqual(await loopback.validateValue('0000:0000:0000:0000:0000:0000:0000:0001'), '0000:0000:0000:0000:0000:0000:0000:0001');
    await assert.rejects(() => loopback.validateValue('::2'), ValidationError);

    // link-local fe80::/10
    const linkLocal = await resolver.compile(new Schema('string').validator({$ipv6: 'link-local'}));
    assert.strictEqual(await linkLocal.validateValue('fe80::1'), 'fe80::1');

    // unique-local fc00::/7
    const ula = await resolver.compile(new Schema('string').validator({$ipv6: 'unique-local'}));
    assert.strictEqual(await ula.validateValue('fd00::1'), 'fd00::1');
    assert.strictEqual(await ula.validateValue('fc00::1'), 'fc00::1');

    // multicast ff00::/8
    const multicast = await resolver.compile(new Schema('string').validator({$ipv6: 'multicast'}));
    assert.strictEqual(await multicast.validateValue('ff02::1'), 'ff02::1');
  });

  it('should reject addresses outside named ranges', async function() {
    const ula = await resolver.compile(new Schema('string').validator({$ipv6: 'unique-local'}));
    await assert.rejects(() => ula.validateValue('2001:db8::1'), ValidationError);
    await assert.rejects(() => ula.validateValue('::1'), ValidationError);
  });

  it('should treat non-routable as the union of loopback, link-local, unique-local', async function() {
    const compiled = await resolver.compile(new Schema('string').validator({$ipv6: 'non-routable'}));

    assert.strictEqual(await compiled.validateValue('::1'), '::1');         // loopback
    assert.strictEqual(await compiled.validateValue('fe80::1'), 'fe80::1'); // link-local
    assert.strictEqual(await compiled.validateValue('fd00::1'), 'fd00::1'); // unique-local

    // global unicast should fail
    await assert.rejects(() => compiled.validateValue('2001:db8::1'), ValidationError);
    // multicast is not in non-routable
    await assert.rejects(() => compiled.validateValue('ff02::1'), ValidationError);
  });

  it('should accept named ranges case-insensitively', async function() {
    const compiled = await resolver.compile(new Schema('string').validator({$ipv6: 'LINK-LOCAL'}));
    assert.strictEqual(await compiled.validateValue('fe80::1'), 'fe80::1');
  });

  it('should accept explicit {in: ...} object form', async function() {
    const compiled = await resolver.compile(new Schema('string').validator({$ipv6: {in: 'fc00::/7'}}));

    assert.strictEqual(await compiled.validateValue('fd12::1'), 'fd12::1');
    await assert.rejects(() => compiled.validateValue('2001:db8::1'), ValidationError);
  });

  // --- min/max range ---

  it('should accept addresses within min/max bounds (inclusive)', async function() {
    const compiled = await resolver.compile(new Schema('string').validator({$ipv6: {min: '2001:db8::1', max: '2001:db8::ffff'}}));

    assert.strictEqual(await compiled.validateValue('2001:db8::1'), '2001:db8::1');
    assert.strictEqual(await compiled.validateValue('2001:db8::abcd'), '2001:db8::abcd');
    assert.strictEqual(await compiled.validateValue('2001:db8::ffff'), '2001:db8::ffff');
  });

  it('should reject addresses outside min/max bounds', async function() {
    const compiled = await resolver.compile(new Schema('string').validator({$ipv6: {min: '2001:db8::1', max: '2001:db8::ffff'}}));

    await assert.rejects(() => compiled.validateValue('2001:db8::0'), ValidationError);
    await assert.rejects(() => compiled.validateValue('2001:db8::1:0'), ValidationError);
  });

  it('should support min-only and max-only bounds', async function() {
    const minOnly = await resolver.compile(new Schema('string').validator({$ipv6: {min: 'fe80::1'}}));
    assert.strictEqual(await minOnly.validateValue('fe80::1'), 'fe80::1');
    assert.strictEqual(await minOnly.validateValue('ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff'), 'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff');
    await assert.rejects(() => minOnly.validateValue('::1'), ValidationError);

    const maxOnly = await resolver.compile(new Schema('string').validator({$ipv6: {max: '::ffff'}}));
    assert.strictEqual(await maxOnly.validateValue('::'), '::');
    assert.strictEqual(await maxOnly.validateValue('::ffff'), '::ffff');
    await assert.rejects(() => maxOnly.validateValue('::1:0'), ValidationError);
  });

  // --- IPv4-mapped addresses in ranges ---

  it('should handle IPv4-mapped addresses in range checks', async function() {
    // ::ffff:0:0/96 covers all IPv4-mapped addresses
    const compiled = await resolver.compile(new Schema('string').validator({$ipv6: '::ffff:0:0/96'}));

    assert.strictEqual(await compiled.validateValue('::ffff:192.0.2.1'), '::ffff:192.0.2.1');
    await assert.rejects(() => compiled.validateValue('2001:db8::1'), ValidationError);
  });

  // --- invalid configuration ---

  it('should reject mutually exclusive "in" and "min"/"max" at runtime', async function() {
    const compiled = await resolver.compile(new Schema('string').validator({$ipv6: {in: 'loopback', min: '::1'}}));
    await assert.rejects(() => compiled.validateValue('::1'), SchemaError);
  });

  it('should reject unknown named ranges at runtime', async function() {
    const compiled = await resolver.compile(new Schema('string').validator({$ipv6: 'bogus'}));
    await assert.rejects(() => compiled.validateValue('::1'), SchemaError);
  });

  // --- description metadata ---

  it('should generate description for "in" parameter', async function() {
    const compiled = await resolver.compile(new Schema('string').validator({$ipv6: 'unique-local'}));
    assert.strictEqual(compiled.metadata.valueDescription, '[in unique-local]');
  });

  it('should generate description for min/max', async function() {
    const both = await resolver.compile(new Schema('string').validator({$ipv6: {min: '::1', max: '::ffff'}}));
    assert.strictEqual(both.metadata.valueDescription, '[::1–::ffff]');

    const minOnly = await resolver.compile(new Schema('string').validator({$ipv6: {min: '::1'}}));
    assert.strictEqual(minOnly.metadata.valueDescription, '[≥::1]');

    const maxOnly = await resolver.compile(new Schema('string').validator({$ipv6: {max: '::ffff'}}));
    assert.strictEqual(maxOnly.metadata.valueDescription, '[≤::ffff]');
  });
});
