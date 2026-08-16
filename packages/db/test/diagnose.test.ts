import { describe, expect, it } from 'vitest';
import { diagnose, explain } from '../src/diagnose';

describe('reading a connection failure', () => {
  // The distinction worth knowing. Both look equally broken and mean opposite
  // things: refused means something answered, timed out means nothing did, and
  // on a managed database nothing answering is the address allowlist.
  it('tells a dropped packet from a refused one', () => {
    expect(diagnose({ code: 'ETIMEDOUT' })?.summary).toContain('dropped rather than refused');
    expect(diagnose({ code: 'ECONNREFUSED' })?.summary).toContain('refused the connection');
  });

  it('points a timeout at the allowlist and at the changing address behind it', () => {
    const found = diagnose({ code: 'ETIMEDOUT' });
    expect(found?.likely.join(' ')).toContain('allowlist');
    expect(found?.likely.join(' ')).toContain('api.ipify.org');
  });

  // The driver buries its code under `cause`, which is where this one really
  // arrives from postgres.js.
  it('finds the code however deeply the driver wrapped it', () => {
    const wrapped = { cause: { cause: { code: 'ETIMEDOUT' } } };
    expect(diagnose(wrapped)?.summary).toContain('never answered');
  });

  it('reads a database error code as well as a socket one', () => {
    expect(diagnose({ code: '28P01' })?.summary).toContain('account or the password');
    expect(diagnose({ code: '3D000' })?.summary).toContain('does not exist');
  });

  // A tool that explains everything confidently is one nobody can trust when it
  // matters. An unrecognised error is worth more printed in full.
  it('says nothing about an error it does not recognise', () => {
    expect(diagnose(new Error('something else entirely'))).toBeNull();
    expect(explain(new Error('something else entirely'))).toBe('');
  });

  it('formats the explanation as lines a terminal can show', () => {
    expect(explain({ code: 'ETIMEDOUT' }).split('\n').length).toBeGreaterThan(2);
  });
});
