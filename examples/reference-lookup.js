import assert from 'node:assert';
import { Schema, SchemaResolver } from '../src/index.js';
import { stringify } from '../src/helpers/stringify.js';

//
// This example demonstrates a schema that defines a structure with cross-references that must be consistent.
// Rather than using any inline functions as a shortcut, we'll do it all declaratively.
//
// The input will be an object with three lists of entities:
//
// {
//   brands: [ {id, name}, ...],
//   categories: [ {id, name}, ...]
//   products: [ {id, name, brand_id, category_id, attributes, price}, ... ]
// }
//
// We will build a schema that converts this normalized input into an output form:
//
// 1. standardize and validate all identifiers:
//    - lower case
//    - formatted as prefix_code
//    - prefixes between 2 and 5 characters
//    - numeric codes zero-padded to 6 digits
// 2. convert each section to an object, keyed by the identifier.
// 3. augment products with denormalized brand and category values
//

const resolver = new SchemaResolver();

// First, let's set up a separate schema for an identifier "object" that has the prefix and code as fields.
// We want to treat string codes differently than numeric codes, so we'll use a union to define the two styles.
// We'll precompile it for efficiency, since it won't be augmented by any of the places where it is used.

const idObjectSchema = resolver.compile(new Schema('object')
  .property('prefix', new Schema('string').required())
  .property('code',
    new Schema().required()
                .unionDiscriminator({$first: [
                    {$pipeline: ['$numeric', 'num_code']},
                    {$pipeline: ['$is-string', 'str_code']}
                  ]})
                .unionSchema('str_code', new Schema('string'))
                .unionSchema('num_code', new Schema('string')
                  .transformer([
                    '$number',
                    '$integer', {$range: {min: 1}},
                    '$string', {$pad: {width: 6, char: '0'}}
                  ])
                )
  )
)

// Here's the full definition of the identifier, which starts and ends processing as a string:
const idSchema = new Schema('string')
  .normalizer(['$trim', '$lowercase'])
  .transformer({$match: /^(?<prefix>[^_]+)_(?<code>.+)$/})  // this explodes the id string into an object
  .transformer({$process: idObjectSchema})                  // which is then cleaned up via the above schema
  .transformer({$template: '{prefix}_{code}'})             // and then restored to string format
  .validator({$matches: /^[a-z]{2,5}_.+$/})

// Entries in the brands, categories, and products groups all have an id and a name as common properties.
// Just to be tricky, we'll enforce that each entry's id matches some metadata we will store in the parent group.

const entrySchema = new Schema('object')
  .property('id',
    new Schema(idSchema).validator({'$has-prefix': {$metadata: {name: 'group-prefix', schema: {'$find-schema': '^'}}}}))
  .property('name',
    new Schema('string').normalizer('$title-case').required())

// Here we create the individual group entries, reusing our shared entry schema and adding metadata.
const categorySchema = new Schema(entrySchema).meta('group-prefix', 'cat_');
const brandSchema = new Schema(entrySchema).meta('group-prefix', 'brand_');
// And here we add the extra product fields
const productSchema = new Schema(entrySchema).meta('group-prefix', 'prod_')
                                             // reuse the id schemas to ensure consistency
                                             .property('brand_id', new Schema(idSchema).default('brand_default'))
                                             .property('category_id', new Schema(idSchema).required()
                                               .validator({$require: {$lookup: {$reference: '/categories'}}})
                                             )
                                             .property('brand',   // synthesize the brand object
                                               new Schema().default({}).required()
                                                           .normalizer({$lookup: {
                                                               from: {$reference: '/brands'},      // relative to root
                                                               path: {$reference: '^brand_id'}}})  // relative to parent
                                                           .serializer('$null') // omit from serialization
                                             )
                                             .property('category',  // same pattern again
                                               new Schema().default({}).required()
                                                           .normalizer({$lookup: {
                                                               from: {$reference: '/categories'},
                                                               path: {$reference: '^category_id'}}})
                                                           .serializer('$null')
                                             )
                                             .property('price', new Schema('number')
                                               .required()
                                               .normalizer({$round: {precision: 2}})
                                               .validator({$range: {min: 0}})
                                             )
                                             .property('attributes', new Schema('object')
                                               .property('*', new Schema('any'))
                                             )

// The groups all follow the same sort of pattern.  We'll add individual entry types as properties to each:
const groupSchema = new Schema() // they change type, so we don't set any particular schema base
  .required()
  .opaque()  // we need to mark them opaque because their post-transform shape (object) differs from the input (array)
  .normalizer({$first: ['$is-array', '$values']})  // if it's an array, let it pass, otherwise extract the values
  .normalizer('$is-array')
  .transformer({'$index-by': 'id'})                // this will convert it to an object
  .serializer('$values')                           // our serialized form should always be the simple list

// Finally, the overall catalog schema, with each group defined.
const catalogSchema = new Schema('object')
  .property('categories',
    new Schema(groupSchema).property('*', categorySchema)
  )
  .property('brands',
    new Schema(groupSchema).property('*', brandSchema)
  )
  .property('products',
    new Schema(groupSchema).property('*', productSchema)
  )

const compiledCatalogSchema = resolver.compile(catalogSchema);

// Feed it some data....
const catalogData = {
  categories: [
    { "id": "cat_alchemy", "name": "Alchemy Equipment" },
    { "id": "cat_automotive", "name": "   Automotive fluids   " },
    { "id": "cat_quantum", "name": "Quantum Devices" },
    { "id": "cat_office", "name": "office supplies" }
  ],
  brands: [
    { "id": "brand_default", "name": "Our Brand" },
    { "id": "brand_acme", "name": "ACME Corporation" },
    { "id": "brand_omni", "name": "OmniCorp" },
    { "id": "brand_flux", "name": "Flux Dynamics" }
  ],
  products: [
    {
      "id": "prod_001",
      "name": "Phlogiston Extractor",
      "category_id": "cat_alchemy",
      "brand_id": "brand_flux",
      "price": 199.989999,
      "attributes": {
        "max_extraction_rate": "3.5 lumens/hour",
        "fuel_type": "pure ether"
      }
    },
    {
      "id": "PROD_02",
      "name": "Blinker Fluid (Premium)",
      "category_id": "cat_automotive",
      "brand_id": "brand_acme",
      "price": 9.49,
      "attributes": {
        "viscosity": "SAE 0W-∞",
        "color": "invisible"
      }
    },
    {
      "id": "prod_3",
      "name": "quantum entanglement starter kit",
      "category_id": "CAT_QUANTUM",
      "brand_id": "brand_omni",
      "price": 499.00,
      "attributes": {
        "qubits_included": 2,
        "entanglement_stability": "questionable"
      }
    },
    {
      "id": "prod_004",
      "name": "Self-Aware Stapler",
      "category_id": "cat_office",
      "brand_id": "brand_acme",
      "price": 24.751,
      "attributes": {
        "ai_level": "mildly judgmental",
        "staple_capacity": 100
      }
    },
    {
      "id": "prod_005",
      "name": "Anti-Gravity Paperclips",
      "category_id": "cat_office",
      "brand_id": "brand_flux",
      "price": 12.00,
      "attributes": {
        "lift_force": "0.2 N per clip",
        "recommended_use": "loose paperwork only"
      }
    },
    {
      "id": "prod_6",
      "name": "elixir distillation coil",
      "category_id": "cat_alchemy",
      "brand_id": "brand_omni",
      "price": 149.50,
      "attributes": {
        "distillation_purity": "99.7%",
        "compatible_elixirs": ["life", "invisibility", "mild regret"],
        "coil_material": "enchanted copper"
      }
    },
    {
      "id": "prod_10",
      "name": "Left-handed Pencils",
      "category_id": "cat_office",
      "price": 1.99,
      "attributes": {
        "count": 100,
        "availability": "back-ordered"
      }
    }
  ]

};

// This schema definition cleans, restructures, and validates the input data:
const catalog = await compiledCatalogSchema.process(catalogData);

console.log('**** PROCESSED CATALOG ****')
console.log(stringify(catalog, {space:2}));

// Sanity checks...
assert.equal(catalog.products['prod_000006'].name, 'Elixir Distillation Coil');
assert.equal(catalog.products['prod_000002'].category.name, 'Automotive Fluids');

// The output from processing should be valid:
const validated = await compiledCatalogSchema.validate(catalog);
// It should also be identical to the processed output:
assert.deepEqual(catalog, validated);

// We should be able to serialize the output...
const serialized = await compiledCatalogSchema.serialize(catalog);
console.log('**** SERIALIZED CATALOG ****')
console.log(stringify(serialized, {space:2}));
// ...and reingest it...
const reloaded = await compiledCatalogSchema.process(serialized);
// ...and get the same results.
assert.deepEqual(catalog, reloaded);

console.log('lgtm!')
