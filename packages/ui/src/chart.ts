// Charts, as inline SVG with no script and no library.
//
// THE PALETTE DECISION WAS MEASURED, NOT ARGUED. Running the four brand and
// result colours through a contrast validator: `--review` amber against
// `--correct` green is ΔE 6.3 under protanopia, which is below the floor where
// a colourblind reader can separate them, and the neutral against the amber is
// 12.5 for normal vision, also below floor. So the result colours are not a
// chart series here and never will be. They stay what design system rule 2 says
// they are: a grading outcome, always accompanied by a glyph or a word.
//
// What is left is better anyway. A bar chart encodes magnitude in LENGTH, so a
// second encoding in hue is decoration that costs a reader. Every chart on this
// dashboard is one hue, and the only thing colour does is separate data from
// grid.
//
// AND THERE IS NO HOVER LAYER, deliberately. These pages carry no JavaScript,
// so a tooltip would be a promise the page cannot keep. The accessible
// alternative that a chart is supposed to have anyway, a real table of the same
// numbers, is the interaction layer instead: it is beside every chart, it is
// readable by a screen reader, and it works with the network off.

import { esc } from './parts';

// Geometry, set by looking at the rendered chart rather than by guessing.
// The first pass collided its own labels: the row was too short for the type
// size, the value sat at the end of the bar so it moved under the axis on a
// long one, and the tick row had no clearance. Values now live in a fixed
// column past the plot, which is the only arrangement where nothing can land
// on anything else whatever the data does.
const W = 660;
const ROW = 26;
const PAD_TOP = 30;
const LABEL = 58;
const VALUE = 62;

export interface Bar {
  readonly label: string;
  /** 0 to 1. */
  readonly value: number;
  /** Printed at the end of the bar, for the few that earn a direct label. */
  readonly note?: string;
  /** Marked with a glyph rather than a colour, since colour is spoken for. */
  readonly flagged?: boolean;
}

export interface BandOptions {
  readonly from: number;
  readonly to: number;
  readonly label: string;
}

export interface BarChartOptions {
  readonly title: string;
  readonly bars: readonly Bar[];
  /** A recessive zone behind the bars: where a healthy value sits. */
  readonly band?: BandOptions;
  readonly empty: string;
  /** Screen reader summary. A chart with no text is a chart for some people. */
  readonly summary: string;
}

/**
 * A horizontal bar chart.
 *
 * Horizontal because the labels are question numbers and identifiers, and a
 * vertical chart turns every label sideways the moment there are more than a
 * dozen. It also reads the same in both directions: the SVG is laid out left to
 * right in its own coordinate space and the page never mirrors it, exactly as
 * a number is never mirrored.
 */
export function barChart(options: BarChartOptions): string {
  if (options.bars.length === 0) {
    return `<p class="chart-empty">${esc(options.empty)}</p>`;
  }
  const rows = options.bars.length;
  const plotBottom = PAD_TOP + rows * ROW;
  const height = plotBottom + 22;
  const plot = W - LABEL - VALUE;
  const x = (value: number): number => LABEL + Math.max(0, Math.min(1, value)) * plot;

  const band =
    options.band === undefined
      ? ''
      : `<rect x="${String(x(options.band.from))}" y="${String(PAD_TOP - 6)}" width="${String(x(options.band.to) - x(options.band.from))}" height="${String(rows * ROW + 2)}" class="c-band"/>
<text x="${String((x(options.band.from) + x(options.band.to)) / 2)}" y="${String(PAD_TOP - 12)}" class="c-band-label">${esc(options.band.label)}</text>`;

  const ticks = [0, 0.25, 0.5, 0.75, 1]
    .map(
      (tick) =>
        `<line x1="${String(x(tick))}" y1="${String(PAD_TOP - 6)}" x2="${String(x(tick))}" y2="${String(plotBottom)}" class="c-grid"/><text x="${String(x(tick))}" y="${String(plotBottom + 16)}" class="c-tick">${String(Math.round(tick * 100))}</text>`,
    )
    .join('');

  const bars = options.bars
    .map((bar, at) => {
      const y = PAD_TOP + at * ROW;
      const mid = y + ROW / 2 + 4;
      const width = Math.max(2, x(bar.value) - LABEL);
      // The value lives in its own column past the plot, so a full width bar
      // cannot push its own number off the chart.
      const note =
        bar.note === undefined
          ? ''
          : `<text x="${String(W - 6)}" y="${String(mid)}" class="c-note">${esc(bar.note)}</text>`;
      const flag =
        bar.flagged === true
          ? `<text x="${String(LABEL - 40)}" y="${String(mid)}" class="c-flag">&#9873;</text>`
          : '';
      return `<text x="${String(LABEL - 10)}" y="${String(mid)}" class="c-label">${esc(bar.label)}</text>${flag}
<rect x="${String(LABEL)}" y="${String(y + 5)}" width="${String(width)}" height="12" rx="4" class="c-bar"/>${note}`;
    })
    .join('');

  return `<figure class="chart">
<figcaption>${esc(options.title)}</figcaption>
<svg viewBox="0 0 ${String(W)} ${String(height)}" role="img" aria-label="${esc(options.summary)}" class="chart-svg" preserveAspectRatio="xMidYMid meet">
${band}${ticks}${bars}
</svg>
</figure>`;
}

/**
 * The distractor chart for one question.
 *
 * The keyed option is named with a glyph AND the word, never by colour, which
 * is both design system rule 2 and the reason the validator sent the result
 * palette away: a reader who cannot separate green from amber would otherwise
 * have no way to tell the right answer from a popular wrong one.
 */
export function distractorChart(
  title: string,
  options: readonly { symbol: string; chosen: number; keyed: boolean }[],
  keyWord: string,
  empty: string,
): string {
  const total = options.reduce((sum, entry) => sum + entry.chosen, 0);
  return barChart({
    title,
    empty,
    summary: `${title}: ${options.map((entry) => `${entry.symbol} ${String(entry.chosen)}`).join(', ')}`,
    bars: options.map((entry) => ({
      label: entry.symbol,
      value: total === 0 ? 0 : entry.chosen / total,
      note: entry.keyed ? `${String(entry.chosen)} ✓ ${keyWord}` : String(entry.chosen),
      flagged: entry.keyed,
    })),
  });
}
