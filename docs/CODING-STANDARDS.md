# معايير الكتابة والجودة (إلزامية)

> أي كود لا يلتزم بهذه المعايير يُرفض في المراجعة. آخر تحديث: 2026-08-13.

## 1) قواعد إلزامية غير قابلة للنقاش

1. **التعليقات داخل الكود بالإنجليزية فقط.** لا تعليقات عربية في أي ملف كود.
2. **نصوص الواجهة ورسائل الأخطاء:** ممنوع استخدام الشرطة الطويلة (—) للفصل بين الكلام نهائياً. يُستخدم فقط الفاصلة (،) أو النقطة (.). ينطبق على العربية والإنجليزية معاً، وعلى كل ملفات الترجمة في `packages/shared`.
3. **الملفات صغيرة:** الهدف أقل من 200 سطر للملف، والحد الأقصى 300 سطر. ملف يتجاوز الحد يُقسَّم قبل الدمج. الاستثناء الوحيد: ملفات البيانات المولَّدة والاختبارات الذهبية.
4. **التوثيق إلزامي:** كل تغيير يُسجَّل في `docs/DEVLOG.md` قبل الدمج.
5. **التحقق من حداثة الأدوات:** قبل إضافة أي تبعية جديدة، تحقق من تاريخ اليوم ثم من آخر إصدار مستقر وحالة الصيانة والثغرات، ووثّق ذلك في `docs/TECH-STACK.md`.

## 2) tsconfig الصارم (الأساس المشترك لكل الحزم)

إصدار TypeScript المعتمد: **6.0.3 مثبّت بالضبط** (بدون `^`). السبب موثق في `docs/TECH-STACK.md`: typescript-eslint لا يدعم TS 7 بعد، والأنواع متطابقة بين 6.0 و7.0 بالتصميم فالترقية لاحقاً آمنة.

```jsonc
// tsconfig.base.json (verified against TypeScript 6.x, 2026-08-13)
{
  "compilerOptions": {
    // Type safety
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noPropertyAccessFromIndexSignature": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "allowUnreachableCode": false,

    // Module hygiene
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "erasableSyntaxOnly": true,

    // Environment: target is pinned explicitly because TS 6 made it float yearly
    "target": "es2024",
    "lib": ["es2024"],
    "types": [],

    // Speed without losing safety in our own code
    "esModuleInterop": true,
    "skipLibCheck": true,
  },
}
```

إعدادات الوحدات تختلف حسب نوع الحزمة (لا توضع في الأساس):

- تطبيقات محزومة (mobile عبر Metro، web عبر Turbopack): `"module": "preserve"` + `"moduleResolution": "bundler"`.
- حزم وأدوات تعمل على Node مباشرة: `"module": "nodenext"`.
- ممنوعات حُذفت في TS 7 نهائياً: `baseUrl` (استخدم `imports` في package.json)، `moduleResolution: node/classic`، `target: es5`، `outFile`.

ملاحظات:

- `noUncheckedIndexedAccess` هو أهم علم لمحرك OMR: كل وصول لمصفوفة إحداثيات يُعامل كأنه قد يكون `undefined`، فيُجبرنا على معالجة الحالة بدل الانهيار وقت التشغيل.
- `erasableSyntaxOnly` يمنع enum وnamespace وparameter properties، وبه تعمل ملفاتنا مباشرة على Node 24 بدون أدوات (`node file.ts`).
- الحزم الخالصة (`core-omr`, `sheet-spec`) تمنع أي تبعية runtime.

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

- **typescript-eslint 8.67+** على ESLint 10 بإعداد flat config مع `projectService: true` والقواعد المعتمدة على الأنواع (`strictTypeChecked`). هذه القواعد (floating promises وأخواتها) هي أعلى الأدوات قدرة على اصطياد الأخطاء الحقيقية لأنها تعمل على الـchecker الفعلي.
- `tsc -b --noEmit` بمراجع المشاريع (project references) لكل حزمة في CI، وليس فحصاً واحداً للجذر.
- **Prettier** للتنسيق، بلا نقاش على الأسلوب في المراجعات. (Biome 2.5 بديل مقبول كمنسق وفاحص سريع، لكنه لا يغني عن typescript-eslint.)
- **Knip 6** لكشف الكود والصادرات الميتة.
- **publint + arethetypeswrong** على كل حزمة داخلية لكشف أخطاء الـexports والأنواع المغلوطة.
- **Vitest** مع عتبة تغطية للحزم الخالصة، والمجموعة الذهبية كبوابة دقة (>=99.7%).
- **tsx** أو Node 24 مباشرة لتشغيل السكربتات. ts-node ممنوع (مهجور منذ 2023).
- فحص آلي لقاعدة الشرطة الطويلة: سكربت CI يرفض أي `—` في ملفات الترجمة ونصوص الواجهة.
- **Renovate** لتحديث التبعيات مع فترة انتظار قبل اعتماد الإصدارات الجديدة (حماية من هجمات سلسلة التوريد). TypeScript وdrizzle-orm يثبَّتان بالضبط ويُرقيان بقرار موثق فقط.
- **Zod 4** عند كل الحدود (v3 متوقف). الصيغ بالدوال المستقلة الجديدة: `z.email()` و`z.uuid()` بدل السلاسل المتصلة.

## 5) بنية الكود

- ملف واحد = مسؤولية واحدة. الدالة أقل من 40 سطراً غالباً.
- الحزم الخالصة لا تستورد من `apps/` أبداً. اتجاه الاعتماد: `apps → packages` فقط.
- أسماء الملفات `kebab-case`، الأنواع `PascalCase`، الدوال والمتغيرات `camelCase`، الثوابت `SCREAMING_SNAKE_CASE`.
- التعليق يشرح **لماذا** وليس ماذا. الكود الواضح لا يحتاج تعليقاً يعيد سرده.

## 6) Git

- رسائل commit بصيغة Conventional Commits بالإنجليزية: `feat(core-omr): add perspective warp`.
- كل PR صغير ومركّز، ويتضمن تحديث `docs/DEVLOG.md`.
- لا دمج مع CI أحمر. لا استثناءات.
