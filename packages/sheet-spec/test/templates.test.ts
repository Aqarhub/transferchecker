// The sheets a teacher starts from. If one of these does not fit a page, the
// product has no first step, so every one is laid out for real here.

import { describe, expect, it } from 'vitest';
import { STOCK_TEMPLATES, layoutSheet, stockQuestionCount, stockTemplate } from '../src/index';
import type { SheetLayout, TemplateText } from '../src/index';

const ENGLISH: TemplateText = {
  name: 'Standard',
  branding: 'TRANSFERCHECKER.COM',
  studentName: 'Name',
  studentId: 'Student ID',
  keyVersion: 'Key',
};

const ARABIC: TemplateText = {
  name: 'نموذج قياسي',
  branding: 'TRANSFERCHECKER.COM',
  studentName: 'اسم الطالب',
  studentId: 'رقم الطالب',
  keyVersion: 'النموذج',
};

const layoutOrThrow = (spec: Parameters<typeof layoutSheet>[0]): SheetLayout => {
  const result = layoutSheet(spec);
  if (result.kind !== 'ok') throw new Error(`does not fit: ${result.axis} in ${result.area}`);
  return result.layout;
};

describe('stock templates', () => {
  it('every one of them fits a page', () => {
    for (const kind of STOCK_TEMPLATES) {
      expect(() => layoutOrThrow(stockTemplate(kind, ENGLISH))).not.toThrow();
    }
  });

  it('fits just the same in Arabic, since only the words differ', () => {
    for (const kind of STOCK_TEMPLATES) {
      const english = layoutOrThrow(stockTemplate(kind, ENGLISH));
      const arabic = layoutOrThrow(stockTemplate(kind, ARABIC));
      expect(arabic.questionColumns).toEqual(english.questionColumns);
    }
  });

  it('prints the number of questions its name promises', () => {
    for (const kind of STOCK_TEMPLATES) {
      const layout = layoutOrThrow(stockTemplate(kind, ENGLISH));
      const rows = layout.questionColumns.reduce((total, c) => total + c.rows.length, 0);
      expect(rows).toBe(stockQuestionCount(kind));
    }
  });

  it('gives every one a way to identify the student', () => {
    for (const kind of STOCK_TEMPLATES) {
      const usages = stockTemplate(kind, ENGLISH).headerFields.map((field) => field.usage);
      expect(usages).toContain('studentName');
      expect(usages).toContain('studentId');
    }
  });

  it('keeps its template id fixed, because the id is printed on the paper', () => {
    // A regenerated id would orphan every sheet already printed from it.
    expect(STOCK_TEMPLATES.map((kind) => stockTemplate(kind, ENGLISH).templateId)).toEqual([
      '0a1b2c3d-0020-4a20-9020-000000000020',
      '0a1b2c3d-0050-4a50-9050-000000000050',
      '0a1b2c3d-0100-4a10-9100-000000000100',
    ]);
  });

  it('keeps the bubble the scanner measures at full size even on the dense sheet', () => {
    // Rows tighten to fit a hundred questions, the bubble does not shrink.
    const roomy = stockTemplate('standard50', ENGLISH).bubble;
    const dense = stockTemplate('full100', ENGLISH).bubble;
    expect(dense.radiusMm).toBe(roomy.radiusMm);
    expect(dense.pitchXMm).toBe(roomy.pitchXMm);
    expect(dense.pitchYMm).toBeLessThan(roomy.pitchYMm);
  });

  it('carries its whole geometry in its code, like any other sheet', () => {
    for (const kind of STOCK_TEMPLATES) {
      expect(layoutOrThrow(stockTemplate(kind, ENGLISH)).code.payload.length).toBeGreaterThan(0);
    }
  });
});
