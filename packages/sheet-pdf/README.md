# @transferchecker/sheet-pdf

يحوّل تخطيط الورقة إلى مصدر Typst ثم إلى PDF جاهز للطباعة.

الحزمة **لا تحسب أي إحداثي**. كل موضع يأتي من `@transferchecker/sheet-spec`، فما يُطبع هو حرفياً ما سيقرؤه الماسح.

## لماذا Typst

تحقّقنا بالتشغيل الفعلي: Typst يشكّل العربية بشكل صحيح (وصل الحروف وترتيب RTL) ويضع المحتوى بدقة ملليمترية في آن. مكتبات JavaScript لتوليد PDF لا تفعل الاثنين معاً، وpdf-lib لا يشكّل العربية إطلاقاً. التفاصيل في [`docs/TECH-STACK.md`](../../docs/TECH-STACK.md).

## الاستخدام

```ts
import { layoutSheet, SheetSpecSchema } from '@transferchecker/sheet-spec';
import { encodeSheetQr, renderSheetTypst } from '@transferchecker/sheet-pdf';

const spec = SheetSpecSchema.parse(input);
const result = layoutSheet(spec);
if (result.kind !== 'ok') return result; // overflow, تُعرض للمعلم

const source = renderSheetTypst(result.layout, {
  fonts: ['IBM Plex Sans Arabic', 'IBM Plex Sans'],
  warningLines: ['Print at 100% scale. Do not use Fit to page.'],
  qr: encodeSheetQr({
    templateId: spec.templateId,
    version: spec.version,
    formCode: spec.formCode,
  }),
});
```

`renderSheetTypst` دالة خالصة تعيد نصاً. التصريف إلى PDF خطوة منفصلة عند الحافة، حتى يبقى التوليد قابلاً للاختبار بلا ثنائيات.

## الأمان: لماذا كل نص مستخدم يخرج كسلسلة نصية

عناوين الاختبارات وتسميات الحقول يكتبها المستخدم، وTypst يعتبر `#` بداية كود. لذلك **لا يُكتب أي نص مستخدم في وضع الـmarkup إطلاقاً**، بل يخرج دائماً كسلسلة نصية بين علامتي اقتباس عبر `str()`، فلا يوجد أصلاً مسار يصل به إلى موضع تنفيذ. الاختبارات تغطي هذا بعنوان عدائي.

## الأوامر

```bash
pnpm test       # وحدات + اختبار تكامل يتحقق أن Typst يقبل المصدر المولَّد
pnpm typecheck
pnpm sample     # يولّد docs/samples، مرّر مجلد خطوط كوسيط ثانٍ
```

مثال مع خطوط:

```bash
pnpm sample ../../docs/samples ../../.fonts
```

## الخطوط

Typst لا يقرأ خطوط النظام هنا، فيجب تمرير مجلد خطوط يحتوي على TTF أو OTF لعائلة IBM Plex. الخطوط ليست في المستودع، وتُجلب عند البناء.

## معايرة الطباعة

قبل اعتماد أي تغيير في `GEOMETRY`: اطبع الورقة بمقياس 100٪ وقس بالمسطرة أن المربعات الركنية 8mm وأن مسافة الفقاعات 6.2mm. تغيير الثوابت يكسر توافق الأوراق المطبوعة سابقاً ويستوجب رفع `SheetSpec.version`.
