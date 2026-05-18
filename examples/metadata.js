import { Schema, SchemaResolver } from '../src/index.js';
const resolver = new SchemaResolver();

// Use the $metadata keyword to look up metadata in a sibling property using a relative path.
// (If 'temperature' lacked 'unit' metadata, $metadata would inherit 'metric' from the parent.)
const weatherSchema = resolver.compile(
  new Schema('object')
    .meta('unit', 'metric')
    .property('temperature', new Schema('number').meta('unit', '°C'))
    .property('unit', new Schema('string')
      .default('')
      .transformer({$metadata: {name: 'unit', schema: '^.temperature'}})
    )
);
const weather = await weatherSchema.process({temperature: 22});
console.log('weather:', weather);
// → {temperature: 22, unit: '°C'}

// Add some metadata to the schema so we can introspect it...

const rootSchema = resolver.compile(
  new Schema('object')
    .property('verbose', new Schema('boolean')
      .meta('description', 'enable verbose mode')
      .meta('advanced'))
    .property('command',
      new Schema('string')
        .meta('description', 'command to apply to files')
        .validator({$in: ['polish', 'neglect']})
        .default('neglect')
        .required()
    )
    .property('files', new Schema('array')
      .meta('description', 'files to process')
      .property('*', new Schema('string')
        .validator('$file')
      )
      .validator({$length: {min: 1}})
    )
)

// If we treat the metadata as a loose "contract", we could implement this in a distant part of the code.

function describe(schema) {
  schema.visitSchema((s, p) => {
    const flags = [];
    if (!s.metadata['description']) {
      return;
    }
    if (s.required) { flags.push('required') }
    if (s.metadata['advanced']) { flags.push('advanced') }
    const flagString = flags.length? ` (${flags.join(', ')})` : '';
    // the compiler generates some helpful metadata for you...
    console.log(`${p}${flagString} - ${s.metadata['valueName']} ${s.metadata['valueDescription']} - ${s.metadata['description']}`);
  })
}

describe(rootSchema);
// outputs...
// verbose (advanced) - boolean [true|false] - enable verbose mode
// command (required) - string <polish|neglect> - command to apply to files
// files - array [file... {len≥1}] - files to process

