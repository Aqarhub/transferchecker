// UUIDv7, generated here because neither end of the product can ask a server.
//
// docs/TECH-STACK.md item 6: `uuidv7()` is a PostgreSQL 18 function and Supabase
// runs 17, so the database cannot mint one. That constraint turns out to agree
// with the product: an offline first client has to be able to name a row before
// it has ever had a network, so the id has to be generated where the row is.
//
// WHAT VERSION 7 BUYS. The first 48 bits are the millisecond timestamp, so ids
// sort by creation time as bytes. Rows written in order then land at the right
// hand edge of the primary key's B-tree instead of scattering across it, which
// is the difference between one hot page and a random write per insert. Version
// 4 is uniformly random and does the scattering.
//
// NO CLOCK IS READ UNLESS ONE IS ASKED FOR. `now` and the random bytes are both
// parameters, following `packages/account`: a function that calls `Date.now()`
// itself cannot be tested at an exact millisecond boundary, and one that calls a
// random source itself cannot be tested for what it does with specific bits.
//
// Layout, from RFC 9562 section 5.7:
//   bits  0..47   unix timestamp in milliseconds, big endian
//   bits 48..51   version, 0b0111
//   bits 52..63   rand_a, 12 bits, used here as a within-millisecond counter
//   bits 64..65   variant, 0b10
//   bits 66..127  rand_b, 62 bits of randomness

import { randomBytes } from 'node:crypto';

/** Largest millisecond the 48 bit timestamp field can hold: the year 10889. */
export const MAX_TIME = 0xffff_ffff_ffff;

const hex = (value: number, digits: number): string =>
  value.toString(16).padStart(digits, '0').slice(-digits);

export interface Uuid7Options {
  /** Milliseconds since the epoch. */
  readonly now: number;
  /**
   * A counter for ids minted within the same millisecond, 0 to 4095.
   *
   * RFC 9562 method 1. Two ids generated in one millisecond are otherwise
   * ordered only by their random tail, which is to say not ordered at all, and a
   * batch of a hundred scans uploaded at once is exactly that case.
   */
  readonly sequence?: number;
  /** Eight bytes of randomness. Supplied so a test can pin them. */
  readonly random?: Uint8Array;
}

/**
 * One UUIDv7, as the canonical 36 character string.
 *
 * Throws on a time outside the 48 bit field rather than silently wrapping it,
 * because a wrapped timestamp produces an id that sorts before every row already
 * written, and nothing downstream would ever notice.
 */
export function uuidv7(options: Uuid7Options): string {
  const { now } = options;
  if (!Number.isInteger(now) || now < 0 || now > MAX_TIME) {
    throw new RangeError(`uuidv7: ${String(now)} is outside the 48 bit timestamp field`);
  }
  const sequence = options.sequence ?? 0;
  if (!Number.isInteger(sequence) || sequence < 0 || sequence > 0xfff) {
    throw new RangeError(`uuidv7: sequence ${String(sequence)} is outside 0..4095`);
  }
  const bytes = options.random ?? randomBytes(8);
  if (bytes.length < 8) throw new RangeError('uuidv7: needs eight bytes of randomness');

  // The timestamp is 48 bits, which is wider than a JavaScript bitwise operator
  // can hold, so it is split into two halves rather than shifted.
  const time = hex(Math.floor(now / 0x1_0000_0000), 4) + hex(now % 0x1_0000_0000, 8);

  return [
    time.slice(0, 8),
    time.slice(8, 12),
    // Version 7 in the top four bits, then the twelve bit sequence.
    `7${hex(sequence, 3)}`,
    // Variant 0b10 in the top two bits of the ninth byte, six random bits under
    // it, then a whole random byte.
    hex(((bytes[0] ?? 0) & 0x3f) | 0x80, 2) + hex(bytes[1] ?? 0, 2),
    // The remaining six bytes, all random.
    [...bytes.subarray(2, 8)].map((byte) => hex(byte, 2)).join(''),
  ].join('-');
}

/**
 * A generator that keeps the within-millisecond counter for you.
 *
 * Holding the counter is the whole reason this exists: two calls in the same
 * millisecond have to differ in `rand_a` or the ordering guarantee is only as
 * good as the clock's resolution, and a device uploading a batch of scans makes
 * those calls in a tight loop.
 */
export function uuid7Source(clock: () => number, random: () => Uint8Array = () => randomBytes(8)) {
  let last = -1;
  let sequence = 0;
  return (): string => {
    const now = clock();
    if (now === last) sequence = (sequence + 1) & 0xfff;
    else {
      last = now;
      sequence = 0;
    }
    return uuidv7({ now, sequence, random: random() });
  };
}
