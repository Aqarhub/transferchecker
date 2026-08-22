// The one email this product sends, composed here rather than by the provider.
//
// WHY THE MESSAGE IS NOT THE MAILER'S BUSINESS. The provider is an undecided
// business choice, so whoever writes that adapter one day would otherwise also
// be deciding what a teacher reads, in which language, and whether the link is
// legible. Composition lives here and the adapter transports a finished
// message, which also means switching provider changes no word of copy.
//
// AND THE LANGUAGE IS CARRIED, NOT DROPPED. Signup already collects a language
// and validates it against the eight the product publishes. An Arabic first
// product whose only email arrives in English because the transport layer
// never learned the answer is a defect that no test of the auth logic can see.
//
// THREE THINGS THIS MESSAGE DELIBERATELY DOES NOT HAVE: no image, no tracking
// pixel and no external stylesheet. The first two contradict the product's own
// data minimisation promise, and all three cost inbox placement. A confirmation
// mail is the least ornamental message a product sends.

import { CONFIRMATION_LIFETIME_MS } from '@transferchecker/account';

/** The eight the product publishes, and the eight this file must cover. */
export const EMAIL_LANGUAGES = ['ar', 'en', 'de', 'es', 'fr', 'hi', 'tr', 'zh'] as const;

export type EmailLanguage = (typeof EMAIL_LANGUAGES)[number];

/**
 * One shape per language, so a missing string is a compile error.
 *
 * The same rule `apps/web/src/copy.ts` follows, and for the same reason: a
 * lookup with a fallback is how a half translated product ships. The expiry is
 * a function of hours rather than a written number, because the lifetime lives
 * in `packages/account` and an email that states a stale one is a lie the code
 * cannot notice.
 */
export interface MailCopy {
  readonly dir: 'rtl' | 'ltr';
  /** Which `--font-*` stack from the design tokens this language reads. */
  readonly font: string;
  /** Arabic needs more leading than Latin at the same size. */
  readonly lineHeight: number;
  readonly subject: string;
  readonly heading: string;
  readonly lead: string;
  readonly action: string;
  readonly fallback: string;
  readonly expiry: (hours: number) => string;
  readonly ignore: string;
}

const LATIN = "'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif";

export const MAIL_COPY: Readonly<Record<EmailLanguage, MailCopy>> = {
  ar: {
    dir: 'rtl',
    font: "'IBM Plex Sans Arabic', 'Geeza Pro', 'Noto Naskh Arabic', 'Segoe UI', sans-serif",
    lineHeight: 1.75,
    subject: 'أكّد بريدك الإلكتروني في TransferChecker',
    heading: 'أكّد بريدك الإلكتروني',
    lead: 'أُنشئ حساب في TransferChecker بهذا العنوان، والتأكيد شرط المزامنة السحابية.',
    action: 'تأكيد البريد',
    fallback: 'أو انسخ هذا الرابط والصقه في المتصفح:',
    expiry: (hours) => `الرابط صالح ${String(hours)} ساعة.`,
    ignore: 'وإن لم تسجّل أنت، فأهمل هذه الرسالة ولا يحدث شيء.',
  },
  en: {
    dir: 'ltr',
    font: LATIN,
    lineHeight: 1.5,
    subject: 'Confirm your email for TransferChecker',
    heading: 'Confirm your email',
    lead: 'An account was created on TransferChecker with this address, and confirming it is what turns on cloud sync.',
    action: 'Confirm email',
    fallback: 'Or copy this link into your browser:',
    expiry: (hours) => `The link works for ${String(hours)} hours.`,
    ignore: 'If you did not sign up, ignore this message and nothing happens.',
  },
  de: {
    dir: 'ltr',
    font: LATIN,
    lineHeight: 1.5,
    subject: 'Bestätigen Sie Ihre E-Mail-Adresse für TransferChecker',
    heading: 'E-Mail-Adresse bestätigen',
    lead: 'Mit dieser Adresse wurde ein Konto bei TransferChecker erstellt. Die Bestätigung schaltet die Cloud-Synchronisierung frei.',
    action: 'E-Mail bestätigen',
    fallback: 'Oder kopieren Sie diesen Link in Ihren Browser:',
    expiry: (hours) => `Der Link ist ${String(hours)} Stunden gültig.`,
    ignore:
      'Falls Sie sich nicht registriert haben, ignorieren Sie diese Nachricht. Es passiert nichts.',
  },
  es: {
    dir: 'ltr',
    font: LATIN,
    lineHeight: 1.5,
    subject: 'Confirma tu correo en TransferChecker',
    heading: 'Confirma tu correo',
    lead: 'Se creó una cuenta en TransferChecker con esta dirección, y confirmarla es lo que activa la sincronización en la nube.',
    action: 'Confirmar correo',
    fallback: 'O copia este enlace en tu navegador:',
    expiry: (hours) => `El enlace es válido durante ${String(hours)} horas.`,
    ignore: 'Si no te registraste, ignora este mensaje y no pasará nada.',
  },
  fr: {
    dir: 'ltr',
    font: LATIN,
    lineHeight: 1.5,
    subject: 'Confirmez votre adresse e-mail pour TransferChecker',
    heading: 'Confirmez votre adresse e-mail',
    lead: 'Un compte TransferChecker a été créé avec cette adresse, et la confirmation active la synchronisation.',
    action: "Confirmer l'adresse",
    fallback: 'Ou copiez ce lien dans votre navigateur :',
    expiry: (hours) => `Le lien est valable ${String(hours)} heures.`,
    ignore: 'Si vous ne vous êtes pas inscrit, ignorez ce message : rien ne se passera.',
  },
  hi: {
    dir: 'ltr',
    font: "'IBM Plex Sans Devanagari', 'Noto Sans Devanagari', 'Nirmala UI', sans-serif",
    lineHeight: 1.7,
    subject: 'TransferChecker के लिए अपना ईमेल पुष्ट करें',
    heading: 'अपना ईमेल पुष्ट करें',
    lead: 'इस पते से TransferChecker पर एक खाता बनाया गया है, और पुष्टि करने पर क्लाउड सिंक चालू होता है।',
    action: 'ईमेल पुष्ट करें',
    fallback: 'या यह लिंक अपने ब्राउज़र में कॉपी करें:',
    expiry: (hours) => `यह लिंक ${String(hours)} घंटे तक काम करता है।`,
    ignore: 'यदि आपने साइन अप नहीं किया, तो इस संदेश को अनदेखा करें, कुछ नहीं होगा।',
  },
  tr: {
    dir: 'ltr',
    font: LATIN,
    lineHeight: 1.5,
    subject: 'TransferChecker e-posta adresinizi doğrulayın',
    heading: 'E-posta adresinizi doğrulayın',
    lead: 'Bu adresle bir TransferChecker hesabı oluşturuldu ve doğrulama bulut eşitlemesini açar.',
    action: 'E-postayı doğrula',
    fallback: 'Veya bu bağlantıyı tarayıcınıza kopyalayın:',
    expiry: (hours) => `Bağlantı ${String(hours)} saat geçerlidir.`,
    ignore: 'Kaydolmadıysanız bu iletiyi yok sayın, hiçbir şey olmaz.',
  },
  zh: {
    dir: 'ltr',
    font: "'IBM Plex Sans SC', 'PingFang SC', 'Noto Sans SC', 'Microsoft YaHei', sans-serif",
    lineHeight: 1.6,
    subject: '确认你的 TransferChecker 邮箱',
    heading: '确认你的邮箱',
    lead: '有人用这个邮箱注册了 TransferChecker 账户，确认后即可开启云同步。',
    action: '确认邮箱',
    fallback: '或将此链接复制到浏览器中打开：',
    expiry: (hours) => `链接在 ${String(hours)} 小时内有效。`,
    ignore: '如果不是你注册的，请忽略这封邮件，不会有任何影响。',
  },
};

/**
 * A language code narrowed to one this file covers.
 *
 * Unreachable by construction today: signup rejects any code outside the
 * server's `LANGUAGES`, and a test asserts that list and this table hold the
 * same eight. It exists because the alternative at this boundary is throwing
 * after the account is already committed, and no email is worth that.
 */
export function mailLanguage(code: string): EmailLanguage {
  return EMAIL_LANGUAGES.find((known) => known === code) ?? 'ar';
}

/** The design tokens this message inlines. Email cannot read a stylesheet. */
const COLOUR = {
  pearl: '#f4f6f8',
  surface: '#ffffff',
  graphite: '#16181c',
  graphite2: '#5c626b',
  ink: '#0f3d52',
} as const;

/**
 * Escaping for the one value that reaches the markup: the link.
 *
 * Written here rather than imported from `packages/ui` because the server has
 * no interface dependency and should not grow one to reach four characters.
 * The token is base64url so it carries none of these, and the origin is our own
 * environment; this is the boundary holding regardless of both staying true.
 */
function attr(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export interface Message {
  readonly to: string;
  readonly subject: string;
  /** The plain text part. Not a courtesy: see the note in `mailer.ts`. */
  readonly text: string;
  readonly html: string;
}

/**
 * The confirmation email, in the language the person chose.
 *
 * The link appears twice on purpose. Corporate gateways rewrite anchors and
 * some clients refuse to render the button at all, and a confirmation mail
 * whose only affordance is a styled anchor is one rewrite away from useless.
 * The printed copy carries `dir="ltr"`, because a URL dropped into an Arabic
 * paragraph is reordered by the bidirectional algorithm and silently becomes an
 * address nobody can retype.
 */
export function confirmationMessage(to: string, language: EmailLanguage, link: string): Message {
  const copy = MAIL_COPY[language];
  const hours = Math.round(CONFIRMATION_LIFETIME_MS / 3_600_000);
  const expiry = copy.expiry(hours);
  const safe = attr(link);

  const text = [
    copy.heading,
    '',
    copy.lead,
    '',
    copy.fallback,
    link,
    '',
    expiry,
    copy.ignore,
    '',
    'TransferChecker',
  ].join('\n');

  const body = `font-family:${copy.font};line-height:${String(copy.lineHeight)}`;
  const muted = `color:${COLOUR.graphite2};font-size:14px`;

  const html = `<!doctype html>
<html lang="${language}" dir="${copy.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width">
<title>${copy.subject}</title>
</head>
<body style="margin:0;padding:24px;background:${COLOUR.pearl};color:${COLOUR.graphite};${body}">
<div style="max-width:560px;margin:0 auto;background:${COLOUR.surface};border-radius:12px;padding:32px">
<p style="margin:0 0 16px;font-size:20px;font-weight:600">${copy.heading}</p>
<p style="margin:0 0 24px">${copy.lead}</p>
<p style="margin:0 0 24px"><a href="${safe}" style="display:inline-block;padding:12px 24px;border-radius:8px;background:${COLOUR.ink};color:${COLOUR.surface};font-weight:600;text-decoration:none">${copy.action}</a></p>
<p style="margin:0 0 8px;${muted}">${copy.fallback}</p>
<p dir="ltr" style="margin:0 0 24px;font-size:14px;word-break:break-all"><a href="${safe}" style="color:${COLOUR.ink}">${safe}</a></p>
<p style="margin:0 0 8px;${muted}">${expiry}</p>
<p style="margin:0;${muted}">${copy.ignore}</p>
</div>
<p style="max-width:560px;margin:16px auto 0;text-align:center;font-size:12px;color:${COLOUR.graphite2}">TransferChecker</p>
</body>
</html>
`;

  return { to, subject: copy.subject, text, html };
}
