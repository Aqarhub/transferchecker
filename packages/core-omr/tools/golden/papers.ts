// Receiving tier 3: reading a manifest, verifying it, and scoring what arrived.
//
// Nothing here captures anything. It is the door the three hundred photographs
// walk through, and it exists before them on purpose, because the alternative
// is discovering the format is wrong after the photographing is done.
//
// The loader NEVER throws on a set that is incomplete. A shot whose bytes are
// not on this machine is `absent`, which is the ordinary state of every shot in
// CI, and a paper nobody has read yet is `pending`. Both are reported and
// neither is a failure. What IS a failure is a shot whose bytes are present and
// do not match the hash the manifest carries, because that is the one case
// where the engine would be scored against a different photograph than the one
// a person read the truth from, and it would look exactly like an engine defect.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { SheetSpecSchema, layoutSheet } from '@transferchecker/sheet-spec';
import type { SheetLayout, SheetSpec } from '@transferchecker/sheet-spec';
import type { Thresholds } from '../../src/decide/thresholds';
import type { GrayImage } from '../../src/image/gray';
import { scanSheet } from '../../src/scan/pipeline';
import { ManifestShapeSchema, PaperSchema, TruthSchema } from './manifest';
import type { Manifest, PaperEntry, PaperTruth, Shot, TruthEntry } from './manifest';
import { readPgm } from './pgm';
import { scoreResult } from './score';
import type { CaseRecord } from './score';
import type { Expected } from './truth';

/** Where the shots live when they are not beside the manifest. */
export const ROOT_ENV = 'TRANSFERCHECKER_GOLDEN_ROOT';

export function defaultRoot(): string {
  const named = process.env[ROOT_ENV];
  if (named !== undefined && named !== '') return resolve(named);
  return resolve(fileURLToPath(new URL('.', import.meta.url)), '../../test/golden');
}

export interface LoadedShot {
  readonly shot: Shot;
  readonly path: string;
  readonly present: boolean;
  readonly image: GrayImage | null;
  /** Empty when the bytes on disk are the bytes the manifest names. */
  readonly fault: string;
}

export interface LoadedPaper {
  readonly entry: PaperEntry;
  readonly spec: SheetSpec;
  readonly layout: SheetLayout;
  readonly truth: PaperTruth;
  readonly shots: readonly LoadedShot[];
  /** A person has read every question of this paper. */
  readonly read: boolean;
  /** Every declared shot is on this machine and matches its hash. */
  readonly complete: boolean;
  readonly faults: readonly string[];
}

export interface GoldenPapers {
  readonly root: string;
  readonly present: boolean;
  readonly papers: readonly LoadedPaper[];
  /** Real papers that are both fully read and fully present: what arms the gates. */
  readonly realPapers: number;
  readonly shotsPresent: number;
  readonly shotsAbsent: number;
  readonly faults: readonly string[];
}

const hashOf = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/** A file read once, with its hash and size checked against what the manifest claims. */
function verified(
  path: string,
  sha256: string,
  bytes: number,
): { data: Uint8Array; fault: string } {
  const data = new Uint8Array(readFileSync(path));
  if (data.byteLength !== bytes) {
    return {
      data,
      fault: `${path}: ${String(data.byteLength)} bytes, manifest says ${String(bytes)}`,
    };
  }
  const found = hashOf(data);
  return {
    data,
    fault: found === sha256 ? '' : `${path}: sha256 ${found}, manifest says ${sha256}`,
  };
}

/**
 * The tier 3 truth as the same `Expected` a drawn case produces.
 *
 * Null for a question nobody has read, which is never scored: an unread
 * question with a guessed expectation would put the corpus's guess into the
 * accuracy number under the name of a person who never saw the paper.
 */
export function expectedFrom(entry: TruthEntry): Expected | null {
  switch (entry.kind) {
    case 'answer':
      return { kind: 'answer', symbol: entry.symbol };
    case 'blank':
      return { kind: 'blank' };
    case 'flagged':
      return { kind: 'flagged', why: entry.why };
    case 'either':
      return { kind: 'either', symbol: entry.symbol, why: entry.why };
    case 'unread':
      return null;
  }
}

function loadShot(paper: PaperEntry, shot: Shot, root: string): LoadedShot {
  const path = join(root, 'papers', paper.id, 'shots', shot.file);
  if (!existsSync(path)) {
    return { shot, path, present: false, image: null, fault: '' };
  }
  const { data, fault } = verified(path, shot.sha256, shot.bytes);
  if (fault !== '') return { shot, path, present: true, image: null, fault };

  const image = readPgm(data);
  if (image === null) {
    return { shot, path, present: true, image: null, fault: `${path}: not a binary 8 bit PGM` };
  }
  if (image.width !== shot.width || image.height !== shot.height) {
    return {
      shot,
      path,
      present: true,
      image: null,
      fault: `${path}: ${String(image.width)}x${String(image.height)}, manifest says ${String(shot.width)}x${String(shot.height)}`,
    };
  }
  return { shot, path, present: true, image, fault: '' };
}

function loadPaper(entry: PaperEntry, root: string): LoadedPaper | string {
  const dir = join(root, 'papers', entry.id);
  const specPath = join(dir, 'spec.json');
  const truthPath = join(dir, 'truth.json');
  if (!existsSync(specPath) || !existsSync(truthPath)) {
    return `${entry.id}: the manifest names it but ${dir} has no spec.json and truth.json pair`;
  }

  const specFile = verified(specPath, entry.spec.sha256, entry.spec.bytes);
  const truthFile = verified(truthPath, entry.truth.sha256, entry.truth.bytes);

  const text = new TextDecoder();
  const specParsed = SheetSpecSchema.safeParse(JSON.parse(text.decode(specFile.data)));
  if (!specParsed.success) return `${specPath}: ${specParsed.error.message}`;
  const truthParsed = TruthSchema.safeParse(JSON.parse(text.decode(truthFile.data)));
  if (!truthParsed.success) return `${truthPath}: ${truthParsed.error.message}`;

  const laid = layoutSheet(specParsed.data);
  if (laid.kind !== 'ok') return `${specPath}: this spec does not lay out`;

  const shots = entry.shots.map((shot) => loadShot(entry, shot, root));
  const read = truthParsed.data.questions.every((question) => question.kind !== 'unread');
  const faults = [specFile.fault, truthFile.fault, ...shots.map((shot) => shot.fault)].filter(
    (fault) => fault !== '',
  );
  if (truthParsed.data.paper !== entry.id) {
    faults.push(`${truthPath}: names paper ${truthParsed.data.paper}, but sits in ${entry.id}`);
  }
  // Two readers, because the truth is the ground everything else is measured
  // against and one person reading two hundred bubbles at midnight is not it.
  if (entry.kind === 'real' && truthParsed.data.readBy.length < 2) {
    faults.push(
      `${truthPath}: a real paper needs two readers, and this has ${String(truthParsed.data.readBy.length)}`,
    );
  }

  return {
    entry,
    spec: specParsed.data,
    layout: laid.layout,
    truth: truthParsed.data,
    shots,
    read,
    complete: shots.every((shot) => shot.present && shot.fault === ''),
    faults,
  };
}

/** Everything the manifest names, with what is missing reported and not thrown. */
export function loadPapers(root: string = defaultRoot()): GoldenPapers {
  const manifestPath = join(root, 'manifest.json');
  const empty = {
    root,
    papers: [],
    realPapers: 0,
    shotsPresent: 0,
    shotsAbsent: 0,
  } as const;
  if (!existsSync(manifestPath)) {
    return { ...empty, present: false, faults: [] };
  }

  // TWO PARSES, AND THE SPLIT IS THE POINT.
  //
  // The file's SHAPE is fatal: a manifest that is not a manifest, or one whose
  // two papers share an id, cannot be read at all and there is nothing to
  // salvage. But a paper that is merely INCOMPLETE is the normal state of a
  // corpus that is still being collected, and `PaperSchema` refuses one until it
  // has three shots differing in lighting or angle.
  //
  // Running those per paper rules through the whole array made one unfinished
  // paper discard every finished one beside it. [measured] The owner's first
  // real set is three papers, one of them two shots along, and the loader
  // accepted ZERO of the three and said so in one sentence about the file. A
  // person reading that has no way to tell a corpus with a typo from a corpus
  // that is simply not finished yet.
  //
  // So the shape is parsed first, then each paper on its own, and an unfinished
  // one is named and skipped rather than taking its siblings with it. Nothing is
  // loosened by this: `realPapers` below still counts only papers that are
  // complete, read and fault free, so a skipped paper cannot arm anything.
  const shaped = ManifestShapeSchema.safeParse(JSON.parse(readFileSync(manifestPath, 'utf8')));
  if (!shaped.success) {
    return { ...empty, present: true, faults: [`${manifestPath}: ${shaped.error.message}`] };
  }
  const ids = shaped.data.papers.map((entry) => entry.id);
  if (new Set(ids).size !== ids.length) {
    return {
      ...empty,
      present: true,
      faults: [`${manifestPath}: two papers share an id, so one would be scored against the other`],
    };
  }
  const manifest: Manifest = shaped.data;

  const papers: LoadedPaper[] = [];
  const faults: string[] = [];
  for (const entry of manifest.papers) {
    const whole = PaperSchema.safeParse(entry);
    if (!whole.success) {
      // Named, and named as unfinished rather than as broken, because those are
      // different problems and only one of them is somebody's mistake.
      faults.push(
        `papers/${entry.id}: not ready to be scored yet: ${whole.error.issues
          .map((issue) => issue.message)
          .join('; ')}`,
      );
      continue;
    }
    const loaded = loadPaper(entry, root);
    if (typeof loaded === 'string') {
      faults.push(loaded);
      continue;
    }
    papers.push(loaded);
    faults.push(...loaded.faults);
  }

  // A directory the manifest does not name is a paper somebody added without an
  // index entry, so it would be silently uncounted rather than silently wrong.
  const dir = join(root, 'papers');
  if (existsSync(dir)) {
    const named = new Set(manifest.papers.map((entry) => entry.id));
    for (const found of readdirSync(dir, { withFileTypes: true })) {
      if (!found.isDirectory() || named.has(found.name)) continue;
      faults.push(`papers/${found.name}: on disk but not in manifest.json, so nothing reads it`);
    }
  }

  const shots = papers.flatMap((paper) => paper.shots);
  return {
    root,
    present: true,
    papers,
    realPapers: papers.filter(
      (paper) =>
        paper.entry.kind === 'real' && paper.read && paper.complete && paper.faults.length === 0,
    ).length,
    shotsPresent: shots.filter((shot) => shot.image !== null).length,
    shotsAbsent: shots.filter((shot) => !shot.present).length,
    faults,
  };
}

/**
 * One shot, scanned and scored, as a record the ordinary report already reads.
 *
 * The stratum is the environment rather than the failure mode, because that is
 * what acceptance criterion 14 asks for a separate floor on: a set averaging
 * 99.7 percent while every tungsten lit shot reads 92 is a product that works
 * on some days.
 */
export function runShot(
  paper: LoadedPaper,
  loaded: LoadedShot,
  thresholds?: Thresholds,
): CaseRecord | null {
  if (loaded.image === null) return null;
  const byQuestion = new Map(paper.truth.questions.map((entry) => [entry.question, entry]));

  const started = Number(process.hrtime.bigint() / 1000n) / 1000;
  const result = scanSheet(loaded.image, thresholds === undefined ? {} : { thresholds });
  const elapsedMs = Number(process.hrtime.bigint() / 1000n) / 1000 - started;

  return scoreResult(
    {
      id: `${paper.entry.id}/${loaded.shot.file}`,
      stratum: `${loaded.shot.source}/${loaded.shot.lighting}/${loaded.shot.angle}`,
      template: paper.spec.name,
      why: loaded.shot.why,
      wanted: loaded.shot.expect,
      layout: paper.layout,
      // Null for a question nobody has read, and `scoreResult` skips it rather
      // than scoring the corpus's guess as if a person had made it.
      expectedFor: (question) => {
        const entry = byQuestion.get(question);
        return entry === undefined ? null : expectedFrom(entry);
      },
      chars: undefined,
    },
    result,
    elapsedMs,
  );
}
