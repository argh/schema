
import { strict as assert } from 'assert';
import { Schema } from '../src/schema.js';
import { SchemaResolver } from '../src/schema-resolver.js';
import { SchemaError, ValidationError } from '../src/errors.js';

/**
 * $email constraint — canary test approach (see 03-processor-04-eq for rationale).
 *
 * Three core concerns plus parameter behavior:
 *   1. Compile-time rejection of bad configuration
 *   2. Canary set of valid emails, exercising regex and parameter forms
 *   3. Canary set of invalid emails that should be rejected
 *   4. Case normalization parameters
 *   5. Filter parameter (plus-addressing, gmail dot stripping)
 */
describe('Processor: email', function() {
  /** @type {SchemaResolver} */
  let resolver;

  beforeEach(function() {
    resolver = new SchemaResolver();
  });

  it('should reject invalid configuration at compile time', async function() {
    // unknown parameter
    assert.throws(() => resolver.compile(new Schema('string').validator({'$email': {unexpected: true}})), SchemaError);

    // excess positional parameters
    assert.throws(() => resolver.compile(new Schema('string').validator({'$email': [1, 2, 3, 4]})), SchemaError);
  });

  it('should accept valid emails and lowercase by default', async function() {
    const schema = await resolver.compile(new Schema('string').validator('$email'));

    // simple email — lowercased by default
    assert.strictEqual(await schema.validateValue('user@example.com'), 'user@example.com');

    // mixed case — both parts lowercased
    assert.strictEqual(await schema.validateValue('User@Example.COM'), 'user@example.com');

    // subdomain
    assert.strictEqual(await schema.validateValue('user@mail.example.com'), 'user@mail.example.com');

    // plus addressing preserved without filter
    assert.strictEqual(await schema.validateValue('user+tag@example.com'), 'user+tag@example.com');

    // dots in local part
    assert.strictEqual(await schema.validateValue('first.last@example.com'), 'first.last@example.com');

    // numbers in both parts
    assert.strictEqual(await schema.validateValue('user123@example123.com'), 'user123@example123.com');

    // hyphens in domain
    assert.strictEqual(await schema.validateValue('user@my-domain.com'), 'user@my-domain.com');

    // allowed special chars: underscore, percent
    assert.strictEqual(await schema.validateValue('a_b%c@example.com'), 'a_b%c@example.com');

    // long TLD
    assert.strictEqual(await schema.validateValue('user@example.museum'), 'user@example.museum');

    // single-char username
    assert.strictEqual(await schema.validateValue('a@example.com'), 'a@example.com');
  });

  it('should reject invalid emails', async function() {
    const schema = await resolver.compile(new Schema('string').validator('$email'));

    // missing @
    await assert.rejects(() => schema.validateValue('userexample.com'), ValidationError);

    // missing domain
    await assert.rejects(() => schema.validateValue('user@'), ValidationError);

    // missing local part
    await assert.rejects(() => schema.validateValue('@example.com'), ValidationError);

    // no TLD (single label domain)
    await assert.rejects(() => schema.validateValue('user@example'), ValidationError);

    // single-letter TLD
    await assert.rejects(() => schema.validateValue('user@example.c'), ValidationError);

    // spaces
    await assert.rejects(() => schema.validateValue('user @example.com'), ValidationError);

    // multiple @
    await assert.rejects(() => schema.validateValue('user@@example.com'), ValidationError);

    // empty string
    await assert.rejects(() => schema.validateValue(''), ValidationError);

    // consecutive dots in local part
    await assert.rejects(() => schema.validateValue('user..name@example.com'), ValidationError);

    // leading dot in local part
    await assert.rejects(() => schema.validateValue('.user@example.com'), ValidationError);

    // trailing dot in local part
    await assert.rejects(() => schema.validateValue('user.@example.com'), ValidationError);

    // consecutive dots in domain
    await assert.rejects(() => schema.validateValue('user@example..com'), ValidationError);

    // leading hyphen in domain label
    await assert.rejects(() => schema.validateValue('user@-example.com'), ValidationError);

    // trailing hyphen in domain label
    await assert.rejects(() => schema.validateValue('user@example-.com'), ValidationError);

    // IP address literal
    await assert.rejects(() => schema.validateValue('user@[192.168.1.1]'), ValidationError);

    // quoted local part
    await assert.rejects(() => schema.validateValue('"user name"@example.com'), ValidationError);

    // disallowed special chars (! # $ & ' * / = ? ^ ` { | } ~)
    await assert.rejects(() => schema.validateValue('user!name@example.com'), ValidationError);
    await assert.rejects(() => schema.validateValue('user#name@example.com'), ValidationError);
    await assert.rejects(() => schema.validateValue("user'name@example.com"), ValidationError);

    // numeric-only TLD (not valid — TLDs must be letters)
    await assert.rejects(() => schema.validateValue('user@example.123'), ValidationError);
  });

  it('should support case-sensitive parameter to preserve username case', async function() {
    const schema = await resolver.compile(
      new Schema('string').validator({'$email': {'case-sensitive': true}})
    );

    // username case preserved, domain still lowered
    assert.strictEqual(await schema.validateValue('UserName@Example.COM'), 'UserName@example.com');
    assert.strictEqual(await schema.validateValue('ALL_UPPER@DOMAIN.ORG'), 'ALL_UPPER@domain.org');
    assert.strictEqual(await schema.validateValue('lower@domain.com'), 'lower@domain.com');
  });

  it('should support case parameter for upper-case conversion', async function() {
    // uppercase everything
    const schema = await resolver.compile(
      new Schema('string').validator({'$email': {'case': 'upper'}})
    );
    assert.strictEqual(await schema.validateValue('user@example.com'), 'USER@EXAMPLE.COM');

    // uppercase with case-sensitive: username preserved, domain uppercased
    const sensitive = await resolver.compile(
      new Schema('string').validator({'$email': {'case': 'upper', 'case-sensitive': true}})
    );
    assert.strictEqual(await sensitive.validateValue('User@example.com'), 'User@EXAMPLE.COM');
  });

  it('should preserve original case when case parameter is falsey', async function() {
    const schema = await resolver.compile(
      new Schema('string').validator({'$email': {'case': false}})
    );

    // both parts preserve original case
    assert.strictEqual(await schema.validateValue('User@Example.COM'), 'User@Example.COM');
    assert.strictEqual(await schema.validateValue('lower@lower.com'), 'lower@lower.com');

    // case-sensitive is redundant when case is falsey, but should still work
    const sensitive = await resolver.compile(
      new Schema('string').validator({'$email': {'case': false, 'case-sensitive': true}})
    );
    assert.strictEqual(await sensitive.validateValue('User@Example.COM'), 'User@Example.COM');
  });

  it('should support filter parameter for plus-addressing and gmail dot normalization', async function() {
    const schema = await resolver.compile(
      new Schema('string').validator({'$email': {filter: true}})
    );

    // plus-addressing stripped
    assert.strictEqual(await schema.validateValue('user+tag@example.com'), 'user@example.com');
    assert.strictEqual(await schema.validateValue('user+a+b@example.com'), 'user@example.com');

    // no plus — unchanged
    assert.strictEqual(await schema.validateValue('user@example.com'), 'user@example.com');

    // gmail dots stripped from username
    assert.strictEqual(await schema.validateValue('first.last@gmail.com'), 'firstlast@gmail.com');

    // gmail dots + plus combined
    assert.strictEqual(await schema.validateValue('f.l+spam@Gmail.COM'), 'fl@gmail.com');

    // non-gmail dots preserved
    assert.strictEqual(await schema.validateValue('first.last@outlook.com'), 'first.last@outlook.com');

    // filter with case-sensitive preserves username case
    const sensitive = await resolver.compile(
      new Schema('string').validator({'$email': {filter: true, 'case-sensitive': true}})
    );
    assert.strictEqual(await sensitive.validateValue('User+tag@Example.com'), 'User@example.com');
    assert.strictEqual(await sensitive.validateValue('F.L@Gmail.com'), 'FL@gmail.com');
  });
});
