import { TraversalState } from '../traversal-state.js';

/**
 * Check whether we have a passing condition.
 *
 * @param {TraversalState} state
 * @returns {TraversalState|null|undefined|Promise<TraversalState|null|undefined>}
 */
export function checkCondition(state) {
  // once we have passed the condition check, it's locked in
  if (state.condition === true) {
    return state;
  }

  if (state.schema === undefined) {
    return undefined;
  }

  //const value = state.pending ?? state.input ?? state.value;
  // todo - think about this:
  //        resolve-union uses pending/input/value like the snippet I extracted above, why is condition just using input?
  //        hmm, pending will never contain any children before the condition returns true...
  //        possibility: allow pending to build up but never be transformed?


  const result = state.schema._checkCondition(state.input, state.context.getValue(), state.location, state.options);

  const handleConditionResult = (result) => {
    state.condition = result;
    if (!result && state.context.final) {
      state.value = null;
    }
    return result ? state : (state.context.final ? null : undefined);
  }

  if (result instanceof Promise) {
    return result.then(resolved => {
      return handleConditionResult(resolved);
    })
  }
  return handleConditionResult(result);
}