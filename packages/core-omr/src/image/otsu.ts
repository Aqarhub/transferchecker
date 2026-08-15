// Otsu's threshold: the cut between two populations of grey values.
//
// Used only where the two populations really are two, such as the modules of a
// printed code, which are ink or paper and nothing between. It is deliberately
// NOT used on bubbles: a bubble carries a continuous fill ratio, and defense
// د16 in docs/FAILURE-MODES.md turns on that grey band existing, so splitting a
// bubble into two levels would destroy exactly the evidence the confidence
// model is built from.

/**
 * The level that best separates the values into two populations, where the
 * level itself belongs to the LOWER population. A caller therefore tests
 * `value <= threshold` for the dark class; testing `<` puts the whole dark
 * population on the light side whenever the values are cleanly bimodal, which
 * is exactly the case a printed code produces.
 *
 * Null when the values do not separate, which is one population, not two.
 */
export function otsuThreshold(values: readonly number[]): number | null {
  if (values.length < 4) return null;

  const histogram = new Float64Array(256);
  for (const value of values) {
    const bucket = Math.min(255, Math.max(0, Math.round(value)));
    histogram[bucket] = (histogram[bucket] ?? 0) + 1;
  }

  const total = values.length;
  let sum = 0;
  for (let level = 0; level < 256; level += 1) sum += level * (histogram[level] ?? 0);

  let weightLow = 0;
  let sumLow = 0;
  let bestVariance = -1;
  let best = -1;

  for (let level = 0; level < 256; level += 1) {
    weightLow += histogram[level] ?? 0;
    if (weightLow === 0) continue;
    const weightHigh = total - weightLow;
    if (weightHigh === 0) break;

    sumLow += level * (histogram[level] ?? 0);
    const meanLow = sumLow / weightLow;
    const meanHigh = (sum - sumLow) / weightHigh;
    const variance = weightLow * weightHigh * (meanLow - meanHigh) * (meanLow - meanHigh);
    if (variance > bestVariance) {
      bestVariance = variance;
      best = level;
    }
  }

  if (best < 0) return null;

  // A split with almost no separation between the two means is a split of one
  // population, and thresholding on it invents structure that is not there.
  const low = Math.min(...values);
  const high = Math.max(...values);
  return high - low < 24 ? null : best;
}
