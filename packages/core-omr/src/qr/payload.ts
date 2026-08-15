// Turning corrected data codewords back into the text the sheet printed.
//
// Our own payload is always alphanumeric, because base32 was chosen precisely
// so the encoder could use the mode that packs two characters into eleven bits.
// Numeric and byte are carried anyway: they cost a few lines, and a decoder
// that rejects a valid symbol it merely did not expect is a rejection the
// teacher cannot act on.

const ALPHANUMERIC = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

const MODE_TERMINATOR = 0x0;
const MODE_NUMERIC = 0x1;
const MODE_ALPHANUMERIC = 0x2;
const MODE_BYTE = 0x4;

interface BitReader {
  /** Bits still unread. */
  remaining: () => number;
  /** Null when the stream runs out, which is corruption rather than an end. */
  read: (count: number) => number | null;
}

// A closure rather than a class: `erasableSyntaxOnly` bans parameter
// properties, and the state here is one cursor.
function bitReader(bytes: readonly number[]): BitReader {
  let at = 0;
  const remaining = (): number => bytes.length * 8 - at;

  return {
    remaining,
    read: (count) => {
      if (count < 0 || count > 24 || remaining() < count) return null;
      let value = 0;
      for (let taken = 0; taken < count; taken += 1) {
        const byte = bytes[at >> 3];
        if (byte === undefined) return null;
        value = (value << 1) | ((byte >> (7 - (at & 7))) & 1);
        at += 1;
      }
      return value;
    },
  };
}

/** How many bits the character count takes, which grows with the version. */
function countBits(mode: number, version: number): number | null {
  const band = version <= 9 ? 0 : version <= 26 ? 1 : 2;
  switch (mode) {
    case MODE_NUMERIC:
      return [10, 12, 14][band] ?? null;
    case MODE_ALPHANUMERIC:
      return [9, 11, 13][band] ?? null;
    case MODE_BYTE:
      return [8, 16, 16][band] ?? null;
    default:
      return null;
  }
}

function readAlphanumeric(reader: BitReader, count: number): string | null {
  let out = '';
  let left = count;
  while (left >= 2) {
    const pair = reader.read(11);
    if (pair === null || pair >= 45 * 45) return null;
    const first = ALPHANUMERIC[Math.floor(pair / 45)];
    const second = ALPHANUMERIC[pair % 45];
    if (first === undefined || second === undefined) return null;
    out += first + second;
    left -= 2;
  }
  if (left === 1) {
    const single = reader.read(6);
    if (single === null) return null;
    const character = ALPHANUMERIC[single];
    if (character === undefined) return null;
    out += character;
  }
  return out;
}

function readNumeric(reader: BitReader, count: number): string | null {
  let out = '';
  let left = count;
  while (left >= 3) {
    const triple = reader.read(10);
    if (triple === null || triple > 999) return null;
    out += String(triple).padStart(3, '0');
    left -= 3;
  }
  if (left === 2) {
    const pair = reader.read(7);
    if (pair === null || pair > 99) return null;
    out += String(pair).padStart(2, '0');
  } else if (left === 1) {
    const single = reader.read(4);
    if (single === null || single > 9) return null;
    out += String(single);
  }
  return out;
}

function readBytes(reader: BitReader, count: number): string | null {
  const bytes = new Uint8Array(count);
  for (let index = 0; index < count; index += 1) {
    const value = reader.read(8);
    if (value === null) return null;
    bytes[index] = value;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    // Not UTF-8, so this is not a payload we printed.
    return null;
  }
}

/** Null for a stream that is damaged, truncated, or in a mode we do not carry. */
export function decodePayload(codewords: readonly number[], version: number): string | null {
  const reader = bitReader(codewords);
  let out = '';

  for (;;) {
    if (reader.remaining() < 4) return out;
    const mode = reader.read(4);
    if (mode === null) return null;
    if (mode === MODE_TERMINATOR) return out;

    const bits = countBits(mode, version);
    if (bits === null) return null;
    const count = reader.read(bits);
    if (count === null) return null;

    const segment =
      mode === MODE_ALPHANUMERIC
        ? readAlphanumeric(reader, count)
        : mode === MODE_NUMERIC
          ? readNumeric(reader, count)
          : readBytes(reader, count);
    if (segment === null) return null;
    out += segment;
  }
}
