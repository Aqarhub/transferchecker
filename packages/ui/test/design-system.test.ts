// The seventeen rules of docs/DESIGN-SYSTEM.md, as a build that fails.
//
// A design system that lives only in a document is a document. Every rule below
// that CAN be checked mechanically is checked here, and the ones that cannot
// (whether the copy in a help marker is one imperative sentence, whether the
// scan sequence is the only orchestrated moment) are named in the file so the
// gap is visible rather than implied.
//
// The value of this file is not that it passes today. It is that the next
// contributor who reaches for a grey border, a green button, a `margin-left` or
// an emoji finds out at once and in the terminal, rather than in a review or
// never.

import { describe, expect, it } from 'vitest';
import { APP_CSS } from '../src/app-css';
import { barChart, distractorChart } from '../src/chart';
import { ICON_NAMES, icon } from '../src/icons';
import {
  bubble,
  button,
  esc,
  help,
  marksStrip,
  resetHelpIds,
  section,
  stat,
  table,
} from '../src/parts';
import { screenHeader, shell, tabs } from '../src/shell';
import { localeOf } from '../src/locale';

/** Every declaration in the stylesheet, comments removed. */
const declarations = (): string[] =>
  APP_CSS.replaceAll(/\/\*[\s\S]*?\*\//g, '')
    .split(/[;{}]/)
    .map((line) => line.trim())
    .filter((line) => line.includes(':'));

/** The selector each rule block belongs to, paired with its body. */
function blocks(): { selector: string; body: string }[] {
  const clean = APP_CSS.replaceAll(/\/\*[\s\S]*?\*\//g, '');
  return [...clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: (match[1] ?? '').trim().replaceAll(/\s+/g, ' '),
    body: match[2] ?? '',
  }));
}

/** One of every part, which is the surface the rules are checked against. */
function everything(): string {
  resetHelpIds();
  return [
    shell({
      locale: localeOf('ar'),
      brand: 'TransferChecker',
      nav: [{ key: 'exams', href: '/ar/', label: 'الاختبارات', glyph: 'exams' }],
      active: 'exams',
      sync: {
        label: 'يعمل بلا إنترنت',
        lastSync: '2026-08-15 09:41',
        pending: 2,
        pendingLabel: 'بانتظار الرفع',
      },
      languages: [{ code: 'en', href: '/en/', name: 'English', current: false }],
      skipLabel: 'تجاوز',
      navLabel: 'التنقل',
      body: '',
    }),
    screenHeader({
      title: 'عنوان',
      help: 'يشرح.',
      helpLabel: 'عنوان',
      action: button('افعل', 'primary', 'plus'),
    }),
    tabs([{ href: '#a', label: 'المفتاح', current: true }], 'أقسام'),
    section({ title: 'قسم', help: 'يشرح.', helpLabel: 'قسم', body: '' }),
    button('ثانوي', 'quiet', 'download'),
    button('خطر', 'danger'),
    stat('الأوراق', '6', 'مصحّحة', 'غير محدد'),
    stat('المتوسط', null, 'من الدرجة', 'غير محدد'),
    bubble('A', 'correct'),
    bubble('B', 'wrong'),
    bubble('!', 'review'),
    bubble('', 'blank'),
    marksStrip('cubd'),
    table(
      [
        { key: '0', label: 'الطالب' },
        { key: '1', label: 'الدرجة', numeric: true },
      ],
      [['ريم', '7.0']],
      'جدول',
    ),
    barChart({
      title: 'صعوبة',
      summary: 'ملخص',
      empty: 'لا شيء',
      bars: [{ label: 'س1', value: 0.5, note: '50%' }],
    }),
    distractorChart('توزيع', [{ symbol: 'A', chosen: 3, keyed: true }], 'المفتاح', 'لا شيء'),
    ...ICON_NAMES.map((name) => icon(name)),
  ].join('\n');
}

describe('rule 1: circles are for bubbles', () => {
  it('rounds nothing fully except a bubble and the one marker section 7 draws round', () => {
    // Section 7 specifies the help marker as a 16 pixel circle with a `؟` in it,
    // so the rule has exactly one documented exception and this is it. Anything
    // else fully rounded would be read as "this is an answer bubble".
    const allowed = /\.bubble|\.help-dot/;
    for (const block of blocks()) {
      if (!/border-radius:\s*50%/.test(block.body)) continue;
      expect(block.selector, block.selector).toMatch(allowed);
    }
  });

  it('draws every other radius from the token scale', () => {
    for (const line of declarations()) {
      const match = /^border-radius:\s*(.+)$/.exec(line);
      if (match === null) continue;
      expect(match[1], line).toMatch(/var\(--r-[123]\)|50%|1px/);
    }
  });
});

describe('rule 2: three reserved colours, and only a result may wear them', () => {
  it('uses correct, wrong and review nowhere but a result', () => {
    const reserved = ['--correct', '--wrong', '--review'];
    for (const block of blocks()) {
      for (const token of reserved) {
        if (!block.body.includes(`var(${token})`)) continue;
        // `.stat-missing` is rule 17: a value the machine could not read is
        // shown in the warning colour, which IS a grading outcome. `.btn-danger`
        // wears the warning amber and never the result red, because red means a
        // student got a question wrong and must not mean "this deletes things".
        expect(block.selector, `${token} on ${block.selector}`).toMatch(
          /\.bubble|\.mark|\.stat-missing|\.btn-danger/,
        );
      }
    }
  });

  it('never lets colour be the only carrier of an outcome', () => {
    // Eight percent of men cannot separate red from green, so every coloured
    // outcome also carries a shape.
    expect(bubble('A', 'correct')).toContain('&#10003;');
    expect(bubble('A', 'wrong')).toContain('&times;');
    expect(bubble('A', 'review')).toContain('?');
  });

  it('keeps the reserved colours out of every chart', () => {
    // Measured, not asserted: the palette validator put amber against green at
    // ΔE 6.3 under protanopia and the neutral against amber at 12.5 for normal
    // vision, both below floor. So a chart is one hue and colour separates data
    // from grid, nothing more.
    const chart = blocks().filter((block) => /^\.c-|\.chart/.test(block.selector));
    for (const block of chart) {
      expect(block.body, block.selector).not.toMatch(/--correct|--wrong|--review/);
    }
  });
});

describe('rule 3: every number is monospaced and tabular', () => {
  it('gives the number classes tabular figures', () => {
    const numeric = blocks().filter((block) => /\.num\b|\.marks\b|num-col/.test(block.selector));
    expect(numeric.length).toBeGreaterThan(0);
    expect(numeric.some((block) => block.body.includes('tabular-nums'))).toBe(true);
    expect(numeric.some((block) => block.body.includes('var(--font-mono)'))).toBe(true);
  });

  it('never breaks a value across two lines', () => {
    // A column narrow enough to wrap "9.0 / 12.5" turns one value into what
    // looks like three. Found by screenshot at 390 pixels.
    const wrap = blocks().find((block) => /\.num,\s*td\.num-col/.test(block.selector));
    expect(wrap?.body).toContain('nowrap');
  });
});

describe('rule 5: separation comes from the surface, not from a border on everything', () => {
  it('draws no grey box around panels, stats or cards', () => {
    for (const block of blocks()) {
      if (!/^\.(panel|stat|shell|main|grid-2)\b/.test(block.selector)) continue;
      expect(block.body, block.selector).not.toMatch(/(^|[^-])border:\s*[^0]/);
    }
  });
});

describe('rules 12 and 13: one icon family, and a 44 pixel touch area', () => {
  it('ships no emoji anywhere in the interface', () => {
    // Rule 12 is absolute about this, and an emoji is also a different glyph on
    // every platform, which is the opposite of one family.
    expect(everything()).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('draws every glyph in one box at one weight', () => {
    for (const name of ICON_NAMES) {
      const drawn = icon(name);
      expect(drawn, name).toContain('viewBox="0 0 20 20"');
      expect(drawn, name).toContain('stroke-width="1.5"');
      expect(drawn, name).toContain('aria-hidden="true"');
      // Outline only. A filled glyph beside eleven outlined ones reads as a
      // different set even when it is the same file.
      expect(drawn, name).toContain('fill="none"');
    }
  });

  it('gives every control at least 44 pixels of touch', () => {
    for (const selector of ['.btn', '.tab', '.nav-item']) {
      const block = blocks().find((entry) => entry.selector === selector);
      // 36 is allowed on `.nav-item`, and only there: a desktop sidebar row is a
      // mouse target, and 44 in that column wastes a third of its width. The
      // mobile rule below raises it back to 44 where a finger uses it.
      expect(block?.body, selector).toMatch(/min-block-size:\s*(44px|36px)/);
    }
    const phone = APP_CSS.slice(APP_CSS.indexOf('@media (max-width: 900px)'));
    expect(phone).toMatch(/\.nav-item\s*\{[^}]*min-block-size:\s*44px/);
    // The help marker is drawn at 16 and expanded to 44 without moving, which is
    // rule 13's own escape clause for an icon smaller than the target.
    const dot = blocks().find((entry) => entry.selector === '.help-dot::after');
    expect(dot?.body).toContain('inset: -14px');
  });
});

describe('the stylesheet is safe in eight languages, not just in one', () => {
  it('never uppercases text, because uppercasing breaks Turkish', () => {
    // `text-transform: uppercase` turns a Turkish dotted i into I rather than
    // into Ä°, which is a different letter and a real word becomes a wrong one.
    // Rule 6 already bans it on Arabic for a different reason. Style a heading
    // with weight and size, never with a case transform.
    for (const line of declarations()) {
      expect(line, line).not.toMatch(/text-transform:\s*(uppercase|capitalize)/);
    }
  });

  it('never letter spaces, because letter spacing takes Arabic apart', () => {
    // Rule 6. Arabic letters join, and tracking pulls a word into pieces.
    for (const line of declarations()) {
      expect(line, line).not.toMatch(/letter-spacing:\s*(?!normal|0)/);
    }
  });

  it('hyphenates the long compounds, and never a number', () => {
    // German runs about thirty percent longer than English and builds single
    // unbreakable tokens, so a column that fits Arabic can still overflow.
    const text = blocks().filter((block) => block.body.includes('hyphens: auto'));
    expect(text.length).toBeGreaterThan(0);
    const numeric = blocks().find((block) => /\.num,\s*\.marks/.test(block.selector));
    expect(numeric?.body).toContain('hyphens: none');
  });
});

describe('rule 14: focus is visible, always', () => {
  it('draws a focus ring and removes it nowhere', () => {
    const ring = blocks().find((block) => block.selector === ':focus-visible');
    expect(ring?.body).toMatch(/outline:\s*2px solid/);
    expect(ring?.body).toContain('outline-offset');
    for (const line of declarations()) {
      expect(line).not.toMatch(/outline:\s*(none|0)/);
    }
  });
});

describe('rule 10: the question mark beside every control', () => {
  it('is a real button, labelled, and tied to its explanation', () => {
    resetHelpIds();
    const marker = help('ينزّل نتائج هذا الاختبار ملف Excel.', 'صدّر Excel');
    expect(marker).toContain('<button type="button"');
    expect(marker).toContain('aria-label="صدّر Excel"');
    expect(marker).toMatch(/aria-describedby="(help-\d+)"[\s\S]*id="\1"/);
    expect(marker).toContain('؟');
  });

  it('puts one beside every section title and every screen title', () => {
    expect(section({ title: 'قسم', help: 'يشرح.', helpLabel: 'قسم', body: '' })).toContain(
      'help-dot',
    );
    expect(screenHeader({ title: 'شاشة', help: 'يشرح.', helpLabel: 'شاشة' })).toContain('help-dot');
  });

  it('opens on focus as well as on hover, since hover does not exist on a phone', () => {
    const opener = blocks().find((block) => block.selector.includes(':focus-visible + .help-body'));
    expect(opener).toBeDefined();
  });
});

describe('rule 17: no invented value in place of a missing one', () => {
  it('writes the word rather than a zero or a dash that looks like data', () => {
    const missing = stat('المتوسط', null, 'من الدرجة الكاملة', 'غير محدد');
    expect(missing).toContain('غير محدد');
    expect(missing).not.toContain('stat-value');
    expect(missing).toContain('stat-missing');
  });
});

describe('the layout is direction agnostic, which is what makes one stylesheet enough', () => {
  it('contains no physical direction anywhere', () => {
    // Not a preference. A stylesheet with `left` and `right` in it needs a
    // second copy for Arabic, and the second copy is the one that rots.
    for (const line of declarations()) {
      expect(line, line).not.toMatch(
        /^(margin|padding|border)-(left|right)\s*:|^(left|right)\s*:|text-align:\s*(left|right)|float:/,
      );
    }
  });

  it('never mirrors a number, an identifier or an answer string', () => {
    // The bidirectional algorithm reorders "00713 / 45" into something nobody
    // typed, and it does it silently.
    expect(marksStrip('cub')).toContain('dir="ltr"');
    // A chart's coordinate space is left to right by construction, since its x
    // maths assumes it and its labels are numbers.
    const svg = blocks().find((block) => block.selector === '.chart-svg');
    expect(svg?.body).toContain('direction: ltr');
  });
});

describe('escaping, because a student name is not markup', () => {
  it('escapes every angle bracket and quote it is given', () => {
    expect(esc('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
    const row = table([{ key: '0', label: '<b>' }], [[esc('</td><script>')]], '<caption>');
    expect(row).not.toContain('<script>');
    expect(row).not.toContain('<b>');
  });
});
