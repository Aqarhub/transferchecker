// The layer boundary, as a test rather than as a comment.
//
// `read.ts` needs the engine's outcome UNION to map it, and needs none of the
// engine's code. `verbatimModuleSyntax` erases a type only import, so the web
// dashboard can re-grade a class from stored strings without loading a scanning
// engine it will never run. Nothing enforces that but this file: a value import
// added here would compile, pass every other check, and quietly put the whole
// engine into a bundle that had no use for it.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../src', import.meta.url));

describe('grading never loads the scanning engine', () => {
  it('imports core-omr for its types only', () => {
    const offenders = readdirSync(SRC)
      .filter((name) => name.endsWith('.ts'))
      .flatMap((name) => {
        const lines = readFileSync(join(SRC, name), 'utf8').split('\n');
        return lines
          .map((line, at) => ({ line: line.trim(), at: at + 1 }))
          .filter((entry) => entry.line.includes("from '@transferchecker/core-omr'"))
          .filter((entry) => !entry.line.startsWith('import type'))
          .map((entry) => `${name}:${String(entry.at)} ${entry.line}`);
      });
    expect(offenders).toEqual([]);
  });

  it('reaches the engine from exactly one file, so the mapping has one home', () => {
    // Written twice, the second copy is the one that decides a grade on a phone.
    const importers = readdirSync(SRC)
      .filter((name) => name.endsWith('.ts'))
      .filter((name) =>
        readFileSync(join(SRC, name), 'utf8').includes('@transferchecker/core-omr'),
      );
    expect(importers).toEqual(['read.ts']);
  });
});
