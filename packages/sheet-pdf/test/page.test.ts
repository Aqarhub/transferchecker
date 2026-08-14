// Several sheets on one printed page, and how heavily the page prints.

import { describe, expect, it } from 'vitest';
import { PAPER } from '@transferchecker/sheet-spec';
import { DARKNESS_LEVELS, DEFAULT_THEME, copiesAvailable, planPage, themeFor } from '../src/index';
import type { PagePlan } from '../src/index';

const planOrThrow = (paper: Parameters<typeof planPage>[0], copies: 1 | 2 | 4): PagePlan => {
  const plan = planPage(paper, copies);
  if (plan === null) throw new Error(`${paper} does not tile at ${String(copies)}`);
  return plan;
};

describe('copies per page', () => {
  it('offers a full page sheet one per page and nothing else', () => {
    expect(copiesAvailable('A4')).toEqual([1]);
    expect(copiesAvailable('LETTER')).toEqual([1]);
  });

  it('offers two for a half page sheet and four for a quarter page one', () => {
    expect(copiesAvailable('A5')).toEqual([1, 2]);
    expect(copiesAvailable('A6')).toEqual([1, 4]);
    expect(copiesAvailable('HALF_LETTER')).toEqual([1, 2]);
    expect(copiesAvailable('QUARTER_LETTER')).toEqual([1, 4]);
  });

  it('refuses a count the paper cannot carry, rather than guessing one', () => {
    expect(planPage('A4', 2)).toBeNull();
    expect(planPage('A5', 4)).toBeNull();
    expect(planPage('A6', 2)).toBeNull();
  });
});

describe('tiling', () => {
  it('prints one sheet on its own paper with nothing to cut', () => {
    const plan = planOrThrow('A4', 1);
    expect(plan.carrier).toEqual(PAPER.A4);
    expect(plan.origins).toEqual([{ xMm: 0, yMm: 0 }]);
    expect(plan.cuts).toEqual([]);
  });

  it('lays two half page sheets on a full page turned sideways', () => {
    const plan = planOrThrow('A5', 2);
    // A4 on its side is exactly two A5 wide and one A5 tall.
    expect(plan.carrier).toEqual({ widthMm: PAPER.A4.heightMm, heightMm: PAPER.A4.widthMm });
    expect(plan.origins).toHaveLength(2);
    expect(plan.cuts).toEqual([{ axis: 'vertical', atMm: 148.5 }]);
  });

  it('lays four quarter page sheets in a grid with a cut on each axis', () => {
    const plan = planOrThrow('A6', 4);
    expect(plan.carrier).toEqual(PAPER.A4);
    expect(plan.origins).toHaveLength(4);
    expect(plan.cuts.map((cut) => cut.axis).sort()).toEqual(['horizontal', 'vertical']);
  });

  it('keeps every sheet inside the page it is printed on', () => {
    for (const [paper, copies] of [
      ['A5', 2],
      ['A6', 4],
      ['HALF_LETTER', 2],
      ['QUARTER_LETTER', 4],
    ] as const) {
      const plan = planOrThrow(paper, copies);
      const sheet = PAPER[paper];
      for (const origin of plan.origins) {
        expect(origin.xMm + sheet.widthMm).toBeLessThanOrEqual(plan.carrier.widthMm + 1e-9);
        expect(origin.yMm + sheet.heightMm).toBeLessThanOrEqual(plan.carrier.heightMm + 1e-9);
      }
    }
  });

  it('never overlaps two sheets, because the cut would run through one', () => {
    const plan = planOrThrow('A6', 4);
    const sheet = PAPER.A6;
    for (const [index, a] of plan.origins.entries()) {
      for (const b of plan.origins.slice(index + 1)) {
        const apart =
          Math.abs(a.xMm - b.xMm) >= sheet.widthMm || Math.abs(a.yMm - b.yMm) >= sheet.heightMm;
        expect(apart).toBe(true);
      }
    }
  });

  it('puts every cut between two sheets, never through one', () => {
    const plan = planOrThrow('A6', 4);
    const sheet = PAPER.A6;
    for (const cut of plan.cuts) {
      for (const origin of plan.origins) {
        const start = cut.axis === 'vertical' ? origin.xMm : origin.yMm;
        const sizeMm = cut.axis === 'vertical' ? sheet.widthMm : sheet.heightMm;
        const inside = cut.atMm > start && cut.atMm < start + sizeMm;
        expect(inside).toBe(false);
      }
    }
  });
});

describe('darkness', () => {
  it('leaves normal as the theme the sheet has always printed with', () => {
    expect(themeFor('normal')).toBe(DEFAULT_THEME);
  });

  it('moves ink in one direction across the levels', () => {
    const widths = DARKNESS_LEVELS.map((level) => themeFor(level).bubbleStrokeMm);
    expect(widths).toEqual([...widths].sort((a, b) => a - b));
  });

  it('changes no measurement the scanner samples', () => {
    // A teacher who reprints darker must not invalidate the papers already
    // handed out, so every size the geometry depends on stays put.
    for (const level of DARKNESS_LEVELS) {
      const theme = themeFor(level);
      expect(theme.bubbleLabelMm).toBe(DEFAULT_THEME.bubbleLabelMm);
      expect(theme.choiceLabelMm).toBe(DEFAULT_THEME.choiceLabelMm);
      expect(theme.labelSizeMm).toBe(DEFAULT_THEME.labelSizeMm);
      expect(theme.questionSizeMm).toBe(DEFAULT_THEME.questionSizeMm);
      expect(theme.bandSizeMm).toBe(DEFAULT_THEME.bandSizeMm);
      expect(theme.warningSizeMm).toBe(DEFAULT_THEME.warningSizeMm);
    }
  });
});
