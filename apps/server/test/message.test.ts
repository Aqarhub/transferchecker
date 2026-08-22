// The confirmation email, checked as a product surface rather than a string.
//
// Three things are worth a test here and none of them is "the copy exists".
// The language has to survive the trip from signup to the message, because
// dropping it is invisible to every test of the auth logic. The design values
// have to be the real ones from `docs/design/tokens.css`, because email cannot
// read a stylesheet and inlined hex is exactly how a second palette is born.
// And the markup has to stay free of anything that fetches, because a tracking
// pixel would contradict the product's own promise about images.

import { describe, expect, it } from 'vitest';
import { CONFIRMATION_LIFETIME_MS } from '@transferchecker/account';
import { localeOf, palette, tokensCss } from '@transferchecker/ui';
import { LANGUAGES } from '../src/settings';
import { EMAIL_LANGUAGES, MAIL_COPY, confirmationMessage, mailLanguage } from '../src/message';

const LINK = 'https://app.example.sa/auth/confirm#Zm9vYmFy_-123';

const fontStack = (name: string): string =>
  new RegExp(`--font-${name}:\\s*([^;]+);`).exec(tokensCss())?.[1]?.trim() ?? '';

describe('every published language is covered', () => {
  it('carries copy for exactly the languages the server publishes', () => {
    // Both directions. A language the server accepts at signup but this table
    // does not know would silently take the Arabic fallback, and a language
    // here that signup rejects is copy nobody can ever receive.
    expect([...EMAIL_LANGUAGES].sort()).toEqual([...LANGUAGES].sort());
  });

  it('falls back to Arabic only for a code no signup can produce', () => {
    expect(mailLanguage('tr')).toBe('tr');
    expect(mailLanguage('xx')).toBe('ar');
  });
});

describe('the language survives the trip', () => {
  it('composes in the language given, not in the default', () => {
    const turkish = confirmationMessage('teacher@example.sa', 'tr', LINK);
    expect(turkish.subject).toBe(MAIL_COPY.tr.subject);
    expect(turkish.subject).not.toBe(MAIL_COPY.ar.subject);
    expect(turkish.html).toContain('lang="tr"');
    expect(turkish.text).toContain(MAIL_COPY.tr.action.slice(0, 4));
  });

  it('addresses the message to the person who signed up', () => {
    expect(confirmationMessage('teacher@example.sa', 'ar', LINK).to).toBe('teacher@example.sa');
  });
});

describe('direction, which is where an Arabic email usually breaks', () => {
  it('sets the document direction from the language', () => {
    expect(confirmationMessage('t@example.sa', 'ar', LINK).html).toContain('dir="rtl"');
    expect(confirmationMessage('t@example.sa', 'en', LINK).html).toContain('dir="ltr"');
  });

  it('keeps the printed link left to right inside a right to left page', () => {
    // Without this the bidirectional algorithm reorders the URL on screen and
    // the address a teacher retypes is not the address that was sent.
    const html = confirmationMessage('t@example.sa', 'ar', LINK).html;
    expect(html).toMatch(/<p dir="ltr"[^>]*>.*?https:\/\//s);
  });

  it('agrees with the interface layer about every locale', () => {
    for (const code of EMAIL_LANGUAGES) {
      const known = localeOf(code);
      expect(MAIL_COPY[code].dir).toBe(known.dir);
      expect(MAIL_COPY[code].lineHeight).toBe(known.lineHeight);
      expect(MAIL_COPY[code].font).toBe(fontStack(known.font));
    }
  });
});

describe('the link, which has to survive a mail client', () => {
  it('appears in the plain text part as well as the html', () => {
    const message = confirmationMessage('t@example.sa', 'ar', LINK);
    expect(message.text).toContain(LINK);
    // Three times in the html: the button's href, and the copyable line's
    // href and its visible text. A gateway that rewrites or strips the anchor
    // leaves that visible text readable, which is the whole point of printing
    // it: the person can still retype the address.
    expect(message.html.split(LINK).length - 1).toBe(3);
  });

  it('escapes the link before it reaches an attribute', () => {
    const hostile = 'https://app.example.sa/auth/confirm#a"><script>x</script>';
    const html = confirmationMessage('t@example.sa', 'ar', hostile).html;
    expect(html).not.toContain('<script>');
    expect(html).toContain('&quot;&gt;&lt;script&gt;');
  });
});

describe('the stated expiry is the real one', () => {
  it('reads the lifetime from the account layer', () => {
    const hours = Math.round(CONFIRMATION_LIFETIME_MS / 3_600_000);
    expect(confirmationMessage('t@example.sa', 'en', LINK).text).toContain(
      MAIL_COPY.en.expiry(hours),
    );
  });

  it('is written as a function of hours in every language, not a fixed number', () => {
    // The proof that changing the lifetime changes the sentence: a different
    // number has to appear in all eight, or one of them is a hardcoded 24.
    for (const code of EMAIL_LANGUAGES) {
      expect(MAIL_COPY[code].expiry(9)).toContain('9');
      expect(MAIL_COPY[code].expiry(9)).not.toContain('24');
    }
  });
});

describe('the design values are the tokens, not a second palette', () => {
  it('inlines only colours that exist in tokens.css', () => {
    const known = new Set(palette().values());
    for (const code of EMAIL_LANGUAGES) {
      const html = confirmationMessage('t@example.sa', code, LINK).html;
      const used = [...html.matchAll(/#[0-9a-f]{6}/gi)].map((m) => m[0].toLowerCase());
      expect(used.length).toBeGreaterThan(0);
      for (const colour of used) expect(known).toContain(colour);
    }
  });
});

describe('nothing in the message fetches anything', () => {
  it('carries no image, no script and no remote reference', () => {
    for (const code of EMAIL_LANGUAGES) {
      const html = confirmationMessage('t@example.sa', code, LINK).html;
      expect(html).not.toContain('<img');
      expect(html).not.toContain('<script');
      expect(html).not.toContain('src=');
      expect(html).not.toContain('http://');
      // The only absolute URL in the message is the confirmation link itself,
      // and its three appearances are the button and the printed line.
      expect([...html.matchAll(/https:\/\//g)]).toHaveLength(3);
    }
  });

  it('ships both parts, and the text part is text', () => {
    for (const code of EMAIL_LANGUAGES) {
      const message = confirmationMessage('t@example.sa', code, LINK);
      expect(message.subject.length).toBeGreaterThan(0);
      expect(message.html.length).toBeGreaterThan(0);
      expect(message.text).not.toContain('<');
      expect(message.text).toContain('TransferChecker');
    }
  });
});
