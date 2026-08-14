# الستاك المعتمد والتحقق من الإصدارات

> تاريخ التحقق: **2026-08-13**. تم التحقق عبر npm registry الرسمي، مستودعات GitHub الرسمية، وإصدارات المشاريع.
> **قاعدة:** قبل إضافة أي تبعية جديدة، أضف سطرها هنا مع تاريخ التحقق والمصدر.

## جدول ملخص (الإصدارات المستقرة بتاريخ 2026-08-13)

| الأداة                      | الإصدار                      | الحالة                                         | القرار                        |
| --------------------------- | ---------------------------- | ---------------------------------------------- | ----------------------------- |
| Expo SDK                    | 57 (expo@57.0.12)            | نشط، يشحن RN 0.86.2 + React 19.2.3             | اعتماد                        |
| React Native                | 0.86.2 (عبر Expo 57)         | New Architecture فقط، Hermes V1 افتراضي        | اعتماد                        |
| react-native-vision-camera  | 5.2.2                        | v5 إعادة كتابة على Nitro Modules، v4 مؤرشف     | اعتماد مع الانتباه لتغير API  |
| react-native-fast-opencv    | 1.0.1                        | v1 أعيدت كتابته لـNew Architecture، صيانة نشطة | اعتماد مع حذر (مطوّر واحد)    |
| @shopify/react-native-skia  | 2.11.0                       | نشط جداً (Shopify)                             | اعتماد عبر SkiaCamera         |
| react-native-worklets (SWM) | 0.11.x                       | المعيار الجديد للـworklets                     | اعتماد، **ليس** worklets-core |
| expo-sqlite                 | 57.x مع useSQLCipher         | دعم SQLCipher رسمي أولى الطرف                  | اعتماد بدل op-sqlite          |
| Supabase                    | Postgres 17 مُدار            | نشط، RLS + Auth ناضجة                          | اعتماد                        |
| Drizzle ORM                 | 0.45.2 + drizzle-kit 0.31.10 | نشط، الإصدار 1.0 في مرحلة RC                   | اعتماد بتثبيت الإصدار         |
| PostgreSQL (Supabase)       | 17 (لا يوجد 18 بعد)          | uuidv7() الأصلية تحتاج PG18                    | توليد UUIDv7 في التطبيق       |
| Next.js                     | 16.3.x                       | Turbopack افتراضي، React 19                    | اعتماد بدل 15                 |
| Typst                       | 0.15.x                       | تشكيل عربي صحيح + دقة mm                       | اعتماد بدل pdf-lib            |
| TypeScript                  | 6.0.3 مثبّت                  | TS 7 صدر لكن typescript-eslint لا يدعمه        | تثبيت 6.0.3 مؤقتاً            |
| Node.js                     | 24 (Active LTS)              | type stripping مستقر                           | اعتماد                        |
| Zod                         | 4.4.x                        | v3 متوقف نهائياً                               | اعتماد v4                     |
| i18next + react-i18next     | 26.3.4+ / 17.x               | حد أدنى أمني، جمع عربي أصلي                    | اعتماد بدون ICU               |
| pnpm                        | 11.21                        | أمان سلسلة توريد افتراضي                       | اعتماد عبر packageManager     |
| Turborepo                   | 2.10.x                       | كاش بعيد مجاني، --affected                     | اعتماد                        |
| Vitest                      | 4.1.x                        | Browser Mode مستقر                             | اعتماد، وjest-expo لمكونات RN |
| ESLint + typescript-eslint  | 10.x / 8.67+                 | الفحص المعتمد على الأنواع                      | اعتماد كفاحص أساسي            |

## تغييرات جوهرية عن الخطة الأصلية (مكتشفة بالتحقق)

الخطة الأصلية كُتبت بمعلومات ما قبل 2026 وتحتاج هذه التصحيحات:

1. **VisionCamera v4 انتهى.** آخر إصدار 4.7.3 في 2025-11 والمستودع مؤرشف له. الإصدار الحالي v5 (أبريل 2026) إعادة كتابة كاملة على Nitro Modules:
   - `useFrameProcessor` أصبح `useFrameOutput`.
   - `takePhoto()` أصبح `capturePhoto()`.
   - Formats API استُبدل بـConstraints API.
   - **إلزامي:** `frame.dispose()` بعد كل فريم داخل try/finally، وإلا يتوقف تدفق الكاميرا لأن مخزن الفريمات محدود.
   - المعالجة غير المتزامنة عبر `AsyncRunner`، وإذا أرجع `runAsync()` قيمة false يجب إسقاط الفريم فوراً، لا طوابير.
2. **`useSkiaFrameProcessor` حُذف في v5.** الرسم فوق الكاميرا الآن عبر حزمة منفصلة `react-native-vision-camera-skia` بمكوّن `<SkiaCamera />`. كل حزم `react-native-vision-camera-*` تُحدَّث معاً بنفس الرقم (5.2.2).
3. **worklets-core أصبح legacy.** المعيار الآن `react-native-worklets` من Software Mansion (نفس محرك Reanimated 4)، وهو ما يستخدمه VisionCamera 5.
4. **fast-opencv v1 غيّر إدارة الذاكرة.** الـMats الآن JSI Host Objects بجمع قمامة تلقائي. `mat.release()` لم يعد إلزامياً لكنه **موصى به بشدة** داخل حلقة الفريمات لتجنب قفزات الذاكرة. `clearBuffers()` حُذفت.
5. **المعمارية القديمة لـRN أُزيلت نهائياً** منذ RN 0.82 (أكتوبر 2025). لا يوجد خيار رجوع. كل تبعية native يجب أن تدعم New Architecture وHermes V1.
6. **لا uuidv7() أصلية على Supabase.** الدالة موجودة في PostgreSQL 18 لكن Supabase يوفر PG17 حالياً، ولا يمكن تثبيت امتدادات native على الاستضافة المدارة. الحل: توليد UUIDv7 على الجهاز (مثالي للـoffline-first) أو دالة SQL خالصة، مع الانتقال للأصلية عند توفر PG18.
7. **Supabase Auth يستخدم bcrypt** (cost 10) وليس Argon2id لإنشاء التجزئات. Argon2 مدعوم للتحقق فقط (استيراد مستخدمين). فحص كلمات السر المسربة (HIBP) ميزة خطة Pro.

## 1) الموبايل: Expo + React Native

- **Expo SDK 57** (expo@57.0.12، صدر 2026-06-30، آخر patch 2026-08-10): يشحن RN 0.86.2 + React 19.2.3.
- **لا تستخدم RN 0.87** (صدر 2026-08-11): حزمة worklets تدعم حتى 0.86 فقط. الترقية عند صدور Expo SDK 58.
- **مهم:** RN 0.85 (في Expo SDK 56 المبكر) فيه تسريب ذاكرة في Hermes V1 يظهر تحديداً مع worklets/Reanimated. الإصلاح في RN 0.86.2. **ثبّت RN >= 0.86.2.**
- Dev client + EAS Build من اليوم الأول. Expo Go لا يعمل مع VisionCamera.
- EAS Update (OTA): يحدّث JS والأصول فقط، لا كود native. استخدم `runtimeVersion: { policy: "fingerprint" }` وفعّل توقيع التحديثات (code signing). الخطة المجانية: 1000 مستخدم نشط شهرياً و100GiB نقل.
- Node.js 22+ مطلوب.

## 2) الكاميرا والرؤية الحاسوبية

الحزم المعتمدة (تُثبَّت معاً بنفس الإصدار حيث ينطبق):

```
react-native-vision-camera@5.2.2
react-native-vision-camera-worklets@5.2.2
react-native-vision-camera-skia@5.2.2
react-native-vision-camera-resizer@5.2.2
react-native-nitro-modules >= 0.36.4   (إصلاح ANR)
react-native-worklets (SWM)
react-native-reanimated@4.x
react-native-fast-opencv@1.0.1
@shopify/react-native-skia@2.11.0
```

قواعد التشغيل الحرجة:

- صيغة البكسل `'yuv'` (الأكفأ، `'rgb'` أغلى بـ2.6 مرة). تحقق من `Frame.pixelFormat` وقت التشغيل.
- تصغير الفريم عبر `react-native-vision-camera-resizer` قبل `Mat.createFromVisionCameraFrameBuffer()`.
- `frame.dispose()` دائماً في try/finally. `mat.release()` في الحلقات الساخنة.
- FPS معتدل (30) عبر Constraints API. سرعة التحليل هي المحدد وليس سرعة الكاميرا.
- انتبه: OpenCV على iOS إصدار 4.9.0 وعلى Android إصدار 4.12.0. اختبر الدقة على المنصتين.
- ثغرة معروفة مفتوحة: دوران canvas في SkiaCamera (issue #4153). اختبر كل الاتجاهات.
- **تحذير:** كل الدروس وأمثلة الإنترنت قبل 2026 تشرح v4 API الميت. اعتمد على التوثيق الرسمي الحالي فقط.

## 3) الباك إند: Supabase + Drizzle + PostgreSQL

- **Supabase**: مشاريع جديدة على PostgreSQL 17. الخطة المجانية 500MB وتتوقف بعد أسبوع خمول، خطة Pro من $25 شهرياً ضرورية للإنتاج.
- **Auth**: bcrypt، تدوير refresh token مفعّل افتراضياً مع كشف إعادة الاستخدام (إعادة استخدام توكن تبطل عائلة الجلسة كلها). تأكيد البريد مفعّل افتراضياً على الاستضافة المدارة.
- **org_id في JWT**: عبر Custom Access Token Hook يكتب في `app_metadata`. لا تعتمد أبداً على `user_metadata` في السياسات (المستخدم يستطيع تعديلها).
- **RLS بالنمط الأدائي الموثق رسمياً**:
  ```sql
  create policy scans_isolation on scans
    to authenticated
    using ( org_id = (select (auth.jwt()->'app_metadata'->>'org_id')::uuid) );
  ```
  - لفّ `auth.jwt()` بـ`(select ...)` دائماً: يُحسب مرة لكل استعلام بدل كل صف (فرق يصل 99.99%).
  - فهرس على كل عمود تستخدمه السياسات.
  - حدد `to authenticated` دائماً.
  - كرر فلتر `org_id` في استعلام العميل حتى مع وجود السياسة (يحسّن الخطة).
- **Drizzle**: ثبّت `drizzle-orm@0.45.2` و`drizzle-kit@0.31.10`. الإصدار 1.0 في مرحلة RC وفيه تغييرات كاسرة (Relations v2)، الترقية له قرار مؤجل موثق.
- **تحذير مزدوج**:
  - اتصال Drizzle كمستخدم postgres يتجاوز RLS كلياً. الوصول من العميل يمر عبر PostgREST حيث تُطبق RLS.
  - مع Supavisor transaction mode (منفذ 6543) يجب تعطيل prepared statements: `postgres(url, { prepare: false })`. الـmigrations على الاتصال المباشر (5432) فقط.
- **UUIDv7**: يولَّد على الجهاز (مناسب تماماً للأوفلاين) لحين توفر PG18 على Supabase.

## 4) الويب وتوليد PDF

- **Next.js 16.3.x** (وليس 15 كما في الخطة الأصلية): App Router، Turbopack أصبح الافتراضي للبناء والتطوير، React 19.x، الحد الأدنى Node 20.9.
  - `middleware.ts` أصبح مهجوراً لصالح `proxy.ts`.
  - درس أمني من CVE-2025-29927 (تجاوز مصادقة في middleware بدرجة 9.1): لا تجعل الـproxy/middleware خط الدفاع الوحيد للمصادقة أبداً، التحقق يتكرر في طبقة البيانات.
  - النشر على Cloudflare: `@cloudflare/next-on-pages` مهجور. المسار الرسمي `@opennextjs/cloudflare` >= 1.20.2 مع Next >= 16.2.11 (الإصدارات 16.0 حتى 16.2.10 كانت مكسورة مع المحوّل). على Vercel: بدون إعداد إضافي.

- **قرار توليد PDF (تغيير جوهري عن الخطة):** الخطة الأصلية اختارت pdf-lib وهو خيار خاطئ لسببين مؤكدين:
  1. **pdf-lib مهجور:** آخر إصدار 1.17.1 في نوفمبر 2021، وآخر commit في نفس الشهر، و279 مشكلة مفتوحة.
  2. **لا يدعم العربية:** لا يملك محرك تشكيل حروف (text shaping) ولا خوارزمية bidi. الحروف العربية تخرج مقطعة وبترتيب خاطئ. الـfork المصان `@cantoo/pdf-lib` لا يحل التشكيل أيضاً (تم فحص سجل تغييراته بالكامل).
  3. الحقيقة الأوسع: **لا توجد مكتبة JS تشكّل العربية بشكل صحيح في 2026.** satori بلا RTL نهائياً، pdfmake طلب الـRTL مفتوح منذ 2015، @react-pdf/renderer دعمه للعربية مكسور بعدة ثغرات مفتوحة.

  **البديل المعتمد: Typst v0.15.x**
  - محرك تنضيد بلغة Rust، يشكّل العربية بشكل صحيح عبر rustybuzz (منفذ HarfBuzz) مع خوارزمية bidi كاملة: `set text(lang: "ar", dir: rtl)`.
  - دقة ملليمترية حقيقية: `place(dx, dy)` بوحدة `mm` مباشرة، مثالي لشبكة الفقاعات والمربعات الركنية.
  - لغة برمجية حقيقية: شبكة الفقاعات تولَّد من بيانات الـspec بحلقات.
  - إخراج حتمي (نفس المدخلات = نفس الملف بالبايت) مع تضمين الخطوط تلقائياً. ثبّت إصدار Typst في CI.
  - التشغيل: typst CLI في route handler بـNode أو في CI. لا يعمل داخل Cloudflare Workers (ثنائي native).
  - خطوط عربية كاملة الجداول إلزامية: Noto Naskh Arabic أو Amiri أو IBM Plex Sans Arabic. rustybuzz لا يملك fallback shaper، الخط الناقص يفشل بصمت.
  - البديل الاحتياطي إن فضّلنا HTML/CSS: طباعة Chromium عبر Playwright (تشكيل مثالي لكن أثقل تشغيلياً).
  - `@cantoo/pdf-lib` يبقى مقبولاً للمعالجة اللاحقة فقط (دمج ملفات، ختم QR) وليس لأي نص عربي.

## 5) TypeScript وأدوات الجودة

- **الوضع في 2026 مختلف جذرياً:** TypeScript 7.0.2 (المحول الأصلي بلغة Go، أسرع نحو 10 مرات) هو المستقر الحالي منذ 2026-07-08، وTypeScript 6.0.3 هو آخر إصدار بقاعدة JavaScript.
- **القرار: نثبّت TypeScript 6.0.3 في كل المستودع مؤقتاً.** السبب: typescript-eslint (النسخة 8.67) يشترط `typescript < 6.1.0` ولا يستطيع الفحص المعتمد على الأنواع مع TS 7 لأن TS 7 صدر بدون API برمجي مستقر. الأنواع والأخطاء متطابقة بين 6.0 و7.0 بالتصميم، فالترقية لاحقاً آمنة عند صدور TS 7.1 ودعم typescript-eslint له. القرار يُراجع فصلياً في DEVLOG.
- **Node.js 24 (Active LTS).** تشغيل ملفات TS مباشرة بـ`node file.ts` أصبح مستقراً (type stripping) بشرط `erasableSyntaxOnly`.
- **أعلام tsconfig المحدثة لعصر TS 6/7** (تفاصيل الأساس الكامل في `docs/CODING-STANDARDS.md`):
  - ممنوعة نهائياً (حُذفت في TS 7): `baseUrl`، `moduleResolution: node/classic`، `target: es5`، `outFile`. بدل baseUrl استخدم `imports` في package.json.
  - `module: "nodenext"` للحزم التي تعمل على Node، و`module: "preserve"` + `moduleResolution: "bundler"` للتطبيقات المحزومة.
  - `target` يثبَّت صراحة (es2024) لأن TS 6 جعله عائماً يتغير سنوياً.
  - `erasableSyntaxOnly: true`: يمنع enum وnamespace وparameter properties، وهو ما يجعل الكود قابلاً للتشغيل المباشر على Node 24.
- **Zod 4.4.x** (v3 متوقف منذ 2025-07): الأخطاء عبر معامل `error` الموحد، الصيغ أصبحت دوال مستقلة (`z.email()` بدل `z.string().email()`)، أسرع 7 إلى 14 مرة، وأخف على الـtype checker بنحو 100 مرة. `zod/mini` للحزم الحساسة للحجم. نمط `z.infer` كمصدر وحيد للحقيقة ما زال الأفضل، ومعيار Standard Schema يضمن عدم الانحباس.
- **الأدوات المكملة:** knip 6 (كود ميت، لا يتأثر بمشكلة TS 7)، publint + arethetypeswrong لكل حزمة داخلية، tsx للتشغيل التطويري. **ts-node ميت** (بلا إصدار منذ 2023)، لا يُستخدم.
- **Biome 2.5**: ممتاز كمنسق وفاحص سريع، لكن قواعده المعتمدة على الأنواع إعادة تنفيذ جزئية وليست الـchecker الحقيقي. typescript-eslint يبقى الفاحص الأساسي لاصطياد الأخطاء الحقيقية (floating promises وغيرها).

## 6) i18n والـMonorepo

**الترجمة والتعدد اللغوي:**

- **i18next 26.3.4 كحد أدنى** (إصدار أمني يسد ثغرة prototype pollution صيف 2026) + react-i18next 17.x، ويُرقيان معاً دائماً.
- **تصحيح عن الخطة، لا حاجة لـICU MessageFormat:** i18next الحديث يعالج صيغ الجمع الست للعربية أصلياً عبر `Intl.PluralRules` باللواحق `_zero` حتى `_other`. إضافة i18next-icu تستبدل صيغة i18next كلها بصيغة ثانية وتضعف أمان الأنواع بلا مكسب. القرار: بدون ICU.
- **فخ حرج على Hermes:** محرك Hermes لا يطبق `Intl.PluralRules` حتى الآن. بدون polyfill يتدهور الجمع العربي بصمت إلى صيغتين فقط بلا أي خطأ. **إلزامي:** استيراد `intl-pluralrules` أول سطر في تطبيق الموبايل، مع اختبار وحدة يتحقق أن `new Intl.PluralRules('ar').select(3) === 'few'`.
- أمان الأنواع للمفاتيح: `i18next.d.ts` لكل حزمة عبر واجهة `ResourceNamespaceMap` (جديدة في 26.3.0، مصممة للـmonorepo) مع `strictKeyChecks: true`، وتفعيل `enableSelector: "optimize"` من البداية لأن مفاتيح النصوص كسلاسل ستُهجر في v27.
- **تصحيح عن الخطة، تبديل الاتجاه يحتاج إعادة تحميل:** تبديل النصوص فوري بـ`changeLanguage()`، لكن قلب الاتجاه RTL/LTR على الموبايل ما زال يتطلب `I18nManager.forceRTL` ثم `Updates.reloadAsync()` (إعادة تحميل واحدة، وليست إعادة تشغيل يدوية). التبديل بين لغتين بنفس الاتجاه لا يحتاج شيئاً.
- expo-localization@57 مع `supportedLocales: ["en", "ar"]` في الإعداد.
- فخ RN معروف: `textAlign` الافتراضي فيزيائي (يسار دائماً) ولا يقبل `start`. الحل مكوّن `<Text>` مشترك يضبط `textAlign: 'left'` صراحة (تعني start في RTL).

**الـMonorepo وCI:**

- **pnpm 11.21** (يتطلب Node >= 22.13)، يثبَّت عبر حقل `packageManager` بدون Corepack (pnpm نفسه صار ينصح بتركه). لا ترقية لـpnpm 12 (ما زال RC).
- إعدادات أمان سلسلة التوريد الافتراضية في pnpm 11 تبقى مفعلة: `minimumReleaseAge` (24 ساعة تأخير لاعتماد الإصدارات الجديدة، ويفضل رفعها لثلاثة أيام)، حجب سكربتات البناء للتبعيات إلا عبر `allowBuilds`، و`trustPolicy: no-downgrade`.
- **Catalogs في pnpm** لكل تبعية مشتركة (react، i18next، typescript، vitest) حتى لا تنجرف الإصدارات بين تطبيقي الموبايل والويب.
- **Turborepo 2.10** ما زال الخيار الصحيح لهذا الحجم (الموقع انتقل لـturborepo.dev). الكاش البعيد من Vercel مجاني حتى بدون استضافة عندهم، مع توقيع القطع الأثرية (`signature: true`). فلترة التنفيذ بـ`--affected` مع `fetch-depth` كافٍ في checkout وإلا يشغّل كل شيء بصمت.
- **Vitest 4.1** (وليس 3): إعداد `test.projects` بدل ملف workspace المحذوف، و`coverage.include` صراحة وإلا التقرير ناقص. Vitest 5 وصل RC فترقبه بعد الاستقرار.
- اختبارات مكونات React Native تبقى على **jest-expo** (المسار الرسمي الوحيد الموثق من Expo). Vitest لكل ما عداها: الحزم الخالصة والويب.
- **Renovate وليس Dependabot، قرار إجباري:** Dependabot لا يدعم pnpm 11 حتى الآن (الطلب مفتوح). Renovate يدعم الـcatalogs ويطبق `minimumReleaseAge` حتى على التبعيات المتعدية مع تنبيهات OSV.
- كل GitHub Actions تثبَّت بالـcommit SHA الكامل وليس بالوسم.

## 7) قاعدة البيانات المحلية وأمان الموبايل

- **قرار قاعدة البيانات المحلية (تحديث عن الخطة):** `expo-sqlite@57` مع `"useSQLCipher": true` هو الافتراضي الجديد بدل op-sqlite.
  - السبب: expo-sqlite أصبح يدعم SQLCipher رسمياً (Android + iOS)، وهو حزمة أولى الطرف تتحدث مع الـSDK بنفس الدورة عبر `npx expo install --fix`، بينما op-sqlite مشروع مطوّر واحد بلا جدول توافق منشور مع إصدارات RN.
  - op-sqlite@17.2.0 يبقى بديلاً مشروعاً إذا أثبتت القياسات حاجتنا لأدائه (كتابة كثيفة، FTS5). القرار يُختبر في الأسبوع 9.
  - بعد فتح القاعدة مباشرة: `PRAGMA key`. **تحذير إطلاق:** تحقق أن بناء SQLCipher يجتاز فحص Google Play لصفحات الذاكرة 16KB (كانت هناك مشكلة مسجلة في 2025).
- **مفتاح التشفير:** 256-bit عشوائي يولَّد أول تشغيل، يُخزن في `expo-secure-store` فقط (حد الحجم العملي نحو 2KB، المفتاح 32 بايت فلا مشكلة).
  - iOS: الـKeychain يبقى بعد حذف التطبيق. يجب معالجة حالة "مفتاح موجود بلا قاعدة" عند إعادة التثبيت.
  - Android: يُمسح مع الحذف. فقدان المفتاح = فقدان البيانات المحلية نهائياً، لذا المزامنة السحابية هي خطة الاسترداد.
  - `requireAuthentication` (القفل البيومتري) فقط مع خطة استرداد، لأن تغيير البصمات قد يبطل الإدخال.
- **التوكنات:** access token في الذاكرة فقط ولا يُخزن أبداً. refresh token في SecureStore. التدوير مع إبطال عائلة التوكنات عند كشف إعادة الاستخدام إلزامي للعملاء العموميين حسب RFC 9700 (يناير 2025)، وSupabase يطبقه افتراضياً.
- **تغيير عن الخطة، certificate pinning:** لم يعد موصى به افتراضياً. توثيق OWASP الحالي: "لا توجد تقريباً حالة تستدعي الـpinning، خطر الانقطاع يفوق المكاسب". وتوثيق Android الرسمي لا ينصح به. **البديل المعتمد:** TLS 1.2+ مع تفعيل فرض Certificate Transparency على Android عبر Network Security Config. إذا فرضه عميل أو جهة امتثال لاحقاً: `react-native-ssl-public-key-pinning` بتجزئات SPKI مع pin احتياطي وتاريخ انتهاء ومفتاح تعطيل عن بعد.
- **قواعد كلمات السر (تحديث إلزامي عن الخطة):** NIST SP 800-63B **المراجعة 4** (يوليو 2025) رفعت الحد الأدنى:
  - **15 حرفاً كحد أدنى** لكلمة سر تُستخدم كعامل وحيد (SHALL وليس SHOULD). الخطة الأصلية قالت 10 وهذا لم يعد كافياً.
  - 8 أحرف مسموحة فقط إذا كانت كلمة السر جزءاً من مصادقة متعددة العوامل.
  - السماح حتى 64 حرفاً على الأقل، لا قواعد تركيب (رموز إلزامية)، لا انتهاء دوري، والفحص ضد قوائم التسريبات إلزامي (SHALL).
  - HIBP Pwned Passwords range API ما زال مجانياً بلا مفتاح: `GET /range/{أول 5 أحرف من SHA-1}`.
  - معايير Argon2id الحالية من OWASP للسيرفر الذاتي مستقبلاً: ذاكرة 19MiB على الأقل مع t=2 وp=1. (Supabase يستخدم bcrypt حالياً وهذا مقبول ضمن توصيات OWASP مع حد 72 بايت لطول كلمة السر.)

## المصادر الرئيسية

- npm registry مباشرة: expo، expo-template-default، react-native، react-native-vision-camera، react-native-fast-opencv، @shopify/react-native-skia، react-native-worklets، drizzle-orm، drizzle-kit.
- GitHub: facebook/react-native (منشورات الإصدارات 0.82 حتى 0.87)، mrousavy/react-native-vision-camera (إصدارات وتوثيق v5)، lukaszkurantdev/react-native-fast-opencv (v1)، Shopify/react-native-skia، supabase/supabase (مصدر التوثيق الرسمي)، supabase/auth (كود التجزئة)، supabase/postgres (مصفوفة الإصدارات)، postgres/postgres (ملاحظات إصدار PG18)، drizzle-team/drizzle-orm.
- GitHub Advisory Database: لا ثغرات مسجلة 2025-2026 على الحزم الأساسية أعلاه وقت الفحص. يبقى `pnpm audit` في CI إلزامياً.
