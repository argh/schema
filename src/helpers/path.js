/**
 * Split off the first section of a path
 *
 * @param {string} path
 * @returns {[string,string|undefined]}
 */
export function behead(path) {
  if (path === '') {
    return ['', undefined];
  }
  const dot = path.indexOf('.');

  return (dot === -1) ? [path, ''] : [path.slice(0, dot), path.slice(dot + 1)];
}

/**
 * Extract the last part of the path
 * @param {string} path
 * @returns {string}
 */
export function propertyName(path) {
  const dot = path.lastIndexOf('.');

  if (dot === -1) {
    return path;
  }
  return path.slice(dot + 1);
}