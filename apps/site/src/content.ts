// The copy, both languages, written and not translated by a machine.
//
// DISCOVERABILITY section 6 forbids machine translated Arabic outright, and the
// reason is not style: this product's whole claim is that it works in Arabic,
// and a page whose Arabic reads like a translation says the opposite before a
// single feature is read. So neither language here is a rendering of the other.
// The English page is shorter on purpose, because its reader is deciding
// whether this is for them, and the Arabic reader is deciding whether to trust
// it on Monday morning.
//
// Section 6 also forbids redirecting a visitor by `Accept-Language`, which is
// why nothing in this generator emits a redirect: a crawler arrives with no
// language preference and would be bounced away from every Arabic page it was
// sent to look at.

import type { Evidence } from './evidence';

export const LOCALES = ['ar', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

/** Arabic is the default, so a visitor with no match lands there. */
export const DEFAULT_LOCALE: Locale = 'ar';

export const SITE = 'https://transferchecker.com';

export interface Feature {
  readonly title: string;
  readonly body: string;
}

export interface Copy {
  readonly dir: 'rtl' | 'ltr';
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly tagline: string;
  readonly lede: string;
  readonly stepsTitle: string;
  readonly steps: readonly string[];
  readonly featuresTitle: string;
  readonly features: readonly Feature[];
  readonly accuracyTitle: string;
  /** Filled from the measurement, never typed by hand. */
  readonly accuracy: (evidence: Evidence) => string;
  readonly privacyTitle: string;
  readonly privacy: string;
  readonly scopeTitle: string;
  readonly scope: string;
  readonly pricingTitle: string;
  readonly pricing: readonly Feature[];
  readonly pricingNote: string;
  readonly otherLanguage: string;
}

const percent = (value: number): string => `${(value * 100).toFixed(1)}%`;

export const COPY: Readonly<Record<Locale, Copy>> = {
  ar: {
    dir: 'rtl',
    name: 'TransferChecker',
    title: 'TransferChecker: تصحيح أوراق الإجابة بالجوال، عربي أولاً',
    description:
      'صمّم ورقة إجابة، اطبعها PDF، صوّرها بجوالك، واحصل على الدرجة فوراً. يعمل بلا إنترنت، ولا تغادر صور طلابك جهازك.',
    tagline: 'ورقة، وجوال، ودرجة فورية',
    lede: 'تصمّم ورقة الإجابة وتطبعها، ويصوّرها المعلم بجواله، فتظهر الدرجة في ثوانٍ. يعمل التطبيق بلا إنترنت كاملاً، والمعالجة كلها على الجهاز.',
    stepsTitle: 'ثلاث خطوات',
    steps: [
      'اختر قالباً جاهزاً بعشرين أو خمسين أو مئة سؤال، أو صمّم ورقتك سؤالاً سؤالاً.',
      'اطبع ملف PDF بمقياس 100٪، وابنِ المفتاح بالنقر أو بمسح ورقة محلولة.',
      'صوّر أوراق الفصل واحدة تلو الأخرى، وصدّر النتائج إلى Excel.',
    ],
    featuresTitle: 'ما الذي يميّزه',
    features: [
      {
        title: 'عربي في الورقة نفسها',
        body: 'حروف الفقاعات عربية أو لاتينية، والتسميات بأي لغة، والتشكيل صحيح في ملف الطباعة لأن التنضيد يشكّل العربية فعلاً لا يقاربها.',
      },
      {
        title: 'الورقة تصف نفسها',
        body: 'الكود المطبوع على الورقة يحمل هندستها كاملة، فجهاز لم يرَ القالب من قبل يصحّحها بلا إنترنت وبلا حساب.',
      },
      {
        title: 'لا يخمّن أبداً',
        body: 'الفقاعة بين العتبتين تُعرَض للمعلم ولا تُحسم بصمت، والفريم الذي أفسده الوهج يُرفض بسببٍ مسمّى بدل أن يُقرأ ناقصاً.',
      },
      {
        title: 'تحليل الفقرات ووسوم المعايير',
        body: 'أي سؤال كان صعباً، وأي مشتّت سحب الأقوياء، وكيف أدى طلابك في «الكسور». ويُنبَّه المعلم إلى مفتاح يبدو خاطئاً قبل أن يصحّح الفصل غلطاً.',
      },
    ],
    accuracyTitle: 'أرقامنا، بمنهجيتها',
    accuracy: (evidence) =>
      evidence.accuracy === null
        ? `لم نقس دقتنا على ورق حقيقي بعد، ولن نعلن رقماً قبل ذلك. المحرك اليوم مُختبَر على ${String(evidence.cases)} حالة و${String(evidence.questions)} سؤالاً من أوراق يرسمها الاختبار نفسه: يبرهن ذلك أن كل دفاع مسمّى يعمل، ولا يبرهن رقم دقة على ورق. تُعلَن الدقة حين تُصوَّر ${String(evidence.papersNeeded)} ورقة مطبوعة على الأقل، وتُعلَن معها نسبة الرفض ونسبة التحذير، لأن دقة عالية بجانب رفض مرتفع هي الكذبة نفسها.`
        : `الدقة ${percent(evidence.accuracy)} لكل سؤال على المجموعة الذهبية، وتُنشر معها نسبة الرفض ونسبة التحذير دائماً. الوحدة السؤال لا الفقاعة ولا الورقة، والفرق بين القراءات الثلاث مئتان وخمسون ضعفاً على ورقة من خمسين سؤالاً.`,
    privacyTitle: 'صور طلابك لا تغادر جهازك',
    privacy:
      'المعالجة كلها على الجهاز، ولا تُرفع صورة ولا تُكتب على القرص. والورقة تعيد إنتاج درجتها من سجلها، فلا حاجة إلى الاحتفاظ بصورة أصلاً.',
    scopeTitle: 'أين يُستخدم',
    scope:
      'للاختبارات التكوينية الصفّية والواجبات والاختبارات القصيرة. الحظر النظامي في السعودية على التصحيح بتطبيقات الجوال محدود النطاق ولا يشمل هذا الاستخدام، ونقول ذلك قبل الإطلاق لا بعده.',
    pricingTitle: 'الباقات',
    pricing: [
      { title: 'مجانية', body: 'مئة ورقة في الشهر، وكل الميزات بلا استثناء.' },
      { title: 'Pro', body: 'بلا حد للأوراق، وكل الميزات نفسها. الفارق الوحيد عدّاد.' },
    ],
    pricingNote:
      'صفر ميزات محجوبة: العمل بلا إنترنت والمزامنة وتحليل الفقرات والتصدير والنماذج المخصصة متاحة في المجانية. والفوترة غير متجددة، فلا خصم تلقائي.',
    otherLanguage: 'English',
  },
  en: {
    dir: 'ltr',
    name: 'TransferChecker',
    title: 'TransferChecker: mark answer sheets with a phone, Arabic first',
    description:
      'Design an answer sheet, print it, photograph it with your phone, and get the mark at once. Works offline, and your students photographs never leave the device.',
    tagline: 'A sheet, a phone, and a mark',
    lede: 'Design and print the answer sheet, photograph it with a phone, and the mark appears in seconds. The app works fully offline and every pixel is processed on the device.',
    stepsTitle: 'Three steps',
    steps: [
      'Start from a 20, 50 or 100 question template, or build your own sheet question by question.',
      'Print the PDF at 100 percent, then build the key by tapping or by scanning a solved sheet.',
      'Photograph the class one paper at a time and export the results to Excel.',
    ],
    featuresTitle: 'What is different',
    features: [
      {
        title: 'Arabic on the sheet itself',
        body: 'Bubble symbols in Arabic or Latin, labels in any language, and correct shaping in the printed file, because the typesetter really shapes Arabic rather than approximating it.',
      },
      {
        title: 'The sheet describes itself',
        body: 'The printed code carries the sheet geometry in full, so a device that has never seen the template marks it with no network and no account.',
      },
      {
        title: 'It never guesses',
        body: 'A bubble between the thresholds is shown to the teacher instead of being settled quietly, and a frame that glare destroyed is refused by a named cause rather than read short.',
      },
      {
        title: 'Item analysis and standard tags',
        body: 'Which question was hard, which distractor pulled the strong students, and how your class did on fractions. A key that looks wrong is flagged before it marks a whole class wrong.',
      },
    ],
    accuracyTitle: 'Our numbers, with their method',
    accuracy: (evidence) =>
      evidence.accuracy === null
        ? `We have not measured our accuracy on real paper yet, and we will not publish a figure before we have. The engine is tested today on ${String(evidence.cases)} cases and ${String(evidence.questions)} questions drawn by the test itself, which proves every named defense still works and proves nothing about paper. The figure is published once at least ${String(evidence.papersNeeded)} printed sheets have been photographed, and it is published together with the refusal and warning rates, because a high accuracy beside a high refusal rate is the same lie.`
        : `${percent(evidence.accuracy)} per question on the golden set, always published together with the refusal and warning rates. The unit is the question, not the bubble and not the paper, and those three readings are 250 to 1 apart on a fifty question sheet.`,
    privacyTitle: 'Photographs stay on the device',
    privacy:
      'Everything is processed on the device. No image is uploaded and none is written to disk. A sheet reproduces its own mark from its record, so there is nothing to keep.',
    scopeTitle: 'Where it is used',
    scope:
      'For classroom formative assessment, homework and quizzes. The Saudi restriction on marking with mobile applications is limited in scope and does not cover this use, and we say so before launch rather than after.',
    pricingTitle: 'Plans',
    pricing: [
      { title: 'Free', body: 'One hundred papers a month, and every feature without exception.' },
      {
        title: 'Pro',
        body: 'No paper limit, and the same features. The only difference is a counter.',
      },
    ],
    pricingNote:
      'Nothing is gated: offline use, sync, item analysis, export and custom sheets are all in the free plan. Billing does not auto renew.',
    otherLanguage: 'العربية',
  },
};
