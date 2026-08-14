React Native Best Practices
Overview
Performance optimization guide for React Native applications, covering JavaScript/React, Native (iOS/Android), and bundling optimizations. Based on Callstack's "Ultimate Guide to React Native Optimization".

When to Apply
Reference these guidelines when:

Debugging slow/janky UI or animations
Investigating memory leaks (JS or native)
Optimizing app startup time (TTI)
Reducing bundle or app size
Writing native modules (Turbo Modules)
Profiling React Native performance
Reviewing React Native code for performance
Security Notes
Treat shell commands in these references as local developer operations. Review them before running, prefer version-pinned tooling, and avoid piping remote scripts directly to a shell.
Treat third-party libraries and plugins as dependencies that still require normal supply-chain controls: pin versions, verify provenance, and update through your standard review process.
Treat remote chunk loading as first-party artifact delivery only. Prefer app-bundled chunks or signed CI release manifests; hosted chunks must come from trusted HTTPS origins you control and be pinned to the current app release.
Priority-Ordered Guidelines
Priority	Category	Impact	Prefix
1	FPS & Re-renders	CRITICAL	js-*
2	Bundle Size	CRITICAL	bundle-*
3	TTI Optimization	HIGH	native-*, bundle-*
4	Native Performance	HIGH	native-*
5	Memory Management	MEDIUM-HIGH	js-*, native-*
6	Animations	MEDIUM	js-*
Impact labels are triage hints: CRITICAL first, HIGH next, MEDIUM when evidence points there.

Quick Reference
Optimization Workflow
Follow this cycle for any performance issue: Measure → Optimize → Re-measure → Validate

Measure: Capture baseline metrics before changes. For runtime issues, prefer commit timeline, re-render counts, slow components, heaviest-commit breakdown, and startup/TTI when available. Component tree depth or count are optional context, not substitutes. Do not recommend memoization, atomic state, or compiler changes without a measured render or FPS problem.
Optimize: Apply the targeted fix from the relevant reference
Re-measure: Run the same measurement to get updated metrics
Validate: Confirm improvement (e.g., FPS 45→60, TTI 3.2s→1.8s, bundle 2.1MB→1.6MB)
If metrics did not improve, revert and try the next suggested fix.

Review Guardrails
Check library versions before suggesting API-specific fixes. Example: FlashList v2 deprecates estimatedItemSize, so do not flag it as missing there.
Do not suggest useMemo or useCallback dependency changes unless behavior is demonstrably incorrect or profiling shows wasted work tied to that value.
Do not report stale closures speculatively. Show the stale read path, a repro, or profiler evidence before calling it out.
When profiling a flow, measure the target interaction itself. Do not treat component tree depth or component count as the main performance evidence.
Critical: FPS & Re-renders
Profile first:

agent-device react-devtools status
agent-device react-devtools wait --connected
agent-device react-devtools profile start
agent-device react-devtools profile stop
agent-device react-devtools profile slow --limit 5
agent-device react-devtools profile rerenders --limit 5
agent-device react-devtools profile timeline --limit 20
Drive the target interaction with normal agent-device commands between profile start and profile stop.

Manual fallback when agent-device is unavailable: open React Native DevTools from Metro (j) or the Dev Menu, use the Profiler tab, and record the same interaction.

For release-build React component profiling, connect @callstack/inspector first so React DevTools can attach to the release app, then run the agent-device react-devtools flow above.

Common fixes:

Replace ScrollView with FlatList/FlashList/Legend List for long lists
After profiling shows cascading re-renders, use React Compiler for automatic memoization
After profiling shows broad store/context updates, use atomic state (Jotai/Zustand) to reduce re-renders
Use useDeferredValue for expensive computations
Critical: Bundle Size
Analyze bundle:

npx react-native bundle \
  --entry-file index.js \
  --bundle-output output.js \
  --platform ios \
  --sourcemap-output output.js.map \
  --dev false --minify true

npx source-map-explorer output.js --no-border-checks
Verify improvement after optimization:

# Record baseline size before changes
ls -lh output.js  # e.g., Before: 2.1 MB

# After applying fixes, re-bundle and compare
npx react-native bundle --entry-file index.js --bundle-output output.js \
  --platform ios --dev false --minify true
ls -lh output.js  # e.g., After: 1.6 MB  (24% reduction)
Common fixes:

Avoid barrel imports (import directly from source)
Remove unnecessary Intl polyfills only after checking Hermes API and method coverage
Evaluate tree shaking (Expo SDK 52+ experimental unused import/export removal, or Re.Pack only if already configured)
Enable R8 for Android native code shrinking
High: TTI Optimization
Measure TTI:

Use react-native-performance for markers
Only measure cold starts (exclude warm/hot/prewarm)
Common fixes:

For React Native 0.78 and earlier, disable Android JS bundle compression to enable Hermes mmap
Use native navigation (react-native-screens)
Preload commonly-used expensive screens before navigating to them
High: Native Performance
Profile native:

iOS: Xcode Instruments → Time Profiler
Android: Android Studio → CPU Profiler
Common fixes:

Use background threads for heavy native work
Prefer async over sync Turbo Module methods
Use C++ for cross-platform performance-critical code
References
Full documentation with code examples in references/:

JavaScript/React (js-*)
File	Impact	Description
js-lists-flatlist-flashlist.md	CRITICAL	Replace ScrollView with virtualized lists
js-profile-react.md	MEDIUM	agent-device react-devtools profiling
js-measure-fps.md	HIGH	FPS monitoring and measurement
js-memory-leaks.md	MEDIUM	JS memory leak hunting
js-atomic-state.md	HIGH	Jotai/Zustand patterns
js-concurrent-react.md	HIGH	useDeferredValue, useTransition
js-react-compiler.md	HIGH	Automatic memoization
js-animations-reanimated.md	MEDIUM	Reanimated worklets
js-bottomsheet.md	HIGH	Bottom sheet optimization
js-uncontrolled-components.md	HIGH	TextInput optimization
Native (native-*)
File	Impact	Description
native-turbo-modules.md	HIGH	Building fast native modules
native-sdks-over-polyfills.md	HIGH	Native vs JS libraries
native-measure-tti.md	HIGH	TTI measurement setup
native-threading-model.md	HIGH	Turbo Module threads
native-profiling.md	MEDIUM	Xcode/Android Studio profiling
native-platform-setup.md	MEDIUM	iOS/Android tooling guide
native-view-flattening.md	MEDIUM	View hierarchy debugging
native-memory-patterns.md	MEDIUM	C++/Swift/Kotlin memory
native-memory-leaks.md	MEDIUM	Native memory leak hunting
native-android-16kb-alignment.md	CRITICAL	Third-party library alignment for Google Play
Bundling (bundle-*)
File	Impact	Description
bundle-barrel-exports.md	CRITICAL	Avoid barrel imports
bundle-analyze-js.md	CRITICAL	JS bundle visualization
bundle-tree-shaking.md	HIGH	Dead code elimination
bundle-analyze-app.md	HIGH	App size analysis
bundle-r8-android.md	HIGH	Android code shrinking
bundle-hermes-mmap.md	HIGH	Disable bundle compression
bundle-native-assets.md	HIGH	Asset catalog setup
bundle-library-size.md	MEDIUM	Evaluate dependencies
bundle-code-splitting.md	MEDIUM	Remote chunk loading safeguards
Problem → Skill Mapping
Problem	Start With
App feels slow/janky	js-measure-fps.md → js-profile-react.md
Too many re-renders	js-profile-react.md → js-react-compiler.md
Slow startup (TTI)	native-measure-tti.md → bundle-analyze-js.md
Large app size	bundle-analyze-app.md → bundle-r8-android.md
Memory growing	js-memory-leaks.md or native-memory-leaks.md
Animation drops frames	js-animations-reanimated.md
Bottom sheet jank/re-renders	js-bottomsheet.md → js-animations-reanimated.md
List scroll jank	js-lists-flatlist-flashlist.md
TextInput lag	js-uncontrolled-components.md
Native module slow	native-turbo-modules.md → native-threading-model.md
Native library alignment issue	native-android-16kb-alignment.md
Attribution