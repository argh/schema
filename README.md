# Schema

A composition-oriented schema system for processing, extracting, and validating data. 

- Focused on enabling decoupled contracts between systems.  
- All behavior is composed rather than hard-coded, even fundamental types.
- Supports unions, conditionals, cross-references, recursion, async value processing, 
  dynamic resolution, and more.

For full documentation, see <https://docs.v0.net/schema>.

## Requirements

- NodeJS 22.22.0+
- ESM Modules only

## Basic Usage

```bash
npm install --save @versionzero/schema
```

### Examples

(Source can be found in the [examples directory](https://github.com/argh/schema/tree/main/examples))

#### Simple String Schema
Here's a trivial schema that just enforces a capitalized greeting:
```javascript title="basics.js"
import { Schema, SchemaResolver } from '@versionzero/schema';

const resolver = new SchemaResolver();

const helloSchema = await resolver.compile(
  new Schema('string')
    .normalizer('$title-case')
    .validator({$matches: /^Hello.+/})
);

// Value processing runs all handlers, so this will be normalized: 
const greeting = await helloSchema.process('hello world');
console.log(greeting);  // Hello World 

// Validation requires the input to already be correct.  This is valid...
await helloSchema.validate('Hello Friend');

// but this will throw a ValidationError (wrong case)
await helloSchema.validate('hello world');
```

#### More complex...
This schema defines the data structure of a meeting.  (Note how `ends` depends on `starts`!)
```javascript title="basics.js"
import crypto from 'node:crypto';
import { Schema, SchemaResolver } from '@versionzero/schema';

const resolver = new SchemaResolver();

// you can define a schema to reference inline in multiple places...
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
    .property('title', new Schema(meetingTextFieldSchema)    // extend a schema instance
      .required()
      .default('Untitled Meeting')
    )
    .property('description', new Schema('meeting-text'))     // or extend a named schema
    .property('starts', new Schema('date').required())
    .property('ends', new Schema('date')
        .required()
        .validator({'$date-range': {min: {$reference: '^starts'}}})
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
)
```
The meeting schema is usable both for validation (checking if data matches the schema rules):
```javascript
const meeting = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  title: 'Weekly Team Meeting',
  description: 'Weekly team meeting to discuss progress and upcoming projects.',
  starts: new Date('2026-09-01T10:00:00'),
  ends: new Date('2026-09-01T11:00:00'),
  attendees: [
    { email: 'john.doe@example.com', response: 'accepted' },
    { email: 'jane.smith@example.com', response: 'declined' },
    { email: 'ted.richards@example.com' },
    { email: 'alice.johnson@example.com', response: 'tentative' }
  ]
}

const validatedMeeting = await meetingSchema.validate(meeting);  // valid!
```

as well as processing (attempt to convert input data to the valid format):

```javascript
const minimal = {
  starts: '2027-01-01T10:00:00',
  ends: '2027-01-01T11:00:00',
  attendees: [ { email: 'john.doe@example.com' } ]
}

// would not validate as-is, but...
const processedMeeting = await meetingSchema.process(minimal);

/* Result is now valid - populated with defaults, date strings converted to Dates:
{
  id: '1f721f55-c075-485c-994c-96dbb30b035d',
  title: 'Untitled Meeting',  
  starts: 2027-01-01T18:00:00.000Z,
  ends: 2027-01-01T19:00:00.000Z,
  attendees: [ { email: 'john.doe@example.com', response: 'pending' } ]
}
 */
```

See the full [documentation](https://docs.v0.net/schema) for details.

Also see the [examples directory](https://github.com/argh/schema/tree/main/examples) for more advanced usage patterns.

## Key Features

### Definition via Fluent API (or Data)

Define your data structure declaratively using composable `Schema` objects.  The fluent API makes 
complex nested and variant structures intuitive to build.  Or use a simple object definition, enabling 
schemas to be exported by data consumers without introducing dependencies.

### "Batteries Included"

Get started quickly with pre-built schemas corresponding to fundamental types, and a rich processor 
library of operators and constraints (`$positive`, `$alphanum`, `$directory`, etc.). 
As your needs grow, create or import libraries of reusable custom schemas and value processors to compose 
complex processing pipelines.  You have complete control over all phases of processing; normalization,
transformation, finalization, validation.

(The system is expressive enough that it self-hosts - schemas are defined by a "schema schema"!)

### Union Types, Selectors, and Conditionals

Easily handle scenarios where your output data structure varies at runtime.  Union schemas let you define 
alternative schemas and multiple discrimination strategies.  Selectors and Conditionals provide
different approaches to activating or deactivating schemas within a schema hierarchy.

### Dynamic/Late Resolution

Compose without coupling, verify without sharing types.  Schemas can be built declaratively with only
named references to other schemas or processors.  Or provide dynamic values to ensure the validation process
calls back to your code.  You can even add async processors without special fanfare; the library automatically
handles deferred results, while optimizing any synchronous call graphs to incur no async overhead.
Multi-pass processing enables complex mixtures of dynamic resolution and cross-referenced values. 

### Schema as a Decoupled Contract

Use schemas as an impartial bridge between data producers and data consumers.  This prevents the 
architectural and maintenance headaches of validation logic being split across tiers, or implementation 
details leaking between subsystems.  The data consumer uses the schema to advertise its requirements 
in a way that upstream producers can enforce, enabling a decoupled contract.

In modular applications, you can aggregate schemas exported from multiple subsystems to create a composite
schema that acts as a canonical definition for configuration.  This application schema can then be 
introspected, enabling automatic construction of interfaces for loading inputs (CLIs, editors, etc.)

### Designed for Extension and Integration

The pre-built schema types and value processors that are provided with the library are deliberately 
not "special", and are all built using the public developer APIs.  This empowers you to easily 
create your own libraries, where your custom definitions participate as first-class citizens,
indistinguishable from the "fundamental" behaviors.   

This library was originally created as the core of the [`Configurator`](https://github.com/argh/configurator) (`@versionzero/configurator`)
system, which focuses on configuring applications using composed lists of configuration data sources
(command line, environment, files, etc).  The `Configurator` is then embedded inside the 
[`ModuleManager`](https://github.com/argh/module-manager) (`@versionzero/module-manager`) package, which extends application configuration
with dependency injection and lifecycle management.

**This project does not have a cute name, because you don't name your plumbing.**

## Rationale

Most schema libraries optimize for one of two things: runtime validation (Joi, Ajv)
or compile-time type integration (Zod, Valibot). Both are useful, and if you're
building a single application in TypeScript with a shared type definition between
producer and consumer, Zod is probably what you want.

This library optimizes for something different: **decoupled composition across
subsystems that don't know about each other.**  

_Read more about this [in the full documentation](https://docs.v0.net/schema/rationale)._ 

## License

Copyright 2026 Version Zero | github.com/argh

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this library except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
