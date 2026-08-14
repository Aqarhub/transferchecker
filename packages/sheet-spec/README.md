# @transferchecker/sheet-spec

مواصفة ورقة الإجابة ومحرك التخطيط. **حزمة TypeScript خالصة بلا أي تبعية وقت تشغيل عدا Zod، ولا تعرف شيئاً عن React أو الكاميرا.**

هذه الحزمة هي مصدر الحقيقة الوحيد لمواقع كل شيء على الورقة. مولّد PDF يرسم ما تعيده، والماسح يقرأ من نفس الإحداثيات، فلا يمكن أن يختلفا.

## الاستخدام

```ts
import { SheetSpecSchema, layoutSheet, bubbleGroups } from '@transferchecker/sheet-spec';

const spec = SheetSpecSchema.parse(input);
const result = layoutSheet(spec);

if (result.kind === 'overflow') {
  // Not an error: data the UI turns into guidance for the teacher.
  console.log(result.area, result.axis, result.neededMm, result.availableMm);
} else {
  const groups = bubbleGroups(result.layout); // what the scanner scores
}
```

## المفاهيم

- **`layoutSheet(spec)`** دالة خالصة تحوّل المواصفة إلى إحداثيات بالمليمتر. لا ترمي استثناءً لأي تركيبة قد يطلبها معلم، بل تعيد `overflow` كبيانات.
- **`bubbleGroups(layout)`** تسطّح التخطيط إلى مجموعات، والمجموعة هي فقاعات يُظلَّل منها واحدة على الأكثر (سؤال واحد، أو خانة واحدة من شبكة). الماسح يمشي على المجموعات دون أن يعرف نوع الحقل، فيبقى كود القراءة بلا حالات خاصة.
- **كل فقاعة تحمل رمزها** (`A` أو `٣` أو `أ`)، فالماسح يعيد الإجابة مباشرة.

## قواعد لا تُخالف

1. **الإحداثيات كلها بالمليمتر** والأصل الزاوية العليا اليسرى، وهو نفس اتجاه الصورة بعد تصحيح المنظور.
2. **تغيير ثوابت `GEOMETRY` يكسر التوافق.** ورقة طُبعت اليوم يجب أن تُقرأ بعد سنوات، فأي تعديل يستوجب رفع `SheetSpec.version`.
3. **صفر تبعيات وقت تشغيل غير Zod**، وصفر استيراد من `apps/`.

## الأوامر

```bash
pnpm test        # اختبارات vitest، تشمل ثوابت هندسية (تداخل الفقاعات، حدود الورقة)
pnpm typecheck   # tsc بكل الأعلام الصارمة
pnpm mockups     # يعيد توليد docs/mockups من محرك التخطيط الحقيقي
```

## التصميم

التفاصيل الكاملة وقواعد اللغة والاتجاه في [`docs/SHEET-SPEC.md`](../../docs/SHEET-SPEC.md).
