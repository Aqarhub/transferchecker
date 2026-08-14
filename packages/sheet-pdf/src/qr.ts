// Encodes the payload the scanner reads off a printed sheet.
//
// The payload is deliberately tiny: it identifies which template and form the
// sheet belongs to, and nothing else. No student data is ever printed into it.

import qrcode from 'qrcode-generator';
import type { QrMatrix } from './render';

export interface SheetCode {
  readonly templateId: string;
  readonly version: number;
  readonly formCode: string;
}

/**
 * The payload string. Kept short and positional so the QR stays a low version
 * with large modules, which is what survives a phone camera at an angle.
 */
export function sheetPayload(code: SheetCode): string {
  return `TC1:${code.templateId}:${String(code.version)}:${code.formCode}`;
}

export function encodeSheetQr(code: SheetCode): QrMatrix {
  // Type 0 lets the encoder pick the smallest version that fits. Error
  // correction M tolerates roughly 15% damage, which covers a fold or a smudge
  // without inflating the module count the way H would.
  const qr = qrcode(0, 'M');
  qr.addData(sheetPayload(code));
  qr.make();

  const size = qr.getModuleCount();
  return Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, column) => qr.isDark(row, column)),
  );
}
