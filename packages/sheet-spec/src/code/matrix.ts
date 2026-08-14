// Turns the payload text into QR modules.
//
// This lives beside the schema rather than in the PDF generator because the
// module count decides how large the code prints, and how large it prints moves
// the header. Geometry has one owner, so the generator draws modules it is
// given and never makes any of its own.

import qrcode from 'qrcode-generator';

/** A QR payload as modules. True is a dark module. */
export type QrMatrix = readonly (readonly boolean[])[];

/** Modules across the largest QR that exists, which is version 40. */
export const MAX_QR_MODULES = 177;

/**
 * Null when no QR of any version can carry this payload. The caller reports
 * that as a sheet too complex to describe itself, never as an exception,
 * because it is a configuration a teacher can reach and must be told about.
 */
export function codeMatrix(payload: string): QrMatrix | null {
  // Type 0 lets the encoder pick the smallest version that fits. Correction
  // level M tolerates roughly 15% damage, which covers a fold or a smudge
  // without the module inflation that level H would cost in printed area.
  //
  // Alphanumeric mode packs two characters into eleven bits. Byte mode would
  // spend eight bits on each, and the payload is base32 precisely so that this
  // mode is available.
  const qr = qrcode(0, 'M');
  qr.addData(payload, 'Alphanumeric');
  try {
    qr.make();
  } catch {
    // The library throws when the payload outgrows version 40.
    return null;
  }

  const size = qr.getModuleCount();
  return Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, column) => qr.isDark(row, column)),
  );
}
