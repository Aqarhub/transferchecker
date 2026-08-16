import { describe, expect, it } from 'vitest';
import { MAX_TIME, uuid7Source, uuidv7 } from '../src/uuidv7';

const bytes = (fill: number): Uint8Array => new Uint8Array(8).fill(fill);

describe('uuidv7', () => {
  it('sets the version and variant bits RFC 9562 requires', () => {
    const id = uuidv7({ now: 1_786_000_000_000, random: bytes(0xff) });
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('puts the timestamp in the first forty eight bits, readable back out', () => {
    const now = 1_786_000_000_000;
    const id = uuidv7({ now, random: bytes(0) });
    expect(Number.parseInt(id.slice(0, 8) + id.slice(9, 13), 16)).toBe(now);
  });

  // The whole reason for choosing version 7. If ids did not sort as strings in
  // the order they were created, the primary key index would scatter its writes
  // and the plan's stated reason for the choice would be gone.
  it('sorts as text in the order the ids were created', () => {
    const ids = [1, 2, 3, 1000, 1_786_000_000_000].map((now) =>
      uuidv7({ now, random: bytes(0x7f) }),
    );
    expect([...ids].sort()).toEqual(ids);
  });

  it('keeps two ids from the same millisecond apart, and in order', () => {
    const next = uuid7Source(
      () => 1_786_000_000_000,
      () => bytes(0),
    );
    const minted = Array.from({ length: 8 }, () => next());
    expect(new Set(minted).size).toBe(8);
    expect([...minted].sort()).toEqual(minted);
  });

  it('restarts the sequence when the millisecond moves on', () => {
    let now = 1_786_000_000_000;
    const next = uuid7Source(
      () => now,
      () => bytes(0),
    );
    const first = next();
    next();
    now += 1;
    const third = next();
    expect(third.slice(14)).toBe(first.slice(14));
    expect(third > first).toBe(true);
  });

  // A wrapped timestamp produces an id that sorts before every row already
  // written, and nothing downstream would ever notice. Refusing is the only
  // safe answer.
  it('refuses a time outside the forty eight bit field rather than wrapping it', () => {
    expect(() => uuidv7({ now: MAX_TIME + 1, random: bytes(0) })).toThrow(RangeError);
    expect(() => uuidv7({ now: -1, random: bytes(0) })).toThrow(RangeError);
    expect(() => uuidv7({ now: 1.5, random: bytes(0) })).toThrow(RangeError);
  });

  it('refuses a sequence that would overflow its twelve bits', () => {
    expect(() => uuidv7({ now: 0, sequence: 4096, random: bytes(0) })).toThrow(RangeError);
  });

  it('refuses to mint an id from too few random bytes', () => {
    expect(() => uuidv7({ now: 0, random: new Uint8Array(4) })).toThrow(RangeError);
  });

  it('is unique across a large batch from the real random source', () => {
    const next = uuid7Source(() => 1_786_000_000_000);
    expect(new Set(Array.from({ length: 2000 }, () => next())).size).toBe(2000);
  });
});
