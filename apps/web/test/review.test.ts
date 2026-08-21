// The form wiring's last leg, proven over the whole real path: migration,
// seed, policy, query, decode, grade, and only then the screen's rows.
//
// The device already refuses to let a blank version box pass as a clean grade.
// What this file pins down is that the DASHBOARD agrees months later, working
// only from what the database stored: if any hop between the column and
// `gradeStored` drops or mistranslates the form, the fault the device raised
// silently disappears on the exact screen a teacher trusts to re-mark a class.

import { describe, expect, it } from 'vitest';
import { demoDashboard } from '../src/source';

const DATA = await demoDashboard();

describe('a blank version box, all the way out of the database', () => {
  it('still needs review on the dashboard, not only on the device', () => {
    const unmatched = DATA.papers.find((paper) => paper.student === null);
    if (unmatched === undefined) throw new Error('the unmatched paper is missing from the seed');
    expect(unmatched.grade.formFault).toBe('unreadable');
    expect(unmatched.grade.needsReview).toBe(true);
  });

  it('does not touch the papers that declared the form this key grades', () => {
    const declared = DATA.papers.filter((paper) => paper.student !== null);
    expect(declared).not.toHaveLength(0);
    for (const paper of declared) expect(paper.grade.formFault).toBe('none');
  });
});
