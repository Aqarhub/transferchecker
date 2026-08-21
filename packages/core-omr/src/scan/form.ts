// Which printed form this paper is, as the paper itself says it.
//
// THIS IS THE ONE DEFECT THE REAL PAPER FOUND THAT SENDS A WRONG GRADE HOME WITH
// NOTHING ON THE RECORD. Every other failure the first four photographed sheets
// exposed loses a mark or raises a flag. This one grades a whole paper against
// the wrong key and reports it as clean.
//
// The sheet prints a version box whenever the template sets `keyVersions`, and
// until now nothing anywhere read it. A blank box scored the paper against
// whichever key the caller happened to hold, and a CIRCLED box was byte
// identical to a blank one as far as anything downstream could tell.
//
// The rule this file encodes is deliberately narrow, because the engine does not
// know whether the exam has one form or four:
//
//   undefined  the sheet prints no version box, so there is nothing to say
//   null       it prints one and the paper did not answer it, or answered twice
//   'A'        the paper said A
//
// What to DO about null is the grading layer's decision, not this one's, because
// only that layer knows whether the key it holds is one of several. What this
// file guarantees is that the three cases stop looking alike.

import type { ScannedSheet } from './result';

/**
 * The form the paper declares, or null when it prints a box and did not fill it,
 * or undefined when it prints no box at all.
 *
 * A field in any state other than `ok` is null rather than a best guess. A
 * partly filled version box is not a form: `state` is already the four way
 * distinction defense د14 asks for, and this reads it rather than re-deriving a
 * weaker one from `columns`.
 */
export function formOf(sheet: ScannedSheet): string | null | undefined {
  const field = sheet.fields.find((entry) => entry.usage === 'keyVersion');
  if (field === undefined) return undefined;
  if (field.state !== 'ok') return null;
  // A doubt the decision rule raised is not a form either. The whole point of
  // carrying `uncertain` out of the pipeline is that somebody acts on it, and a
  // key version is the field where acting on it costs least: there is exactly
  // one right answer and the teacher knows it.
  if (field.uncertain) return null;
  const text = field.columns.filter((value) => value !== null).join('');
  return text === '' ? null : text;
}
