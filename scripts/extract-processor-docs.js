#!/usr/bin/env node
/**
 * Extracts processor documentation from JSDoc blocks in core library processor source files.
 *
 * For each JSDoc block containing `## $keyword`:
 *   - Strips `/** ... *\/` comment markers
 *   - Filters JSDoc-only annotation lines (@ type, @ import, etc.)
 *   - Extracts `@category Name` if present (otherwise inferred from directory)
 *   - Writes `processors-output-md/{keyword}.md`
 *
 * Also writes `processors-output-md/index.md` with a table grouped by category.
 *
 * Usage: node scripts/extract-processor-docs.js
 */

import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'node:path';

/**
 * Processor source directories.
 * Each entry maps a directory to a default category applied when the source
 * file does not contain an explicit `@category` annotation.
 */
const PROCESSOR_DIRS = [
  { path: new URL('../src/core-library/processors/', import.meta.url).pathname, defaultCategory: 'General' },
  { path: new URL('../src/core-library-node/processors/', import.meta.url).pathname, defaultCategory: 'Platform: Node.js' },
];

const OUTPUT_DIR = new URL('../processors-output-md/', import.meta.url).pathname;

// JSDoc annotation lines to strip from extracted output (not user-facing content)
const JSDOC_TAG_RE = /^@(type|import|package|param|returns|callback|typedef|template|internal|example|category)\b/;

await mkdir(OUTPUT_DIR, { recursive: true });

/**
 * Strip JSDoc comment delimiters and leading ` * ` from each line.
 * Returns the cleaned multi-line string.
 * @param {string} block - The JSDoc block to clean
 * @returns {string}
 */
function stripCommentMarkers(block) {
  return block
    .replace(/^\/\*\*[ \t]*\n/, '')   // opening /**
    .replace(/[ \t]*\*\/\s*$/, '')    // closing */
    .split('\n')
    .map(line => line.replace(/^ \* ?/, ''))   // leading ' * ' or ' *'
    .join('\n');
}

/**
 * Extract `@category <name>` from raw JSDoc content lines.
 * Returns the category name or undefined if not present.
 * @param {string[]} lines
 * @returns {string|undefined}
 */
function extractCategory(lines) {
  for (const line of lines) {
    const m = line.trim().match(/^@category\s+(.+)$/);
    if (m) return m[1].trim();
  }
  return undefined;
}

/**
 * Filter annotation-only lines from extracted content, respecting code fences
 * so annotations inside ``` blocks are preserved.
 * Also trims leading/trailing blank lines.
 * @param {string} content - The content to filter
 * @returns {string}
 */
function filterContent(content) {
  const lines = content.split('\n');
  const result = [];
  let inFence = false;

  for (const line of lines) {
    if (line.trimStart().startsWith('```')) inFence = !inFence;
    if (!inFence && JSDOC_TAG_RE.test(line.trim())) continue;
    result.push(line);
  }

  while (result.length && result[0].trim() === '') result.shift();
  while (result.length && result[result.length - 1].trim() === '') result.pop();

  return result.join('\n');
}

/**
 * Escape bare curly braces in prose so MDX doesn't interpret them as JSX expressions.
 *
 * Strategy:
 *   - Inside code fences or inline backticks: leave alone
 *   - A matched `{...}` pair under 80 chars with "safe" content (word chars, spaces,
 *     dots, commas, colons, hyphens): wrap the whole group in backticks
 *   - Anything else: backslash-escape individual `{` and `}` chars
 *
 * @param {string} content - Markdown content to escape
 * @returns {string}
 */
function escapeMdxBraces(content) {
  const lines = content.split('\n');
  const result = [];
  let inFence = false;

  for (const line of lines) {
    if (line.trimStart().startsWith('```')) inFence = !inFence;
    if (inFence) {
      result.push(line);
      continue;
    }

    // Process the line in segments, preserving inline backtick spans
    let out = '';
    let i = 0;
    while (i < line.length) {
      // Skip inline backtick spans
      if (line[i] === '`') {
        const end = line.indexOf('`', i + 1);
        if (end !== -1) {
          out += line.slice(i, end + 1);
          i = end + 1;
          continue;
        }
      }

      // Look for bare { ... } pairs
      if (line[i] === '{') {
        const close = line.indexOf('}', i + 1);
        if (close !== -1 && close - i < 80) {
          const inner = line.slice(i, close + 1);
          // Safe content: word chars, spaces, dots, commas, colons, hyphens, slashes
          if (/^\{[\w .,:/$@^-]+\}$/.test(inner)) {
            out += '`' + inner + '`';
            i = close + 1;
            continue;
          }
        }
        // Lone or unsafe brace — backslash escape
        out += '\\{';
        i++;
        continue;
      }

      // Escape lone closing braces too
      if (line[i] === '}') {
        out += '\\}';
        i++;
        continue;
      }

      out += line[i];
      i++;
    }

    result.push(out);
  }

  return result.join('\n');
}

/**
 * Extract a plain-text description from the lines following `## $keyword`
 * (up to the first blank line or `###` heading after content starts),
 * for use in the index table.
 * @param {string[]} lines - The lines to extract description from
 * @returns {string}
 */
function extractDescription(lines) {
  let started = false;
  const descLines = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!started) {
      if (trimmed === '') continue;  // skip leading blank lines before description
      started = true;
    }
    if (trimmed === '' || line.startsWith('#')) break;
    if (JSDOC_TAG_RE.test(trimmed)) continue;
    descLines.push(trimmed);
  }
  return descLines
    .join(' ')
    .replace(/`/g, '')        // strip backtick formatting for plain table cell
    .replace(/\*\*/g, '')     // strip bold markers
    .replace(/\{/g, '\\{')   // escape bare braces for MDX safety
    .replace(/\}/g, '\\}')
    .substring(0, 120)
    .trim();
}

const processors = []; // { keyword, description, category } collected for index.md

for (const { path: dirPath, defaultCategory } of PROCESSOR_DIRS) {
  let files;
  try {
    files = (await readdir(dirPath))
      .filter(f => f.endsWith('.js') && f !== 'index.js')
      .sort();
  } catch {
    // Directory may not exist (e.g. running on a platform without node processors)
    continue;
  }

  for (const filename of files) {
    const src = await readFile(join(dirPath, filename), 'utf8');
    const blockRe = /\/\*\*[\s\S]*?\*\//g;
    let match;

    while ((match = blockRe.exec(src)) !== null) {
      const stripped = stripCommentMarkers(match[0]);
      const allLines = stripped.split('\n');

      // Find the ## $keyword heading — the extraction anchor
      const headerIdx = allLines.findIndex(l => /^## \$\w/.test(l));
      if (headerIdx === -1) continue;

      const kwMatch = allLines[headerIdx].match(/^## \$(\w[\w-]*)/);
      if (!kwMatch) continue;
      const keyword = kwMatch[1];

      const category = extractCategory(allLines) ?? defaultCategory;

      const contentLines = allLines.slice(headerIdx);
      const content = escapeMdxBraces(filterContent(contentLines.join('\n')));
      const description = extractDescription(contentLines.slice(1));

      const outputPath = join(OUTPUT_DIR, `${keyword}.md`);
      await writeFile(outputPath, content + '\n', 'utf8');

      processors.push({ keyword, description, category });
      console.log(`  wrote: ${keyword}.md  [${category}]`);
    }
  }
}

// Group by category, sort categories and processors within each
const byCategory = new Map();
for (const p of processors) {
  if (!byCategory.has(p.category)) byCategory.set(p.category, []);
  byCategory.get(p.category).push(p);
}
for (const list of byCategory.values()) {
  list.sort((a, b) => a.keyword.localeCompare(b.keyword));
}

// Sort categories: 'General' first, then alphabetically, 'Platform: *' last
const sortedCategories = [...byCategory.keys()].sort((a, b) => {
  const aPlat = a.startsWith('Platform:');
  const bPlat = b.startsWith('Platform:');
  if (aPlat !== bPlat) return aPlat ? 1 : -1;
  if (a === 'General') return -1;
  if (b === 'General') return 1;
  return a.localeCompare(b);
});

const sections = [];
for (const category of sortedCategories) {
  const list = byCategory.get(category);
  sections.push(`## ${category}`);
  sections.push('');
  sections.push('| Processor | Description |');
  sections.push('|-----------|-------------|');
  for (const { keyword, description } of list) {
    sections.push(`| [\`$${keyword}\`](./${keyword}.md) | ${description} |`);
  }
  sections.push('');
}

const index = [
  '# Core Library Processors',
  '',
  'A reference for core library value processors available via `$keyword` syntax.',
  '',
  ...sections,
].join('\n');

await writeFile(join(OUTPUT_DIR, 'index.md'), index, 'utf8');
console.log(`\nWrote index.md (${processors.length} processors in ${sortedCategories.length} categories)`);
