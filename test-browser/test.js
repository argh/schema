/*
 * Browser smoke tests for `@versionzero/schema`.
 *
 * Exercises the primary API surface (.process(), .validate(), .serialize())
 * to verify that the library loads and runs in a browser without Node.js.
 *
 * Results are written to `window.__TEST_RESULTS__` for Playwright to read.
 */

const results = [];

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertDeepEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${message}: expected ${e}, got ${a}`);
  }
}

async function test(name, fn) {
  try {
    await fn();
    results.push({ name, passed: true });
  } catch (error) {
    results.push({ name, passed: false, error: error.message });
  }
}

async function run() {
  const { Schema, SchemaResolver, CompiledSchema, SchemaError, EMPTY } = await import('../src/index.js');

  await test('exports are available', () => {
    assert(typeof Schema === 'function', 'Schema');
    assert(typeof SchemaResolver === 'function', 'SchemaResolver');
    assert(typeof CompiledSchema === 'function', 'CompiledSchema');
    assert(typeof SchemaError === 'function', 'SchemaError');
    assert(EMPTY !== undefined, 'EMPTY');
  });

  await test('compile a string schema', async () => {
    const resolver = new SchemaResolver();
    const compiled = await resolver.compile(new Schema('string'));
    assert(compiled instanceof CompiledSchema, 'should produce a CompiledSchema');
  });

  await test('string schema processes values', async () => {
    const resolver = new SchemaResolver();
    const compiled = await resolver.compile(new Schema('string'));
    assertEqual(await compiled.process('hello'), 'hello', 'passthrough');
    assertEqual(await compiled.process(42), '42', 'coerce number');
  });

  await test('number schema processes values', async () => {
    const resolver = new SchemaResolver();
    const compiled = await resolver.compile(new Schema('number'));
    assertEqual(await compiled.process('42'), 42, 'coerce string');
    assertEqual(await compiled.process(3.14), 3.14, 'passthrough');
  });

  await test('boolean schema processes values', async () => {
    const resolver = new SchemaResolver();
    const compiled = await resolver.compile(new Schema('boolean'));
    assertEqual(await compiled.process('true'), true, 'coerce "true"');
    assertEqual(await compiled.process('false'), false, 'coerce "false"');
    assertEqual(await compiled.process(1), true, 'coerce 1');
  });

  await test('object schema with properties', async () => {
    const resolver = new SchemaResolver();
    const schema = new Schema('object')
      .property('name', new Schema('string'))
      .property('age', new Schema('number'));
    const compiled = await resolver.compile(schema);
    const result = await compiled.process({ name: 'Alice', age: '30' });
    assertEqual(result.name, 'Alice', 'name passthrough');
    assertEqual(result.age, 30, 'age coerced');
  });

  await test('array schema with wildcard elements', async () => {
    const resolver = new SchemaResolver();
    const schema = new Schema('array')
      .property('*', new Schema('number'));
    const compiled = await resolver.compile(schema);
    const result = await compiled.process(['1', '2', '3']);
    assertDeepEqual(result, [1, 2, 3], 'coerce elements');
  });

  await test('nested object schema', async () => {
    const resolver = new SchemaResolver();
    const schema = new Schema('object')
      .property('user', new Schema('object')
        .property('email', new Schema('string').validator('$email'))
      );
    const compiled = await resolver.compile(schema);
    const result = await compiled.process({ user: { email: 'a@b.com' } });
    assertEqual(result.user.email, 'a@b.com', 'nested email');
  });

  await test('default values', async () => {
    const resolver = new SchemaResolver();
    const compiled = await resolver.compile(new Schema('string').default('fallback'));
    assertEqual(await compiled.process(undefined), 'fallback', 'apply default');
  });

  await test('$lowercase normalizer via process', async () => {
    const resolver = new SchemaResolver();
    const compiled = await resolver.compile(new Schema('string').normalizer('$lowercase'));
    assertEqual(await compiled.process('HELLO'), 'hello', 'lowercase');
  });

  await test('$trim normalizer via process', async () => {
    const resolver = new SchemaResolver();
    const compiled = await resolver.compile(new Schema('string').normalizer('$trim'));
    assertEqual(await compiled.process('  hello  '), 'hello', 'trim');
  });

  await test('date schema processes ISO strings', async () => {
    const resolver = new SchemaResolver();
    const compiled = await resolver.compile(new Schema('date'));
    const result = await compiled.process('2025-01-01T00:00:00.000Z');
    assert(result instanceof Date, 'should be Date');
    assertEqual(result.toISOString(), '2025-01-01T00:00:00.000Z', 'ISO parse');
  });

  await test('validation rejects invalid input', async () => {
    const resolver = new SchemaResolver();
    const compiled = await resolver.compile(new Schema('string').validator('$email'));
    let error;
    try {
      await compiled.process('not-an-email');
    } catch (e) {
      error = e;
    }
    assert(error instanceof SchemaError, 'should throw SchemaError');
  });

  await test('validation passes valid input', async () => {
    const resolver = new SchemaResolver();
    const compiled = await resolver.compile(new Schema('number').validator('$positive'));
    assertEqual(await compiled.process(42), 42, 'positive passes');
  });

  await test('serialization round-trips', async () => {
    const resolver = new SchemaResolver();
    const schema = new Schema('object')
      .property('name', new Schema('string'))
      .property('count', new Schema('number'));
    const compiled = await resolver.compile(schema);
    const input = { name: 'test', count: 5 };
    const processed = await compiled.process(input);
    const serialized = await compiled.serialize(processed);
    assertDeepEqual(serialized, input, 'round-trip');
  });

  await test('buffer schema is NOT available in browser', () => {
    const resolver = new SchemaResolver();
    let threw = false;
    try { resolver.getSchema('buffer'); } catch { threw = true; }
    assert(threw, 'buffer schema should not be registered');
  });

  await test('custom processor via .use()', async () => {
    const resolver = new SchemaResolver();
    resolver.registerValueProcessor('double', (value) => value * 2);
    const compiled = await resolver.compile(new Schema('number').normalizer('$double'));
    assertEqual(await compiled.process(5), 10, 'custom double');
  });

  // -- Pre-built browser bundle (dist/schema.browser.mjs) ----------
  // The bundle is what CDN consumers load (single request). These
  // tests guard against a broken or stale artifact reaching publish.
  await test('bundle: exports are available', async () => {
    const mod = await import('/dist/schema.browser.mjs');
    for (const name of ['Schema', 'SchemaResolver', 'CompiledSchema', 'SchemaError', 'SchemaLocation']) {
      assert(typeof mod[name] === 'function', name);
    }
    assert(mod.EMPTY !== undefined, 'EMPTY');
  });

  await test('bundle: compiles and processes', async () => {
    const { Schema, SchemaResolver } = await import('/dist/schema.browser.mjs');
    const resolver = new SchemaResolver();
    const compiled = await resolver.compile(new Schema('string').normalizer('$trim').normalizer('$lowercase'));
    assertEqual(await compiled.process('  HeLLo  '), 'hello', 'trim + lowercase');
  });

  await test('bundle: excludes the Node-only library', async () => {
    const { Schema, SchemaResolver } = await import('/dist/schema.browser.mjs');
    let threw = false;
    try { await new SchemaResolver().compile(new Schema('buffer')); } catch { threw = true; }
    assert(threw, 'buffer schema should not be registered in the bundle');
  });

  // summary
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  const output = document.getElementById('output');
  for (const r of results) {
    const line = r.passed ? `PASS: ${r.name}` : `FAIL: ${r.name} - ${r.error}`;
    output.textContent += line + '\n';
  }
  output.textContent += `\n${passed}/${total} passed, ${failed} failed\n`;

  window.__TEST_RESULTS__ = { results, passed, failed, total };
}

run().catch(err => {
  window.__TEST_RESULTS__ = { results, passed: 0, failed: 1, total: 1, fatalError: err.message };
  document.getElementById('output').textContent = `FATAL: ${err.message}\n${err.stack}`;
});
