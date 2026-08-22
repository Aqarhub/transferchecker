// The sheet builder screen.
//
// `locale.test.ts` already proves this screen has one DOM in both languages and
// survives a 35 percent longer language, because it iterates every screen. What
// is left, and what this file holds, is the one claim that file cannot make:
// that the numbers under the choices are the engine's and not a paragraph
// somebody wrote once.

import { describe, expect, it } from 'vitest';
import { buildSheet } from '@transferchecker/sheet-spec';
import { COPY } from '../src/copy';
import { DEFAULT_CHOICES, sheetScreen } from '../src/sheet-screen';

const ar = COPY['ar'];
if (ar === undefined) throw new Error('the dashboard has no Arabic copy');

/**
 * The value of one stat, read out of the strip.
 *
 * `toContain` was the first attempt and it proved nothing: the copy under the
 * key version field says a quiz moves "from A5 to A4", so both names are on the
 * page whatever the engine returned, and hardcoding the paper survived the
 * mutation pass. This reads the value out of the stat that carries the label.
 */
const statValue = (html: string, label: string): string =>
  new RegExp(
    `<p class="stat-label">${label}</p><span class="stat-value"><bdi[^>]*>([^<]*)</bdi>`,
  ).exec(html)?.[1] ?? '';

describe('the outcome is built, not described', () => {
  it('shows the paper the engine returned, on two shapes that differ', () => {
    // Two, and deliberately: one whose answer is A5 and one whose answer is A4.
    // A single case that happens to be A4 cannot tell a real answer from a
    // hardcoded one.
    for (const shape of [
      { questions: 20, choices: 4 },
      { questions: 50, choices: 5 },
    ]) {
      const choices = { ...DEFAULT_CHOICES, ...shape };
      const made = buildSheet(choices);
      expect(made.kind).toBe('ok');
      if (made.kind !== 'ok') continue;
      expect(statValue(sheetScreen(ar, choices), ar.builder.stats.paper)).toBe(made.paper);
    }
    // And the two really are different papers, or the loop above proves nothing.
    const small = buildSheet({ ...DEFAULT_CHOICES, questions: 20, choices: 4 });
    const large = buildSheet({ ...DEFAULT_CHOICES, questions: 50, choices: 5 });
    expect(small.kind === 'ok' && large.kind === 'ok' && small.paper !== large.paper).toBe(true);
  });

  it('says the rows were tightened, and by how much, when they were', () => {
    // A hundred questions of five choices only fits once the rows close up.
    const html = sheetScreen(ar, { ...DEFAULT_CHOICES, questions: 100, choices: 5 });
    expect(html).toContain('5.5mm');
    expect(html).toContain(ar.builder.rowsDense);
    expect(html).not.toContain(ar.builder.rowsDefault);
  });

  it('says the rows are the usual ones when they are', () => {
    const html = sheetScreen(ar, { ...DEFAULT_CHOICES, questions: 20, choices: 4 });
    expect(html).toContain(ar.builder.rowsDefault);
    expect(html).not.toContain(ar.builder.rowsDense);
  });
});

describe('a refusal is an outcome, not an error state bolted on', () => {
  const refused = sheetScreen(ar, { ...DEFAULT_CHOICES, questions: 200, choices: 10 });

  it('names the refusal and carries both measurements', () => {
    const made = buildSheet({ ...DEFAULT_CHOICES, questions: 200, choices: 10 });
    expect(made.kind).toBe('refused');
    if (made.kind !== 'refused' || made.reason.kind !== 'does-not-fit') return;
    expect(refused).toContain(ar.builder.refusals.doesNotFit);
    expect(refused).toContain(`${String(Math.round(made.reason.neededMm))}mm`);
    expect(refused).toContain(`${String(Math.round(made.reason.availableMm))}mm`);
  });

  it('offers no download of a sheet that does not exist', () => {
    expect(refused).not.toContain(ar.builder.download);
  });

  it('keeps the millimetres left to right inside Arabic prose', () => {
    // Rule from `packages/ui`: a measurement is read left to right in every
    // language, and the bidirectional algorithm reorders it otherwise.
    expect(refused).toMatch(/<bdi dir="ltr"[^>]*>\d+mm<\/bdi>/);
  });
});

describe('the choices are real, labelled controls', () => {
  const html = sheetScreen(ar);

  it('labels every control, and ties each label to its own field', () => {
    const labels = [...html.matchAll(/<label for="([^"]+)">/g)].map((match) => match[1]);
    expect(labels.length).toBe(9);
    for (const id of labels) expect(html).toContain(`id="${id ?? ''}"`);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('tells the teacher what a key version costs, before the printer does', () => {
    expect(html).toContain(ar.builder.keyVersionCost);
  });

  it('bounds every number field at the ranges the engine enforces', () => {
    expect(html).toContain('min="1" max="200"');
    expect(html).toContain('min="2" max="10"');
    expect(html).toContain('min="0" max="12"');
  });
});
