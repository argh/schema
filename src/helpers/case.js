/**
 * @param {string} str
 * @returns {string[]}
 */
function normalizeToWords(str) {
  // Handle empty or non-string input
  if (!str || typeof str !== 'string') {
    return [];
  }

  // Split on common delimiters and word boundaries
  return str
    // Split on non-alphanumeric characters (handles kebab-case, snake_case, etc.)
    .split(/[^a-zA-Z0-9]+/)
    // Split on lowercase-to-uppercase transitions (but not uppercase-to-uppercase)
    .flatMap(part => part.split(/(?<=[a-z])(?=[A-Z])/))
    .flatMap(part => part.split(/(?<=[0-9])(?=[A-Za-z])/))
    // Filter out empty strings and convert to lowercase
    .filter(word => word.length > 0)
    .map(word => word.toLowerCase());
}

// Convert normalized words array to camelCase
function wordsToCamelCase(words) {
  if (words.length === 0) {
    return '';
  }
  return words[0] + words.slice(1).map(word =>
         word.charAt(0).toUpperCase() + word.slice(1)
  ).join('');
}

// Convert normalized words array to camelCase
function wordsToPascalCase(words) {
  if (words.length === 0) {
    return '';
  }
  return words.map(word =>
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join('');
}

function wordsToCapitalize(words) {
  if (words.length === 0) {
    return '';
  }
  return words.map(word =>
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
}

const TITLE_CASE_LOWERCASE = new Set([
  'a', 'an', 'the',                          // articles
  'and', 'but', 'or', 'nor', 'for', 'so', 'yet',  // coordinating conjunctions
  'at', 'by', 'in', 'of', 'on', 'to', 'up', 'as', 'via'  // short prepositions
]);

// Convert normalized words array to CONSTANT_CASE
function wordsToConstantCase(words) {
  return words.map(word => word.toUpperCase()).join('_');
}

// Convert normalized words array to kebab-case
function wordsToKebabCase(words) {
  return words.map(word => word.toLowerCase()).join('-');
}

/**
 * @param {string} str
 * @returns {string}
 */
export function toCamelCase(str) {
  return wordsToCamelCase(normalizeToWords(str));
}

/**
 * @param {string} str
 * @returns {string}
 */
export function toPascalCase(str) {
  return wordsToPascalCase(normalizeToWords(str));
}

/**
 * @param {string} str
 * @returns {string}
 */
export function toConstantCase(str) {
  return wordsToConstantCase(normalizeToWords(str));
}

/**
 * @param {string} str
 * @returns {string}
 */
export function toKebabCase(str) {
  return wordsToKebabCase(normalizeToWords(str));
}

/**
 * @param {string} str
 * @returns {string}
 */
export function toCapitalize(str) {
  return wordsToCapitalize(normalizeToWords(str));
}

/**
 * @param {string} str
 * @returns {string}
 */
export function toTitleCase(str) {
  if (!str || typeof str !== 'string') return '';
  let wordIndex = 0;
  const lastWordStart = str.search(/\b\w(?=[^]*$)/);
  return str.replace(/\b(\w)(\w*)\b/g, (match, first, rest, offset) => {
    const i = wordIndex++;
    if (i !== 0 && offset !== lastWordStart && TITLE_CASE_LOWERCASE.has(match.toLowerCase())) {
      return match.toLowerCase();
    }
    return first.toUpperCase() + rest.toLowerCase();
  });
}