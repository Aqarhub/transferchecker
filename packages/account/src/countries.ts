// The countries a teacher can sign up from, and the legal regime each one sits
// under.
//
// TWO THINGS LIVE HERE AND THEY ARE DIFFERENT KINDS OF FACT. The list of country
// codes is a standard, and the names are data the platform already ships. The
// mapping from a country to a privacy regime is a PRODUCT DECISION about which
// law we write a policy against, and it is the one thing in this file a lawyer
// has to sign off.
//
// NO HAND WRITTEN COUNTRY NAMES. `Intl.DisplayNames` resolves every code into
// every one of the eight languages from ICU, which is the same CLDR data a
// phone's own settings screen uses. Writing 249 countries by hand in eight
// languages would be two thousand strings that rot the day a country renames
// itself, and Türkiye renamed itself in 2022.

/**
 * ISO 3166-1 alpha-2, officially assigned, all 249 of them.
 *
 * Derived from ICU rather than typed, then frozen here so the BUILD is
 * deterministic: the names may improve when ICU updates, the list may not
 * change under us. Withdrawn codes ICU still answers for (SU, YU, AN, ZR and
 * the rest) are not here, and neither are the groupings that are not countries
 * (EU, UN, QO).
 *
 * Kosovo is absent because ISO has not assigned it a code; XK is user assigned.
 * That is a rule rather than a position, and adding it is one line whenever the
 * owner decides it should be offered.
 */
const ASSIGNED = [
  'AD',
  'AE',
  'AF',
  'AG',
  'AI',
  'AL',
  'AM',
  'AO',
  'AQ',
  'AR',
  'AS',
  'AT',
  'AU',
  'AW',
  'AX',
  'AZ',
  'BA',
  'BB',
  'BD',
  'BE',
  'BF',
  'BG',
  'BH',
  'BI',
  'BJ',
  'BL',
  'BM',
  'BN',
  'BO',
  'BQ',
  'BR',
  'BS',
  'BT',
  'BV',
  'BW',
  'BY',
  'BZ',
  'CA',
  'CC',
  'CD',
  'CF',
  'CG',
  'CH',
  'CI',
  'CK',
  'CL',
  'CM',
  'CN',
  'CO',
  'CR',
  'CU',
  'CV',
  'CW',
  'CX',
  'CY',
  'CZ',
  'DE',
  'DJ',
  'DK',
  'DM',
  'DO',
  'DZ',
  'EC',
  'EE',
  'EG',
  'EH',
  'ER',
  'ES',
  'ET',
  'FI',
  'FJ',
  'FK',
  'FM',
  'FO',
  'FR',
  'GA',
  'GB',
  'GD',
  'GE',
  'GF',
  'GG',
  'GH',
  'GI',
  'GL',
  'GM',
  'GN',
  'GP',
  'GQ',
  'GR',
  'GS',
  'GT',
  'GU',
  'GW',
  'GY',
  'HK',
  'HM',
  'HN',
  'HR',
  'HT',
  'HU',
  'ID',
  'IE',
  'IL',
  'IM',
  'IN',
  'IO',
  'IQ',
  'IR',
  'IS',
  'IT',
  'JE',
  'JM',
  'JO',
  'JP',
  'KE',
  'KG',
  'KH',
  'KI',
  'KM',
  'KN',
  'KP',
  'KR',
  'KW',
  'KY',
  'KZ',
  'LA',
  'LB',
  'LC',
  'LI',
  'LK',
  'LR',
  'LS',
  'LT',
  'LU',
  'LV',
  'LY',
  'MA',
  'MC',
  'MD',
  'ME',
  'MF',
  'MG',
  'MH',
  'MK',
  'ML',
  'MM',
  'MN',
  'MO',
  'MP',
  'MQ',
  'MR',
  'MS',
  'MT',
  'MU',
  'MV',
  'MW',
  'MX',
  'MY',
  'MZ',
  'NA',
  'NC',
  'NE',
  'NF',
  'NG',
  'NI',
  'NL',
  'NO',
  'NP',
  'NR',
  'NU',
  'NZ',
  'OM',
  'PA',
  'PE',
  'PF',
  'PG',
  'PH',
  'PK',
  'PL',
  'PM',
  'PN',
  'PR',
  'PS',
  'PT',
  'PW',
  'PY',
  'QA',
  'RE',
  'RO',
  'RS',
  'RU',
  'RW',
  'SA',
  'SB',
  'SC',
  'SD',
  'SE',
  'SG',
  'SH',
  'SI',
  'SJ',
  'SK',
  'SL',
  'SM',
  'SN',
  'SO',
  'SR',
  'SS',
  'ST',
  'SV',
  'SX',
  'SY',
  'SZ',
  'TC',
  'TD',
  'TF',
  'TG',
  'TH',
  'TJ',
  'TK',
  'TL',
  'TM',
  'TN',
  'TO',
  'TR',
  'TT',
  'TV',
  'TW',
  'TZ',
  'UA',
  'UG',
  'UM',
  'US',
  'UY',
  'UZ',
  'VA',
  'VC',
  'VE',
  'VG',
  'VI',
  'VN',
  'VU',
  'WF',
  'WS',
  'YE',
  'YT',
  'ZA',
  'ZM',
  'ZW',
] as const;

/**
 * Countries not offered, and why, because a silent omission is not a decision.
 *
 * Recorded as data with its reason attached rather than filtered out somewhere
 * in a component, so the answer to "why is this country missing" is in the file
 * that omits it. This is a commercial decision by the product owner, it is
 * reversible by editing this array, and nothing else in the code knows about it.
 */
export const NOT_OFFERED: readonly { code: string; reason: string }[] = [
  { code: 'IL', reason: 'Owner decision, 2026-08-16. Not offered as a market.' },
];

const withheld: ReadonlySet<string> = new Set(NOT_OFFERED.map((entry) => entry.code));

/** Every country the signup form offers, in code order. */
export const COUNTRIES: readonly string[] = ASSIGNED.filter((code) => !withheld.has(code));

/**
 * The privacy regimes we write a policy against.
 *
 * NOT one policy per country, and not one policy for the world. Both are wrong
 * for the same reason: the first is 248 documents nobody maintains, and the
 * second is the document that names the wrong law to every reader who is not in
 * one place. A regime is the unit that actually differs, and a country maps to
 * exactly one.
 *
 * `default` is not a gap. It is a policy written to the strictest common
 * denominator, which is what a product with no local entity should offer
 * anywhere it has not specifically looked.
 */
export type Regime =
  'eu' | 'uk' | 'ch' | 'sa' | 'ae' | 'gcc' | 'tr' | 'in' | 'cn' | 'br' | 'us' | 'ca' | 'default';

/** The law each regime is written against. Shown on the policy page itself. */
export const REGIME_LAW: Readonly<Record<Regime, string>> = {
  eu: 'General Data Protection Regulation (EU) 2016/679',
  uk: 'UK GDPR and the Data Protection Act 2018',
  ch: 'Swiss Federal Act on Data Protection, revised 2023',
  sa: 'Saudi Personal Data Protection Law and its implementing regulations',
  ae: 'UAE Federal Decree-Law 45 of 2021 on Personal Data Protection',
  gcc: 'the national personal data protection law of the country of residence',
  tr: 'Kisisel Verilerin Korunmasi Kanunu number 6698',
  in: 'Digital Personal Data Protection Act 2023',
  cn: 'Personal Information Protection Law of the People Republic of China',
  br: 'Lei Geral de Protecao de Dados 13.709/2018',
  us: 'the applicable state privacy law of the user state of residence',
  ca: 'PIPEDA, and Quebec Law 25 for residents of Quebec',
  default: 'the strictest of the regimes above, applied everywhere else',
};

/** EU and EEA. One regime, because GDPR is one regulation. */
const EEA = [
  'AT',
  'BE',
  'BG',
  'CY',
  'CZ',
  'DE',
  'DK',
  'EE',
  'ES',
  'FI',
  'FR',
  'GR',
  'HR',
  'HU',
  'IE',
  'IS',
  'IT',
  'LI',
  'LT',
  'LU',
  'LV',
  'MT',
  'NL',
  'NO',
  'PL',
  'PT',
  'RO',
  'SE',
  'SI',
  'SK',
];

const BY_COUNTRY: Readonly<Record<string, Regime>> = {
  ...Object.fromEntries(EEA.map((code) => [code, 'eu' as const])),
  GB: 'uk',
  CH: 'ch',
  SA: 'sa',
  AE: 'ae',
  BH: 'gcc',
  KW: 'gcc',
  OM: 'gcc',
  QA: 'gcc',
  TR: 'tr',
  IN: 'in',
  CN: 'cn',
  BR: 'br',
  US: 'us',
  CA: 'ca',
};

/** Which policy a given country reads. Unknown and unmapped both fall through. */
export function regimeOf(country: string): Regime {
  return BY_COUNTRY[country.toUpperCase()] ?? 'default';
}

/**
 * The country's own name, in the reader's language.
 *
 * Falls back to the code rather than to English: a form listing "AE" is
 * obviously incomplete, and a form listing "United Arab Emirates" in the middle
 * of a Hindi page looks finished and is not.
 */
export function countryName(country: string, locale: string): string {
  const names = new Intl.DisplayNames([locale], { type: 'region', fallback: 'code' });
  return names.of(country.toUpperCase()) ?? country.toUpperCase();
}

/**
 * The country and language pair as it appears in a URL: `ae-ar`.
 *
 * Country first because that is the order the owner asked for, and it reads the
 * way a person says it. Lowercase both, because a URL that differs only by case
 * is two URLs to a crawler and one to a person.
 */
export function slugOf(country: string, language: string): string {
  return `${country.toLowerCase()}-${language.toLowerCase()}`;
}

export interface Audience {
  readonly country: string;
  readonly language: string;
}

/**
 * Reads `ae-ar` back, and refuses anything it does not recognise.
 *
 * Returns null rather than guessing. A slug naming a country we do not offer, or
 * a language we do not publish, must not silently fall back to another country's
 * policy page: that is the one failure in this file that would put the wrong law
 * in front of a reader.
 */
export function audienceOf(slug: string, languages: readonly string[]): Audience | null {
  const match = /^([a-z]{2})-([a-z]{2})$/.exec(slug);
  if (match === null) return null;
  const country = (match[1] ?? '').toUpperCase();
  const language = match[2] ?? '';
  if (!COUNTRIES.includes(country)) return null;
  if (!languages.includes(language)) return null;
  return { country, language };
}
