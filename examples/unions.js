import crypto from 'node:crypto';
import assert from 'node:assert';
import { Schema, SchemaError, SchemaResolver } from '../src/index.js';
import { UnionResolutionError, ValidationError } from '../src/errors.js';

const resolver = new SchemaResolver();

// In this example, we define a union schema that accepts strings and integers from 1-10.
// We define our own discriminator, leveraging the $type operator to match the named union schemas.
const typeSchema = await resolver.compile(
  new Schema()
    .unionDiscriminator('$type')
    .unionSchema('string', new Schema('string')
      .transformer('$uppercase')
      .validator('$alpha'))
    .unionSchema('number', new Schema('number')
      .transformer({$clamp: [1,10]})
      .validator(['$integer', {$range: [1,10]}]))
)

// valid values
await typeSchema.validate('hello');
await typeSchema.validate(5);
// out of range:
await assert.rejects(typeSchema.validate(20), ValidationError);

// these pass through the transformer
assert.equal(await typeSchema.process('hello'), 'HELLO');
assert.equal(await typeSchema.process(20), 10);
// there is no union schema with the key "object", so this will fail to discriminate:
await assert.rejects(typeSchema.process({}), SchemaError);


// In this example, we'll define a more complex schema with child properties, and allow the compiler
// to automatically generate a discriminator.

const postSchema = await resolver.compile(
  new Schema('object')
    .property('id', new Schema('string')
      .required()
      .validator('$uuid')
    )
    .property('author', new Schema('string')
      .required()
      .normalizer('$lowercase')
      .validator({$matches: /[a-z][a-z0-9_]{3,14}/i})
    )
    .property('subject', new Schema('string')
      .normalizer('$trim')
      .required()
      .validator({$length: {min: 1, max: 140}}))
    .property('posted', new Schema('date').required())
    .property('content', new Schema('object')
      .unionSchema('text', new Schema('object')
        .property('type', Schema.literal('text').required())
        .property('body', new Schema('string').required())
      )
      .unionSchema('link', new Schema('object')
        .property('type', Schema.literal('link').required())
        .property('url', new Schema('string')
          .required()
          .validator('$url')
        )
        .property('thumbnail', new Schema('string'))
      )
      .unionSchema('image', new Schema('object')
        .property('type', Schema.literal('image').required())
        .property('content-type', new Schema('string'))
        .property('media', new Schema('string').required())
        .property('thumbnail', new Schema('string'))
      )
    )
);

const basicPost = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  author: 'john_doe',
  subject: 'Sample Post',
  posted: new Date(),
}

// this basic post should validate, as content is not marked as required.
const basicPostValidated = await postSchema.validate(basicPost);
assert.deepEqual(basicPost, basicPostValidated);

// and a correctly formed text post should validate
const goodTextPost = {...basicPost,
  content: {
    type: 'text',
    body: 'This is a sample text post.'
  },
}
const textPostValidated = await postSchema.validate(goodTextPost);
assert.deepEqual(goodTextPost, textPostValidated);

// but a text post without the required "type" field in the content is invalid
const textPostWithoutType = {...basicPost,
  content: {
    body: 'This is a sample text post.'
  },
};
await assert.rejects(postSchema.validate(textPostWithoutType), ValidationError);

// note however that it did discriminate to the text content union schema;
// since the type literal default value expands itself, it auto-populates during process:

const processedTextPostWithDefaultedType = await postSchema.process(textPostWithoutType);
assert.equal(processedTextPostWithDefaultedType.content.type, 'text');
await postSchema.validate(processedTextPostWithDefaultedType);

// this ambiguous post won't validate, but it won't process either, because it can't auto-discriminate the union
// (could be image or link)
const ambiguousPost = {...basicPost,
  content: {
    thumbnail: '/cache/1234.jpg'
  }
}
await assert.rejects(postSchema.process(ambiguousPost), UnionResolutionError);

// conflicts will also lead to a resolution error:
const conflictingPost = {...basicPost,
  content: {
    type: 'text',
    body: 'This is a sample text post.',
    media: '/media/1234.jpg'
  }
}
await assert.rejects(postSchema.process(conflictingPost), UnionResolutionError);

console.log('lgtm!')