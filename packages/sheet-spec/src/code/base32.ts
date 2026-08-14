// Base32 as defined by RFC 4648, without padding.
//
// Base64 would be shorter in characters, but every character here is drawn from
// the QR alphanumeric set, which packs two characters into eleven bits instead
// of spending eight bits on each. The longer string ends up in a smaller code.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Uint8Array): string {
  let out = '';
  let buffer = 0;
  let bits = 0;

  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET.charAt((buffer >> bits) & 31);
    }
  }
  if (bits > 0) {
    out += ALPHABET.charAt((buffer << (5 - bits)) & 31);
  }
  return out;
}

/** Returns null for anything that is not a well formed encoding. */
export function base32Decode(text: string): Uint8Array | null {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;

  for (const char of text) {
    const value = ALPHABET.indexOf(char);
    if (value < 0) return null;
    buffer = (buffer << 5) | value;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 255);
    }
  }

  // Five or more leftover bits mean a character that encodes nothing, and any
  // leftover bit that is set means the encoder did not pad with zeroes. Both
  // are corruption, so neither is accepted quietly.
  if (bits >= 5) return null;
  if ((buffer & ((1 << bits) - 1)) !== 0) return null;
  return Uint8Array.from(bytes);
}
