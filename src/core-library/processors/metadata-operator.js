import { CompiledSchema } from '../../compiled-schema.js';
import { SchemaError } from '../../errors.js';
import { SchemaLocation } from "../../schema-location.js";
import { formatValue } from '../../helpers/format.js';

/**
 * ## $metadata
 *
 * Extracts named metadata from a schema, either from the current schema or a parameter.
 *
 * Useful for getting standard metadata like `type` or `description`, or as a way to transport information
 * between schemas that get aggregated together.
 *
 * If a schema value is passed, the metadata is retrieved only from that particular schema.
 * If a schema path is passed, or it is left empty (and thus uses the current schema), $metadata will
 * search from the current schema to the root and return the first value located.  To suppress this search,
 * pass `false` to the `inherit` parameter.
 *
 * Returns `undefined` if the referenced schema or metadata key does not exist.
 *
 * ### Parameters
 * - `name` (string, required): The name of the metadata to extract from the schema.
 * - `schema` (CompiledSchema|string, optional): The schema (or a relative path to a schema) to extract metadata from.  Defaults to the current schema.
 * - `inherit` (boolean, optional): Whether to search for metadata in a parent if not found in implicit schema.
 *
 * ### Example
 * ```js
 * // Here is an example that will simply propagate the current schema description
 * new Schema('object')
 *   .property('description', new Schema('string')
 *     .required()
 *     .meta('description', 'This will be pulled into the property value')
 *     .normalizer({$metadata: 'description'}))
 *
 * // Extract metadata from a sibling property using a relative path.
 * // If 'temperature' lacked a 'unit' meta, $metadata would inherit 'metric' from the parent.
 * const weatherSchema = await resolver.compile(
 *   new Schema('object')
 *     .meta('unit', 'metric')
 *     .property('temperature', new Schema('number').meta('unit', '°C'))
 *     .property('unit', new Schema('string')
 *       .default('')
 *       .transformer({$metadata: {name: 'unit', schema: '^.temperature'}})
 *     )
 * );
 * const weather = await weatherSchema.process({temperature: 22});
 * console.log('weather:', weather);
 * // → {temperature: 22, unit: '°C'}
 *
 * // Unlike most other "get a value" operators, $metadata does not use the pipeline input as the source
 * // because it is focused on the current processor calling context rather than values.  However, you can
 * // force it to use a compiled schema in the value pipeline by using $input:
 *
 * new Schema('string')
 *   .transformer(new Schema('string').meta('greeting', 'hello world'))
 *   .transformer({'$metadata': {name: 'greeting', schema: '$input'}})
 * ```
 *
 * @type {import("../../value-processor/value-processor.js").ValueProcessorDefinition}
 */
export const METADATA_OPERATOR = {
  keyword: 'metadata',
  parameters: [{parameter: 'name', required: true, type: 'string'}, {parameter: 'schema', required: false, default: undefined}, {parameter: 'inherit', required: false, default: true}],
  process: (_value, _target, location, options) => {

    const name = options.args.name;
    const schema = options.args.schema;
    const inherit = options.args.inherit;

    if (schema !== undefined) {
      if (schema instanceof CompiledSchema) {
        return schema.metadata[name];
      }
      if (typeof schema === 'string') {
        const newLocation = location.relative(schema);
        if (newLocation === undefined) {
          throw new SchemaError(`$metadata was unable to retrieve a schema at ${formatValue(schema)}`);
        }
        location = newLocation;
      }
      else {
        throw new SchemaError(`$metadata expects a valid schema, got ${formatValue(schema)}`, {location});
      }
    }

    /** @type {SchemaLocation|undefined} */
    let search = location;

    while (search !== undefined) {
      if (search.schema.metadata[name] !== undefined) {
        return search.schema.metadata[name];
      }
      if (!inherit) {
        break;
      }
      search = search.parent;
    }
    return undefined;
  }
};
