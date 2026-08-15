// The printed code, read back.
//
// sheet-spec owns the encoder, so every assertion here is a round trip against
// a symbol we really print rather than against a fixture someone typed. That is
// what makes a table typo in versions.ts impossible to miss: a wrong block
// count does not decode.

import { describe, expect, it } from 'vitest';
import {
  GEOMETRY,
  codeMatrix,
  decodeSheetCode,
  encodeSheetCode,
  stockTemplate,
} from '@transferchecker/sheet-spec';
import type { QrMatrix } from '@transferchecker/sheet-spec';
import { decodeQrMatrix } from '../src/qr/index';
import { EC_LEVELS, MAX_VERSION, moduleCountOf, versionOfMatrix } from '../src/qr/versions';
import { blockPlan } from '../src/qr/versions';

const TEXT = {
  name: 'Standard 50',
  branding: 'TRANSFERCHECKER.COM',
  studentName: 'Name',
  studentId: 'Student ID',
  keyVersion: 'Key',
};

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Deterministic base32 text of a given length: tests may not be random. */
function payloadOfLength(length: number): string {
  let out = '';
  for (let index = 0; index < length; index += 1) {
    out += ALPHABET[(index * 7 + 3) % ALPHABET.length] ?? 'A';
  }
  return out;
}

function flip(matrix: QrMatrix, row: number, column: number): QrMatrix {
  return matrix.map((line, r) =>
    line.map((module, c) => (r === row && c === column ? !module : module)),
  );
}

describe('the block tables agree with the specification', () => {
  it('rebuilds every version total from its blocks', () => {
    for (let version = 1; version <= MAX_VERSION; version += 1) {
      for (const level of EC_LEVELS) {
        const plan = blockPlan(version, level);
        expect(plan).not.toBeNull();
        if (plan === null) continue;
        const rebuilt = plan.dataPerBlock.reduce((sum, data) => sum + data + plan.ecPerBlock, 0);
        expect(`v${String(version)}${level}=${String(rebuilt)}`).toBe(
          `v${String(version)}${level}=${String(plan.totalCodewords)}`,
        );
      }
    }
  });
});

describe('a printed code decodes back to its payload', () => {
  it('round trips the three stock sheets', () => {
    for (const kind of ['quick20', 'standard50', 'full100'] as const) {
      const spec = stockTemplate(kind, TEXT);
      const payload = encodeSheetCode(spec);
      const matrix = codeMatrix(payload);
      expect(matrix).not.toBeNull();
      if (matrix === null) continue;
      expect(decodeQrMatrix(matrix)).toBe(payload);
    }
  });

  it('round trips every payload length the sheet can reach, across versions', () => {
    const versionsSeen = new Set<number>();
    for (let length = 1; length <= 320; length += 1) {
      const payload = payloadOfLength(length);
      const matrix = codeMatrix(payload);
      if (matrix === null) continue;
      const version = versionOfMatrix(matrix.length);
      if (version === null || version > MAX_VERSION) continue;
      versionsSeen.add(version);
      expect(`len ${String(length)}: ${String(decodeQrMatrix(matrix))}`).toBe(
        `len ${String(length)}: ${payload}`,
      );
    }
    // Every supported version was actually exercised, so no table row is
    // carried on trust.
    expect([...versionsSeen].sort((a, b) => a - b)).toEqual(
      Array.from({ length: MAX_VERSION }, (_, index) => index + 1),
    );
  });

  it('decodes a sheet spec end to end, from spec to modules and back', () => {
    const spec = stockTemplate('standard50', TEXT);
    const matrix = codeMatrix(encodeSheetCode(spec));
    expect(matrix).not.toBeNull();
    if (matrix === null) return;

    const text = decodeQrMatrix(matrix);
    expect(text).not.toBeNull();
    if (text === null) return;

    const decoded = decodeSheetCode(text);
    expect(decoded?.mode).toBe('full');
    if (decoded?.mode !== 'full') return;
    expect(decoded.spec.questions).toHaveLength(50);
    expect(decoded.spec.paper).toBe(spec.paper);
    expect(decoded.spec.bubble).toEqual(spec.bubble);
  });
});

describe('error correction earns its place', () => {
  it('survives damaged modules rather than rejecting the sheet', () => {
    const payload = encodeSheetCode(stockTemplate('standard50', TEXT));
    const clean = codeMatrix(payload);
    expect(clean).not.toBeNull();
    if (clean === null) return;

    // Level M repairs roughly fifteen percent of the codewords. Eight scattered
    // module flips is a smudge, and the payload must still come back exact.
    let damaged = clean;
    for (let index = 0; index < 8; index += 1) {
      const row = 10 + ((index * 5) % (clean.length - 12));
      const column = 9 + ((index * 7) % (clean.length - 12));
      damaged = flip(damaged, row, column);
    }
    expect(decodeQrMatrix(damaged)).toBe(payload);
  });

  it('returns null rather than a wrong payload when damage is past repair', () => {
    const payload = encodeSheetCode(stockTemplate('quick20', TEXT));
    const clean = codeMatrix(payload);
    expect(clean).not.toBeNull();
    if (clean === null) return;

    let wrecked = clean;
    for (let row = 9; row < clean.length - 9; row += 1) {
      for (let column = 9; column < clean.length - 9; column += 2) {
        wrecked = flip(wrecked, row, column);
      }
    }
    const result = decodeQrMatrix(wrecked);
    // The only two honest outcomes are the true payload or nothing at all.
    expect(result === null || result === payload).toBe(true);
    expect(result).toBeNull();
  });

  it('refuses a matrix that is not a symbol at all', () => {
    expect(decodeQrMatrix([])).toBeNull();
    expect(decodeQrMatrix([[true, false]])).toBeNull();
    const ragged: QrMatrix = [[true], [false, true]];
    expect(decodeQrMatrix(ragged)).toBeNull();
  });
});

describe('the printed sheet stays inside the versions this decoder carries', () => {
  it('cannot print a code larger than the largest supported version', () => {
    const modulesAcross =
      GEOMETRY.codeMaxSizeMm / GEOMETRY.codeMinModuleMm - 2 * GEOMETRY.codeQuietModules;
    // Raising codeMaxSizeMm or lowering codeMinModuleMm upstream without widening
    // the version tables here would print sheets this engine cannot read, so
    // the failure belongs at build time and not on a teacher's phone.
    expect(modulesAcross).toBeLessThanOrEqual(moduleCountOf(MAX_VERSION));
  });
});
