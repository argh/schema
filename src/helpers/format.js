import { CompiledSchema } from "../compiled-schema.js";
import { stringify } from './stringify.js';
import { isPlainObject } from './object.js';

/**
 *
 * @param {CompiledSchema} schema
 * @returns {string}
 * @package
 */
export function formatArgumentType(schema) {

  if (schema.metadata.valueDescription) {
    return schema.metadata.valueDescription;
  }

  let argumentTypeString;
  if (schema.isArray && schema.hasChildren) {
    const props = Array.from(schema.propertyEntries)
                        .sort((a, b) => {
                          if (a[0] === '*') return 1;
                          if (b[0] === '*') return -1;
                          return a[0].localeCompare(b[0], undefined, {numeric: true});
                        })
                        .map(e => e[1]);


    argumentTypeString = props.map(s =>
    {
      let propFormat = formatArgumentType(s)
      if (!s.required && (propFormat.length > 2) && propFormat.charAt(0) === '[' && propFormat.charAt(propFormat.length - 1) === ']') {
        propFormat = propFormat.slice(1, propFormat.length - 1);
      }
      return propFormat;
    }).join(', ')

    if (schema.hasWildcard) {
      argumentTypeString += '...';
    }

    if (schema.metadata.validatorDescription) {
      if (argumentTypeString && !argumentTypeString.includes(schema.metadata.validatorDescription)) {
        argumentTypeString += ` {${schema.metadata.validatorDescription}}`;
      }
    }
  }
  else {
    if (Array.isArray(schema.options.values) && schema.options.values.length > 0) {
      argumentTypeString = schema.options.values.map(v => `${typeof v === 'string'? `"${v}"` : stringify(v)}`)
                                 .sort((a, b) => a.localeCompare(b, undefined, {numeric: true})).join('|');
    }
    else {
      argumentTypeString = schema.metadata.valueName ?? (schema.isArray? '' : schema.options.type);

      if (schema.metadata.validatorDescription) {
        if (!argumentTypeString || (argumentTypeString === schema.options.type)) {
          argumentTypeString = schema.metadata.validatorDescription;  // overwrite basic "type names"
        }
        else {
          argumentTypeString = `${argumentTypeString} {${schema.metadata.validatorDescription}}`;
        }
      }
    }
    if (argumentTypeString === undefined) {
      argumentTypeString = 'value';
    }
    if (schema.isArray && !argumentTypeString.includes('...')) {
      argumentTypeString += '...';
    }
  }
  return argumentTypeString;
}

const DELIMITED = /^[^A-Za-z0-9_].+[^A-Za-z0-9_]$/;

/**
 * @param {any} value
 * @param {object} [options]
 * @returns {string}
 */
export function formatValue(value, options = {}) {
  const {delimiterOpen = '«', delimiterClose = '»', maxLength = 40} = options;

  try {
    if (value === null) {
      return `${delimiterOpen}null${delimiterClose}`;
    }
    else if (value === undefined) {
      return `${delimiterOpen}undefined${delimiterClose}`;
    }
    let valueString;
    if (typeof value === 'function' && value.name) {
      valueString = `${delimiterOpen}${value.name}()${delimiterClose}`;
    }
    else if (typeof value === 'object' && !isPlainObject(value) && value.constructor?.name) {
      valueString = `${delimiterOpen}${value.constructor.name}${delimiterClose}`;
    }
    else {
      // get our stringified json  of the value
      valueString = stringify(value, {delimiterOpen, delimiterClose});
    }
    if (typeof value !== 'string'
        && ((valueString.startsWith('"') && valueString.endsWith('"'))
            || (valueString.startsWith("'") && valueString.endsWith("'")))) {
      // if what we got back has quotes but the original wasn't a string, remove them.
      valueString = valueString.slice(1, -1);
    }
    if (!DELIMITED.test(valueString)) {
      valueString = `${delimiterOpen}${valueString}${delimiterClose}`;
    }
    if (valueString.length > 40) {
      // everything should be delimited here.  grab the final char so we can reattach it.
      const finalChar = valueString.charAt(valueString.length - 1);
      valueString = valueString.slice(0, 40) + `...${finalChar}`;
    }
    return valueString;
  }
  catch (error) {
    return '�'
  }
}