import assert from 'node:assert';
import crypto from 'node:crypto';
import { Schema, SchemaError, SchemaResolver } from '../src/index.js';
import { ValidationError } from '../src/errors.js';

// This file provides two examples that demonstrate basic schema operation.

// The schema resolver is used for compilation, and contains a registry of named schemas and value processors.
// You can extend it with your own custom implementations.
const resolver = new SchemaResolver();

// As is tradition... hello!

const helloSchema = await resolver.compile(
  new Schema('string')
    .normalizer('$title-case')
    .validator({$matches: /^Hello.+/})
);

const greeting = await helloSchema.process('hello world');  // normalized
console.log(greeting);  // Hello World

await assert.rejects(helloSchema.validate('hello world'), ValidationError);  // invalid capitalization
await helloSchema.validate('Hello Friend');  // succeeds..


// Here's a schema for a meeting.
//
// It is set up to support both validation (verify that input matches the schema)
// and processing (convert the input data into a valid format that matches the schema)
//

// you can define a schema to reuse inline
const meetingTextFieldSchema = new Schema('string')
  .normalizer('$trim')
  .validator({$length: {min: 1, max: 1024}});

// or you can register it to the resolver to reference by name
resolver.registerSchema('meeting-text', meetingTextFieldSchema);

const meetingSchema = await resolver.compile(
  new Schema('object')
    .property('id', new Schema('string')
      .required()
      .default(() => crypto.randomUUID())
      .normalizer(['$trim', '$lowercase'])
      .validator('$uuid')
    )
    .property('title', new Schema(meetingTextFieldSchema)
      .required()
      .default('Untitled Meeting')
    )
    .property('description', new Schema('meeting-text'))
    .property('starts', new Schema('date').required())
    .property('ends', new Schema('date').required()
      .validator({'$date-range': {min: {$reference: '^starts'}}})
    )
    .property('recurring', new Schema('object')
      .property('frequency', new Schema('string')
        .required()
        .normalizer('$trim')
        .validator({$in: ['daily', 'weekly', 'monthly', 'yearly']})
      )
      .property('interval', new Schema('number')
        .default(1)
        .validator({$range: {min: 1}})
      )
      .property('until', new Schema('date'))
    )
    .property('attendees', new Schema('array')
      .required()
      .validator({$length: {min: 1}})
      .property('*', new Schema('object')
        .property('email', new Schema('string')
          .required()
          .validator('$email')
        )
        .property('response', new Schema('string')
          .default('pending')
          .validator({$in: ['accepted', 'declined', 'tentative', 'pending']})
        )
      )
    )
    .property('location', new Schema('meeting-text'))
);
// Here's a fully populated meeting that will pass validation:

const meeting = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  title: 'Weekly Team Meeting',
  description: 'Weekly team meeting to discuss progress and upcoming projects.',
  starts: new Date('2024-09-01T10:00:00'),
  ends: new Date('2024-09-01T11:00:00'),
  recurring: {
    frequency: 'weekly',
    interval: 1,
    until: new Date('2025-09-01T11:00:00')
  },
  attendees: [
    { email: 'john.doe@example.com', response: 'accepted' },
    { email: 'jane.smith@example.com', response: 'declined' },
    { email: 'ted.richards@example.com' },
    { email: 'alice.johnson@example.com', response: 'tentative' }
  ],
  location: 'Conference Room A',
}
assert.deepEqual(meeting, await meetingSchema.validate(meeting));
// if we set a constrained value to be something bad, we can make it invalid:
meeting.recurring.interval = 0;
await assert.rejects(meetingSchema.validate(meeting), ValidationError);


// This is invalid because it is missing required fields and has string timestamps instead of dates,
// but after processing it becomes valid:
const minimal = {
  starts: '2027-01-01T10:00:00',
  ends: '2027-01-01T11:00:00',
  attendees: [ { email: 'john.doe@example.com' } ]
}
const minimalProcessed = await meetingSchema.process(minimal);
console.log(minimalProcessed);
assert(minimalProcessed.id !== undefined);
assert.equal(minimalProcessed.title, 'Untitled Meeting');
await meetingSchema.validate(minimalProcessed);

// bad response:
const invalid1 = {
  starts: '2027-01-01T10:00:00',
  ends: '2027-01-01T11:00:00',
  attendees: [ { email: 'john.doe@example.com', response: 'nope' } ]
}
await assert.rejects(meetingSchema.process(invalid1), SchemaError);

// no attendees:
const invalid2 = {
  starts: '2027-01-01T10:00:00',
  ends: '2027-01-01T11:00:00',
  attendees: []
}
await assert.rejects(meetingSchema.process(invalid2), SchemaError);

// title too short:
const invalid3 = {
  starts: '2027-01-01T10:00:00',
  ends: '2027-01-01T11:00:00',
  title: '',
  attendees: [ { email: 'john.doe@example.com', response: 'pending' } ]
}
await assert.rejects(meetingSchema.process(invalid3), SchemaError);


console.log('lgtm!');
