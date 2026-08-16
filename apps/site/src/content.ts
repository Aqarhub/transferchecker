// The copy, one entry per language, none of them a rendering of another.
//
// DISCOVERABILITY section 6 forbids machine translated Arabic outright, and the
// reason is not style: this product's whole claim is that it works in Arabic,
// and a page whose Arabic reads like a translation says the opposite before a
// single feature is read. So neither of the two owner written languages here is
// a rendering of the other. The English page is shorter on purpose, because its
// reader is deciding whether this is for them, and the Arabic reader is deciding
// whether to trust it on Monday morning.
//
// The other six are marked `source: 'editorial'` in `locales.ts`: written for
// this repository against a researched rule set per language, read again by a
// pass whose brief was to find what was still wrong, then checked across all
// eight for parallelism and terminology. They ship. What that flag buys is that
// a future reader can tell which sentences came from the owner's hand, which
// matters most for the two that must never be regenerated.
//
// Section 6 also forbids redirecting a visitor by `Accept-Language`, which is
// why nothing in this generator emits a redirect: a crawler arrives with no
// language preference and would be bounced away from every Arabic page it was
// sent to look at.
//
// ONE MORE RULE LIVES HERE, in `steps`. Only Arabic and English name the print
// scale as a percentage, and the other six say "at real size, not fit to page"
// instead. That is not a translation gap: `test/claims.test.ts` exempts exactly
// two strings from its no percentages rule, and a third exemption in a seventh
// language is the hole a future "100% accurate" would eventually walk through.

import { DEFAULT_LOCALE, LOCALES, LOCALE_INFO, OWNER_WRITTEN, localeOf } from './locales';
import type { CopySource, Locale, LocaleInfo } from './locales';
import type { Evidence } from './evidence';

export { DEFAULT_LOCALE, LOCALES, LOCALE_INFO, OWNER_WRITTEN, localeOf };
export type { CopySource, Locale, LocaleInfo };

export const SITE = 'https://transferchecker.com';

export interface Feature {
  readonly title: string;
  readonly body: string;
}

export interface Copy {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  /** One sentence saying what the thing is. The blockquote of llms.txt. */
  readonly summary: string;
  readonly tagline: string;
  readonly lede: string;
  readonly stepsTitle: string;
  readonly steps: readonly string[];
  readonly featuresTitle: string;
  readonly features: readonly Feature[];
  readonly accuracyTitle: string;
  /** Filled from the measurement, never typed by hand. */
  readonly accuracy: (evidence: Evidence) => string;
  /**
   * This language's words for refusal and for warning.
   *
   * Acceptance criterion 14 says an accuracy is never published without both
   * rates beside it, and that has to be checkable in eight languages by a test
   * that does not itself speak eight languages. So the words are declared here
   * and the test asserts the accuracy sentence contains them.
   */
  readonly rateWords: readonly [string, string];
  /** This language for "per question", the unit the accuracy is quoted in. */
  readonly unitWord: string;
  readonly privacyTitle: string;
  readonly privacy: string;
  readonly scopeTitle: string;
  readonly scope: string;
  readonly pricingTitle: string;
  readonly pricing: readonly Feature[];
  readonly pricingNote: string;
  readonly languagesTitle: string;
  /** This language for "page", which heads the link list in llms.txt. */
  readonly pageWord: string;
  /** How this language joins a short list inline. */
  readonly listSeparator: string;
}

/**
 * The measured figure, quoted the way the report writes it in every language.
 *
 * A comma decimal would be the local convention in French, German, Spanish and
 * Turkish, and it is deliberately not used: this is one number produced by one
 * gate, and a reader comparing the German page against the golden report should
 * be reading the same characters. Prose is localised; a measurement identifier
 * is quoted.
 */
const percent = (value: number): string => `${(value * 100).toFixed(1)}%`;

export const COPY: Readonly<Record<Locale, Copy>> = {
  ar: {
    name: 'TransferChecker',
    title: 'TransferChecker: تصحيح أوراق الإجابة بالجوال، عربي أولاً',
    description:
      'صمّم ورقة إجابة، اطبعها PDF، صوّرها بجوالك، واحصل على الدرجة فوراً. يعمل بلا إنترنت، ولا تغادر صور طلابك جهازك.',
    summary:
      'تطبيق جوال يصحّح أوراق الإجابة الورقية بالكاميرا، عربي أولاً، يعمل بلا إنترنت، وكل المعالجة على الجهاز.',
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
    rateWords: ['الرفض', 'التحذير'],
    unitWord: 'لكل سؤال',
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
    languagesTitle: 'اللغات',
    pageWord: 'الصفحة',
    listSeparator: '، ',
  },

  en: {
    name: 'TransferChecker',
    title: 'TransferChecker: mark answer sheets with a phone, Arabic first',
    description:
      'Design an answer sheet, print it, photograph it with a phone, get the mark at once. Works offline, and pupils’ photographs never leave the device.',
    summary:
      'A mobile app that marks printed answer sheets with the camera, Arabic first, fully offline, with every pixel processed on the device.',
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
    rateWords: ['refusal', 'warning'],
    unitWord: 'per question',
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
    languagesTitle: 'Languages',
    pageWord: 'Page',
    listSeparator: ', ',
  },

  de: {
    name: 'TransferChecker',
    title: 'TransferChecker: Antwortbögen mit dem Handy korrigieren',
    description:
      'Antwortbogen als PDF drucken, mit dem Handy abfotografieren, Ergebnis in Sekunden. Läuft offline, die Fotos bleiben auf dem Gerät.',
    summary:
      'Eine Handy-App, die gedruckte Antwortbögen mit der Kamera korrigiert, Arabisch zuerst, vollständig offline und mit der gesamten Verarbeitung auf dem Gerät.',
    tagline: 'Ein Bogen, ein Handy, das Ergebnis',
    lede: 'Sie entwerfen den Antwortbogen, drucken ihn aus und fotografieren jeden Bogen mit dem Handy. Das Ergebnis steht in Sekunden. Die App arbeitet vollständig offline, und die gesamte Verarbeitung findet auf dem Gerät statt.',
    stepsTitle: 'Drei Schritte',
    steps: [
      'Beginnen Sie mit einer Vorlage für 20, 50 oder 100 Fragen, oder setzen Sie den Bogen Frage für Frage selbst zusammen.',
      'Drucken Sie das PDF in Originalgröße, nicht an die Seite angepasst. Den Lösungsbogen legen Sie durch Antippen an oder scannen einen gelösten Bogen ein.',
      'Fotografieren Sie die Klasse Bogen für Bogen und exportieren Sie die Ergebnisse nach Excel.',
    ],
    featuresTitle: 'Was anders ist',
    features: [
      {
        title: 'Arabisch auf dem Bogen selbst',
        body: 'Die Zeichen in den Antwortfeldern sind arabisch oder lateinisch, die Beschriftungen stehen in jeder beliebigen Sprache. In der Druckdatei verbinden sich die arabischen Buchstaben richtig, weil der Satz die Schrift wirklich formt und nicht nachahmt.',
      },
      {
        title: 'Der Bogen beschreibt sich selbst',
        body: 'Der aufgedruckte Code trägt die gesamte Geometrie des Bogens. Ein Gerät, das die Vorlage nie gesehen hat, korrigiert ihn ohne Netz und ohne Konto.',
      },
      {
        title: 'Nichts wird geraten',
        body: 'Liegt die Schwärzung eines Feldes zwischen den beiden Schwellen, legt die App es Ihnen vor, statt still zu entscheiden. Ein Bild, das eine Spiegelung unbrauchbar macht, wird mit benanntem Grund abgelehnt und nicht unvollständig ausgewertet.',
      },
      {
        title: 'Aufgabenanalyse und Kompetenzen',
        body: 'Welche Aufgabe schwer war, welche falsche Antwortoption die starken Schülerinnen und Schüler angezogen hat und wie die Klasse beim Thema „Brüche“ abgeschnitten hat. Einen Lösungsbogen, der falsch aussieht, meldet die App, bevor er eine ganze Klasse falsch bewertet.',
      },
    ],
    accuracyTitle: 'Unsere Zahlen, mit ihrer Methode',
    accuracy: (evidence) =>
      evidence.accuracy === null
        ? `Wir haben unsere Genauigkeit noch nicht auf echtem Papier gemessen und veröffentlichen bis dahin keine Zahl. Geprüft ist die Engine heute an ${String(evidence.cases)} Fällen und ${String(evidence.questions)} Fragen, die der Test selbst zeichnet: das belegt, dass jede benannte Absicherung greift, und belegt nichts über Papier. Die Zahl erscheint, sobald mindestens ${String(evidence.papersNeeded)} gedruckte Bögen fotografiert wurden, und sie erscheint zusammen mit der Ablehnungsquote und der Warnquote, denn eine hohe Genauigkeit neben einer hohen Ablehnungsquote ist dieselbe Lüge.`
        : `${percent(evidence.accuracy)} pro Frage auf dem Goldstandard-Datensatz, immer zusammen mit der Ablehnungsquote und der Warnquote veröffentlicht. Gemessen wird pro Frage, nicht pro Feld und nicht pro Bogen: auf einem Bogen mit fünfzig Fragen liegen diese drei Lesarten um das 250-Fache auseinander.`,
    rateWords: ['Ablehnungsquote', 'Warnquote'],
    unitWord: 'pro Frage',
    privacyTitle: 'Die Fotos bleiben auf dem Gerät',
    privacy:
      'Alles wird auf dem Gerät verarbeitet. Kein Bild wird hochgeladen, und keines wird gespeichert. Ein Bogen erzeugt sein Ergebnis aus seinem Datensatz neu, es gibt also nichts aufzubewahren.',
    scopeTitle: 'Wofür es gedacht ist',
    scope:
      'Für Lernstandserhebungen im Unterricht, für Hausaufgaben und kurze Tests. Die saudische Beschränkung für das Korrigieren mit Handy-Apps ist im Umfang begrenzt und deckt diesen Einsatz nicht ab. Wir sagen das vor dem Start und nicht danach.',
    pricingTitle: 'Tarife',
    pricing: [
      { title: 'Kostenlos', body: 'Hundert Bögen im Monat, mit allen Funktionen ohne Ausnahme.' },
      {
        title: 'Pro',
        body: 'Keine Begrenzung der Bögen, und dieselben Funktionen. Der einzige Unterschied ist ein Zähler.',
      },
    ],
    pricingNote:
      'Keine Funktion ist gesperrt: Offline-Betrieb, Synchronisierung, Aufgabenanalyse, Export und eigene Bögen gehören zum kostenlosen Tarif. Die Abrechnung verlängert sich nicht automatisch.',
    languagesTitle: 'Sprachen',
    pageWord: 'Seite',
    listSeparator: ', ',
  },

  es: {
    name: 'TransferChecker',
    title: 'TransferChecker: corregir exámenes con el teléfono',
    description:
      'La hoja de respuestas se imprime en PDF y se fotografía con el teléfono. La nota sale en segundos, sin conexión y sin subir ninguna foto.',
    summary:
      'Una aplicación móvil que corrige con la cámara hojas de respuestas impresas de opción múltiple, pensada primero para el árabe, sin conexión y con todo el procesamiento en el dispositivo.',
    tagline: 'Una hoja, un teléfono y la nota',
    lede: 'La hoja de respuestas de lectura óptica se diseña y se imprime desde la aplicación. Se fotografía con el teléfono y la nota aparece en segundos, sin conexión y sin que ninguna imagen salga del dispositivo.',
    stepsTitle: 'Tres pasos',
    steps: [
      'Se parte de una plantilla de 20, 50 o 100 preguntas, o se diseña la hoja pregunta a pregunta.',
      'Se imprime el PDF a tamaño real, sin ajustar a la página, y la clave de respuestas se crea tocando las opciones o escaneando una hoja ya contestada.',
      'Se fotografían los exámenes de la clase uno a uno y los resultados se exportan a Excel.',
    ],
    featuresTitle: '¿Qué lo hace distinto?',
    features: [
      {
        title: 'Árabe en la propia hoja',
        body: 'Las burbujas se rotulan con letras árabes o latinas y las etiquetas van en cualquier idioma. En el PDF el árabe sale con sus letras enlazadas de verdad, porque la composición las forma en lugar de aproximarlas.',
      },
      {
        title: 'La hoja se describe a sí misma',
        body: 'El código impreso en la hoja lleva toda su geometría, así que un teléfono que no ha visto nunca la plantilla la corrige igual, sin conexión y sin cuenta.',
      },
      {
        title: 'Nunca adivina',
        body: 'Una burbuja cuya marca queda entre los dos umbrales se le muestra al docente en lugar de resolverse en silencio, y una foto que el reflejo ha estropeado se rechaza indicando el motivo, en vez de leerse a medias.',
      },
      {
        title: 'Análisis de ítems y etiquetas por criterio',
        body: 'Qué pregunta resultó difícil, qué distractor se llevó a los mejores alumnos y cómo fue la clase en «fracciones». Si la clave parece equivocada, aparece el aviso antes de que corrija mal a toda la clase.',
      },
    ],
    accuracyTitle: 'Nuestros números, con su método',
    accuracy: (evidence) =>
      evidence.accuracy === null
        ? `Todavía no hemos medido la exactitud en papel real y no publicaremos ninguna cifra hasta hacerlo. Hoy el motor está probado con ${String(evidence.cases)} casos y ${String(evidence.questions)} preguntas que genera la propia prueba: eso demuestra que cada una de las defensas que nombramos funciona, y no demuestra nada sobre papel. La cifra se publicará cuando se hayan fotografiado al menos ${String(evidence.papersNeeded)} hojas impresas, y saldrá siempre junto a la tasa de rechazo y la tasa de aviso, porque una exactitud alta al lado de una tasa de rechazo alta es la misma mentira.`
        : `Exactitud de ${percent(evidence.accuracy)} por pregunta en el conjunto de referencia, publicada siempre junto a la tasa de rechazo y la tasa de aviso. La unidad es la pregunta, no la burbuja ni la hoja: entre esas tres lecturas hay una diferencia de 250 a 1 en una hoja de cincuenta preguntas.`,
    rateWords: ['rechazo', 'aviso'],
    unitWord: 'por pregunta',
    privacyTitle: 'Las fotos de los alumnos no salen del dispositivo',
    privacy:
      'Todo el procesamiento ocurre en el dispositivo. Ninguna imagen se sube y ninguna se escribe en disco. Cada hoja reproduce su propia nota a partir de su registro, así que no queda nada que guardar.',
    scopeTitle: '¿Dónde se usa?',
    scope:
      'Para evaluación formativa en el aula, tareas y pruebas cortas. La restricción saudí sobre la corrección con aplicaciones móviles tiene un alcance limitado y no cubre este uso, y lo decimos antes del lanzamiento, no después.',
    pricingTitle: 'Planes',
    pricing: [
      { title: 'Gratis', body: 'Cien hojas al mes, con todas las funciones sin excepción.' },
      {
        title: 'Pro',
        body: 'Sin límite de hojas y las mismas funciones. La única diferencia es un contador.',
      },
    ],
    pricingNote:
      'No hay nada bloqueado: el uso sin conexión, la sincronización, el análisis de ítems, la exportación y las hojas personalizadas entran en el plan gratuito. La facturación no se renueva sola.',
    languagesTitle: 'Idiomas',
    pageWord: 'Página',
    listSeparator: ', ',
  },

  fr: {
    name: 'TransferChecker',
    title: 'TransferChecker : corriger les QCM papier au téléphone',
    description:
      'Imprimez la grille, photographiez les copies, la note tombe en quelques secondes. Hors ligne, rien ne quitte le téléphone.',
    summary:
      'Une application mobile qui corrige les grilles de réponses imprimées avec l’appareil photo, l’arabe d’abord, entièrement hors ligne, tout le traitement se faisant sur le téléphone.',
    tagline: 'Une copie, un téléphone, une note',
    lede: 'Vous concevez la grille de réponses et vous l’imprimez. L’élève la remplit, vous la photographiez, et la note apparaît en quelques secondes. Tout fonctionne hors ligne, et le traitement se fait entièrement sur le téléphone.',
    stepsTitle: 'Trois étapes',
    steps: [
      'Partez d’un modèle de 20, 50 ou 100 questions, ou composez votre grille question par question.',
      'Imprimez le PDF à taille réelle, sans ajuster à la page, puis saisissez le corrigé en touchant les cases ou en scannant une grille remplie avec les bonnes réponses.',
      'Photographiez la classe copie par copie, puis exportez les résultats vers Excel.',
    ],
    featuresTitle: 'Ce qui change',
    features: [
      {
        title: 'L’arabe sur la grille elle-même',
        body: 'Les repères des cases en arabe ou en latin, les libellés dans la langue de votre choix, et des lettres arabes correctement liées à l’impression : le fichier compose réellement l’arabe au lieu d’en donner une approximation.',
      },
      {
        title: 'La grille se décrit elle-même',
        body: 'Le code imprimé porte toute la géométrie de la grille. Un téléphone qui n’a jamais vu le modèle la corrige quand même, sans réseau et sans compte.',
      },
      {
        title: 'Il ne devine jamais',
        body: 'Une case dont le noircissement tombe entre les deux seuils vous est montrée au lieu d’être tranchée en silence. Et une photo gâchée par un reflet est refusée avec une cause nommée, jamais lue à moitié.',
      },
      {
        title: 'Analyse par question et par compétence',
        body: 'Quelle question a fait chuter la classe, quel distracteur a attiré les bons élèves, ce que donne la classe sur les fractions. Et un corrigé qui semble faux est signalé avant d’avoir mal noté toute une classe.',
      },
    ],
    accuracyTitle: 'Nos chiffres, avec leur méthode',
    accuracy: (evidence) =>
      evidence.accuracy === null
        ? `Nous n’avons pas encore mesuré notre précision sur du vrai papier, et nous ne publierons aucun chiffre avant de l’avoir fait. Le moteur est aujourd’hui éprouvé sur ${String(evidence.cases)} cas et ${String(evidence.questions)} questions que le test tire lui-même : cela démontre que chaque défense nommée tient, et cela ne démontre rien sur du papier. Le chiffre paraîtra quand au moins ${String(evidence.papersNeeded)} grilles imprimées auront été photographiées, et il paraîtra avec le taux de refus et le taux d’avertissement, parce qu’une précision élevée posée à côté d’un refus élevé, c’est le même mensonge.`
        : `${percent(evidence.accuracy)} par question sur le jeu de référence. Ce chiffre ne paraît jamais seul : il est publié avec le taux de refus et le taux d’avertissement. L’unité est la question, pas la case et pas la copie, et sur une grille de cinquante questions ces trois lectures sont séparées par un facteur 250.`,
    rateWords: ['taux de refus', 'taux d’avertissement'],
    unitWord: 'par question',
    privacyTitle: 'Les photos ne quittent pas le téléphone',
    privacy:
      'Tout est traité sur le téléphone. Aucune image n’est envoyée, aucune n’est écrite sur le disque. Une copie reproduit sa note à partir de son enregistrement : il n’y a donc rien à conserver.',
    scopeTitle: 'Où il s’utilise',
    scope:
      'Pour l’évaluation formative en classe, les devoirs et les interrogations courtes. La restriction saoudienne sur la correction par application mobile est de portée limitée et ne couvre pas cet usage ; nous le disons avant le lancement, pas après.',
    pricingTitle: 'Formules',
    pricing: [
      { title: 'Gratuite', body: 'Cent copies par mois, et toutes les fonctions, sans exception.' },
      {
        title: 'Pro',
        body: 'Plus aucune limite de copies, et exactement les mêmes fonctions. La seule différence est un compteur.',
      },
    ],
    pricingNote:
      'Rien n’est verrouillé : le hors ligne, la synchronisation, l’analyse par question, l’export et les grilles sur mesure sont dans la formule gratuite. Et la facturation ne se reconduit pas toute seule.',
    languagesTitle: 'Langues',
    pageWord: 'Page',
    listSeparator: ', ',
  },

  hi: {
    name: 'TransferChecker',
    title: 'TransferChecker: फ़ोन से उत्तर पत्रक जाँचें, पहले अरबी',
    description:
      'उत्तर पत्रक बनाइए, PDF छापिए, फ़ोन से उसकी तस्वीर लीजिए, और अंक तुरंत पाइए। बिना इंटरनेट चलता है, और विद्यार्थियों की तस्वीरें उपकरण से बाहर नहीं जातीं',
    summary:
      'एक मोबाइल ऐप जो कैमरे से छपे हुए उत्तर पत्रक जाँचता है, पहले अरबी में, पूरी तरह बिना इंटरनेट, और सारी प्रोसेसिंग उपकरण पर ही होती है।',
    tagline: 'एक पत्रक, एक फ़ोन, और तुरंत अंक',
    lede: 'आप उत्तर पत्रक बनाते और छापते हैं, शिक्षक उसे फ़ोन से खींचता है, और अंक सेकंडों में सामने आ जाते हैं। ऐप पूरी तरह बिना इंटरनेट चलता है और हर पिक्सल उपकरण पर ही संसाधित होता है।',
    stepsTitle: 'तीन चरण',
    steps: [
      '20, 50 या 100 प्रश्नों के तैयार साँचे से शुरू कीजिए, या अपना पत्रक प्रश्न दर प्रश्न बनाइए।',
      'PDF को वास्तविक आकार में छापिए, पृष्ठ पर फ़िट किए बिना, फिर छूकर या हल किया हुआ पत्रक स्कैन करके उत्तर कुंजी बनाइए।',
      'कक्षा के पत्रक एक एक करके खींचिए और परिणाम Excel में निर्यात कीजिए।',
    ],
    featuresTitle: 'क्या अलग है',
    features: [
      {
        title: 'अरबी पत्रक पर ही',
        body: 'गोलों के चिह्न अरबी या लातीनी, नाम किसी भी भाषा में, और छपाई की फ़ाइल में सही अक्षर जुड़ाव, क्योंकि टाइपसेटिंग अरबी को सचमुच जोड़ती है, उसका अनुमान नहीं लगाती।',
      },
      {
        title: 'पत्रक अपना परिचय स्वयं देता है',
        body: 'पत्रक पर छपा कोड उसकी पूरी ज्यामिति रखता है, इसलिए जिस उपकरण ने वह साँचा कभी देखा ही नहीं, वह भी उसे बिना नेटवर्क और बिना खाते के जाँच लेता है।',
      },
      {
        title: 'यह कभी अनुमान नहीं लगाता',
        body: 'दो सीमाओं के बीच पड़ा गोला चुपचाप तय करने के बजाय शिक्षक को दिखाया जाता है, और चमक से बिगड़ा फ़्रेम अधूरा पढ़ने के बजाय नामित कारण के साथ अस्वीकार कर दिया जाता है।',
      },
      {
        title: 'प्रश्न विश्लेषण और मानक टैग',
        body: 'कौन सा प्रश्न कठिन था, किस विकल्प ने अच्छे विद्यार्थियों को खींचा, और भिन्नों में आपकी कक्षा कैसी रही। जो कुंजी ग़लत लगती है उसे पूरी कक्षा ग़लत जाँचे जाने से पहले चिह्नित कर दिया जाता है।',
      },
    ],
    accuracyTitle: 'हमारे आँकड़े, अपनी विधि के साथ',
    accuracy: (evidence) =>
      evidence.accuracy === null
        ? `हमने अभी असली काग़ज़ पर अपनी शुद्धता नापी नहीं है, और उससे पहले कोई आँकड़ा प्रकाशित नहीं करेंगे। इंजन आज ${String(evidence.cases)} स्थितियों और ${String(evidence.questions)} प्रश्नों पर परखा गया है जिन्हें परीक्षण स्वयं बनाता है: इससे यह सिद्ध होता है कि हर नामित बचाव काम करता है, काग़ज़ पर शुद्धता का कोई आँकड़ा सिद्ध नहीं होता। यह आँकड़ा तब प्रकाशित होगा जब कम से कम ${String(evidence.papersNeeded)} छपे हुए पत्रक खींचे जा चुके हों, और वह अस्वीकृति दर तथा चेतावनी दर के साथ ही प्रकाशित होगा, क्योंकि ऊँची अस्वीकृति दर के बग़ल में ऊँची शुद्धता वही झूठ है।`
        : `स्वर्ण संग्रह पर प्रति प्रश्न ${percent(evidence.accuracy)}, और यह सदा अस्वीकृति दर तथा चेतावनी दर के साथ ही प्रकाशित होती है। इकाई प्रश्न है, न गोला और न पत्रक, और पचास प्रश्नों के पत्रक पर ये तीनों पाठ 250 गुना अलग पड़ते हैं।`,
    rateWords: ['अस्वीकृति दर', 'चेतावनी दर'],
    unitWord: 'प्रति प्रश्न',
    privacyTitle: 'तस्वीरें उपकरण से बाहर नहीं जातीं',
    privacy:
      'सब कुछ उपकरण पर ही संसाधित होता है। कोई तस्वीर न अपलोड होती है और न डिस्क पर लिखी जाती है। पत्रक अपने रिकॉर्ड से अपना अंक फिर से बना लेता है, इसलिए रखने को कुछ है ही नहीं।',
    scopeTitle: 'कहाँ काम आता है',
    scope:
      'कक्षा के रचनात्मक मूल्यांकन, गृहकार्य और छोटी परीक्षाओं के लिए। मोबाइल ऐप से जाँच पर सऊदी प्रतिबंध सीमित दायरे का है और इस उपयोग को नहीं ढकता, और हम यह बात लॉन्च के बाद नहीं, पहले कह रहे हैं।',
    pricingTitle: 'योजनाएँ',
    pricing: [
      { title: 'निःशुल्क', body: 'महीने में सौ पत्रक, और हर सुविधा बिना किसी अपवाद के।' },
      {
        title: 'Pro',
        body: 'पत्रकों की कोई सीमा नहीं, और वही सुविधाएँ। अंतर केवल एक गिनती का है।',
      },
    ],
    pricingNote:
      'कुछ भी रोका नहीं गया है: बिना इंटरनेट काम, समन्वयन, प्रश्न विश्लेषण, निर्यात और अपने बनाए पत्रक, सब निःशुल्क योजना में हैं। बिल अपने आप नवीनीकृत नहीं होता।',
    languagesTitle: 'भाषाएँ',
    pageWord: 'पृष्ठ',
    listSeparator: ', ',
  },

  tr: {
    name: 'TransferChecker',
    title: 'TransferChecker: cevap kağıtlarını telefonla okuyun, önce Arapça',
    description:
      'Cevap kağıdını tasarlayın, PDF olarak yazdırın, telefonla fotoğraflayın, notu anında alın. İnternetsiz çalışır ve fotoğraflar cihazdan çıkmaz.',
    summary:
      'Basılı cevap kağıtlarını kamerayla okuyan bir telefon uygulaması. Önce Arapça, tümüyle çevrimdışı, ve bütün işlem cihazın kendisinde.',
    tagline: 'Bir kağıt, bir telefon, anında not',
    lede: 'Cevap kağıdını tasarlayıp yazdırırsınız, öğretmen telefonuyla fotoğraflar, ve not saniyeler içinde çıkar. Uygulama tümüyle çevrimdışı çalışır ve her piksel cihazda işlenir.',
    stepsTitle: 'Üç adım',
    steps: [
      '20, 50 veya 100 soruluk hazır bir şablonla başlayın, ya da kağıdınızı soru soru kendiniz kurun.',
      'PDF dosyasını gerçek boyutta, sayfaya sığdırmadan yazdırın, sonra cevap anahtarını dokunarak veya çözülmüş bir kağıdı tarayarak oluşturun.',
      'Sınıfın kağıtlarını tek tek fotoğraflayın ve sonuçları Excel dosyasına aktarın.',
    ],
    featuresTitle: 'Farkı ne',
    features: [
      {
        title: 'Arapça kağıdın kendisinde',
        body: 'Baloncuk simgeleri Arap veya Latin harfleriyle, etiketler herhangi bir dilde, ve baskı dosyasında doğru harf bitişmesi, çünkü dizgi Arapçayı gerçekten bitiştirir, yaklaştırmaz.',
      },
      {
        title: 'Kağıt kendini anlatır',
        body: 'Kağıda basılan kod onun bütün geometrisini taşır, böylece şablonu hiç görmemiş bir cihaz onu ağsız ve hesapsız okur.',
      },
      {
        title: 'Asla tahmin etmez',
        body: 'İki eşik arasında kalan baloncuk sessizce karara bağlanmaz, öğretmene gösterilir, ve parlamanın bozduğu kare eksik okunmak yerine adı konmuş bir gerekçeyle geri çevrilir.',
      },
      {
        title: 'Madde analizi ve kazanım etiketleri',
        body: 'Hangi soru zordu, hangi çeldirici güçlü öğrencileri çekti, ve sınıfınız kesirlerde nasıldı. Yanlış görünen bir anahtar, bütün sınıfı yanlış değerlendirmeden önce işaretlenir.',
      },
    ],
    accuracyTitle: 'Sayılarımız, yöntemiyle birlikte',
    accuracy: (evidence) =>
      evidence.accuracy === null
        ? `Doğruluğumuzu gerçek kağıt üzerinde henüz ölçmedik, ve ölçmeden önce bir sayı yayımlamayacağız. Motor bugün, testin kendi çizdiği ${String(evidence.cases)} durum ve ${String(evidence.questions)} soru üzerinde sınanıyor: bu, adı konmuş her savunmanın çalıştığını kanıtlar, kağıt üzerinde bir doğruluk oranını kanıtlamaz. Sayı, en az ${String(evidence.papersNeeded)} basılı kağıt fotoğraflandığında yayımlanır, ve ret oranı ile uyarı oranıyla birlikte yayımlanır, çünkü yüksek ret oranının yanındaki yüksek doğruluk aynı yalandır.`
        : `Altın küme üzerinde soru başına ${percent(evidence.accuracy)}, ve her zaman ret oranı ile uyarı oranıyla birlikte yayımlanır. Birim sorudur, baloncuk değil, kağıt da değil, ve elli soruluk bir kağıtta bu üç okuma arasında 250 kat fark vardır.`,
    rateWords: ['ret oranı', 'uyarı oranı'],
    unitWord: 'soru başına',
    privacyTitle: 'Fotoğraflar cihazdan çıkmaz',
    privacy:
      'Her şey cihazda işlenir. Hiçbir görüntü yüklenmez ve diske yazılmaz. Bir kağıt kendi notunu kendi kaydından yeniden üretir, dolayısıyla saklanacak bir şey yoktur.',
    scopeTitle: 'Nerede kullanılır',
    scope:
      'Sınıf içi biçimlendirici değerlendirme, ödev ve kısa sınavlar için. Suudi Arabistan’da telefon uygulamasıyla okumaya getirilen kısıt dar kapsamlıdır ve bu kullanımı içermez, ve bunu lansmandan sonra değil önce söylüyoruz.',
    pricingTitle: 'Paketler',
    pricing: [
      { title: 'Ücretsiz', body: 'Ayda yüz kağıt, ve istisnasız bütün özellikler.' },
      { title: 'Pro', body: 'Kağıt sınırı yok, ve aynı özellikler. Tek fark bir sayaç.' },
    ],
    pricingNote:
      'Hiçbir şey kilitli değil: çevrimdışı kullanım, eşitleme, madde analizi, dışa aktarma ve özel kağıtlar ücretsiz pakette. Fatura kendiliğinden yenilenmez.',
    languagesTitle: 'Diller',
    pageWord: 'Sayfa',
    listSeparator: ', ',
  },

  zh: {
    name: 'TransferChecker',
    title: 'TransferChecker：用手机批阅答题卡，阿拉伯语优先',
    description:
      '设计答题卡，打印成 PDF，用手机拍照，立刻得到分数。完全离线可用，学生的照片不会离开设备。',
    summary:
      '一款用摄像头批阅纸质答题卡的手机应用，阿拉伯语优先，完全离线，所有处理都在设备上完成。',
    tagline: '一张纸，一部手机，一个分数',
    lede: '你设计并打印答题卡，老师用手机拍照，分数在几秒内出现。应用完全离线运行，每一个像素都在设备上处理。',
    stepsTitle: '三个步骤',
    steps: [
      '从 20 题、50 题或 100 题的模板开始，也可以逐题设计自己的答题卡。',
      '按原始尺寸打印 PDF，不要缩放到页面大小，然后点选或扫描一张已作答的卡来建立答案。',
      '逐张给全班拍照，再把结果导出到 Excel。',
    ],
    featuresTitle: '有何不同',
    features: [
      {
        title: '阿拉伯语直接印在卡上',
        body: '选项符号可用阿拉伯字母或拉丁字母，标签可用任何语言，打印文件中的连写形状正确，因为排版是真正在连写阿拉伯语，而不是近似处理。',
      },
      {
        title: '答题卡自带说明',
        body: '卡上打印的编码完整承载了它的几何结构，因此从未见过该模板的设备也能在无网络、无账号的情况下批阅它。',
      },
      {
        title: '它从不猜测',
        body: '落在两个阈值之间的选项不会被悄悄判定，而是交给老师查看；被反光毁掉的画面会以指明的原因被拒绝，而不是残缺地读下去。',
      },
      {
        title: '题目分析与知识点标签',
        body: '哪道题难，哪个干扰项拉走了优等生，班级在分数运算上表现如何。看起来有误的答案会在整个班级被判错之前得到提示。',
      },
    ],
    accuracyTitle: '我们的数字，连同它的方法',
    accuracy: (evidence) =>
      evidence.accuracy === null
        ? `我们还没有在真实纸张上测量准确率，在测量之前也不会公布任何数字。引擎目前在测试自身生成的 ${String(evidence.cases)} 个用例和 ${String(evidence.questions)} 道题上通过检验：这证明每一项具名防御都在工作，并不能证明纸张上的准确率。该数字将在至少拍摄了 ${String(evidence.papersNeeded)} 张打印答题卡之后公布，并且与拒绝率和警告率一同公布，因为高准确率旁边配着高拒绝率是同一个谎言。`
        : `在黄金集上每题 ${percent(evidence.accuracy)}，并且始终与拒绝率和警告率一同公布。单位是题，不是选项圈，也不是整张卡，在一张五十题的卡上这三种读法相差 250 倍。`,
    rateWords: ['拒绝率', '警告率'],
    unitWord: '每题',
    privacyTitle: '照片不会离开设备',
    privacy:
      '一切都在设备上处理。没有任何图像被上传，也没有任何图像被写入磁盘。答题卡能从自己的记录重新生成分数，所以根本没有需要保存的东西。',
    scopeTitle: '用在哪里',
    scope:
      '用于课堂形成性评价、作业和小测验。沙特对使用手机应用批阅的限制范围有限，并不涵盖这一用途，我们在发布之前就把这一点说明白，而不是发布之后。',
    pricingTitle: '套餐',
    pricing: [
      { title: '免费', body: '每月一百张卡，所有功能一个不少。' },
      { title: 'Pro', body: '不限张数，功能完全相同。唯一的差别是一个计数器。' },
    ],
    pricingNote:
      '没有任何功能被锁住：离线使用、同步、题目分析、导出和自定义答题卡都在免费套餐里。账单不会自动续费。',
    languagesTitle: '语言',
    pageWord: '页面',
    listSeparator: '、',
  },
};
