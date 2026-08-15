# TransferChecker: تطبيق التصحيح الآلي لأوراق الإجابة (OMR)

تطبيق للمعلمين: إنشاء نموذج إجابة مخصص، طباعته PDF، مسحه بالكاميرا، ودرجة فورية.
يعمل أوفلاين بالكامل، عربي وإنجليزي، والمعالجة كلها على الجهاز بدون رفع صور.

## التوثيق

| الملف                                                  | المحتوى                                                  |
| ------------------------------------------------------ | -------------------------------------------------------- |
| [docs/PLAN.md](docs/PLAN.md)                           | خطة العمل الكاملة من النموذج إلى الإطلاق                 |
| [docs/TECH-STACK.md](docs/TECH-STACK.md)               | الستاك المعتمد والإصدارات المتحقق منها بتاريخ 2026-08-13 |
| [docs/CODING-STANDARDS.md](docs/CODING-STANDARDS.md)   | معايير الكتابة والجودة الإلزامية                         |
| [docs/SHEET-SPEC.md](docs/SHEET-SPEC.md)               | تصميم ورقة الإجابة وقواعد التخصيص واللغة                 |
| [docs/DESIGN-SYSTEM.md](docs/DESIGN-SYSTEM.md)         | نظام التصميم والخطوط والحركة وقواعد الواجهة              |
| [docs/samples/](docs/samples/)                         | أوراق إجابة مولَّدة فعلياً بـTypst، PDF وSVG             |
| [docs/SHEET-SPEC-V3.md](docs/SHEET-SPEC-V3.md)         | قرارات مواصفة الورقة v3 والسكيما الجديدة                 |
| [docs/COMPETITIVE-NOTES.md](docs/COMPETITIVE-NOTES.md) | ملاحظات تنافسية على طبقة المنتج والتسعير                 |
| [docs/DISCOVERABILITY.md](docs/DISCOVERABILITY.md)     | SEO و GEO و AEO، وسياسة فتح الموقع لكل الزواحف           |
| [docs/DEVLOG.md](docs/DEVLOG.md)                       | سجل التطوير الإلزامي، كل تغيير يوثَّق هنا                |
| [docs/FAILURE-MODES.md](docs/FAILURE-MODES.md)         | أنماط فشل التصحيح الآلي و23 دفاعاً، ببحث ومصادر          |
| **[docs/STATUS.md](docs/STATUS.md)**                   | **اقرأه أولاً: أين وصلنا، وما التالي، وما ينتظر قراراً** |

## قواعد إلزامية مختصرة

1. أي تعديل أو تطوير يُوثَّق في `docs/DEVLOG.md` قبل الدمج.
2. التعليقات داخل الكود بالإنجليزية فقط.
3. نصوص الواجهة ورسائل الأخطاء بلا شرطة طويلة (—)، الفصل بالفاصلة أو النقطة فقط.
4. الملفات صغيرة (هدف أقل من 200 سطر) حفاظاً على سهولة الصيانة.
5. قبل أي تبعية جديدة: تحقق من تاريخ اليوم وأحدث إصدار مستقر وحالة الأمان، ووثّقها في `docs/TECH-STACK.md`.

## البنية والأوامر

```
packages/sheet-spec/   مواصفة الورقة ومحرك التخطيط (TypeScript خالص، مُختبر)
packages/sheet-pdf/    توليد الورقة PDF عبر Typst، بتشكيل عربي صحيح
packages/core-omr/     محرك المسح، والمجموعة الذهبية بأدواتها
packages/grading/      الترميز المخزَّن، ومفتاح الإجابة، والدرجة، وإعادة الحساب
scripts/               أدوات المستودع
docs/                  التوثيق
```

```bash
pnpm install
pnpm run typecheck     # tsc بكل الأعلام الصارمة، لكل حزمة
pnpm run lint          # ESLint 10 مع الفحص المعتمد على الأنواع
pnpm run test          # Vitest
pnpm run format:check  # Prettier
pnpm run check:emdash  # يرفض الشرطة الطويلة في نصوص المستخدم
```

## ترتيب البدء

لا نبدأ بالكاميرا. البداية بحزمتي `sheet-spec` و`core-omr` كـTypeScript خالص يُختبر على صور ثابتة في CI.
التفاصيل في [docs/PLAN.md](docs/PLAN.md) القسم 12.
