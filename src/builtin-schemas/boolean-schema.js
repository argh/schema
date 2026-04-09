import { Schema } from '../schema.js';
import { isTruthy } from '../helpers/truthy.js';

export const BOOLEAN_SCHEMA = new Schema()
  .option('type', 'boolean')
  .meta('valueName', 'boolean')
  .normalizer(isTruthy)
  .validator({$in: [true, false]})


