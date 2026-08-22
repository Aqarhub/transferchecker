// The custom sheet builder.
//
// The anchor test is not a hand written expectation, it is the three sheets
// this product already ships: if the builder is asked for `quick20`'s shape it
// has to return `quick20`'s paper. A builder that disagrees with the templates
// beside it is wrong no matter how reasonable its own numbers look.
//
// Everything asserted here about paper and fill was measured by running the
// layout engine, not chosen. The numbers appear in the DEVLOG entry for this
// round with the sweep that produced them.

import { describe, expect, it } from 'vitest';
import { buildSheet } from '../src/build';
import type { SheetChoices } from '../src/build';
import { layoutSheet } from '../src/layout/index';
import { stockTemplate } from '../src/templates';

const LABELS = { studentName: 'Name', studentId: 'Student ID', keyVersion: 'Key' };

const CHOICES: SheetChoices = {
  templateId: '0a1b2c3d-1111-4a11-9111-000000000111',
  name: 'Custom',
  branding: 'TRANSFERCHECKER.COM',
  questions: 20,
  choices: 4,
  alphabet: 'latin',
  placement: 'internal',
  select: 'one',
  studentId: 4,
  keyVersions: 0,
  family: 'A',
  labels: LABELS,
};

const build = (over: Partial<SheetChoices> = {}) => buildSheet({ ...CHOICES, ...over });

describe('it agrees with the sheets this product already ships', () => {
  it('puts twenty questions on the paper quick20 uses', () => {
    const made = build({ questions: 20, choices: 4, keyVersions: 0 });
    expect(made.kind).toBe('ok');
    if (made.kind !== 'ok') return;
    expect(made.paper).toBe(
      stockTemplate('quick20', { ...LABELS, name: 'q', branding: 'b' }).paper,
    );
    expect(made.paper).toBe('A5');
    expect(made.rows).toBe('default');
  });

  it('puts fifty questions with key versions on the paper standard50 uses', () => {
    const made = build({ questions: 50, choices: 5, keyVersions: 4 });
    expect(made.kind).toBe('ok');
    if (made.kind !== 'ok') return;
    expect(made.paper).toBe(
      stockTemplate('standard50', { ...LABELS, name: 's', branding: 'b' }).paper,
    );
    expect(made.paper).toBe('A4');
  });

  it('reaches a hundred questions the only way the product does, by closing the rows', () => {
    // Measured: a hundred questions of five choices fits NO paper in the A
    // family at the default pitch, and fits A4 once the rows close up. This is
    // what `full100` does by hand, so a builder that refused here would call a
    // shipped sheet impossible.
    const made = build({ questions: 100, choices: 5, keyVersions: 0 });
    expect(made.kind).toBe('ok');
    if (made.kind !== 'ok') return;
    expect(made.paper).toBe('A4');
    expect(made.rows).toBe('dense');
    expect(made.spec.bubble.pitchYMm).toBe(5.5);
  });
});

describe('what the choices cost, which the teacher should be told', () => {
  it('shows that asking for key versions can cost a whole paper size', () => {
    // Measured: the same twenty question quiz is A5 without a key version grid
    // and A4 with one. A quiz that quietly doubled its paper is a thing worth
    // surfacing in the interface, so it is pinned here.
    const without = build({ questions: 20, choices: 4, keyVersions: 0 });
    const with4 = build({ questions: 20, choices: 4, keyVersions: 4 });
    expect(without.kind === 'ok' && without.paper).toBe('A5');
    expect(with4.kind === 'ok' && with4.paper).toBe('A4');
  });

  it('reports how full the page is, so a mostly blank sheet is visible', () => {
    const small = build({ questions: 10, choices: 4 });
    const packed = build({ questions: 50, choices: 5, keyVersions: 4 });
    expect(small.kind).toBe('ok');
    expect(packed.kind).toBe('ok');
    if (small.kind !== 'ok' || packed.kind !== 'ok') return;
    expect(packed.fill).toBeGreaterThan(small.fill);
    expect(packed.fill).toBeGreaterThan(0.9);
  });

  it('builds on the letter family too', () => {
    const made = build({ family: 'LETTER', questions: 50, choices: 5 });
    expect(made.kind).toBe('ok');
    if (made.kind !== 'ok') return;
    expect(['QUARTER_LETTER', 'HALF_LETTER', 'LETTER']).toContain(made.paper);
  });
});

describe('every refusal is named, and carries the numbers a screen needs', () => {
  it('refuses more questions than a sheet may hold', () => {
    const made = build({ questions: 300 });
    expect(made.kind === 'refused' && made.reason.kind).toBe('questions-out-of-range');
  });

  it('refuses a choice that is not a choice', () => {
    expect(build({ choices: 1 }).kind).toBe('refused');
    const made = build({ choices: 1 });
    expect(made.kind === 'refused' && made.reason.kind).toBe('choices-out-of-range');
  });

  it('separates "too many options" from "wrong alphabet for that many"', () => {
    // Four options is a perfectly ordinary ask; it is only impossible because
    // true and false has two symbols. The fix is a different alphabet, not a
    // different number, so it is a different refusal.
    const made = build({ alphabet: 'trueFalse', choices: 4 });
    expect(made.kind).toBe('refused');
    if (made.kind !== 'refused' || made.reason.kind !== 'alphabet-too-small') {
      expect.unreachable('expected alphabet-too-small');
    }
    expect(made.reason.available).toBe(2);
    expect(made.reason.asked).toBe(4);
  });

  it('accepts true and false at two', () => {
    expect(build({ alphabet: 'trueFalse', choices: 2 }).kind).toBe('ok');
  });

  it('refuses an identity grid longer than the schema allows', () => {
    const made = build({ studentId: 13 });
    expect(made.kind === 'refused' && made.reason.kind).toBe('student-id-out-of-range');
  });

  it('refuses one key version, because one version is not a version', () => {
    const made = build({ keyVersions: 1 });
    expect(made.kind === 'refused' && made.reason.kind).toBe('key-versions-out-of-range');
    expect(build({ keyVersions: 0 }).kind).toBe('ok');
    expect(build({ keyVersions: 2 }).kind).toBe('ok');
  });

  it('says what did not fit and by how much, rather than just no', () => {
    const made = build({ questions: 200, choices: 10 });
    expect(made.kind).toBe('refused');
    if (made.kind !== 'refused' || made.reason.kind !== 'does-not-fit') {
      expect.unreachable('expected does-not-fit');
    }
    expect(made.reason.paper).toBe('A4');
    expect(made.reason.area).toBe('questions');
    expect(made.reason.axis).toBe('height');
    // The numbers are the whole point: a screen can say "needs 140cm of page".
    expect(made.reason.neededMm).toBeGreaterThan(made.reason.availableMm);
  });

  it('passes a schema rejection through with the field named', () => {
    const made = build({ name: 'x'.repeat(60) });
    expect(made.kind).toBe('refused');
    if (made.kind !== 'refused' || made.reason.kind !== 'rejected') {
      expect.unreachable('expected rejected');
    }
    expect(made.reason.field).toBe('name');
  });
});

describe('what it returns is a real sheet', () => {
  it('lays out, so the builder cannot hand back a spec that will not print', () => {
    const made = build({ questions: 40, choices: 5, keyVersions: 3 });
    expect(made.kind).toBe('ok');
    if (made.kind !== 'ok') return;
    expect(layoutSheet(made.spec).kind).toBe('ok');
  });

  it('carries the template id it was given, and never mints one', () => {
    // A reprint next term has to be the same template, and a builder that
    // generated an id per call would hand back a different sheet every time it
    // was asked for the same one.
    const first = build();
    const second = build();
    expect(first.kind === 'ok' && first.spec.templateId).toBe(CHOICES.templateId);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('carries the placement and select mode the teacher chose', () => {
    const made = build({ placement: 'external', select: 'many' });
    expect(made.kind).toBe('ok');
    if (made.kind !== 'ok') return;
    const first = made.spec.questions[0];
    expect(first?.kind === 'choice' && first.placement).toBe('external');
    expect(first?.kind === 'choice' && first.select).toBe('many');
  });

  it('leaves the identity grid off when it was not asked for', () => {
    const made = build({ studentId: 0 });
    expect(made.kind).toBe('ok');
    if (made.kind !== 'ok') return;
    expect(made.spec.headerFields.map((field) => field.id)).toEqual(['studentName']);
  });
});
