// What a scan returns.
//
// A result is data, never an exception, and an ambiguous read is a member of
// the union rather than a special value inside a success. That is the shape
// docs/CODING-STANDARDS.md asks for, and here it carries a product rule: the
// engine is not allowed to have a way of saying "probably".

import type { FieldUsage, PaperName } from '@transferchecker/sheet-spec';
import type { GroupOutcome } from '../decide/group';
import type { Rejection } from './reject';

export interface QuestionReading {
  /** One based, as printed on the sheet. */
  readonly question: number;
  readonly outcome: GroupOutcome;
}

/**
 * Four states, not two. Defense د14: a partly filled identity grid is the
 * common case and it must not become a mangled number that looks real, because
 * a mangled identity fails the reconciliation silently and produces exactly the
 * duplicate record acceptance criterion 9 promises to prevent.
 */
export type FieldState = 'ok' | 'partial' | 'ambiguous' | 'unset';

export interface FieldReading {
  readonly id: string;
  /**
   * What the field means to the system, which is the only handle the app has on
   * it. The printed code carries the usage and not the identifier, because a
   * label is cosmetic and never moves a bubble, so a sheet read from its own code
   * names its grids f0 and f1 while still knowing which one is the student id.
   */
  readonly usage: FieldUsage;
  readonly state: FieldState;
  /** One entry per character column, null where that column holds nothing. */
  readonly columns: readonly (string | null)[];
  /** The same thing for a card to show, with an underscore for a blank column. */
  readonly text: string;
}

export interface ScanQuality {
  /** Pixels per printed code module, the resolution the read actually had. */
  readonly modulePx: number;
  /** Timing mark residual: how well the sheet's middle matched its corners. */
  readonly timingResidualMm: number;
  /** Black to white separation the sheet's own furniture declared. */
  readonly contrast: number;
  readonly blanks: number;
  readonly ambiguous: number;
  readonly uncertain: number;
}

export interface ScannedSheet {
  readonly templateId: string;
  readonly paper: PaperName;
  readonly questions: readonly QuestionReading[];
  readonly fields: readonly FieldReading[];
  /**
   * One character per question: clean, uncertain, double, blank, eraser trace.
   * Defense د20. Fifty bytes on a fifty question paper, and it is the whole
   * answer to the only question an appeal ever asks, which is whether question
   * seven was one of the doubtful ones.
   */
  readonly marks: string;
  readonly quality: ScanQuality;
}

export type ScanResult =
  | { readonly kind: 'ok'; readonly sheet: ScannedSheet }
  | { readonly kind: 'rejected'; readonly reason: Rejection };
