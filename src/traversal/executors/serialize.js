import { TraversalState } from '../traversal-state.js';
import { isPlainObject } from '../../helpers/object.js';
import { isTruthy } from '../../helpers/truthy.js';

/**
 * Serialize the pending/input and save as output state value
 *
 * Runs pre-child-traversal; acts in the same way that normalize does.
 * Setting the input will propagate down to assigned values in the child states.
 *
 * @param {TraversalState} state
 * @returns {TraversalState|null|undefined|Promise<TraversalState|null|undefined>}
 */
export function serialize(state) {
  if (state.schema === undefined) {
    return undefined;
  }
  const schema = state.schema;

  if (state.assignedInput === null || schema.isImplicit || isTruthy(schema.metadata['omitFromSerialize'])) {
    return null;
  }

  if (state.assignedInput === undefined) {
    return state;
  }

  const result = schema._serializeValue(state.assignedInput, state.target, state.location, state.options);

  /**
   * @param {any} serialized
   * @returns {null|TraversalState}
   */
  const updateState = (serialized) => {
    if (serialized === null) {
      state.value = null;
      return null;
    }
    state.pending ??= state.hasChildren? ((schema.isArray || Array.isArray(result))? [] : {}) : serialized;
    if (!state.isUnion) {
      state.value = state.pending;
    }
    state.input = serialized;
    return state;
  }

  return (result instanceof Promise)? result.then(updateState) : updateState(result);
}