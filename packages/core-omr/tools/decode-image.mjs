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

// THE CONVERSION IS THE PHONE'S, NOT THE LIBRARY'S, and this is the whole of
// what this block is for.
//
// `sharp().greyscale()` is Rec.709 luminance computed in LINEAR light. A phone's
// Y plane, which is what the engine reads at run time, is BT.601 luma computed
// on the GAMMA ENCODED components. On grey they agree. On colour they do not,
// and the gap is not academic [measured, on solid patches through this same
// library]:
//
//   ink               greyscale()   a phone      error
//   white paper           242         241.8       +0.2
//   HB graphite           102         102.2       -0.2
//   black ballpoint        38          38.5       -0.5
//   blue ballpoint         66          63.2       +2.8
//   red ballpoint          94          82.5      +11.5
//   red gel               106          85.8      +20.2
//
// Twenty grey levels is the difference between a mark and blank paper. Two of
// the first four real sheets were marked in red, and the corpus that was
// supposed to measure the engine would have measured a DIFFERENT engine than the
// one the product runs, silently, on exactly the papers where it matters.
//
// The matrix below reproduces the phone to within half a grey level on every
// patch above, and is byte identical to `greyscale()` on achromatic pages, which
// is why no golden paper needs re-importing. `.linear(1, 0.5)` rounds rather
// than truncating; without it every value is biased half a level low.
//
// The three weights are BT601_LUMA in src/image/gray.ts. They are copied rather
// than imported because this file is plain JavaScript held outside the tsconfig
// on purpose, so that resolving `sharp` never becomes a type check dependency,
// and a test asserts the two copies still agree.
//
// `rotate()` with no argument applies the EXIF orientation and nothing else,
// which matters because a phone writes a landscape buffer with a portrait tag
// and the sheet would arrive on its side.
const BT601 = [
  [0.299, 0.587, 0.114],
  [0.299, 0.587, 0.114],
  [0.299, 0.587, 0.114],
];

let pipeline = sharp(input, { failOn: 'error' })
  .rotate()
  .flatten({ background: '#ffffff' })
  .toColourspace('srgb')
  .recomb(BT601)
  .extractChannel(0)
  .linear(1, 0.5);
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
