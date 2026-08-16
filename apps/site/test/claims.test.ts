// The gate between the marketing page and the measurement.
//
// PLAN.md section 8ب makes our real numbers the competitive position, and
// FAILURE-MODES puts the trap beside it: publishing an accuracy without its
// refusal rate is the same lie a product that guesses tells, and if the two
// drift apart then the stated methodology is decoration.
//
// So the site does not carry a number a human typed. It reads the golden
// report, and while the accuracy gate is DISARMED, which it is until thirty
// real papers exist, the page says that in words. This file is what makes that
// impossible to undo by editing copy: a percentage on the page while the gate
// is disarmed fails the build here.

import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildFiles, reportPath } from '../src/build';
import { COPY, LOCALES } from '../src/content';
import { readEvidence } from '../src/evidence';
import type { Evidence } from '../src/evidence';

const UNMEASURED: Evidence = {
  armed: false,
  papersNeeded: 30,
  cases: 55,
  questions: 2300,
  accuracy: null,
};

const MEASURED: Evidence = { ...UNMEASURED, armed: true, accuracy: 0.998 };

/** Any percentage anywhere in the visible copy, which is what may not appear. */
const PERCENTAGES = /(\d+(?:\.\d+)?)\s*(?:%|٪|percent)/g;

/**
 * The one percentage that is not a claim about us.
 *
 * "Print at 100 percent" is an instruction to a printer, and it is load bearing
 * on the sheet: a page shrunk by "fit to page" prints bubbles the scanner then
 * measures in the wrong millimetres. It is exempted by exact text rather than
 * by a prefix, so a future "100% accurate" could never slip through the same
 * hole.
 */
const PRINT_INSTRUCTION = ['100٪', '100 percent'];

const claimsIn = (html: string): string[] =>
  [...html.matchAll(PERCENTAGES)]
    .map((match) => match[0])
    .filter((text) => !PRINT_INSTRUCTION.includes(text));

const pagesOf = (evidence: Evidence): string[] =>
  buildFiles(evidence)
    .filter((file) => file.path.endsWith('.html'))
    .map((file) => file.text);

describe('the site cannot publish an accuracy it has not measured', () => {
  it('states the absence in words while the gate is disarmed', () => {
    for (const locale of LOCALES) {
      const said = COPY[locale].accuracy(UNMEASURED);
      // The corpus size IS publishable, because it is a fact about the corpus
      // and not a claim about paper. The accuracy is not.
      expect(said).toContain('55');
      expect(said).toContain('2300');
      expect(said).toContain('30');
      expect(said).not.toMatch(/99\.7|100%|100 percent/);
    }
  });

  it('puts no percentage on any page while the gate is disarmed', () => {
    // The load bearing assertion of this file. A contributor who types a
    // number into the copy fails here rather than shipping it.
    for (const html of pagesOf(UNMEASURED)) {
      expect(claimsIn(html)).toEqual([]);
    }
  });

  it('publishes the number, and its unit, once the gate arms', () => {
    for (const html of pagesOf(MEASURED)) {
      expect(html).toMatch(/99\.8/);
    }
    // Per QUESTION, which is the whole of what the unit decision was about: the
    // three readings are 250 to 1 apart on a fifty question sheet. Checked in
    // every language against the words that language declares, so a ninth
    // translation cannot quietly drop the unit and still pass.
    for (const locale of LOCALES) {
      expect(COPY[locale].accuracy(MEASURED), locale).toContain(COPY[locale].unitWord);
    }
  });

  it('never publishes an accuracy without the refusal and warning rates beside it', () => {
    // Acceptance criterion 14, carried into the copy: a high accuracy next to a
    // high refusal rate is the same lie as guessing. Both sentences carry it,
    // because a page that names the rates only when they are flattering is the
    // same page as one that never names them.
    for (const locale of LOCALES) {
      for (const evidence of [UNMEASURED, MEASURED]) {
        const said = COPY[locale].accuracy(evidence);
        for (const word of COPY[locale].rateWords) expect(said, locale).toContain(word);
      }
    }
  });
});

describe('the report this reads is the one the engine writes', () => {
  it('finds it, and finds the accuracy gate disarmed today', () => {
    // Not a mock. If the engine's report moves or changes shape, this fails,
    // and the site falls back to claiming nothing rather than to claiming the
    // last number it happened to remember.
    const evidence = readEvidence(reportPath());
    expect(evidence.cases).toBeGreaterThan(0);
    expect(evidence.armed).toBe(false);
    expect(evidence.accuracy).toBeNull();
  });

  it('claims nothing at all when the report cannot be read', () => {
    const missing = readEvidence('/nowhere/golden-report.json');
    expect(missing).toMatchObject({ armed: false, accuracy: null, cases: 0 });
    for (const html of pagesOf(missing)) {
      expect(claimsIn(html)).toEqual([]);
    }
  });

  it('refuses a report whose shape it does not recognise', () => {
    // A shape this cannot parse must not become permission to publish.
    const broken = readEvidence(
      fileURLToPath(new URL('./fixtures/not-a-report.json', import.meta.url)),
    );
    expect(broken.accuracy).toBeNull();
  });

  it('reads the real file rather than a copy of its numbers', () => {
    const raw: unknown = JSON.parse(readFileSync(reportPath(), 'utf8'));
    expect(raw).toHaveProperty('gates');
  });
});
