// Bringing one phone photograph into the golden set.
//
// The operator's whole job is this command and then filling in `truth.json` by
// eye. Everything else, the hashing, the manifest entry, the question list, is
// bookkeeping that a person doing it three hundred times would get wrong.
//
// Usage:
//   pnpm --filter @transferchecker/core-omr import-shot \
//     --paper 2026-08-20-hp-a4-01 --template standard50 \
//     --device 'Pixel 8a' --lighting daylight --angle flat \
//     --printer 'HP M404, toner 70 percent' --pen 'HB pencil' \
//     --captured 2026-08-20 --why 'the ordinary case' \
//     shots/IMG_0031.jpg shots/IMG_0032.jpg
//
// The conversion runs in a separate process and `sharp` is never a dependency
// of this workspace. If it is not installed the command says exactly that and
// exactly what to do, which is `pnpm add -g sharp` or an ImageMagick that is
// already on the machine. See `decode-image.mjs` for why the split exists.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { SheetSpecSchema, stockTemplate } from '@transferchecker/sheet-spec';
import type { StockTemplate } from '@transferchecker/sheet-spec';
import {
  ManifestSchema,
  ManifestShapeSchema,
  REFUSALS,
  SHOT_ANGLES,
  SHOT_LIGHTING,
  SHOT_SOURCES,
} from './golden/manifest';
import type { Manifest, PaperEntry, Shot } from './golden/manifest';
import { defaultRoot } from './golden/papers';
import { readPgm } from './golden/pgm';

/** `--name value` pairs and bare positional arguments, with no dependency. */
function parseArgs(argv: readonly string[]): { flags: Map<string, string>; rest: string[] } {
  const flags = new Map<string, string>();
  const rest: string[] = [];
  for (let at = 0; at < argv.length; at += 1) {
    const item = argv[at] ?? '';
    if (!item.startsWith('--')) {
      rest.push(item);
      continue;
    }
    const next = argv[at + 1];
    if (next === undefined || next.startsWith('--')) {
      flags.set(item.slice(2), 'true');
    } else {
      flags.set(item.slice(2), next);
      at += 1;
    }
  }
  return { flags, rest };
}

const { flags, rest } = parseArgs(process.argv.slice(2));
const need = (name: string): string => {
  const value = flags.get(name);
  if (value === undefined || value === '') {
    process.stderr.write(`missing --${name}\n`);
    process.exit(2);
  }
  return value;
};

const oneOf = <T extends string>(name: string, allowed: readonly T[], fallback: T): T => {
  const value = flags.get(name);
  if (value === undefined) return fallback;
  const found = allowed.find((candidate) => candidate === value);
  if (found === undefined) {
    process.stderr.write(`--${name} must be one of ${allowed.join(', ')}\n`);
    process.exit(2);
  }
  return found;
};

const root = flags.get('root') === undefined ? defaultRoot() : resolve(flags.get('root') ?? '');
const paperId = need('paper');
const dryRun = flags.get('dry-run') === 'true';
const maxWidth = flags.get('max-width') ?? '';

if (rest.length === 0) {
  process.stderr.write('give at least one image to import\n');
  process.exit(2);
}

const DECODER = fileURLToPath(new URL('./decode-image.mjs', import.meta.url));

/** The one place an external converter is invoked, and it is always a subprocess. */
function toPgm(input: string): Uint8Array {
  // A file that is already a PGM is taken as it stands. A flatbed scanner and
  // an operator with their own converter both produce one, and putting those
  // bytes through a decoder would be a resample nobody asked for.
  const held = new Uint8Array(readFileSync(input));
  if (readPgm(held) !== null) return held;

  const viaSharp = spawnSync(process.execPath, [DECODER, input, maxWidth], {
    maxBuffer: 512 * 1024 * 1024,
  });
  if (viaSharp.status === 0) return new Uint8Array(viaSharp.stdout);
  if (viaSharp.status !== 3) {
    process.stderr.write(viaSharp.stderr.toString());
    process.stderr.write(`could not decode ${input}\n`);
    process.exit(1);
  }

  // No sharp on this machine. ImageMagick writes the same format and is on most
  // of them already, so it is tried before the command gives up.
  //
  // `-grayscale Rec601Luma` and NOT `-colorspace Gray`. The latter converts in
  // linear light, which is the same mistake decode-image.mjs used to make and
  // which reads a red gel mark about twenty grey levels too light. This flag
  // computes the weighted sum on the encoded values, which is what a phone's Y
  // plane carries. [reasoned, not measured: `magick` was not installed on the
  // machine this was written on, so the flag is right by its documentation and
  // has not been run.]
  const viaMagick = spawnSync(
    'magick',
    [input, '-auto-orient', '-grayscale', 'Rec601Luma', '-depth', '8', 'pgm:-'],
    {
      maxBuffer: 512 * 1024 * 1024,
    },
  );
  if (viaMagick.status === 0) return new Uint8Array(viaMagick.stdout);

  // The advice used to say `pnpm add -g sharp`, and [measured] that does not
  // work: decode-image.mjs is an ES module, so a bare specifier resolves by
  // walking node_modules upward from the MODULE'S OWN path, and a global install
  // is not on that chain. Neither is NODE_PATH, which ESM ignores. Installing
  // into a directory ABOVE the clone is on the chain, and touches no file inside
  // this repository, which is the constraint that matters.
  process.stderr.write(
    'no image decoder found. Install one, and neither becomes a dependency of this workspace:\n' +
      `  npm install sharp --prefix ${resolve(DECODER, '../../../../..')}\n` +
      '  (a global install does NOT work: ESM resolves from the module upward)\n' +
      '  or install ImageMagick, so that `magick` is on the path\n',
  );
  process.exit(3);
}

const paperDir = join(root, 'papers', paperId);
const shotsDir = join(paperDir, 'shots');
if (!dryRun) mkdirSync(shotsDir, { recursive: true });

const hashOf = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const asJson = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
const write = (path: string, data: string | Uint8Array): void => {
  if (dryRun) {
    process.stdout.write(`would write ${path}\n`);
    return;
  }
  writeFileSync(path, data);
};

// The sheet this paper was printed from. Written once and never again, because
// its hash is in the manifest and a spec that changes under a photograph makes
// every truth read against it wrong.
const specPath = join(paperDir, 'spec.json');
let specJson = existsSync(specPath) ? readFileSync(specPath, 'utf8') : '';
if (specJson === '') {
  const template = oneOf<StockTemplate>(
    'template',
    ['quick20', 'standard50', 'full100'],
    'standard50',
  );
  specJson = asJson(
    stockTemplate(template, {
      name: flags.get('name') ?? 'Golden',
      branding: 'TRANSFERCHECKER.COM',
      studentName: 'Name',
      studentId: 'Student ID',
      keyVersion: 'Key',
    }),
  );
  write(specPath, specJson);
}
const spec = SheetSpecSchema.parse(JSON.parse(specJson));

// A truth file every question is present in, all of them unread. A person fills
// the letters in; nothing here ever guesses one.
const truthPath = join(paperDir, 'truth.json');
const truthJson = existsSync(truthPath)
  ? readFileSync(truthPath, 'utf8')
  : asJson({
      paper: paperId,
      readBy: [flags.get('read-by') ?? 'unread'],
      readAt: need('captured'),
      identity: null,
      questions: spec.questions.map((_, index) => ({ question: index + 1, kind: 'unread' })),
    });
if (!existsSync(truthPath)) write(truthPath, truthJson);

const manifestPath = join(root, 'manifest.json');
const manifest: Manifest = existsSync(manifestPath)
  ? ManifestShapeSchema.parse(JSON.parse(readFileSync(manifestPath, 'utf8')))
  : {
      format: 1,
      sheetVersion: 4,
      note: 'Tier 3 of the golden set. The shots are not in this repository, their hashes are.',
      papers: [],
    };

// Numbering continues from what the paper already holds. Restarting at 01 each
// run would let a second import overwrite the first shot whenever two source
// files happen to share a name, and the manifest would still hash cleanly
// against the survivor while a photograph quietly disappeared.
const already = manifest.papers.find((paper) => paper.id === paperId)?.shots.length ?? 0;

const shots: Shot[] = [];
for (const [index, input] of rest.entries()) {
  const bytes = toPgm(input);
  const image = readPgm(bytes);
  if (image === null) {
    process.stderr.write(`${input}: the decoder did not produce a readable PGM\n`);
    process.exit(1);
  }
  const slug = basename(input, extname(input))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const file = `${String(already + index + 1).padStart(2, '0')}-${slug === '' ? 'shot' : slug}.pgm`;
  if (existsSync(join(shotsDir, file))) {
    process.stderr.write(`${file} already exists in ${shotsDir}, and this would overwrite it\n`);
    process.exit(1);
  }
  write(join(shotsDir, file), bytes);
  shots.push({
    file,
    sha256: hashOf(bytes),
    bytes: bytes.byteLength,
    width: image.width,
    height: image.height,
    source: oneOf('source', SHOT_SOURCES, 'phone'),
    device: need('device'),
    capturedAt: need('captured'),
    lighting: oneOf('lighting', SHOT_LIGHTING, 'daylight'),
    angle: oneOf('angle', SHOT_ANGLES, 'flat'),
    // A shot taken to be refused says which refusal it expects, so criterion 16
    // can ask whether the reported cause matched the defect that was aimed at it.
    expect: oneOf('expect', REFUSALS, 'graded'),
    why: flags.get('why') ?? 'an ordinary capture',
  });
  process.stdout.write(`${input} -> ${file} ${String(image.width)}x${String(image.height)}\n`);
}

const encoder = new TextEncoder();
const specBytes = encoder.encode(specJson);
const truthBytes = encoder.encode(truthJson);
const printScale = Number(flags.get('print-scale') ?? '1');
if (!Number.isFinite(printScale)) {
  process.stderr.write(`--print-scale must be a number, and 'fit to page' usually means 0.94\n`);
  process.exit(2);
}
const entry: PaperEntry = {
  id: paperId,
  kind: 'real',
  printer: flags.get('printer') ?? 'unrecorded',
  printScale,
  pen: flags.get('pen') ?? 'unrecorded',
  spec: { sha256: hashOf(specBytes), bytes: specBytes.byteLength },
  truth: { sha256: hashOf(truthBytes), bytes: truthBytes.byteLength },
  shots,
  why: flags.get('why') ?? 'an ordinary paper',
};

const held = manifest.papers.find((paper) => paper.id === paperId);
const papers =
  held === undefined
    ? [...manifest.papers, entry]
    : manifest.papers.map((paper) =>
        paper.id === paperId ? { ...paper, ...entry, shots: [...paper.shots, ...shots] } : paper,
      );

const updated = { ...manifest, papers };
write(manifestPath, asJson(updated));

// Said here rather than left for the loader to say a week later. Importing one
// shot at a time leaves the manifest legitimately incomplete in between, so
// this is a warning and never a refusal to write.
const checked = ManifestSchema.safeParse(updated);
if (!checked.success) {
  process.stdout.write(
    `\nthe manifest is not complete yet, which is expected while shots are still arriving:\n`,
  );
  for (const issue of checked.error.issues) {
    process.stdout.write(`  ${issue.path.join('.')}: ${issue.message}\n`);
  }
}

process.stdout.write(
  `\n${String(shots.length)} shot(s) imported into ${paperId}.\n` +
    `Now read the paper by eye and fill ${truthPath}: every question is 'unread' until a person clears it,\n` +
    `and a real paper needs two names in readBy before it counts toward arming the accuracy gate.\n`,
);
