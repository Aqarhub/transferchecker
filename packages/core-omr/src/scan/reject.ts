// Why a sheet was refused, as a closed type.
//
// Defense د15. A refusal a teacher cannot act on is the failure mode this
// product exists to replace: the competitor's answer to "it will not scan" is a
// slider labelled image sharpness, which hands the threshold to the one person
// with no way to reason about it.
//
// So every refusal here carries a physical cause and the measurement behind it,
// and there is no free text member. The reason is the return type, which makes
// a refusal without a cause impossible to construct rather than merely
// discouraged, and `messageKeyOf` below is exhaustive over the union, so adding
// a member without giving it a message fails the build.

export type Rejection =
  | { readonly kind: 'no_sheet'; readonly candidates: number }
  | { readonly kind: 'code_unreadable' }
  | { readonly kind: 'code_too_small'; readonly modulePx: number }
  /**
   * The page is at too steep an angle to read, which is a different instruction
   * to the teacher than "come closer" and was being reported as that one.
   *
   * [measured] The four corner squares are the same 8 mm of ink, so the ratio
   * between the largest and the smallest measured one is a direct reading of
   * how far the page is from square on: 1.00 flat, 1.36 at the steepest frame
   * the engine still reads (10 degrees of yaw with 7 of pitch at 1440p), and
   * 2.07 to 2.15 beyond it, where the code stops decoding.
   */
  | { readonly kind: 'too_steep'; readonly ratio: number }
  | { readonly kind: 'template_unknown'; readonly templateId: string }
  | { readonly kind: 'not_this_geometry'; readonly area: string; readonly axis: string }
  /**
   * The corner squares do not measure 8 mm under the map their own centres
   * define, so the four points the whole scan rests on are not the four points
   * of one sheet. Two sheets in one frame is the case that produces it: the
   * detector locks onto the outer four of eight squares and the map comes out
   * stretched, which [measured] reads the 8 mm square back as 4.97 mm.
   */
  | { readonly kind: 'not_one_sheet'; readonly fiducialMm: number }
  /**
   * An edge mark that is not where the geometry says it is, by more than the
   * search window is wide, or is hidden under something. Each of the four is
   * the only evidence for its own edge's bend, so a subset is a sheet whose
   * registration cannot be stated.
   */
  | { readonly kind: 'marks_missing'; readonly expected: number; readonly found: number }
  /**
   * The axis matters to the teacher, because the two are different sheets. In y
   * the paper is stretched or fed crooked; in x it is curled about a vertical
   * axis, which is the fault the corner squares cannot see at all.
   */
  | { readonly kind: 'sheet_not_flat'; readonly residualMm: number; readonly axis: 'x' | 'y' }
  | {
      readonly kind: 'glare';
      readonly quadrant: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';
      readonly groups: number;
    }
  | { readonly kind: 'low_contrast'; readonly contrast: number };

/**
 * The translation key for each cause. Keys, not sentences: the interface owns
 * the wording, in the teacher's language, and no user-facing string is built
 * inside the engine.
 */
export function messageKeyOf(reason: Rejection): string {
  switch (reason.kind) {
    case 'no_sheet':
      return 'scan.reject.noSheet';
    case 'code_unreadable':
      return 'scan.reject.codeUnreadable';
    case 'code_too_small':
      return 'scan.reject.comeCloser';
    case 'too_steep':
      return 'scan.reject.holdFlatter';
    case 'template_unknown':
      return 'scan.reject.templateUnknown';
    case 'not_this_geometry':
      return 'scan.reject.notThisGeometry';
    case 'not_one_sheet':
      return 'scan.reject.notOneSheet';
    case 'marks_missing':
      return 'scan.reject.marksMissing';
    case 'sheet_not_flat':
      return reason.axis === 'x' ? 'scan.reject.sheetCurled' : 'scan.reject.sheetNotFlat';
    case 'glare':
      return 'scan.reject.glare';
    case 'low_contrast':
      return 'scan.reject.lowContrast';
  }
}

/**
 * Whether the next frame from a slightly different position could succeed.
 *
 * Glare and resolution are properties of where the phone is, so the camera loop
 * should drop the frame and keep going. A sheet printed at the wrong size is a
 * property of the paper, so the loop should stop and say so rather than
 * spinning on a sheet that will never read.
 */
export function isFrameFault(reason: Rejection): boolean {
  switch (reason.kind) {
    case 'glare':
    case 'code_too_small':
    case 'too_steep':
    case 'no_sheet':
    case 'code_unreadable':
      return true;
    case 'template_unknown':
    case 'not_this_geometry':
    case 'not_one_sheet':
    case 'marks_missing':
    case 'sheet_not_flat':
    case 'low_contrast':
      return false;
  }
}
