// The refresh token state machine, at its edges.
//
// This is the part of the account layer where a plausible implementation is
// wrong in a way nobody notices until a session is stolen, so the tests are
// written around the theft rather than around the happy path.
//
// The scenario worth holding in mind throughout: a thief copies a refresh
// token. Both they and the real user now hold the same one. Whoever refreshes
// first succeeds and gets a successor; whoever refreshes second presents a
// token that has already been used. NEITHER SIDE CAN CHOOSE TO GO SECOND, which
// is why this detects the theft whichever of them wins the race.

import { describe, expect, it } from 'vitest';
import { familyMembers, refresh, rotate } from '../src/session';
import type { TokenRecord } from '../src/session';

const HOUR = 3600_000;
const NOW = 1_760_000_000_000;

const store = (...records: TokenRecord[]): ReadonlyMap<string, TokenRecord> =>
  new Map(records.map((record) => [record.id, record]));

const fresh = (id: string, family = 'f1'): TokenRecord => ({
  id,
  family,
  expiresAt: NOW + HOUR,
});

describe('an ordinary refresh', () => {
  it('issues a successor in the same family', () => {
    const out = refresh({
      presented: 'a',
      now: NOW,
      lifetimeMs: HOUR,
      tokens: store(fresh('a')),
      families: new Map([['f1', { id: 'f1' }]]),
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.issue.family).toBe('f1');
      expect(out.issue.expiresAt).toBe(NOW + HOUR);
    }
  });

  it('marks the old token used and writes the new one, as one value', () => {
    // Returned together on purpose. If a crash could land between marking the
    // old one used and writing the successor, either the user is logged out for
    // nothing or the old token stays valid and rotation has quietly stopped.
    const { used, issued } = rotate(fresh('a'), 'b', NOW, HOUR);
    expect(used.usedAt).toBe(NOW);
    expect(issued.id).toBe('b');
    expect(issued.family).toBe(used.family);
    expect(issued.usedAt).toBeUndefined();
  });
});

describe('the theft, from both sides of the race', () => {
  it('catches the thief when the real user refreshes first', () => {
    // User rotates a into b. The thief still holds a.
    const { used, issued } = rotate(fresh('a'), 'b', NOW, HOUR);
    const out = refresh({
      presented: 'a',
      now: NOW + 1000,
      lifetimeMs: HOUR,
      tokens: store(used, issued),
      families: new Map([['f1', { id: 'f1' }]]),
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe('reused');
      expect(out.revokeFamily).toBe('f1');
    }
  });

  it('catches the thief when the thief refreshes first', () => {
    // Same code path, and that is the point: the loser of the race is caught
    // whoever it is, and the real user is logged out and signs in again while
    // the thief is left holding a family that no longer exists.
    const { used, issued } = rotate(fresh('a'), 'stolen-b', NOW, HOUR);
    const out = refresh({
      presented: 'a',
      now: NOW + 1000,
      lifetimeMs: HOUR,
      tokens: store(used, issued),
      families: new Map([['f1', { id: 'f1' }]]),
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('reused');
  });

  it('names reuse rather than expiry when a token is both', () => {
    // The ordering decision this file exists to protect. A thief presenting a
    // token that is used AND expired is still a thief, and answering "expired"
    // would throw away the only evidence of the theft there will ever be.
    // Expiry is housekeeping; reuse is an alarm.
    const spent: TokenRecord = { id: 'a', family: 'f1', expiresAt: NOW - HOUR, usedAt: NOW - HOUR };
    const out = refresh({
      presented: 'a',
      now: NOW,
      lifetimeMs: HOUR,
      tokens: store(spent),
      families: new Map([['f1', { id: 'f1' }]]),
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe('reused');
      expect(out.revokeFamily, 'an expired reuse must still revoke').toBe('f1');
    }
  });

  it('revokes the whole family, including the successor the thief just took', () => {
    // Revoking only the reused token would leave the thief holding whatever
    // they rotated to, which is the entire session they came for.
    const { used, issued } = rotate(fresh('a'), 'b', NOW, HOUR);
    const other = fresh('other', 'f2');
    const doomed = familyMembers(store(used, issued, other), 'f1');
    expect(new Set(doomed)).toEqual(new Set(['a', 'b']));
    expect(doomed, 'a different login must survive').not.toContain('other');
  });

  it('refuses everything in a family once it is revoked', () => {
    const out = refresh({
      presented: 'a',
      now: NOW,
      lifetimeMs: HOUR,
      tokens: store(fresh('a')),
      families: new Map([['f1', { id: 'f1', revokedAt: NOW - 1 }]]),
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('family-revoked');
  });
});

describe('the boring refusals, which still have to be right', () => {
  it('refuses a token it has never seen', () => {
    const out = refresh({
      presented: 'nope',
      now: NOW,
      lifetimeMs: HOUR,
      tokens: store(fresh('a')),
      families: new Map([['f1', { id: 'f1' }]]),
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe('unknown-token');
      // No family to revoke, and inventing one would revoke somebody else.
      expect(out.revokeFamily).toBeUndefined();
    }
  });

  it('expires exactly on the boundary rather than a millisecond late', () => {
    const at = (now: number): boolean =>
      refresh({
        presented: 'a',
        now,
        lifetimeMs: HOUR,
        tokens: store(fresh('a')),
        families: new Map([['f1', { id: 'f1' }]]),
      }).ok;
    expect(at(NOW + HOUR - 1), 'one millisecond before').toBe(true);
    expect(at(NOW + HOUR), 'exactly at expiry').toBe(false);
    expect(at(NOW + HOUR + 1), 'one millisecond after').toBe(false);
  });

  it('reads no clock of its own', () => {
    // Every time is a parameter. A function that called Date.now() could not be
    // tested at the boundary above, and would drift with how fast a test ran.
    const twice = [0, 1].map(() =>
      refresh({
        presented: 'a',
        now: NOW,
        lifetimeMs: HOUR,
        tokens: store(fresh('a')),
        families: new Map([['f1', { id: 'f1' }]]),
      }),
    );
    expect(twice[0]).toEqual(twice[1]);
  });
});
