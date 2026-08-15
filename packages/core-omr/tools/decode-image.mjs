// Decoding one phone photograph to raw grey bytes, in a process of its own.
//
// THIS FILE IS THE REASON `sharp` IS NOT A DEPENDENCY OF ANYTHING, and the
// separate process is the mechanism rather than a style choice. `sharp` ships
// prebuilt native binaries per platform and per libc, it is the heaviest thing
// that could enter this workspace, and `core-omr` is compiled for a phone. A
// dependency added "only for the tools" is still in the lockfile, still in
// every CI install, and still in the closure a mobile bundler walks.
//
// So the importer spawns this file, this file resolves `sharp` from wherever
// the operator installed it, and if it is not there the exit code says so and
// the importer prints the one command that fixes it. CI never runs this path:
// there are no phone photographs in CI, and `test/tier3.test.ts` asserts that
// the string `sharp` appears in no package.json and in no workflow.
//
// Plain JavaScript on purpose. A .ts file here would have to be covered by a
// tsconfig, and covering it means resolving `sharp` at type check time, which
// is the exact coupling this file exists to prevent.
//
// Usage: node decode-image.mjs <input> [maxWidth]
// Writes: a binary PGM on stdout. Exits 3 when sharp is not installed.

import process from 'node:process';

const [, , input, maxWidth] = process.argv;
if (input === undefined) {
  process.stderr.write('usage: node decode-image.mjs <input> [maxWidth]\n');
  process.exit(2);
}

let sharp;
try {
  ({ default: sharp } = await import('sharp'));
} catch {
  process.stderr.write('sharp is not resolvable from this directory\n');
  process.exit(3);
}

// Greyscale, no alpha, no colour profile, one byte per pixel. `rotate()` with
// no argument applies the EXIF orientation and nothing else, which matters
// because a phone writes a landscape buffer with a portrait tag and the sheet
// would arrive on its side.
let pipeline = sharp(input, { failOn: 'error' }).rotate().greyscale();
const limit = Number(maxWidth);
if (Number.isFinite(limit) && limit > 0) {
  pipeline = pipeline.resize({ width: limit, withoutEnlargement: true, kernel: 'lanczos3' });
}

const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
if (info.channels !== 1) {
  process.stderr.write(`expected one channel, got ${String(info.channels)}\n`);
  process.exit(4);
}

process.stdout.write(`P5\n${String(info.width)} ${String(info.height)}\n255\n`);
process.stdout.write(data);
