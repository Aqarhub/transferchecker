# مواصفة تصميم ورقة الإجابة (Sheet Spec v2)

> آخر تحديث: 2026-08-13. المرجع البصري: نمط ZipGrade (صورة مرجعية من المستخدم).
> النماذج البصرية: `docs/mockups/sheet-mockup-en.svg` و `docs/mockups/sheet-mockup-ar.svg`.

## 1) المبدأ الحاكم

الورقة تولَّد من config والماسح يستنتج نفس الإحداثيات من نفس الـconfig.
دالة خالصة واحدة `layout(spec) -> coordinates` تعيش في حزمة `sheet-spec` ويستهلكها الطرفان: مولّد PDF (Typst) ومحرك المسح (core-omr). صفر تخمين.

## 2) مناطق الورقة (A4: 210x297mm، Letter: 216x279mm)

| المنطقة | الموقع | ملاحظات |
|---|---|---|
| مربعات ركنية (fiducials) | 4 زوايا، 8x8mm، هامش 6mm | نقاط المرجع للتصحيح المنظوري |
| شريط التوقيت (timing marks) | الحافة اليسرى، علامة لكل صف أسئلة | تحديد الصف حتى مع انزياح الطباعة |
| اسم الموقع | نص عمودي على الحافة اليسرى أعلى | نص قابل للتخصيص (branding) |
| عنوان الاختبار | نص عمودي على الحافة اليمنى | من إعداد المستخدم، أي لغة |
| QR | مربع صغير أعلى يمين | يحمل templateId + version + formCode |
| حقول الترويسة | شريط أفقي أعلى الورقة | قابلة للإضافة والحذف والتخصيص |
| شبكة الأسئلة | جسم الورقة، 1 إلى 4 أعمدة | فقاعات بمسافات ثابتة بالمليمتر |
| شبكة هوية الطالب | يمين الجسم (اختيارية) | أعمدة أرقام 0-9 |
| تحذير الطباعة | أسفل الورقة | «Print at 100% scale» |

## 3) السكيما (Zod، حزمة sheet-spec)

```ts
// Header fields are fully user-defined: any label, any language,
// handwritten box or bubble grid (e.g. a bubbled name instead of writing).
const HeaderField = z.object({
  id: z.string().min(1).max(24),
  label: z.string().min(1).max(40),          // any language, shaped by Typst
  kind: z.enum(['writtenBox', 'bubbleGrid']),
  // bubbleGrid only:
  length: z.number().int().min(1).max(12).optional(),   // characters/digits count
  alphabet: z.enum(['digits', 'latin', 'arabic']).optional(),
});

export const SheetSpec = z.object({
  templateId: z.uuid(),
  version: z.literal(2),
  paper: z.enum(['A4', 'LETTER']),
  questions: z.number().int().min(1).max(200),
  choices: z.number().int().min(2).max(6),
  columns: z.number().int().min(1).max(4),
  bubbleLabels: z.enum(['latin', 'arabic']),  // A B C D vs Arabic letters
  headerFields: z.array(HeaderField).max(6),  // default: name + section + score
  studentId: z.object({
    digits: z.number().int().min(2).max(10),
  }).nullable(),                              // null = no student ID grid
  branding: z.string().max(30),               // vertical site name text
  title: z.string().max(60),                  // vertical exam title, any language
  formCode: z.string().regex(/^[A-D]$/),
  bubble: z.object({
    rMm: z.number().min(1.8).max(3.5),
    pitchXMm: z.number().min(5).max(10),
    pitchYMm: z.number().min(6).max(12),
  }),
});
```

## 4) حرية التخصيص (ما يتحكم فيه المعلم)

- عدد الأسئلة (1-200)، عدد الخيارات (2-6)، عدد الأعمدة (1-4).
- حروف الفقاعات: لاتينية (A B C D) أو عربية (أ ب ج د).
- حقول الترويسة بالكامل: إضافة، حذف، إعادة تسمية بأي لغة، وتحويل أي حقل من كتابة يدوية إلى تظليل فقاعات (مثال: الاسم تظليلاً بدل الكتابة).
- شبكة هوية الطالب: اختيارية، عدد خانات 2-10، أو تُستبدل بحقل ترويسة مخصص.
- اسم الموقع وعنوان الاختبار: نص حر.
- أبعاد الفقاعات والمسافات: قيم افتراضية مدروسة وقابلة للضبط ضمن حدود آمنة للمسح.

## 5) قواعد اللغة والاتجاه

1. **الأصل في هيكل الورقة إنجليزي LTR:** أرقام الأسئلة أرقام غربية (1, 2, 3) دائماً، واتجاه الشبكة من اليسار لليمين، وتحذير الطباعة بالإنجليزية (مع سطر عربي عند اختيار قالب عربي).
2. **حروف الفقاعات** قابلة للتبديل إلى العربية دون تغيير اتجاه الشبكة.
3. **تسميات الحقول** (الاسم، رقم الطالب، الشعبة وغيرها) نص حر بأي لغة، وTypst يتكفل بتشكيل العربية الصحيح.
4. ما يعبيه الطالب بخط اليد لا يعنينا لغوياً، الماسح لا يقرأه.

## 6) قواعد وقيود

- الماسح يقرأ أي `bubbleGrid` بشكل عام: كل عمود في الشبكة يمثل خانة واحدة، فلا كود خاصاً لكل حقل.
- تحذير مساحة موثق للمستخدم: حقل اسم بالتظليل يستهلك مساحة كبيرة (26 صفاً للاتينية، 28 للعربية لكل خانة)، والواجهة تحسب وترفض التركيبات التي لا تتسع في الورقة (دالة `fits(spec)` في نفس الحزمة).
- عند عدم اتساع الأسئلة في صفحة واحدة بالتركيبة المختارة، تُرفض التركيبة برسالة واضحة بدل توليد ورقة مشوهة. دعم تعدد الصفحات قرار مؤجل خارج الـMVP.
- كل الإحداثيات دوال من الـspec بالمليمتر. لا قيمة ثابتة في المولّد أو الماسح خارج هذه الحزمة.
