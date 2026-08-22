---
name: tc-interface
description: Building or changing any TransferChecker interface (marketing site, dashboard, future mobile app). Read this FIRST before any UI, styling, or motion work, and before invoking any vendored design skill in this repo. It binds those skills to this repo's own design system, names the stack facts they must not violate, and routes which skill to use for what.
---

# TransferChecker interface work starts here

## 1) The law, and what skills are for

`docs/DESIGN-SYSTEM.md` and `docs/design/tokens.css` are this product's identity,
and they are TESTED: `packages/ui` turns the seventeen rules into assertions and
computes contrast from the tokens file. Nothing a skill suggests overrides them.

Concretely, when a vendored skill proposes a palette, a font pairing, a UI style
("Soft UI", "glassmorphism"), a component library, or "more places to animate",
the answer is already decided by the design system: paper and graphite, IBM Plex
family, petrol brand ink, three reserved result colours, circles for bubbles
only. Skills contribute TECHNIQUE (how to build well), AUDIT LENSES (what is
broken), and CRAFT (easing, timing, states, accessibility). They never
contribute identity.

Arabic and English copy in `apps/site/src/content.ts` is owner-written
(`source: 'owner'`). No skill and no tool regenerates it. Ever.

## 2) Stack facts a skill must not violate

**apps/site (marketing site).** A hand-written static generator. No React, no
Tailwind, no shadcn, no client framework, no webfonts (system fonts are a
deliberate decision measured against Saudi phones), no new dependencies. One
stylesheet string in `src/style.ts`, logical properties only (`margin-inline`,
`inset-inline-start`), eight locales from one DOM shape, Arabic is primary and
RTL. Any skill instruction that starts with "install" is wrong here by
construction: implement the idea in plain CSS/HTML, or drop it.

**apps/web (dashboard).** Same kind of static generator, styled by
`packages/ui` (`app-css.ts`) from the design tokens. Same rules.

**apps/mobile (future).** React Native + Reanimated + Skia, does not exist yet
and is gated on thirty real papers (PLAN.md section 13). When it exists,
`animate-expo` applies there and nowhere else.

**JavaScript on the site is progressive enhancement only.** The pages must be
complete without it. Small inline vanilla JS (an IntersectionObserver, a class
toggle) is acceptable; a dependency is not.

## 3) The motion budget (design system sections 4 and 9.4)

- Tokens only: `--dur-fast` 150ms, `--dur-base` 240ms, `--dur-slow` 400ms cap,
  `--ease-out` for entering, `--ease-in` for exiting. Exits faster than enters.
- `transform` and `opacity` only. Never width, height, top, left, margin.
- **One orchestrated moment per surface.** Landing page: the scan sequence in
  the hero. The app: the score card rising after a successful scan. Everything
  else is static or, at most, a single simple reveal on scroll.
- `prefers-reduced-motion` means JUMP TO THE FINAL STATE, not slower motion.
  The dashboard already ships the pattern (1ms override in `app-css.ts`).
- Motion is interruptible and never blocks input.
- Skills that hunt for MORE animation opportunities contradict rule 9.4 and are
  deliberately not vendored. Do not compensate by improvising the same hunt.

**RTL rule for motion.** Prefer vertical motion (`translateY`), which needs no
mirroring. When horizontal motion is meaningful (a step wizard advancing), the
direction must follow reading direction: set `--flow: 1` under `[dir="ltr"]`
and `--flow: -1` under `[dir="rtl"]`, then
`transform: translateX(calc(var(--flow) * 8px))`. Never hardcode a left or
right slide, and never mirror with `scaleX(-1)` on content.

## 4) Which skill for what

| Task | Skill to invoke |
| --- | --- |
| Build one animation (curve, duration, interruption, exit) | `animate` |
| Critique a specific animation someone points at | `review-animations` |
| Audit all motion in a codebase, with a prioritized plan | `improve-animations` |
| Words to describe or brief motion precisely | `animation-vocabulary` |
| Polish details beyond motion (states, feel, component design) | `emil-design-eng` |
| Produce N design variants for the owner to pick from visually | `prototype` |
| Pre-delivery UI audit (contrast, touch targets, a11y, states) | `ui-ux-pro-max` |
| Mobile app motion, once `apps/mobile` exists | `animate-expo` |

Two bindings on `ui-ux-pro-max`: its palette/font/style search results are
reference material, never product decisions (section 1); and its stack guidance
is consulted for the future React Native app, not for the framework-free site.

`prototype` variants must be built from this product's tokens so every variant
"could ship tomorrow"; the picker chrome stays unstyled per that skill's spec.

## 5) The scan sequence, the one sanctioned set piece

What it is (DESIGN-SYSTEM section 8.1): the hero shows a paper being scanned
and graded, once, as the page's single orchestrated moment.

Implementation constraints, in order:

1. The artwork is inline SVG drawn from the sheet's real geometry (the repo can
   render true sheets; do not fake a generic answer sheet).
2. The timeline is CSS keyframes with `animation-delay` stages on one parent
   `.is-live` class. No JS animation library, no scroll-linked effects.
3. JS is one IntersectionObserver that adds `.is-live` once when the hero is
   visible, and `animation-play-state: paused` keeps it cheap off screen. The
   page without JS shows the finished state and loses nothing but the motion.
4. Reduced motion: `@media (prefers-reduced-motion: reduce)` disables the
   animations entirely so the final graded frame simply shows.
5. Every stage obeys the tokens; nothing exceeds `--dur-slow` per stage, and
   the whole sequence reads in under ~2.5s, runs once, and does not loop.

## 6) Definition of done for interface work

- The five repo checks are green: `typecheck`, `test`, `lint`,
  `check:emdash`, `format:check`. No em dash in any user-visible text.
- Verified in BOTH directions: an Arabic RTL page and an English LTR page,
  same DOM skeleton (the locale test enforces this; do not fight it).
- Verified with reduced motion emulated: the page is complete and still.
- Real measurement over claims: this repo's habit is measuring in a real
  browser at 390px (see DEVLOG 2026-08-15 entries). Follow it.
- No new runtime dependency on the site, and `sharp` never enters this repo.

## 7) Sources these rules lean on

Official: MDN `prefers-reduced-motion` and CSS transitions/animations guides;
web.dev animation guidance; WCAG 2.2 SC 2.2.2 (Pause, Stop, Hide), SC 2.3.1
(Three Flashes), SC 2.3.3 (Animation from Interactions); W3C WAI notes on
motion; Chrome DevTools rendering/animations tooling.

Expert, public: Emil Kowalski's published articles (emilkowal.ski: "Great
animations", "You don't need animations", "7 practical animation tips") and his
MIT-licensed skills vendored beside this file; easing.dev and easings.co for
curve references; motion.dev documentation when a React surface eventually
needs a library.

Historical, in-repo: the root `SKILLS/` texts fed the original design-system
round (DEVLOG 2026-08-14); they remain as record. Operational skills live here
in `.claude/skills/`.
