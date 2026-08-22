// Every string the dashboard shows, in one shape per language.
//
// A single interface, so a missing string in a new language is a compile error
// rather than an English word appearing in an Arabic screen. That is the whole
// reason this is a typed object and not a lookup with a fallback: a fallback is
// how half translated products ship.
//
// Adding a language is adding one entry here. No screen, no layout and no
// stylesheet changes, which is the property `test/locale.test.ts` checks by
// building every screen in every locale and comparing the structures.

export interface Copy {
  readonly brand: string;
  readonly skip: string;
  readonly navLabel: string;
  readonly tabsLabel: string;
  readonly nav: { exams: string; students: string; sheets: string; settings: string };
  readonly sync: { label: string; last: string; pending: string };
  readonly exams: {
    readonly title: string;
    readonly help: string;
    readonly newExam: string;
    readonly columns: readonly string[];
    readonly openLabel: string;
  };
  readonly exam: {
    readonly eyebrow: string;
    readonly title: string;
    readonly help: string;
    readonly scan: string;
    readonly scanHelp: string;
    readonly tabs: readonly string[];
    readonly stats: readonly { label: string; note: string }[];
    readonly missing: string;
    readonly papersTitle: string;
    readonly papersHelp: string;
    readonly papersColumns: readonly string[];
    readonly export: string;
    readonly reviewNeeded: string;
    readonly itemsTitle: string;
    readonly itemsHelp: string;
    readonly difficultyTitle: string;
    readonly difficultyBand: string;
    readonly difficultySummary: string;
    readonly distractorTitle: string;
    readonly keyWord: string;
    readonly suspectKey: string;
    readonly indicesOff: string;
    readonly tagsTitle: string;
    readonly tagsHelp: string;
    readonly tagsColumns: readonly string[];
    readonly empty: string;
    readonly question: string;
  };
  readonly students: { title: string; help: string; import: string; columns: readonly string[] };
  readonly sheets: { title: string; help: string; make: string; columns: readonly string[] };
  readonly builder: {
    readonly title: string;
    readonly titleHelp: string;
    readonly choicesTitle: string;
    readonly choicesHelp: string;
    readonly outcomeTitle: string;
    readonly outcomeHelp: string;
    readonly download: string;
    /** Rule 17: a value that is not there gets its own word, never a zero. */
    readonly missing: string;
    readonly rowsDefault: string;
    readonly rowsDense: string;
    /** A measured consequence of asking for key versions, not advice. */
    readonly keyVersionCost: string;
    readonly fields: {
      readonly name: string;
      readonly questions: string;
      readonly choices: string;
      readonly alphabet: string;
      readonly placement: string;
      readonly select: string;
      readonly studentId: string;
      readonly keyVersions: string;
      readonly family: string;
    };
    readonly help: {
      readonly name: string;
      readonly questions: string;
      readonly choices: string;
      readonly alphabet: string;
      readonly placement: string;
      readonly select: string;
      readonly studentId: string;
      readonly keyVersions: string;
      readonly family: string;
    };
    readonly alphabets: {
      readonly latin: string;
      readonly arabic: string;
      readonly digits: string;
      readonly trueFalse: string;
    };
    readonly placements: {
      readonly internal: string;
      readonly header: string;
      readonly external: string;
    };
    readonly selects: { readonly one: string; readonly many: string };
    readonly families: { readonly A: string; readonly LETTER: string };
    readonly stats: {
      readonly paper: string;
      readonly questions: string;
      readonly fill: string;
      readonly rows: string;
    };
    readonly statNotes: {
      readonly paper: string;
      readonly questions: string;
      readonly fill: string;
      readonly rows: string;
    };
    readonly refusals: { readonly doesNotFit: string; readonly other: string };
  };
  readonly settings: { title: string; help: string; language: string; languageHelp: string };
}

export const COPY: Readonly<Record<string, Copy>> = {
  ar: {
    brand: 'TransferChecker',
    skip: 'تجاوز إلى المحتوى',
    navLabel: 'التنقل الرئيسي',
    tabsLabel: 'أقسام الاختبار',
    nav: { exams: 'الاختبارات', students: 'الطلاب', sheets: 'النماذج', settings: 'الإعدادات' },
    sync: {
      label: 'يعمل بلا إنترنت',
      last: 'آخر مزامنة 2026-08-15 09:41',
      pending: 'بانتظار الرفع',
    },
    exams: {
      title: 'الاختبارات',
      help: 'يعرض كل اختباراتك ودرجة إنجاز التصحيح فيها.',
      newExam: 'اختبار جديد',
      columns: ['الاختبار', 'الفصل', 'الأسئلة', 'الأوراق', 'يحتاج مراجعة', 'التاريخ'],
      openLabel: 'افتح',
    },
    exam: {
      eyebrow: 'الاختبارات',
      title: 'اختبار الرياضيات، الوحدة الثالثة',
      help: 'يجمع كل أفعال هذا الاختبار في مكان واحد.',
      scan: 'امسح الأوراق',
      scanHelp: 'يفتح الكاميرا لتصوير أوراق الفصل ورقةً ورقة.',
      tabs: ['المفتاح', 'المسح', 'المراجعة', 'تحليل الفقرات', 'تقارير الوسوم'],
      stats: [
        { label: 'الأوراق', note: 'مصحّحة في هذا الاختبار' },
        { label: 'المتوسط', note: 'من الدرجة الكاملة' },
        { label: 'تحتاج مراجعة', note: 'ورقة تنتظر نظرة قبل اعتماد درجتها' },
        { label: 'لم تُحسم', note: 'أسئلة لم تقرأها الآلة' },
      ],
      missing: 'غير محدد',
      papersTitle: 'أوراق الفصل',
      papersHelp: 'يعرض كل ورقة مصحّحة بدرجتها وسلسلة علاماتها.',
      papersColumns: ['الطالب', 'الرقم', 'الدرجة', 'الفراغ', 'مراجعة', 'التاريخ', 'العلامات'],
      export: 'صدّر Excel',
      reviewNeeded: 'يحتاج مراجعة',
      itemsTitle: 'تحليل الفقرات',
      itemsHelp: 'يحسب صعوبة كل سؤال من إجابات الفصل.',
      difficultyTitle: 'نسبة من أجاب كل سؤال صحيحاً',
      difficultyBand: 'النطاق الصحّي',
      difficultySummary: 'صعوبة كل سؤال، من أسهل إلى أصعب.',
      distractorTitle: 'توزيع اختيارات الفصل على',
      keyWord: 'المفتاح',
      suspectKey: 'المفتاح مشكوك فيه',
      indicesOff: 'معامل التمييز مطفأ تحت 25 ورقة، لأن رقمه على فصل واحد ضجيج لا معلومة.',
      tagsTitle: 'تقارير الوسوم',
      tagsHelp: 'يجمع درجات الفصل حسب وسم كل سؤال.',
      tagsColumns: ['الوسم', 'الأسئلة', 'النسبة', 'لم تُحسم'],
      empty: 'لا توجد بيانات بعد.',
      question: 'س',
    },
    students: {
      title: 'الطلاب',
      help: 'يعرض قائمة الفصل ويستورد أسماء جديدة من ملف.',
      import: 'استورد قائمة',
      columns: ['الاسم', 'الرقم', 'الأوراق'],
    },
    sheets: {
      title: 'النماذج',
      help: 'ينشئ ورقة إجابة ويطبعها PDF.',
      make: 'نموذج جديد',
      columns: ['النموذج', 'الأسئلة', 'الخيارات', 'المقاس'],
    },
    settings: {
      title: 'الإعدادات',
      help: 'يضبط لغة الواجهة وبيانات حسابك.',
      language: 'لغة الواجهة',
      languageHelp: 'يبدّل لغة الواجهة ويبقيك في الشاشة نفسها.',
    },
    builder: {
      title: 'منشئ النماذج',
      titleHelp: 'ابنِ ورقة إجابة بمقاسك، ثم نزّلها PDF.',
      choicesTitle: 'الاختيارات',
      choicesHelp: 'غيّر خياراً واحداً، وتتبعه الورقة أدناه.',
      outcomeTitle: 'الورقة الناتجة',
      outcomeHelp: 'ما تنتجه اختياراتك الآن، محسوباً بمحرك التخطيط نفسه لا موصوفاً.',
      download: 'نزّل PDF',
      missing: 'غير محدد',
      rowsDefault: 'تباعد الصفوف الاعتيادي',
      rowsDense: 'ضُمّت الصفوف لتتسع الورقة',
      keyVersionCost:
        'خانة النسخة تكبّر الورقة أحياناً: اختبار من عشرين سؤالاً ينتقل من A5 إلى A4.',
      fields: {
        name: 'اسم الورقة',
        questions: 'عدد الأسئلة',
        choices: 'خيارات كل سؤال',
        alphabet: 'رموز الخيارات',
        placement: 'موضع الحرف',
        select: 'نمط الإجابة',
        studentId: 'خانات رقم الطالب',
        keyVersions: 'نسخ المفتاح',
        family: 'عائلة المقاس',
      },
      help: {
        name: 'يُطبع على حافة الورقة لتميّزها بالعين.',
        questions: 'من سؤال واحد إلى مئتين.',
        choices: 'من خيارين إلى عشرة لكل سؤال.',
        alphabet: 'يختار الحروف أو الأرقام التي تحملها الفقاعات.',
        placement: 'يقرر أين يُطبع حرف الخيار، وهو يغيّر عرض الصف.',
        select: 'يسمح بإجابة واحدة أو بأكثر من إجابة في السؤال.',
        studentId: 'طول شبكة رقم الطالب، وصفر يعني بلا شبكة.',
        keyVersions: 'عدد نسخ المفتاح، وصفر يعني بلا خانة نسخة.',
        family: 'يختار بين مقاسات A ومقاسات Letter.',
      },
      alphabets: {
        latin: 'حروف لاتينية A B C',
        arabic: 'حروف عربية أ ب ج',
        digits: 'أرقام 0 1 2',
        trueFalse: 'صواب وخطأ',
      },
      placements: {
        internal: 'داخل الفقاعة',
        header: 'فوق العمود مرة واحدة',
        external: 'بجانب الفقاعة',
      },
      selects: { one: 'إجابة واحدة', many: 'أكثر من إجابة' },
      families: { A: 'مقاسات A', LETTER: 'مقاسات Letter' },
      stats: { paper: 'المقاس', questions: 'الأسئلة', fill: 'امتلاء الصفحة', rows: 'تباعد الصفوف' },
      statNotes: {
        paper: 'أصغر مقاس يتسع لها',
        questions: 'كما اخترتها',
        fill: 'الصفحة شبه الفارغة تبدو خطأً',
        rows: 'المسافة بين صف وصف',
      },
      refusals: {
        doesNotFit: 'لا يتسع لها أي مقاس في هذه العائلة. المطلوب مقابل المتاح:',
        other: 'اختيار خارج المدى المسموح. راجع القيم أعلاه.',
      },
    },
  },
  en: {
    brand: 'TransferChecker',
    skip: 'Skip to content',
    navLabel: 'Main navigation',
    tabsLabel: 'Exam sections',
    nav: { exams: 'Exams', students: 'Students', sheets: 'Sheets', settings: 'Settings' },
    sync: {
      label: 'Working offline',
      last: 'Last sync 2026-08-15 09:41',
      pending: 'Waiting to upload',
    },
    exams: {
      title: 'Exams',
      help: 'Lists every exam and how far its marking has got.',
      newExam: 'New exam',
      columns: ['Exam', 'Class', 'Questions', 'Papers', 'Needs review', 'Date'],
      openLabel: 'Open',
    },
    exam: {
      eyebrow: 'Exams',
      title: 'Mathematics, unit three',
      help: 'Holds every action for this exam in one place.',
      scan: 'Scan papers',
      scanHelp: 'Opens the camera to photograph the class one paper at a time.',
      tabs: ['Key', 'Scan', 'Review', 'Item analysis', 'Tag reports'],
      stats: [
        { label: 'Papers', note: 'marked in this exam' },
        { label: 'Mean', note: 'out of the full mark' },
        { label: 'Needs review', note: 'papers waiting on a look before the grade stands' },
        { label: 'Unresolved', note: 'questions the machine would not read' },
      ],
      missing: 'Not set',
      papersTitle: 'Class papers',
      papersHelp: 'Shows every marked paper with its score and mark string.',
      papersColumns: ['Student', 'ID', 'Score', 'Blank', 'Review', 'Date', 'Marks'],
      export: 'Export Excel',
      reviewNeeded: 'Needs review',
      itemsTitle: 'Item analysis',
      itemsHelp: 'Computes each question difficulty from the class answers.',
      difficultyTitle: 'Share of the class answering each question correctly',
      difficultyBand: 'Healthy range',
      difficultySummary: 'Difficulty per question, easiest to hardest.',
      distractorTitle: 'How the class answered',
      keyWord: 'key',
      suspectKey: 'Key looks wrong',
      indicesOff:
        'Discrimination is off below 25 papers, because on one class the figure is noise rather than information.',
      tagsTitle: 'Tag reports',
      tagsHelp: 'Groups the class marks by the tag on each question.',
      tagsColumns: ['Tag', 'Questions', 'Share', 'Unresolved'],
      empty: 'Nothing here yet.',
      question: 'Q',
    },
    students: {
      title: 'Students',
      help: 'Lists the class and imports names from a file.',
      import: 'Import list',
      columns: ['Name', 'ID', 'Papers'],
    },
    sheets: {
      title: 'Sheets',
      help: 'Builds an answer sheet and prints it as a PDF.',
      make: 'New sheet',
      columns: ['Sheet', 'Questions', 'Options', 'Paper'],
    },
    settings: {
      title: 'Settings',
      help: 'Sets the interface language and your account details.',
      language: 'Interface language',
      languageHelp: 'Switches the interface language and keeps you on the same screen.',
    },
    builder: {
      title: 'Sheet builder',
      titleHelp: 'Build an answer sheet to your own shape, then download it as a PDF.',
      choicesTitle: 'Choices',
      choicesHelp: 'Change one choice and the sheet below follows it.',
      outcomeTitle: 'The resulting sheet',
      outcomeHelp:
        'What your choices produce now, computed by the layout engine rather than described.',
      download: 'Download PDF',
      missing: 'Not set',
      rowsDefault: 'The usual row spacing',
      rowsDense: 'Rows were tightened to make it fit',
      keyVersionCost:
        'A version box can grow the paper: a twenty question quiz moves from A5 to A4.',
      fields: {
        name: 'Sheet name',
        questions: 'Questions',
        choices: 'Options per question',
        alphabet: 'Option symbols',
        placement: 'Letter position',
        select: 'Answer mode',
        studentId: 'Student number digits',
        keyVersions: 'Key versions',
        family: 'Paper family',
      },
      help: {
        name: 'Printed on the edge of the sheet so you can tell two apart by eye.',
        questions: 'From one question to two hundred.',
        choices: 'From two options to ten, per question.',
        alphabet: 'Chooses the letters or digits the bubbles carry.',
        placement: 'Decides where the option letter is printed, which changes the row width.',
        select: 'Allows one answer, or more than one, per question.',
        studentId: 'How long the student number grid is. Zero means no grid.',
        keyVersions: 'How many key versions. Zero means no version box.',
        family: 'Chooses between A sizes and Letter sizes.',
      },
      alphabets: {
        latin: 'Latin letters A B C',
        arabic: 'Arabic letters أ ب ج',
        digits: 'Digits 0 1 2',
        trueFalse: 'True and false',
      },
      placements: {
        internal: 'Inside the bubble',
        header: 'Once above the column',
        external: 'Beside the bubble',
      },
      selects: { one: 'One answer', many: 'More than one answer' },
      families: { A: 'A sizes', LETTER: 'Letter sizes' },
      stats: { paper: 'Size', questions: 'Questions', fill: 'Page fill', rows: 'Row spacing' },
      statNotes: {
        paper: 'The smallest size that holds it',
        questions: 'As you chose them',
        fill: 'A mostly blank page reads as a mistake',
        rows: 'The distance from one row to the next',
      },
      refusals: {
        doesNotFit: 'No size in this family holds it. Needed against available:',
        other: 'A choice is outside the allowed range. Check the values above.',
      },
    },
  },
};

export const BUILT_LOCALES = Object.keys(COPY);
