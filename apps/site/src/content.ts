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
      'Antwortbogen als PDF drucken, mit dem Handy abfotografieren, Ergebnis in Sekunden. Läuft offline, kein Bild verlässt das Gerät.',
    summary:
      'Eine Handy-App, die gedruckte Antwortbögen mit der Kamera korrigiert. Zuerst für Arabisch entwickelt, vollständig offline, die gesamte Verarbeitung findet auf dem Gerät statt.',
    tagline: 'Ein Bogen, ein Handy, sofort das Ergebnis',
    lede: 'Sie entwerfen den Antwortbogen, drucken ihn als PDF aus und fotografieren jeden ausgefüllten Bogen mit dem Handy. Das Ergebnis steht in Sekunden. Die App arbeitet vollständig offline, die gesamte Verarbeitung findet auf dem Gerät statt.',
    stepsTitle: 'Drei Schritte',
    steps: [
      'Beginnen Sie mit einer Vorlage für 20, 50 oder 100 Fragen oder stellen Sie den Bogen Frage für Frage selbst zusammen.',
      'Drucken Sie das PDF in Originalgröße aus, nicht an die Seite angepasst. Den Lösungsbogen tippen Sie selbst ein, oder Sie fotografieren einen fertig ausgefüllten Bogen.',
      'Fotografieren Sie die Bögen der Klasse einen nach dem anderen und exportieren Sie die Ergebnisse nach Excel.',
    ],
    featuresTitle: 'Was anders ist',
    features: [
      {
        title: 'Arabisch auf dem Bogen selbst',
        body: 'Die Zeichen in den Antwortfeldern sind arabisch oder lateinisch, die Beschriftungen stehen in jeder beliebigen Sprache. In der Druckdatei verbinden sich die arabischen Buchstaben richtig, weil die Schrift wirklich gesetzt und nicht nachgeahmt wird.',
      },
      {
        title: 'Der Bogen beschreibt sich selbst',
        body: 'Der aufgedruckte Code enthält die gesamte Geometrie des Bogens. Ein Gerät, das die Vorlage nie gesehen hat, korrigiert ihn ohne Internetverbindung und ohne Benutzerkonto.',
      },
      {
        title: 'Nichts wird geraten',
        body: 'Liegt die Schwärzung eines Antwortfeldes zwischen den beiden Schwellenwerten, legt die App es Ihnen vor, statt stillschweigend zu entscheiden. Ein Bild, das durch Spiegelungen unbrauchbar ist, wird unter Angabe des Grundes abgelehnt und nicht unvollständig korrigiert.',
      },
      {
        title: 'Aufgabenanalyse und Kompetenzberichte',
        body: 'Sie sehen, welche Aufgabe schwer war, welche falsche Antwortmöglichkeit ausgerechnet die starken Schülerinnen und Schüler angelockt hat und wie die Klasse beim Thema „Brüche“ abgeschnitten hat. Einen Lösungsbogen, der falsch aussieht, meldet die App, bevor damit eine ganze Klasse falsch korrigiert wird.',
      },
    ],
    accuracyTitle: 'Unsere Zahlen und wie wir sie messen',
    accuracy: (evidence) =>
      evidence.accuracy === null
        ? `Wir haben unsere Genauigkeit noch nicht auf echtem Papier gemessen und veröffentlichen bis dahin keine Zahl. Geprüft ist die Auswertung heute an ${String(evidence.cases)} Fällen und ${String(evidence.questions)} Fragen, die der Test selbst erzeugt. Das belegt, dass jede benannte Absicherung greift, und belegt nichts über Papier. Die Zahl erscheint, sobald mindestens ${String(evidence.papersNeeded)} gedruckte Bögen fotografiert wurden, und sie erscheint zusammen mit der Ablehnungsquote und der Warnquote, denn eine hohe Genauigkeit neben einer hohen Ablehnungsquote ist dieselbe Lüge.`
        : `${percent(evidence.accuracy)} pro Frage auf dem geprüften Datensatz, immer zusammen mit der Ablehnungsquote und der Warnquote veröffentlicht. Gemessen wird pro Frage, nicht pro Antwortfeld und nicht pro Bogen. Auf einem Bogen mit fünfzig Fragen liegen diese drei Lesarten um das 250-Fache auseinander.`,
    rateWords: ['Ablehnungsquote', 'Warnquote'],
    unitWord: 'pro Frage',
    privacyTitle: 'Kein Bild verlässt das Gerät',
    privacy:
      'Alles wird auf dem Gerät verarbeitet. Kein Bild wird hochgeladen, keines wird gespeichert. Ein Bogen erzeugt sein Ergebnis jederzeit neu aus seinem Datensatz, aufbewahren muss die App also nichts.',
    scopeTitle: 'Wofür es gedacht ist',
    scope:
      'Für Lernstandserhebungen im Unterricht, für Hausaufgaben und kurze Tests. Die saudische Beschränkung für das Korrigieren mit Handy-Apps ist eng gefasst und gilt für diesen Einsatz nicht. Wir sagen das vor dem Start und nicht danach.',
    pricingTitle: 'Tarife',
    pricing: [
      { title: 'Kostenlos', body: '100 Bögen pro Monat, mit allen Funktionen ohne Ausnahme.' },
      { title: 'Pro', body: 'Ohne Begrenzung der Bögen. Sonst ändert sich nichts.' },
    ],
    pricingNote:
      'Keine Funktion ist gesperrt: Offline-Betrieb, Synchronisierung, Aufgabenanalyse, Export nach Excel und eigene Bögen gehören zum kostenlosen Tarif. Die Abrechnung verlängert sich nicht automatisch.',
    languagesTitle: 'Sprachen',
    pageWord: 'Seite',
    listSeparator: ', ',
  },

  es: {
    name: 'TransferChecker',
    title: 'TransferChecker: corregir hojas de respuestas con el teléfono',
    description:
      'La hoja de respuestas se imprime en papel y se fotografía con el teléfono. La nota sale en segundos, sin conexión y sin subir ninguna foto.',
    summary:
      'Una aplicación móvil que corrige hojas de respuestas de opción múltiple impresas con la cámara del teléfono. Pensada primero para el árabe, funciona sin conexión y procesa todo en el propio dispositivo.',
    tagline: 'Una hoja, un teléfono y la nota',
    lede: 'La hoja de respuestas se diseña y se imprime desde la aplicación. Después se fotografía con el teléfono y la nota aparece en segundos, sin conexión y sin que ninguna imagen salga del dispositivo.',
    stepsTitle: 'Tres pasos',
    steps: [
      'Se elige una plantilla de 20, 50 o 100 preguntas o se diseña la hoja pregunta a pregunta.',
      'Se imprime el PDF a tamaño real, sin ajustar a la página, y la clave de respuestas se crea tocando las opciones correctas o escaneando una hoja ya contestada.',
      'Se fotografían las hojas de la clase una a una y los resultados se exportan a Excel.',
    ],
    featuresTitle: '¿Qué lo hace distinto?',
    features: [
      {
        title: 'Árabe en la propia hoja',
        body: 'Las burbujas se rotulan con letras árabes o latinas y las etiquetas pueden ir en cualquier idioma. En el PDF el árabe sale con sus letras bien enlazadas, porque el archivo de impresión da forma real a cada palabra en lugar de aproximarla.',
      },
      {
        title: 'La hoja se describe a sí misma',
        body: 'El código impreso en la hoja lleva toda su geometría, así que un teléfono que nunca ha visto la plantilla puede corregir la hoja igualmente, sin conexión y sin necesidad de cuenta.',
      },
      {
        title: 'Nunca adivina',
        body: 'Cuando la oscuridad de una burbuja queda entre los dos umbrales, la aplicación se la muestra al profesor en lugar de decidir en silencio. Y si un reflejo estropea la foto, la rechaza indicando el motivo en vez de leer la hoja a medias.',
      },
      {
        title: 'Análisis de ítems e informes por competencia',
        body: 'Muestra qué pregunta resultó difícil, qué distractor atrajo a los mejores alumnos y cómo fue la clase en el tema «fracciones». Y si la clave parece equivocada, avisa antes de corregir mal a toda la clase.',
      },
    ],
    accuracyTitle: 'Nuestras cifras y cómo las medimos',
    accuracy: (evidence) =>
      evidence.accuracy === null
        ? `Todavía no hemos medido la exactitud en papel real y no publicaremos ninguna cifra hasta hacerlo. Hoy el motor está probado con ${String(evidence.cases)} casos sintéticos y ${String(evidence.questions)} preguntas que genera la propia prueba: eso demuestra que cada una de las defensas que nombramos funciona, pero no demuestra nada sobre el papel. Publicaremos la cifra cuando se hayan fotografiado al menos ${String(evidence.papersNeeded)} hojas impresas, y siempre irá acompañada de la tasa de rechazo y la tasa de aviso, porque una exactitud alta junto a una tasa de rechazo alta miente exactamente igual.`
        : `Exactitud de ${percent(evidence.accuracy)} por pregunta en el conjunto de referencia, publicada siempre junto a la tasa de rechazo y la tasa de aviso. La unidad es la pregunta, no la burbuja ni la hoja: entre esas tres lecturas hay una diferencia de 250 a 1 en una hoja de cincuenta preguntas.`,
    rateWords: ['rechazo', 'aviso'],
    unitWord: 'por pregunta',
    privacyTitle: 'Las fotos de los alumnos no salen del dispositivo',
    privacy:
      'Todo el procesamiento se hace en el dispositivo. Ninguna imagen se sube a ningún servidor ni se escribe en el disco. Cada hoja vuelve a generar su propia nota a partir de su registro, así que no queda nada que conservar.',
    scopeTitle: '¿Dónde se usa?',
    scope:
      'Para evaluación formativa en el aula, tareas y pruebas cortas. La restricción saudí sobre la corrección con aplicaciones móviles tiene un alcance limitado y no cubre este uso, y lo decimos antes del lanzamiento, no después.',
    pricingTitle: 'Planes',
    pricing: [
      { title: 'Gratis', body: 'Cien hojas al mes, con todas las funciones incluidas.' },
      { title: 'Pro', body: 'Quita el límite de hojas y no cambia nada más.' },
    ],
    pricingNote:
      'No hay nada bloqueado: el uso sin conexión, la sincronización, el análisis de ítems, la exportación a Excel y las hojas personalizadas entran en el plan gratuito. La facturación no se renueva automáticamente.',
    languagesTitle: 'Idiomas',
    pageWord: 'Página',
    listSeparator: ', ',
  },

  fr: {
    name: 'TransferChecker',
    title: 'TransferChecker : corriger les QCM papier avec son téléphone',
    description:
      'Imprimez la grille, photographiez les copies, la note s’affiche en quelques secondes. Hors ligne, rien ne quitte le téléphone.',
    summary:
      'Une application mobile qui corrige les grilles de réponses imprimées avec l’appareil photo, pensée d’abord pour l’arabe, entièrement hors ligne : tout le traitement se fait sur le téléphone.',
    tagline: 'Une copie, un téléphone, une note',
    lede: 'Vous concevez la grille de réponses et vous l’imprimez. L’élève la remplit, vous la photographiez, et la note apparaît en quelques secondes. Tout fonctionne hors ligne, et le traitement se fait entièrement sur le téléphone.',
    stepsTitle: 'Trois étapes',
    steps: [
      'Partez d’un modèle de 20, 50 ou 100 questions, ou composez votre grille question par question.',
      'Imprimez le PDF à taille réelle, sans ajuster à la page, puis saisissez le corrigé en touchant les cases ou en scannant une grille déjà remplie avec les bonnes réponses.',
      'Photographiez les copies une par une, puis exportez les résultats vers Excel.',
    ],
    featuresTitle: 'Ce qui fait la différence',
    features: [
      {
        title: 'L’arabe sur la grille elle-même',
        body: 'Les symboles des cases en lettres arabes ou latines, les libellés dans la langue de votre choix, et des lettres arabes correctement liées à l’impression : le fichier compose réellement l’arabe au lieu d’en donner une approximation.',
      },
      {
        title: 'La grille se décrit elle-même',
        body: 'Le code imprimé contient toute la géométrie de la grille. Un téléphone qui n’a jamais vu le modèle corrige quand même la grille, sans réseau et sans compte.',
      },
      {
        title: 'L’application ne devine jamais',
        body: 'Une case dont le noircissement tombe entre les deux seuils vous est montrée au lieu d’être tranchée en silence. De même, une photo gâchée par un reflet est refusée avec une cause nommée, jamais lue à moitié.',
      },
      {
        title: 'Analyse par question et par compétence',
        body: 'Quelle question a été difficile, quel distracteur a attiré les bons élèves, ce que donne la classe sur un thème donné comme les fractions. Un corrigé qui semble faux est signalé avant d’avoir mal noté toute une classe.',
      },
    ],
    accuracyTitle: 'Nos chiffres, avec leur méthode',
    accuracy: (evidence) =>
      evidence.accuracy === null
        ? `Nous n’avons pas encore mesuré notre précision sur du vrai papier, et nous ne publierons aucun chiffre avant de l’avoir fait. Le moteur est aujourd’hui éprouvé sur ${String(evidence.cases)} cas et ${String(evidence.questions)} questions que le test tire lui-même : cela démontre que chaque défense nommée tient, et cela ne démontre rien sur du papier. Le chiffre paraîtra quand au moins ${String(evidence.papersNeeded)} grilles imprimées auront été photographiées, et il paraîtra accompagné du taux de refus et du taux d’avertissement, parce qu’une précision élevée posée à côté d’un taux de refus élevé, c’est le même mensonge.`
        : `${percent(evidence.accuracy)} par question sur le jeu de référence. Ce chiffre ne paraît jamais seul : il est publié avec le taux de refus et le taux d’avertissement. L’unité est la question, pas la case et pas la copie, et sur une grille de cinquante questions ces trois lectures sont séparées par un facteur 250.`,
    rateWords: ['taux de refus', 'taux d’avertissement'],
    unitWord: 'par question',
    privacyTitle: 'Les photos ne quittent pas le téléphone',
    privacy:
      'Tout est traité sur le téléphone. Aucune image n’est envoyée, aucune n’est écrite sur le disque. Une copie reproduit sa note à partir de son enregistrement : il n’y a donc rien à conserver.',
    scopeTitle: 'Dans quel cadre l’utiliser',
    scope:
      'Pour l’évaluation formative en classe, les devoirs et les interrogations courtes. La restriction saoudienne sur la correction par application mobile est de portée limitée et ne couvre pas cet usage ; nous le disons avant le lancement, pas après.',
    pricingTitle: 'Formules',
    pricing: [
      { title: 'Gratuite', body: 'Cent copies par mois, et toutes les fonctions, sans exception.' },
      {
        title: 'Pro',
        body: 'Plus aucune limite de copies, et exactement les mêmes fonctions. La levée de cette limite est la seule différence.',
      },
    ],
    pricingNote:
      'Rien n’est verrouillé : le hors ligne, la synchronisation, l’analyse par question, l’export vers Excel et les grilles sur mesure sont inclus dans la formule gratuite. Et la facturation ne se reconduit pas toute seule.',
    languagesTitle: 'Langues',
    pageWord: 'Page',
    listSeparator: ', ',
  },

  hi: {
    name: 'TransferChecker',
    title: 'TransferChecker: फ़ोन से OMR शीट जाँचें',
    description:
      'OMR शीट डिज़ाइन करें, PDF छापें, हर शीट की फ़ोटो लें, नंबर तुरंत सामने। बिना इंटरनेट, और फ़ोटो फ़ोन से बाहर नहीं जातीं',
    summary:
      'एक मोबाइल ऐप जो छपी हुई OMR शीट को कैमरे से जाँचता है। पहले अरबी के लिए बनाया गया, इंटरनेट की ज़रूरत नहीं, और सारा काम फ़ोन के अंदर ही होता है।',
    tagline: 'एक शीट, एक फ़ोन, और तुरंत नंबर',
    lede: 'OMR शीट आप डिज़ाइन करके छापते हैं, फ़ोन से हर बच्चे की शीट की फ़ोटो लेते हैं, और नंबर सेकंडों में सामने आ जाता है। ऐप पूरी तरह बिना इंटरनेट चलता है, और सारी प्रोसेसिंग फ़ोन के अंदर ही होती है।',
    stepsTitle: 'तीन चरण',
    steps: [
      '20, 50 या 100 प्रश्नों का तैयार टेम्पलेट लें, या अपनी शीट प्रश्न दर प्रश्न बनाएँ',
      'PDF को असली साइज़ में छापें, पेज पर फ़िट न करें, फिर टैप करके या हल की हुई शीट स्कैन करके उत्तर कुंजी बना लें',
      'एक एक करके हर शीट की फ़ोटो खींचें, और नतीजे Excel में एक्सपोर्ट करें',
    ],
    featuresTitle: 'इसमें अलग क्या है',
    features: [
      {
        title: 'शीट पर ही अरबी',
        body: 'गोलों के निशान अरबी अक्षरों में रखें या रोमन में, लेबल किसी भी भाषा में, और PDF में अरबी के अक्षर सही तरह आपस में जुड़कर छपते हैं, क्योंकि छपाई अरबी को सचमुच जोड़ती है, उससे मिलती-जुलती शक्ल बनाकर नहीं छोड़ देती।',
      },
      {
        title: 'शीट अपनी जानकारी खुद रखती है',
        body: 'शीट पर छपा कोड उसकी पूरी बनावट अपने अंदर समेटे रहता है, इसलिए जिस फ़ोन ने वह टेम्पलेट कभी देखा ही नहीं है, वह भी उसे बिना नेटवर्क और बिना अकाउंट के जाँच लेता है।',
      },
      {
        title: 'यह कभी अंदाज़ा नहीं लगाता',
        body: 'जिस गोले का कालापन दोनों सीमाओं के बीच पड़ता है, उसे चुपचाप तय करने के बजाय शिक्षक को दिखाया जाता है, और जिस फ़ोटो को रोशनी की चमक ने बिगाड़ दिया हो, उसे आधा-अधूरा पढ़ने के बजाय कारण बताकर अस्वीकार कर दिया जाता है।',
      },
      {
        title: 'प्रश्नवार विश्लेषण और लर्निंग आउटकम टैग',
        body: 'कौन सा प्रश्न कठिन रहा, किस ग़लत विकल्प ने होशियार बच्चों को खींच लिया, और जिस टॉपिक पर आपने टैग लगाया है उसमें पूरी कक्षा कैसी रही। जो उत्तर कुंजी ग़लत लग रही हो, उस पर पूरी कक्षा की ग़लत जाँच होने से पहले ही निशान लग जाता है।',
      },
    ],
    accuracyTitle: 'हमारे आँकड़े, और उन्हें नापने का तरीक़ा',
    accuracy: (evidence) =>
      evidence.accuracy === null
        ? `असली काग़ज़ पर हमने अपनी सटीकता अभी नापी नहीं है, और नापने से पहले कोई आँकड़ा नहीं छापेंगे। आज इंजन ${String(evidence.cases)} मामलों और ${String(evidence.questions)} प्रश्नों पर परखा गया है, जिन्हें टेस्ट खुद बनाता है, और इससे इतना ही साबित होता है कि जिन बचावों के नाम हमने गिनाए हैं वे सब काम कर रहे हैं, यह नहीं कि काग़ज़ पर सटीकता कितनी है। आँकड़ा तब छपेगा जब कम से कम ${String(evidence.papersNeeded)} छपी हुई शीट की फ़ोटो ली जा चुकी होंगी, और उसके साथ अस्वीकृति दर और चेतावनी दर भी छपेगी, क्योंकि ऊँची अस्वीकृति दर के साथ छपी ऊँची सटीकता वही झूठ है।`
        : `मानक सैंपल सेट पर ${percent(evidence.accuracy)} प्रति प्रश्न सटीकता, और यह हमेशा अस्वीकृति दर और चेतावनी दर के साथ ही छपती है। इकाई प्रश्न है, गोला नहीं और शीट भी नहीं, और पचास प्रश्नों की शीट पर इन तीनों में 250 गुना फ़र्क़ पड़ता है।`,
    rateWords: ['अस्वीकृति दर', 'चेतावनी दर'],
    unitWord: 'प्रति प्रश्न',
    privacyTitle: 'फ़ोटो फ़ोन से बाहर नहीं जातीं',
    privacy:
      'सारा काम फ़ोन के अंदर ही होता है। कोई फ़ोटो न कहीं अपलोड होती है, न डिस्क पर लिखी जाती है। शीट अपने रिकॉर्ड से अपना नंबर दोबारा बना लेती है, इसलिए रखने को कुछ बचता ही नहीं।',
    scopeTitle: 'कहाँ काम आता है',
    scope:
      'कक्षा के रचनात्मक मूल्यांकन, होमवर्क और छोटे टेस्ट के लिए। मोबाइल ऐप से जाँच पर सऊदी अरब की जो रोक है वह सीमित दायरे की है और इस इस्तेमाल पर लागू नहीं होती, और यह बात हम लॉन्च के बाद नहीं, पहले कह रहे हैं।',
    pricingTitle: 'प्लान',
    pricing: [
      { title: 'मुफ़्त', body: 'महीने में 100 शीट, और हर फ़ीचर पूरा का पूरा।' },
      { title: 'Pro', body: 'शीट की कोई सीमा नहीं, बाक़ी सब वही का वही।' },
    ],
    pricingNote:
      'कुछ भी रोका नहीं गया है। बिना इंटरनेट काम, सिंक, प्रश्नवार विश्लेषण, Excel में एक्सपोर्ट और अपनी बनाई शीट, सब मुफ़्त प्लान में हैं। बिल अपने आप रिन्यू नहीं होता।',
    languagesTitle: 'भाषाएँ',
    pageWord: 'पेज',
    listSeparator: ', ',
  },

  tr: {
    name: 'TransferChecker',
    title: 'TransferChecker: optik formları telefonla okutun, önce Arapça',
    description:
      'Optik formunuzu tasarlayın, PDF olarak yazdırın, telefonla fotoğraflayın. Not saniyeler içinde hazır, internet gerekmez, fotoğraflar cihazdan çıkmaz.',
    summary:
      'Basılı optik formları kamerayla okuyan, önce Arapça için tasarlanan, tümüyle çevrimdışı çalışan ve her işlemi cihazda yapan bir telefon uygulaması.',
    tagline: 'Bir optik form, bir telefon, anında not',
    lede: 'Optik formunuzu tasarlayıp yazdırırsınız, sınıfın formlarını telefonunuzla fotoğraflarsınız, not saniyeler içinde çıkar. Uygulama tümüyle çevrimdışı çalışır, her piksel cihazda işlenir.',
    stepsTitle: 'Üç adım',
    steps: [
      '20, 50 ya da 100 soruluk hazır bir şablonla başlayın ya da formunuzu soru soru kendiniz tasarlayın.',
      'PDF dosyasını gerçek boyutta yazdırın, sayfaya sığdırmayın. Cevap anahtarını ekrana dokunarak ya da çözülmüş bir formu okutarak oluşturun.',
      'Sınıfın formlarını tek tek fotoğraflayın, sonuçları Excel’e aktarın.',
    ],
    featuresTitle: 'Farkı nerede?',
    features: [
      {
        title: 'Arapça formun kendisinde',
        body: 'Kutucuk simgeleri Arap ya da Latin harfleriyle, etiketler istediğiniz dilde. Baskı dosyasındaki dizgi Arapçayı gerçekten bitiştirir, ona benzeyen bir şeyle yetinmez.',
      },
      {
        title: 'Form kendini anlatır',
        body: 'Forma basılan kod, formun bütün geometrisini taşır. Şablonu hiç görmemiş bir cihaz da onu okur, ne internet ister ne de hesap.',
      },
      {
        title: 'Asla tahmin etmez',
        body: 'İki eşik arasında kalan kutucuk sessizce karara bağlanmaz, öğretmene gösterilir. Parlamanın bozduğu kare, eksik okunmaktansa adı konmuş bir gerekçeyle geri çevrilir.',
      },
      {
        title: 'Madde ve kazanım analizi',
        body: 'Hangi soru zordu, hangi çeldirici güçlü öğrencileri çekti, etiketlediğiniz kazanımda sınıf nerede duruyor. Yanlış görünen bir cevap anahtarı, bütün sınıf yanlış değerlendirilmeden önce işaretlenir.',
      },
    ],
    accuracyTitle: 'Sayılarımız, yöntemiyle birlikte',
    accuracy: (evidence) =>
      evidence.accuracy === null
        ? `Doğruluğumuzu gerçek kâğıt üzerinde henüz ölçmedik, ölçmeden de bir sayı yayımlamayacağız. Okuma motoru bugün, testin kendi ürettiği ${String(evidence.cases)} durum ve ${String(evidence.questions)} soru üzerinde sınanıyor. Bu, adı konmuş her önlemin çalıştığını kanıtlar, kâğıt üzerindeki doğruluğu kanıtlamaz. Sayıyı en az ${String(evidence.papersNeeded)} basılı form fotoğraflandıktan sonra, ret oranı ve uyarı oranı ile birlikte yayımlayacağız; çünkü yüksek bir ret oranının yanındaki yüksek doğruluk da aynı yalandır.`
        : `Altın kümede soru başına ${percent(evidence.accuracy)} doğruluk; bu sayı her zaman ret oranı ve uyarı oranı ile birlikte yayımlanır. Birim sorudur, kutucuk değil, form değil. Elli soruluk bir formda bu üç okuma arasında 250 kat fark vardır.`,
    rateWords: ['ret oranı', 'uyarı oranı'],
    unitWord: 'soru başına',
    privacyTitle: 'Fotoğraflar cihazdan çıkmaz',
    privacy:
      'Her şey cihazda işlenir. Hiçbir görüntü yüklenmez, diske de yazılmaz. Form kendi notunu kendi kaydından yeniden üretir, dolayısıyla saklanacak bir şey yoktur.',
    scopeTitle: 'Nerede kullanılır',
    scope:
      'Sınıf içi biçimlendirici değerlendirme (süreç değerlendirmesi), ödev ve kısa sınavlar için. Suudi Arabistan’da telefon uygulamasıyla optik form okutmaya getirilen kısıt dar kapsamlıdır ve bu kullanımı içermez. Bunu lansmandan sonra değil, önce söylüyoruz.',
    pricingTitle: 'Paketler',
    pricing: [
      { title: 'Ücretsiz', body: 'Ayda yüz optik form, istisnasız bütün özellikler.' },
      { title: 'Pro', body: 'Form sınırı yok, özellikler aynı. Aradaki tek fark bir sayaç.' },
    ],
    pricingNote:
      'Hiçbir özellik kilitli değil: çevrimdışı kullanım, eşitleme, madde analizi, Excel’e aktarma ve kendi tasarladığınız formlar ücretsiz pakette de var. Fatura kendiliğinden yenilenmez.',
    languagesTitle: 'Diller',
    pageWord: 'Sayfa',
    listSeparator: ', ',
  },

  zh: {
    name: 'TransferChecker',
    title: 'TransferChecker：手机拍照阅卷，答题卡当场出分，全程离线',
    description:
      '自己设计答题卡，导出 PDF 后按实际大小打印，用手机逐张拍照，几秒钟就出分。全程离线，学生的答题卡照片不出手机。',
    summary: '一款用手机摄像头批阅纸质答题卡的应用，阿拉伯语优先，全程离线，照片不出手机。',
    tagline: '一张答题卡，一部手机，几秒出分',
    lede: '答题卡在应用里排版，导出 PDF 打印出来；学生做完收上来，老师用手机逐张拍照，几秒钟就出分。全程不用联网，识别和统计都在手机上完成。',
    stepsTitle: '三个步骤',
    steps: [
      '从 20 题、50 题或 100 题的现成模板开始，也可以自己逐题设计答题卡。',
      '打印 PDF 时选“实际大小”，不要缩放以适应页面。参考答案可以逐题点选，也可以扫描一张填好的答题卡自动生成。',
      '把全班的答题卡逐张拍照，再把成绩导出成 Excel 表格。',
    ],
    featuresTitle: '有什么不一样',
    features: [
      {
        title: '阿拉伯语直接印在答题卡上',
        body: '选项符号可以用阿拉伯字母，也可以用拉丁字母，答题卡上的文字标签用哪种语言都行。打印文件里的阿拉伯文是真正连写排版出来的，字形连接正确，不是拿相近的字形凑出来的。',
      },
      {
        title: '答题卡自带版面信息',
        body: '答题卡上印的编码完整记录了它的版面结构，所以一部从没见过这个模板的手机也能直接批阅，不用联网，也不用账号。',
      },
      {
        title: '绝不猜测',
        body: '涂点的深浅落在两个阈值之间时，不会被悄悄判成涂或没涂，而是交给老师自己判断。照片被反光毁掉时，会写明原因退回，而不是将就着读出一个残缺的结果。',
      },
      {
        title: '题目分析和知识点标签',
        body: '哪道题偏难，哪个干扰项把成绩好的学生拉走了，全班在“一元一次方程”这个知识点上掌握得怎么样。参考答案有问题时，会在全班被判错之前先提示出来。',
      },
    ],
    accuracyTitle: '我们的数字是怎么测出来的',
    accuracy: (evidence) =>
      evidence.accuracy === null
        ? `准确率还没有在真实纸张上测过，测出来之前我们不会公布任何数字。引擎现在只跑过测试自己生成的 ${String(evidence.cases)} 个用例、${String(evidence.questions)} 道题，这只能证明每一项写明的防护都在起作用，证明不了纸上的准确率。等我们实拍过至少 ${String(evidence.papersNeeded)} 张打印出来的答题卡，这个数字才会公布，而且一定和拒绝率、警告率一起公布：高准确率的旁边跟着高拒绝率，这样的准确率同样是在骗人。`
        : `在标准样本集上，每题准确率 ${percent(evidence.accuracy)}，并且一定和拒绝率、警告率一起公布。准确率按题计算，不按涂点，也不按整张答题卡：在一张 50 道题的答题卡上，这三种口径差 250 倍。`,
    rateWords: ['拒绝率', '警告率'],
    unitWord: '每题',
    privacyTitle: '照片不出手机',
    privacy:
      '所有处理都在手机上完成，图像不会上传，也不会写入手机存储。答题卡凭自己的记录就能重新算出分数，所以根本没有需要留存的东西。',
    scopeTitle: '适用范围',
    scope:
      '用于课堂上的过程性评价、作业批改和随堂小测。沙特对手机应用阅卷的限制只针对特定范围，并不涵盖这类用途；这一点我们在发布之前就讲清楚，而不是等发布之后再说。',
    pricingTitle: '套餐',
    pricing: [
      { title: '免费版', body: '每月一百张答题卡，功能一个不少。' },
      { title: 'Pro', body: '答题卡张数不限，功能和免费版完全一样，唯一的差别就是那个计数器。' },
    ],
    pricingNote:
      '功能不分套餐：离线使用、同步、题目分析、导出 Excel、自定义答题卡，免费版里全都有。账单不会自动续费。',
    languagesTitle: '语言',
    pageWord: '页面',
    listSeparator: '、',
  },
};
