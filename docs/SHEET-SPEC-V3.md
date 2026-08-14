# مواصفة الورقة v3: القرارات والسكيما الجديدة

> نتيجة دراسة منشئ الأوراق في ZipGrade. سجل الملاحظات الثلاثين في [`SHEET-SPEC.md`](SHEET-SPEC.md) القسم 7، وهذه الوثيقة هي **القرارات المترتبة عليه**.
> الحالة: مصادق عليها للتنفيذ. التاريخ: 2026-08-14.

## 0) لماذا v3 وليس تعديلاً على v2

v2 مبنية على افتراض واحد لم يعد صحيحاً: **أن كل أسئلة الورقة متطابقة**. سقوط هذا الافتراض يغيّر السكيما ومحرك التخطيط معاً، فالترقيم يقفز إلى 3 وتبقى v2 قابلة للقراءة للأوراق المطبوعة منها.

## 1) القرارات

### أ) الأسئلة قائمة، لا عدد

```ts
questions: Question[]   // بدل questions: number + choices: number
```

سؤال واحد قد يكون خمسة خيارات والذي يليه صح/خطأ. يخدم اختبارات المدارس الحقيقية التي تخلط الأنواع، ويلغي الحاجة لورقتين.

**النطاق:** نوع `choice` فقط في هذه المرحلة. الأنواع الأربعة الأخرى (`verbose` و`numeric` و`response` والمتناوب) لها تصميم مسجَّل أدناه، وتُضاف لاحقاً **إضافةً لا هجرة**، لأن الاتحاد المميَّز يقبل عضواً جديداً بلا كسر.

### ب) نسخة المفتاح تنتقل من القالب إلى الورقة

`formCode` يخرج من `SheetSpec` نهائياً، ويصير **حقل فقاعات على الورقة** يظلله المعلم أو الطالب، ويقرؤه الماسح ضمن نتيجة المسح.

الأثر العملي: **ورقة واحدة تُطبع مرة واحدة وتخدم كل النسخ**، بدل أربعة قوالب وأربع رزم يخشى المعلم اختلاطها.

### ج) كل شيء له وجهان: ما يفهمه النظام وما يقرؤه الإنسان

المبدأ تكرر في ثلاثة مواضع مستقلة عندهم، فنعتمده قاعدة عامة:

| الموضع       | وجه النظام | وجه الإنسان |
| ------------ | ---------- | ----------- |
| حقل الترويسة | `usage`    | `label`     |
| القالب       | `id`       | `name`      |
| خيار السؤال  | `code`     | `text`      |

`usage` تحديداً يحل مشكلة حقيقية: بدونه لا يعرف النظام أي صندوق هو اسم الطالب، فيتعذر ربط المسح بسجله وتسمية أعمدة Excel.

### د) النشر يجمّد القالب نهائياً

قالب منشور للقراءة فقط إلى الأبد. التعديل ينشئ قالباً جديداً بمعرّف جديد.

المبرر غير قابل للنقاش: **أوراق طُبعت وصارت بيد الطلاب**، وأي تعديل بعدها يجعل الماسح يقرأ خلاف ما في يد الطالب فتخرج درجات خاطئة بلا إنذار.

`status` **لا يدخل في `SheetSpec`**، لأنه دورة حياة لا وصف للمطبوع. مكانه عمود في جدول `templates`.

### هـ) العرض والمقاسات قوائم مسماة لا أرقام خام

`widthMm: 20..120` تُستبدل بـ`width: 'small' | 'medium' | 'large'`. المعلم لا يريد أن يقرر مليمترات، والأرقام الحرة تفتح حالات قبيحة بلا فائدة.

### و) عدد الأعمدة يُحسب افتراضاً

```ts
columns: 'auto' | 1..6
```

`auto` تشتق العدد من عرض الصف والمساحة المتاحة، فتختفي معظم حالات رفض `overflow` قبل أن تحدث. التثبيت اليدوي يبقى متاحاً.

### ز) مجموعات رموز حرة، وتجنب الحروف الملتبسة

الرموز مصفوفة نصية حرة (2 إلى 10) بدل ثلاث مجموعات جاهزة. المجموعات الجاهزة تبقى **دوال مساعدة في الكود لا قيوداً في السكيما**.

والافتراضي يتخطى الحروف الملتبسة: **I و O** في اللاتينية لالتباسهما بـ1 و0. هذا عرف راسخ في أوراق OMR ولاحظناه في مثالهم `FGHJK`.

### ح) موضع التسمية: داخل الفقاعة أو بجانبها

`placement: 'internal' | 'external'`. الداخلي أكثف والخارجي أوضح، والفرق في عرض الصف يقارب الضعف. خيار حقيقي يوازن به المعلم بين الوضوح وعدد الأسئلة في الصفحة.

### ط) حواف الورقة: هوية القالب لا عنوان الاختبار

- الحافة اليسرى: `branding` (اسم المنتج).
- الحافة اليمنى: `name` مع معرّف قصير، **مقروءاً للإنسان** بجانب الـQR الذي يقرؤه الجهاز. فيعرف المعلم أي قالب بيده دون جهاز.
- **`title` يُحذف من السكيما.** عنوان الاختبار بيانات خاصة بالاختبار لا بالقالب، ومكانه حقل ترويسة يكتبه المعلم. الحواف للهوية الثابتة فقط.

### ي) الترصيف وخيارات السواد قرارات وقت التنزيل

للورقة مقاس ذاتي يحدده محتواها. عدد النسخ في الصفحة (1 أو 2 أو 4) ودرجة سواد الطباعة **خيارات تنزيل، لا حقول في المواصفة**. درجة السواد مضبوطة عندنا أصلاً في `SheetTheme`.

## 2) السكيما المقترحة

```ts
// System side and human side, everywhere.
const FieldUsage = z.enum([
  'studentName',
  'studentId',
  'class',
  'subject',
  'date',
  'score',
  'keyVersion',
  'other',
]);
const FieldWidth = z.enum(['small', 'medium', 'large']);

/** Two to ten bubble symbols. Presets are code helpers, not schema variants. */
const Symbols = z.array(z.string().min(1).max(2)).min(2).max(10);

const WrittenBoxField = z.object({
  id: z.string().min(1).max(24),
  usage: FieldUsage,
  label: z.string().min(1).max(40),
  kind: z.literal('writtenBox'),
  width: FieldWidth.default('medium'),
});

const BubbleGridField = z.object({
  id: z.string().min(1).max(24),
  usage: FieldUsage,
  label: z.string().min(1).max(40),
  kind: z.literal('bubbleGrid'),
  length: z.number().int().min(1).max(12),
  symbols: Symbols,
});

const HeaderField = z.discriminatedUnion('kind', [WrittenBoxField, BubbleGridField]);

/** Multiple choice. The only type rendered today. */
const ChoiceQuestion = z.object({
  kind: z.literal('choice'),
  symbols: Symbols,
  placement: z.enum(['internal', 'external']).default('internal'),
});

const Question = z.discriminatedUnion('kind', [ChoiceQuestion]);

export const SheetSpecV3 = z.object({
  templateId: z.uuid(),
  version: z.literal(3),
  /** Printed on the right edge beside the QR, so a human can identify it. */
  name: z.string().min(1).max(40),
  branding: z.string().max(30),
  paper: z.enum(['A4', 'LETTER']),
  columns: z.union([z.literal('auto'), z.number().int().min(1).max(6)]).default('auto'),
  questions: z.array(Question).min(1).max(200),
  headerFields: z.array(HeaderField).max(8),
  bubble: BubbleMetricsSchema,
});
```

**ما حُذف من v2:** `questions: number` و`choices` و`choiceLabels` و`formCode` و`title`.
**ما أُضيف:** `name` و`usage` و`width` و`placement` و`symbols` الحرة و`columns: auto`.

## 3) تصميم الأنواع المؤجلة

مسجَّلة الآن حتى تُضاف لاحقاً بلا هجرة:

```ts
// Each option carries a code the scanner records and text the student reads.
const VerboseQuestion = z.object({
  kind: z.literal('verbose'),
  options: z
    .array(
      z.object({
        code: z.string().min(1).max(2),
        text: z.string().min(1).max(60),
      }),
    )
    .min(2)
    .max(10),
  showCodes: z.boolean().default(true),
});

// The same grid primitive as a student id, placed in the question flow.
const NumericQuestion = z.object({
  kind: z.literal('numeric'),
  digits: z.number().int().min(1).max(10),
  sign: z.boolean().default(false),
  decimal: z.boolean().default(false),
  fraction: z.boolean().default(false),
  exponent: z.boolean().default(false),
});

// A handwriting box the student fills, plus bubbles THE GRADER fills.
const ResponseQuestion = z.object({
  kind: z.literal('response'),
  symbols: Symbols,
  boxWidth: FieldWidth,
  boxHeightUnits: z.number().int().min(1).max(4),
  filledBy: z.literal('grader'),
});
```

`filledBy` يوثّق أن من يظلل هنا هو المصحح لا الطالب، وهو ما يغيّر نص التعليمات في التطبيق.

**التسميات المتناوبة ليست نوعاً**، بل أداة في المنشئ تولّد قائمة أسئلة تتناوب مجموعتا رموزها. السكيما تخزن الناتج فقط. غرضها أمني: الحرف نفسه يعني خياراً مختلفاً عند الجار.

## 4) أثر خارج الورقة

**نموذج مفتاح الإجابة يحتاج وزناً لكل سؤال.** مخطط `docs/PLAN.md` يخزن المفتاح سلسلة حرف لكل سؤال بافتراض وزن متساوٍ. سؤال الإجابة القصيرة يكسر ذلك: `C` تعني «صحيح» ولها قيمة نقاط يحددها المعلم. تخزين المفتاح كسلسلة يبقى كفؤاً، ويُضاف بجانبه مصفوفة أوزان. **قرار مؤجل** إلى بناء نموذج التصحيح.

**الورقة المكتفية بذاتها، قرار مفتوح يحتاج بتّك.** الـQR يحمل `templateId` فقط، فورقة تُمسح على جهاز لا يملك القالب تفشل. ZipGrade يعالجها بزر «مشاركة النموذج». البديل الأقوى لمنتج أوفلاين أولاً: **مواصفة مضغوطة كاملة داخل الـQR** فتصير الورقة مقروءة بلا شبكة وبلا حساب. الكلفة حجم QR أكبر. يُحسم عند بناء `core-omr`.

## 5) خطة التنفيذ بترتيب التبعية

| #   | العمل                                                     | الحزمة                     | يكسر             |
| --- | --------------------------------------------------------- | -------------------------- | ---------------- |
| 1   | سكيما v3 وأنواعها                                         | `sheet-spec`               | السكيما فقط      |
| 2   | تخطيط تدفقي: ارتفاع متغير للصف، عرض متغير حسب `placement` | `sheet-spec`               | `layout/grid.ts` |
| 3   | اشتقاق `columns: auto`                                    | `sheet-spec`               | لا شيء           |
| 4   | `keyVersion` كحقل شبكة، وحذف `formCode`                   | `sheet-spec`               | المواصفة والـQR  |
| 5   | تحديث الاختبارات والنماذج البصرية                         | `sheet-spec`               | لا شيء           |
| 6   | رسم التسمية الخارجية، والمعرّف المقروء على الحافة         | `sheet-pdf`                | `render.ts`      |
| 7   | خيارات التنزيل: 1 و2 و4 نسخ، ودرجات السواد                | `sheet-pdf`                | إضافة فقط        |
| 8   | تصدير PNG                                                 | `sheet-pdf`                | إضافة فقط        |
| 9   | الأنواع الأربعة المؤجلة                                   | `sheet-spec` + `sheet-pdf` | إضافة فقط        |
| 10  | أوزان مفتاح الإجابة                                       | نموذج التصحيح              | لاحقاً           |

البنود 1 إلى 6 هي المرحلة الحالية. البند 2 أثقلها، والباقي مباشر.

**ما ينجو بلا تعديل:** `bubbleGroups` و`Bubble` و`Rect` و`LayoutResult` وكل حزمة `sheet-pdf` عدا الرسم، وأدوات القيم في Typst، ونموذج الأمان. أقوى دليل على ذلك أن الإدخال الرقمي عندهم هو حرفياً بنية `GridFieldLayout` عندنا.
