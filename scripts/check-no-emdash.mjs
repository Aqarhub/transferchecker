// Fails the build when an em dash reaches user-facing text.
//
// House rule: interface copy and error messages separate clauses with a comma
// or a full stop, never with an em dash. The check is deliberately blunt and
// flags the character anywhere in the scanned files rather than trying to tell
// a string literal from a comment, because a comma always works in both.
//
// Usage: node scripts/check-no-emdash.mjs [dir ...]

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import process from 'node:process';

const EM_DASH = '—';
// Source, translation catalogues and site content: everything a user can read.
// Plain .md is developer documentation and stays out of scope, which also lets
// the standards docs name the character they are banning.
const SCANNED = /\.(ts|tsx|json|mdx|html|css)$/;
const SKIPPED = new Set(['node_modules', '.git', '.next', '.turbo', 'dist', 'build', 'coverage']);
// This checker names the character it bans, and docs/research/raw holds agent
// output kept verbatim as a record. Editing that record to satisfy a house
// style would falsify it, and nobody reads it as product text.
const EXEMPT = /(^|\/)(scripts\/check-no-emdash\.mjs|docs\/research\/raw\/.*)$/;

/** Every scannable file under `dir`, skipping build output and dependencies. */
function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIPPED.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (SCANNED.test(entry)) yield path;
  }
}

const roots = process.argv.slice(2);
const targets = roots.length > 0 ? roots : ['.'];
const findings = [];

for (const root of targets) {
  for (const path of walk(root)) {
    const shown = relative(process.cwd(), path);
    if (EXEMPT.test(shown)) continue;
    const lines = readFileSync(path, 'utf8').split('\n');
    lines.forEach((line, index) => {
      const column = line.indexOf(EM_DASH);
      if (column !== -1) findings.push(`${shown}:${index + 1}:${column + 1}`);
    });
  }
}

if (findings.length > 0) {
  process.stderr.write(
    `Found ${findings.length} em dash occurrence(s). Use a comma or a full stop.\n`,
  );
  for (const finding of findings) process.stderr.write(`  ${finding}\n`);
  process.exit(1);
}

process.stdout.write('No em dash found in user-facing text.\n');
