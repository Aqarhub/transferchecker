// The one page on this server, and the reason it is a page rather than a link
// that just works.
//
// A CONFIRMATION LINK MUST NOT BE SPENT BY A GET. Corporate mail gateways open
// every URL in a message before a human sees it, so a link that confirms on
// arrival is a link consumed by a scanner. So the link lands here, this renders
// a button, and the button POSTs. A machine that follows links finds a page and
// changes nothing.
//
// NO JAVASCRIPT, AND NOTHING LOADED FROM ANYWHERE. The content security policy
// on every response here allows no script, no image and no font. That is not
// minimalism: the URL carries a secret in its query string, and a page that
// fetches anything at all is a page that can hand that secret to a third party
// through a request line. The same reason `Referrer-Policy: no-referrer` is set.
//
// AND THERE IS NO CSRF TOKEN, deliberately. The form posts the link secret
// itself, so a cross site submission would have to already know the secret, and
// anybody who knows it can confirm the mailbox by other means anyway.
//
// TWO LANGUAGES, as with the mail. Arabic and English are the two the owner
// writes; the other six published languages fall back to English until they go
// through the same rewrite and second reader the marketing copy did.

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);

interface Words {
  readonly dir: 'rtl' | 'ltr';
  readonly title: string;
  readonly ask: string;
  readonly button: string;
  readonly done: string;
  readonly failed: string;
}

const ARABIC: Words = {
  dir: 'rtl',
  title: 'تأكيد البريد',
  ask: 'اضغط الزر لتأكيد بريدك.',
  button: 'أكّد بريدي',
  done: 'تم تأكيد بريدك. يمكنك إغلاق هذه الصفحة.',
  failed: 'الرابط لم يعد صالحاً. اطلب رسالة جديدة من التطبيق.',
};

const ENGLISH: Words = {
  dir: 'ltr',
  title: 'Confirm your email',
  ask: 'Press the button to confirm your email address.',
  button: 'Confirm my email',
  done: 'Your email is confirmed. You can close this page.',
  failed: 'This link is no longer valid. Ask for a new message from the app.',
};

export const wordsFor = (locale: string): Words => (locale === 'ar' ? ARABIC : ENGLISH);

const STYLE =
  'font:16px/1.6 system-ui,sans-serif;max-width:34rem;margin:4rem auto;padding:0 1.5rem';

function page(locale: string, words: Words, inner: string): string {
  return [
    '<!doctype html>',
    `<html lang="${escapeHtml(locale)}" dir="${words.dir}">`,
    '<head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="robots" content="noindex,nofollow">',
    `<title>${escapeHtml(words.title)}</title>`,
    `</head><body style="${STYLE}">`,
    `<h1>${escapeHtml(words.title)}</h1>`,
    inner,
    '</body></html>',
  ].join('');
}

/** The page the link lands on: a sentence and a button that POSTs. */
export function askPage(locale: string, token: string): string {
  const words = wordsFor(locale);
  return page(
    locale,
    words,
    [
      `<p>${escapeHtml(words.ask)}</p>`,
      `<form method="post" action="/${escapeHtml(locale)}/confirm">`,
      `<input type="hidden" name="token" value="${escapeHtml(token)}">`,
      `<button type="submit">${escapeHtml(words.button)}</button>`,
      '</form>',
    ].join(''),
  );
}

/** What the button leads to, in one sentence either way. */
export function resultPage(locale: string, confirmed: boolean): string {
  const words = wordsFor(locale);
  return page(locale, words, `<p>${escapeHtml(confirmed ? words.done : words.failed)}</p>`);
}
