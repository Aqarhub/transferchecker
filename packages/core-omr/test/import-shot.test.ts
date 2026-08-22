// The importer, run as the operator runs it.
//
// This tool had no test, and it is the one every real paper passes through:
// what it writes becomes the geometry and the bookkeeping that the accuracy
// gate is later computed against. So the defects it grew were the expensive
// kind, silent and only visible weeks later in a number nobody could explain.
//
// It is driven here as a subprocess with real arguments, because that is the
// only way to test a top level script and also the only way to test the part
// that matters: what it refuses, and whether it wrote anything before refusing.
//
// A PGM input is passed through untouched by design (a flatbed and an operator
// with their own converter both produce one), so these tests need no image
// decoder and `sharp` stays out of the workspace exactly as the rule requires.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writePgm } from '../tools/golden/pgm';
import { decodeHint } from '../tools/golden/decode-hint';

const TOOL = fileURLToPath(new URL('../tools/import-shot.ts', import.meta.url));
const TSX = fileURLToPath(new URL('../node_modules/.bin/tsx', import.meta.url));

let work = '';
let root = '';
let shot = '';

const BASE = [
  '--device',
  'Pixel 8a',
  '--captured',
  '2026-08-22',
  '--printer',
  'HP M404',
  '--pen',
  'HB pencil',
] as const;

/** The tool, run the way the operator runs it, with the root always named. */
function importShot(args: readonly string[]): {
  status: number;
  stdout: string;
  stderr: string;
} {
  const run = spawnSync(TSX, [TOOL, ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    // A clean environment, so a root exported by whoever runs the suite cannot
    // decide what these tests are measuring.
    env: { ...process.env, TRANSFERCHECKER_GOLDEN_ROOT: '' },
  });
  return { status: run.status ?? -1, stdout: run.stdout, stderr: run.stderr };
}

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'tc-import-'));
  root = join(work, 'golden');
  mkdirSync(root, { recursive: true });
  shot = join(work, 'IMG_0031.pgm');
  // A page sized grey rectangle. Nothing here reads the pixels; the schema only
  // asks that a shot be at least 64 by 64 and that the bytes hash.
  writeFileSync(
    shot,
    writePgm({ width: 200, height: 280, stride: 200, data: new Uint8Array(200 * 280).fill(200) }),
  );
});

afterEach(() => {
  rmSync(work, { recursive: true, force: true });
});

const manifestAt = (): Record<string, unknown> =>
  JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')) as Record<string, unknown>;

describe('the happy path still works', () => {
  it('imports a shot and writes the spec, the truth and the manifest', () => {
    const run = importShot([
      '--root',
      root,
      '--paper',
      '2026-08-22-hp-a4-01',
      '--template',
      'quick20',
      ...BASE,
      shot,
    ]);
    expect(run.status).toBe(0);
    expect(existsSync(join(root, 'papers/2026-08-22-hp-a4-01/spec.json'))).toBe(true);
    expect(existsSync(join(root, 'papers/2026-08-22-hp-a4-01/truth.json'))).toBe(true);
    expect(existsSync(join(root, 'manifest.json'))).toBe(true);
  });
});

describe('the template, which decides a geometry that is never revisited', () => {
  it('refuses the first import of a paper that does not name one', () => {
    // The trap this closes: the flag used to default to standard50 in silence,
    // on the one branch that fixes a paper's geometry forever. A quick20 on the
    // desk was recorded as a standard50 and every truth read against it wrong.
    const run = importShot(['--root', root, '--paper', 'paper-01', ...BASE, shot]);
    expect(run.status).toBe(2);
    expect(run.stderr).toContain('--template is required');
    expect(existsSync(join(root, 'manifest.json'))).toBe(false);
  });

  it('writes the geometry the flag named, not a default', () => {
    importShot(['--root', root, '--paper', 'paper-01', '--template', 'quick20', ...BASE, shot]);
    const spec = JSON.parse(readFileSync(join(root, 'papers/paper-01/spec.json'), 'utf8')) as {
      questions: unknown[];
    };
    expect(spec.questions).toHaveLength(20);
  });

  it('refuses a later shot that names a different template', () => {
    importShot(['--root', root, '--paper', 'paper-01', '--template', 'quick20', ...BASE, shot]);
    const second = join(work, 'IMG_0032.pgm');
    writeFileSync(
      second,
      writePgm({ width: 200, height: 280, stride: 200, data: new Uint8Array(200 * 280).fill(180) }),
    );

    // Silently ignored before: the flag is only read while spec.json is absent,
    // so an operator who typed the wrong one saw a clean success.
    const run = importShot([
      '--root',
      root,
      '--paper',
      'paper-01',
      '--template',
      'standard50',
      ...BASE,
      second,
    ]);
    expect(run.status).toBe(2);
    expect(run.stderr).toContain('Nothing was imported');
    expect((manifestAt()['papers'] as { shots: unknown[] }[])[0]?.shots).toHaveLength(1);
  });
});

describe('the root, which is a tracked fixture by default', () => {
  it('refuses to guess where the papers go', () => {
    const run = importShot(['--paper', 'paper-01', '--template', 'quick20', ...BASE, shot]);
    expect(run.status).toBe(2);
    expect(run.stderr).toContain('--root');
    expect(run.stderr).toContain('TRANSFERCHECKER_GOLDEN_ROOT');
  });
});

describe('what the operator typed is refused before anything is written', () => {
  it('names the flag and the limit, and leaves no manifest behind', () => {
    const run = importShot([
      '--root',
      root,
      '--paper',
      'paper-01',
      '--template',
      'quick20',
      '--device',
      'Pixel 8a',
      '--captured',
      '2026-08-22',
      '--pen',
      'x'.repeat(41),
      shot,
    ]);
    expect(run.status).toBe(2);
    expect(run.stderr).toContain('--pen');
    // The point of moving the check earlier: a rejected keystroke used to leave
    // a written manifest that the loader would refuse a week later.
    expect(existsSync(join(root, 'manifest.json'))).toBe(false);
    expect(existsSync(join(root, 'papers/paper-01/spec.json'))).toBe(false);
  });

  it('catches a note that fits a paper but not a shot, since one flag feeds both', () => {
    // 180 characters: inside the paper's 200 and past the shot's 160.
    const run = importShot([
      '--root',
      root,
      '--paper',
      'paper-01',
      '--template',
      'quick20',
      ...BASE,
      '--why',
      'y'.repeat(180),
      shot,
    ]);
    expect(run.status).toBe(2);
    expect(run.stderr).toContain('--why');
    expect(existsSync(join(root, 'manifest.json'))).toBe(false);
  });

  it('refuses a capture date that is not one', () => {
    const run = importShot([
      '--root',
      root,
      '--paper',
      'paper-01',
      '--template',
      'quick20',
      '--device',
      'Pixel 8a',
      '--captured',
      'yesterday',
      shot,
    ]);
    expect(run.status).toBe(2);
    expect(run.stderr).toContain('--captured');
    expect(existsSync(join(root, 'manifest.json'))).toBe(false);
  });
});

describe('and incompleteness is still not an error', () => {
  it('imports one shot of a real paper and says only that it is not complete', () => {
    const run = importShot([
      '--root',
      root,
      '--paper',
      'paper-01',
      '--template',
      'quick20',
      ...BASE,
      shot,
    ]);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('not complete yet');
    // A paper is one shot for as long as it takes to import the second, and the
    // importer has to be able to append to its own output in that state.
    expect(existsSync(join(root, 'manifest.json'))).toBe(true);
  });
});

describe('the hint a failed decode carries', () => {
  // The spawn path itself needs a decoder this machine does not have, so the
  // message is proven where it is decided rather than claimed in a comment.
  it('names the phone side fix for an iPhone capture', () => {
    expect(decodeHint('IMG_0031.HEIC')).toContain('JPEG');
    expect(decodeHint('IMG_0031.heif')).toContain('JPEG');
  });

  it('says nothing extra about a format that has no such story', () => {
    expect(decodeHint('IMG_0031.jpg')).toBe('');
    expect(decodeHint('scan.png')).toBe('');
  });
});
