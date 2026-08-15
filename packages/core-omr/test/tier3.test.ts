// Tier 3 receives paper. This is the proof that the door works before anybody
// walks through it.
//
// Nothing here needs a photograph. The end to end test builds a whole golden
// root in a temporary directory FROM THE SYNTHETIC RENDERER, writes real PGM
// bytes, hashes them, writes a manifest and a hand written truth, and then
// loads it back through the same reader a phone shot will use and scores it
// through the same rule the drawn corpus is scored by. If that path is broken,
// it is broken today rather than on the evening three hundred sheets have been
// photographed.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { stockTemplate } from '@transferchecker/sheet-spec';
import type { Rejection } from '../src/scan/reject';
import { ManifestSchema, REFUSALS, TruthSchema } from '../tools/golden/manifest';
import { answerFraction, sheetOf } from '../tools/golden/corpus';
import { imageOf } from '../tools/golden/image';
import { loadPapers, runShot } from '../tools/golden/papers';
import { readPgm, writePgm } from '../tools/golden/pgm';
import { summarise } from '../tools/golden/report';

const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const encode = (value: unknown): Uint8Array =>
  new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

/** A whole golden root, drawn rather than photographed, on disk. */
function buildRoot(): { root: string; answers: Map<number, string> } {
  const root = mkdtempSync(join(tmpdir(), 'golden-tier3-'));
  roots.push(root);
  const id = 'drawn-a5-quick20';
  const dir = join(root, 'papers', id);
  mkdirSync(join(dir, 'shots'), { recursive: true });

  const template = 'quick20' as const;
  const { layout } = sheetOf(template);
  const marks = answerFraction(layout, 1, 41);
  const answers = new Map(marks.map((mark) => [Number(mark.groupId.slice(2)), mark.symbol]));

  const image = imageOf({ id, stratum: 'clean', template, marks, expect: 'graded', why: 'drawn' });
  const pgm = writePgm(image);
  writeFileSync(join(dir, 'shots', '01-daylight-flat.pgm'), pgm);

  const spec = encode(
    stockTemplate(template, {
      name: 'Golden',
      branding: 'TRANSFERCHECKER.COM',
      studentName: 'Name',
      studentId: 'Student ID',
      keyVersion: 'Key',
    }),
  );
  writeFileSync(join(dir, 'spec.json'), spec);

  const rows = layout.questionColumns.flatMap((column) => column.rows);
  const truth = encode({
    paper: id,
    readBy: ['first reader', 'second reader'],
    readAt: '2026-08-15',
    identity: null,
    questions: rows.map((row) => {
      const symbol = answers.get(row.question);
      return symbol === undefined
        ? { question: row.question, kind: 'blank' }
        : { question: row.question, kind: 'answer', symbol };
    }),
  });
  writeFileSync(join(dir, 'truth.json'), truth);

  writeFileSync(
    join(root, 'manifest.json'),
    encode({
      format: 1,
      sheetVersion: 4,
      note: 'built by a test, drawn rather than photographed',
      papers: [
        {
          id,
          kind: 'fixture',
          printer: 'none',
          printScale: 1,
          pen: 'none',
          spec: { sha256: sha(spec), bytes: spec.byteLength },
          truth: { sha256: sha(truth), bytes: truth.byteLength },
          shots: [
            {
              file: '01-daylight-flat.pgm',
              sha256: sha(pgm),
              bytes: pgm.byteLength,
              width: image.width,
              height: image.height,
              source: 'fixture',
              device: 'the synthetic renderer',
              capturedAt: '2026-08-15',
              lighting: 'daylight',
              angle: 'flat',
              expect: 'graded',
              why: 'the reception path, end to end, with no camera',
            },
          ],
          why: 'a drawn stand in for a real paper',
        },
      ],
    }),
  );
  return { root, answers };
}

describe('the format a real paper arrives in', () => {
  it('reads back a grey image byte for byte through PGM', () => {
    const image = imageOf({
      id: 'x',
      stratum: 'clean',
      template: 'quick20',
      marks: [],
      expect: 'graded',
      why: 'x',
    });
    const back = readPgm(writePgm(image));
    expect(back).not.toBeNull();
    expect(back?.width).toBe(image.width);
    expect(back?.height).toBe(image.height);
    // Byte for byte, because a format that resamples is a format that changes
    // the number this whole tier exists to measure.
    expect(back === null ? -1 : back.data.length).toBe(image.width * image.height);
    for (let y = 0; y < image.height; y += 97) {
      for (let x = 0; x < image.width; x += 89) {
        expect(back?.data[y * image.width + x]).toBe(image.data[y * image.stride + x]);
      }
    }
  });

  it('refuses anything that is not an 8 bit binary PGM, rather than guessing', () => {
    const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);
    expect(readPgm(bytes('P2\n2 2\n255\n1 2 3 4\n'))).toBeNull();
    expect(readPgm(bytes('P5\n2 2\n65535\n'))).toBeNull();
    expect(readPgm(bytes('P5\n2 2\n255\nxy'))).toBeNull();
    expect(readPgm(bytes(''))).toBeNull();
    // Comments are part of the format, and a decoder that chokes on one would
    // reject files a perfectly ordinary converter writes.
    const withComment = readPgm(bytes('P5\n# written by a converter\n2 1\n255\nab'));
    expect(withComment?.width).toBe(2);
    expect(withComment?.data[0]).toBe(0x61);
  });

  it('keeps the manifest a closed vocabulary the engine cannot drift away from', () => {
    // Every rejection cause the engine can produce has to be sayable in a
    // manifest, or a shot taken to be refused could not declare what it wants.
    const kinds: Rejection['kind'][] = [
      'no_sheet',
      'code_unreadable',
      'code_too_small',
      'too_steep',
      'template_unknown',
      'not_this_geometry',
      'not_one_sheet',
      'rows_missing',
      'anchors_missing',
      'sheet_not_flat',
      'glare',
      'low_contrast',
    ];
    for (const kind of kinds) expect(REFUSALS).toContain(kind);
    expect(REFUSALS).toContain('graded');
  });

  it('will not let a real paper into the set on one shot, or on three of the same', () => {
    const shot = {
      file: '01-a.pgm',
      sha256: 'a'.repeat(64),
      bytes: 10,
      width: 100,
      height: 100,
      source: 'phone',
      device: 'a phone',
      capturedAt: '2026-08-20',
      lighting: 'daylight',
      angle: 'flat',
      expect: 'graded',
      why: 'a shot',
    };
    const paper = {
      id: 'a-paper',
      kind: 'real',
      printer: 'a printer',
      printScale: 1,
      pen: 'HB',
      spec: { sha256: 'b'.repeat(64), bytes: 10 },
      truth: { sha256: 'c'.repeat(64), bytes: 10 },
      shots: [shot],
      why: 'a paper',
    };
    const manifest = { format: 1, sheetVersion: 4, note: 'n', papers: [paper] };

    // One shot cannot measure determinism, which acceptance criterion 8 asks of
    // every paper in the set.
    expect(ManifestSchema.safeParse(manifest).success).toBe(false);

    // Neither can three from the same chair under the same lamp.
    const same = {
      ...paper,
      shots: [shot, { ...shot, file: '02-a.pgm' }, { ...shot, file: '03-a.pgm' }],
    };
    expect(ManifestSchema.safeParse({ ...manifest, papers: [same] }).success).toBe(false);

    const differing = {
      ...paper,
      shots: [
        shot,
        { ...shot, file: '02-a.pgm', angle: 'tilted' },
        { ...shot, file: '03-a.pgm', lighting: 'tungsten' },
      ],
    };
    expect(ManifestSchema.safeParse({ ...manifest, papers: [differing] }).success).toBe(true);

    // And two papers under one id would score one against the other's truth.
    expect(ManifestSchema.safeParse({ ...manifest, papers: [differing, differing] }).success).toBe(
      false,
    );
  });

  it('accepts a truth nobody has read yet, and never a truth that reads a question twice', () => {
    const base = { paper: 'a-paper', readBy: ['someone'], readAt: '2026-08-20', identity: null };
    expect(
      TruthSchema.safeParse({
        ...base,
        questions: [
          { question: 1, kind: 'unread' },
          { question: 2, kind: 'unread' },
        ],
      }).success,
    ).toBe(true);
    expect(
      TruthSchema.safeParse({
        ...base,
        questions: [
          { question: 1, kind: 'answer', symbol: 'C' },
          { question: 1, kind: 'blank' },
        ],
      }).success,
    ).toBe(false);
  });
});

describe('the converter stays outside this workspace', () => {
  it('keeps sharp out of every dependency manifest, every lockfile and every CI job', () => {
    // The condition on tier 3, as a test rather than as a promise. `sharp`
    // ships prebuilt native binaries per platform and `core-omr` is compiled
    // for a phone, so a dependency added "only for the tools" is still in the
    // lockfile, still in every CI install and still in the closure a mobile
    // bundler walks. It is invoked as a subprocess by `tools/decode-image.mjs`
    // and resolved from wherever the operator installed it.
    const repo = fileURLToPath(new URL('../../..', import.meta.url));
    const guarded = [
      'package.json',
      'pnpm-workspace.yaml',
      'pnpm-lock.yaml',
      'packages/core-omr/package.json',
      'packages/sheet-spec/package.json',
      'packages/sheet-pdf/package.json',
      '.github/workflows/ci.yml',
    ];
    const offenders = guarded
      .filter((path) => existsSync(join(repo, path)))
      .filter((path) => /\bsharp\b/.test(readFileSync(join(repo, path), 'utf8')))
      .map((path) => `${path} names sharp`);
    expect(offenders).toEqual([]);
  });
});

describe('the committed example, which is the shape an operator copies', () => {
  it('parses, and declares itself a fixture with its bytes deliberately absent', () => {
    const set = loadPapers();
    expect(set.present).toBe(true);
    expect(set.faults).toEqual([]);
    expect(set.papers.length).toBeGreaterThan(0);
    // Nothing here may arm the accuracy gate, and the report says 0 of 30
    // because that is the true state of this project's evidence.
    expect(set.realPapers).toBe(0);
    expect(set.shotsPresent).toBe(0);
    expect(set.shotsAbsent).toBeGreaterThan(0);
    for (const paper of set.papers) {
      expect(paper.entry.kind).toBe('fixture');
      expect(paper.read).toBe(false);
    }
  });
});

describe('a paper received, verified and scored, with no camera involved', () => {
  it('loads a drawn set from disk and grades it through the tier 0 rule', () => {
    const { root, answers } = buildRoot();
    const set = loadPapers(root);
    expect(set.faults).toEqual([]);
    expect(set.shotsPresent).toBe(1);

    const paper = set.papers[0];
    expect(paper?.read).toBe(true);
    expect(paper?.complete).toBe(true);

    const shot = paper?.shots[0];
    const record = paper === undefined || shot === undefined ? null : runShot(paper, shot);
    expect(record?.got).toBe('graded');
    expect(record?.counts.wrong).toBe(0);
    expect(record?.questions.length).toBe(answers.size);
    // The stratum is the environment, which is the unit acceptance criterion 14
    // asks for a separate accuracy floor on.
    expect(record?.stratum).toBe('fixture/daylight/flat');

    // And it flows into the ordinary report with the ordinary gates, which is
    // the whole point of receiving rather than building a second scorer.
    const report = summarise(record === null ? [] : [record]);
    expect(report.accuracy).toBe(1);
    expect(report.gates.filter((gate) => gate.armed && !gate.passed)).toEqual([]);
  });

  it('names a shot whose bytes stopped matching its hash, instead of scoring it', () => {
    const { root } = buildRoot();
    const path = join(root, 'papers', 'drawn-a5-quick20', 'shots', '01-daylight-flat.pgm');
    const image = imageOf({
      id: 'x',
      stratum: 'clean',
      template: 'quick20',
      marks: [],
      expect: 'graded',
      why: 'a different photograph entirely',
    });
    writeFileSync(path, writePgm(image));

    const set = loadPapers(root);
    expect(set.faults.length).toBe(1);
    expect(set.faults[0]).toContain('sha256');
    expect(set.shotsPresent).toBe(0);
    expect(set.realPapers).toBe(0);
  });
});
