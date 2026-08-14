// The scaffold's own test: this package can reach the geometry it will sample.
//
// It is worth having before any algorithm exists, because the whole design
// rests on the scanner and the printed sheet agreeing about millimetres, and a
// workspace that does not resolve would break that silently and late.

import { describe, expect, it } from 'vitest';
import { GEOMETRY, bubbleGroups, layoutSheet, stockTemplate } from '@transferchecker/sheet-spec';

describe('core-omr can see the sheet it will read', () => {
  it('resolves the geometry the scanner locks onto', () => {
    // A solid square this size at the page corners is what perspective
    // correction finds first, before anything else on the page is meaningful.
    expect(GEOMETRY.fiducialMm).toBeGreaterThan(0);
    expect(GEOMETRY.marginMm).toBeGreaterThan(0);
  });

  it('gets a laid out sheet and the groups it will score', () => {
    const spec = stockTemplate('standard50', {
      name: 'Standard 50',
      branding: 'TRANSFERCHECKER.COM',
      studentName: 'Name',
      studentId: 'Student ID',
      keyVersion: 'Key',
    });
    const result = layoutSheet(spec);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    expect(result.layout.fiducials).toHaveLength(4);
    // One group per question plus one per character column of every grid field,
    // which is the unit the scanner walks without knowing the field kind.
    const groups = bubbleGroups(result.layout);
    expect(groups.length).toBeGreaterThan(50);
    for (const group of groups) {
      expect(group.bubbles.length).toBeGreaterThan(1);
    }
  });
});
