# معايير الكتابة والجودة (إلزامية)

> أي كود لا يلتزم بهذه المعايير يُرفض في المراجعة. آخر تحديث: 2026-08-13.

## 1) قواعد إلزامية غير قابلة للنقاش

1. **التعليقات داخل الكود بالإنجليزية فقط.** لا تعليقات عربية في أي ملف كود.
2. **نصوص الواجهة ورسائل الأخطاء:** ممنوع استخدام الشرطة الطويلة (—) للفصل بين الكلام نهائياً. يُستخدم فقط الفاصلة (،) أو النقطة (.). ينطبق على العربية والإنجليزية معاً، وعلى كل ملفات الترجمة في `packages/shared`.
3. **الملفات صغيرة:** الهدف أقل من 200 سطر للملف، والحد الأقصى 300 سطر. ملف يتجاوز الحد يُقسَّم قبل الدمج. الاستثناء الوحيد: ملفات البيانات المولَّدة والاختبارات الذهبية.
4. **التوثيق إلزامي:** كل تغيير يُسجَّل في `docs/DEVLOG.md` قبل الدمج.
5. **التحقق من حداثة الأدوات:** قبل إضافة أي تبعية جديدة، تحقق من تاريخ اليوم ثم من آخر إصدار مستقر وحالة الصيانة والثغرات، ووثّق ذلك في `docs/TECH-STACK.md`.

## 2) tsconfig الصارم (الأساس المشترك لكل الحزم)

```jsonc
// tsconfig.base.json
{
  "compilerOptions": {
    // Type safety
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "allowUnreachableCode": false,

    // Module hygiene
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "moduleDetection": "force",

    // Environment
    "target": "es2022",
    "lib": ["es2023"],
    "module": "preserve",
    "moduleResolution": "bundler",

    // Speed without losing safety in our own code
    "skipLibCheck": true
  }
}
```

- `noUncheckedIndexedAccess` هو أهم علم لمحرك OMR: كل وصول لمصفوفة إحداثيات يُعامل كأنه قد يكون `undefined`، فيُجبرنا على معالجة الحالة بدل الانهيار وقت التشغيل.
- الحزم الخالصة (`core-omr`, `sheet-spec`) تضيف `"exactOptionalPropertyTypes"` بلا استثناءات وتمنع أي تبعية runtime.

## 3) قواعد TypeScript لتقليل الأخطاء

1. **ممنوع `any`.** عند الاضطرار تُستخدم `unknown` ثم تضييق بالنوع أو Zod.
2. **ممنوع `as` (type assertion)** إلا في حالات موثقة بتعليق يشرح السبب. ممنوع `!` (non-null assertion) نهائياً.
3. **Zod عند كل الحدود:** أي بيانات تدخل النظام (API، QR، ملفات، قاعدة بيانات، إعدادات) تمر عبر `schema.parse` أولاً. الأنواع تُستنتج بـ`z.infer` ولا تُكتب مرتين.
4. **Discriminated unions للنتائج بدل الرمي:**
   ```ts
   // Scan outcome is data, not an exception. Ambiguity must be explicit.
   type ScanResult =
     | { kind: 'ok'; answers: string; score: number }
     | { kind: 'ambiguous'; question: number; fills: number[] }
     | { kind: 'no_sheet' };
   ```
5. **Exhaustiveness check:** كل `switch` على union يُغلق بـ:
   ```ts
   default: { const _exhaustive: never = value; throw new Error('Unreachable'); }
   ```
6. **`as const` للثوابت** و`readonly` للمصفوفات والكائنات التي لا يجب تعديلها. إحداثيات الورقة كلها `readonly`.
7. **أنواع Branded للمعرّفات** حتى لا يُمرَّر `examId` مكان `templateId`:
   ```ts
   type ExamId = string & { readonly __brand: 'ExamId' };
   ```
8. **الدوال الخالصة أولاً:** `core-omr` و`sheet-spec` بلا حالة وبلا side effects. المدخلات والمخرجات فقط. هذا ما يجعل الاختبار والتصحيح ممكناً.
9. **لا `enum`.** تُستخدم union types أو `as const` objects. متوافقة مع `verbatimModuleSyntax` وأسهل في التحليل.
10. **الأخطاء المتوقعة قيم، والأخطاء البرمجية استثناءات.** لا `try/catch` للتحكم بالمسار الطبيعي.

## 4) الفحص الآلي (CI يرفض المخالفة)

- **typescript-eslint** بإعداد flat config مع القواعد المعتمدة على الأنواع (`recommendedTypeChecked` + `strictTypeChecked` للحزم الخالصة).
- `tsc --noEmit` لكل حزمة على حدة في CI، وليس فحصاً واحداً للجذر.
- **Prettier** للتنسيق، بلا نقاش على الأسلوب في المراجعات.
- **Knip** لكشف الكود والصادرات الميتة.
- **Vitest** مع عتبة تغطية للحزم الخالصة، والمجموعة الذهبية كبوابة دقة (>=99.7%).
- فحص آلي لقاعدة الشرطة الطويلة: سكربت CI يرفض أي `—` في ملفات الترجمة ونصوص الواجهة.
- **Renovate** لتحديث التبعيات مع فترة انتظار قبل اعتماد الإصدارات الجديدة (حماية من هجمات سلسلة التوريد).

## 5) بنية الكود

- ملف واحد = مسؤولية واحدة. الدالة أقل من 40 سطراً غالباً.
- الحزم الخالصة لا تستورد من `apps/` أبداً. اتجاه الاعتماد: `apps → packages` فقط.
- أسماء الملفات `kebab-case`، الأنواع `PascalCase`، الدوال والمتغيرات `camelCase`، الثوابت `SCREAMING_SNAKE_CASE`.
- التعليق يشرح **لماذا** وليس ماذا. الكود الواضح لا يحتاج تعليقاً يعيد سرده.

## 6) Git

- رسائل commit بصيغة Conventional Commits بالإنجليزية: `feat(core-omr): add perspective warp`.
- كل PR صغير ومركّز، ويتضمن تحديث `docs/DEVLOG.md`.
- لا دمج مع CI أحمر. لا استثناءات.
