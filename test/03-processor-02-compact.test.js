
import { strict as assert } from 'assert';
import { Schema } from '../src/schema.js';
import { SchemaResolver } from '../src/schema-resolver.js';

/**
 * $compact and $collapse — string cleaning operators.
 *
 * $compact strips formatting characters (whitespace, dashes, dots, parens, slashes).
 * $collapse normalizes whitespace runs to single space + trims.
 *
 * Canary tests: representative inputs covering the documented character sets
 * and primary use cases (phone/card storage, messy form input).
 */
describe('Processors: $compact, $collapse', function() {
  /** @type {SchemaResolver} */
  let resolver;

  beforeEach(function() {
    resolver = new SchemaResolver();
  });

  // ─── $compact ──────────────────────────────────────────────────────────────

  describe('$compact', function() {

    it('should strip whitespace, dashes, dots, parens, and slashes', async function() {
      const schema = await resolver.compile(new Schema('string').transformer('$compact'));

      // whitespace
      assert.strictEqual(await schema.transformValue('hello world'), 'helloworld');
      assert.strictEqual(await schema.transformValue(' leading and trailing '), 'leadingandtrailing');
      assert.strictEqual(await schema.transformValue("tabs\tand\nnewlines"), 'tabsandnewlines');

      // dashes
      assert.strictEqual(await schema.transformValue('123-456-7890'), '1234567890');

      // dots
      assert.strictEqual(await schema.transformValue('192.168.1.1'), '19216811');

      // parentheses
      assert.strictEqual(await schema.transformValue('(212) 555-1234'), '2125551234');

      // slashes
      assert.strictEqual(await schema.transformValue('2026/01/15'), '20260115');

      // mixed formatting
      assert.strictEqual(await schema.transformValue('+1 (212) 555-1234'), '+12125551234');
      assert.strictEqual(await schema.transformValue('4111 1111 1111 1111'), '4111111111111111');
    });

    it('should preserve characters outside the formatting set', async function() {
      const schema = await resolver.compile(new Schema('string').transformer('$compact'));

      // plus sign preserved
      assert.strictEqual(await schema.transformValue('+12125551234'), '+12125551234');

      // letters, digits, other punctuation preserved
      assert.strictEqual(await schema.transformValue('hello@world.com'), 'hello@worldcom');
      assert.strictEqual(await schema.transformValue('key=value&a=b'), 'key=value&a=b');
      assert.strictEqual(await schema.transformValue('price: $42!'), 'price:$42!');
    });

    it('should return empty string when input is all formatting', async function() {
      const schema = await resolver.compile(new Schema('string').transformer('$compact'));
      assert.strictEqual(await schema.transformValue(' - . ( ) / '), '');
    });
  });

  // ─── $collapse ─────────────────────────────────────────────────────────────

  describe('$collapse', function() {

    it('should collapse whitespace runs to single space and trim', async function() {
      const schema = await resolver.compile(new Schema('string').transformer('$collapse'));

      // multiple spaces → single
      assert.strictEqual(await schema.transformValue('hello   world'), 'hello world');

      // leading and trailing stripped
      assert.strictEqual(await schema.transformValue('  hello  '), 'hello');

      // tabs and newlines normalized
      assert.strictEqual(await schema.transformValue("hello\t\tworld\n\nfoo"), 'hello world foo');

      // mixed whitespace
      assert.strictEqual(await schema.transformValue('  one   two\tthree\n\n  four  '), 'one two three four');
    });

    it('should preserve non-whitespace characters', async function() {
      const schema = await resolver.compile(new Schema('string').transformer('$collapse'));

      // dashes, dots, parens NOT stripped (only $compact does that)
      assert.strictEqual(await schema.transformValue('(212) 555-1234'), '(212) 555-1234');
      assert.strictEqual(await schema.transformValue('192.168.1.1'), '192.168.1.1');
    });

    it('should handle already-clean strings as identity', async function() {
      const schema = await resolver.compile(new Schema('string').transformer('$collapse'));
      assert.strictEqual(await schema.transformValue('already clean'), 'already clean');
      assert.strictEqual(await schema.transformValue('single'), 'single');
    });

    it('should return empty string for whitespace-only input', async function() {
      const schema = await resolver.compile(new Schema('string').transformer('$collapse'));
      assert.strictEqual(await schema.transformValue('   \t\n  '), '');
    });
  });
});
