// A QR symbol as modules goes in, the text it carries comes out.
//
// This is a decoder rather than a dependency because the plan requires this
// package to carry zero runtime dependencies and to run on Hermes, where a
// library built on WebAssembly is not available at all. The whole of it is
// pure: modules in, text out, so it is tested against sheet-spec's own encoder
// on thousands of payloads without an image anywhere near it.

import type { QrMatrix } from '@transferchecker/sheet-spec';
import { correctCodewords } from './blocks';
import { readFormat } from './format';
import { readCodewords } from './layout';
import { decodePayload } from './payload';
import { blockPlan, versionOfMatrix } from './versions';

export { EC_LEVELS, MAX_VERSION, moduleCountOf, versionOfMatrix } from './versions';
export type { EcLevel } from './versions';
export { functionPatternMap } from './layout';

/**
 * Null when the modules are not a symbol we can read, whatever the reason: not
 * square, not a supported version, an unreadable format, damage past what the
 * check symbols repair, or a data stream that does not parse. The caller turns
 * that into one named rejection, because the teacher's remedy is the same in
 * every case: hold the camera closer and steadier.
 */
export function decodeQrMatrix(matrix: QrMatrix): string | null {
  const size = matrix.length;
  if (size === 0 || matrix.some((row) => row.length !== size)) return null;

  const version = versionOfMatrix(size);
  if (version === null) return null;

  const format = readFormat(matrix, size);
  if (format === null) return null;

  const plan = blockPlan(version, format.level);
  if (plan === null) return null;

  const raw = readCodewords(matrix, version, format.mask, plan.totalCodewords);
  if (raw === null) return null;

  const corrected = correctCodewords(raw, plan);
  if (corrected === null) return null;

  return decodePayload(corrected, version);
}
