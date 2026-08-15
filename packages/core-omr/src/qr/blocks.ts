// Splitting a symbol's codewords back into its Reed-Solomon blocks.
//
// A symbol above a certain size is not one long block: it is several, and their
// codewords are interleaved so that a tear across the printed code damages a
// little of each block rather than destroying one of them completely. Undoing
// that interleave is the whole of this file.

import { correctBlock } from './reed-solomon';
import type { BlockPlan } from './versions';

/** Null when any block carries damage its check symbols cannot repair. */
export function correctCodewords(raw: readonly number[], plan: BlockPlan): number[] | null {
  const { ecPerBlock, dataPerBlock } = plan;
  const expected = dataPerBlock.reduce((sum, count) => sum + count + ecPerBlock, 0);
  if (raw.length !== expected) return null;

  const data: number[][] = dataPerBlock.map(() => []);
  const check: number[][] = dataPerBlock.map(() => []);
  const longest = Math.max(...dataPerBlock);
  let at = 0;

  const take = (): number | null => {
    const value = raw[at];
    at += 1;
    return value ?? null;
  };

  // Data codewords come round robin, and a short block simply drops out of the
  // rotation once it is full.
  for (let index = 0; index < longest; index += 1) {
    for (const [block, count] of dataPerBlock.entries()) {
      if (index >= count) continue;
      const value = take();
      if (value === null) return null;
      data[block]?.push(value);
    }
  }

  // Every block carries the same number of check codewords, so this rotation
  // never drops anyone.
  for (let index = 0; index < ecPerBlock; index += 1) {
    for (let block = 0; block < dataPerBlock.length; block += 1) {
      const value = take();
      if (value === null) return null;
      check[block]?.push(value);
    }
  }

  const out: number[] = [];
  for (const [block, count] of dataPerBlock.entries()) {
    const dataPart = data[block];
    const checkPart = check[block];
    if (dataPart === undefined || checkPart === undefined) return null;
    const corrected = correctBlock([...dataPart, ...checkPart], ecPerBlock);
    if (corrected === null) return null;
    out.push(...corrected.slice(0, count));
  }
  return out;
}
