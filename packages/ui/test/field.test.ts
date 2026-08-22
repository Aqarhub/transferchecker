// The labelled control.
//
// What is worth testing here is not that it renders, it is the three things
// that are invisible when they are wrong: whether the label actually points at
// the control, whether the help marker steals the label's clicks, and whether a
// value a teacher typed can close the attribute it sits in.

import { describe, expect, it } from 'vitest';
import { field, resetHelpIds } from '../src/parts';

const NUMBER = {
  id: 'questions',
  label: 'Questions',
  help: 'How many questions the sheet holds.',
  control: { kind: 'number' as const, value: 20, min: 1, max: 200 },
};

describe('the label reaches the control', () => {
  it('points at the id the control carries', () => {
    resetHelpIds();
    const html = field(NUMBER);
    expect(html).toContain('<label for="questions">');
    expect(html).toContain('id="questions"');
  });

  it('keeps the help marker outside the label', () => {
    // A `<button>` inside a `<label>` is activated by clicking the label text,
    // so the tooltip would open every time somebody aimed at the field.
    resetHelpIds();
    const html = field(NUMBER);
    const label = /<label[^>]*>(.*?)<\/label>/s.exec(html)?.[1] ?? '';
    expect(label).toBe('Questions');
    expect(label).not.toContain('<button');
    expect(html).toContain('help-dot');
  });
});

describe('each kind carries what its kind needs', () => {
  it('bounds a number and prints it in the tabular face', () => {
    resetHelpIds();
    const html = field(NUMBER);
    expect(html).toContain('type="number"');
    expect(html).toContain('min="1"');
    expect(html).toContain('max="200"');
    expect(html).toContain('value="20"');
    // Rule 3: a number is monospaced and tabular wherever it appears.
    expect(html).toContain('class="field-input num"');
  });

  it('marks exactly one option selected, and it is the current value', () => {
    resetHelpIds();
    const html = field({
      id: 'alphabet',
      label: 'Letters',
      help: 'Which letters the choices use.',
      control: {
        kind: 'choice',
        value: 'arabic',
        options: [
          { value: 'latin', label: 'A B C' },
          { value: 'arabic', label: 'أ ب ج' },
        ],
      },
    });
    expect([...html.matchAll(/ selected/g)]).toHaveLength(1);
    expect(html).toContain('<option value="arabic" selected>');
  });

  it('caps the length of text a teacher types', () => {
    resetHelpIds();
    const html = field({
      id: 'name',
      label: 'Name',
      help: 'Printed on the edge of the sheet.',
      control: { kind: 'text', value: 'Unit 3', maxLength: 40 },
    });
    expect(html).toContain('maxlength="40"');
    expect(html).toContain('value="Unit 3"');
  });
});

describe('a value cannot escape the attribute it sits in', () => {
  it('escapes text, the selected value and the option labels', () => {
    resetHelpIds();
    const html = field({
      id: 'name',
      label: 'Name',
      help: 'Printed on the edge.',
      control: { kind: 'text', value: '" onfocus="alert(1)', maxLength: 40 },
    });
    // Not "the string onfocus is absent": it is present, as the teacher's own
    // text. What matters is that its quotes are entities, so the value never
    // closes and the browser reads one attribute rather than three.
    expect(html).toContain('value="&quot; onfocus=&quot;alert(1)"');

    resetHelpIds();
    const picked = field({
      id: 'family',
      label: 'Paper',
      help: 'Which paper family.',
      control: {
        kind: 'choice',
        value: 'A',
        options: [{ value: 'A', label: '<script>x</script>' }],
      },
    });
    expect(picked).not.toContain('<script>');
  });
});

describe('the note is a consequence, and only appears when there is one', () => {
  it('renders nothing extra when no note was given', () => {
    resetHelpIds();
    expect(field(NUMBER)).not.toContain('field-note');
  });

  it('renders the note when there is one', () => {
    // Rule 17's neighbour: the interface does not invent a value, and it does
    // not invent a consequence either. A note appears when the build measured
    // one, such as key versions moving a quiz from A5 to A4.
    resetHelpIds();
    const html = field({ ...NUMBER, note: 'This moves the sheet to A4.' });
    expect(html).toContain('<p class="field-note">This moves the sheet to A4.</p>');
  });
});
