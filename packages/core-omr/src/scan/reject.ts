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
  | { readonly kind: 'template_unknown'; readonly templateId: string }
  | { readonly kind: 'not_this_geometry'; readonly area: string; readonly axis: string }
  | { readonly kind: 'rows_missing'; readonly expected: number; readonly found: number }
  | { readonly kind: 'sheet_not_flat'; readonly residualMm: number }
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
    case 'template_unknown':
      return 'scan.reject.templateUnknown';
    case 'not_this_geometry':
      return 'scan.reject.notThisGeometry';
    case 'rows_missing':
      return 'scan.reject.rowsMissing';
    case 'sheet_not_flat':
      return 'scan.reject.sheetNotFlat';
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
    case 'no_sheet':
    case 'code_unreadable':
      return true;
    case 'template_unknown':
    case 'not_this_geometry':
    case 'rows_missing':
    case 'sheet_not_flat':
    case 'low_contrast':
      return false;
  }
}
