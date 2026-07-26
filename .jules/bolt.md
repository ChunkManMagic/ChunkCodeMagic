# Bolt Performance Optimization Journal

This journal tracks critical performance optimizations, learnings, and architectural details to keep the PersonaForge application running at maximum efficiency.

## 2025-07-20 - [Memoized Token Estimation in ChatInterface]
**Learning:** In highly interactive React components (like `ChatInterface` where typing updates state on every keystroke), expensive non-render operations—such as token estimation via deep string concatenation and string splitting on long message histories—must be memoized. Running these O(N) tasks on every render creates high CPU overhead and typing lag.
**Action:** Use `useMemo` with dependency arrays `[profile, messages]` to ensure token calculation only triggers when actual scenario data changes.

## 2025-07-20 - [Consolidated Framer Motion / Motion Imports]
**Learning:** Combining direct `framer-motion` imports with `motion/react` imports can cause duplicate animation dependency bundling, larger bundle sizes, or runtime warnings in bundlers like Vite.
**Action:** Consolidate all motion-related imports to `motion/react` across the codebase.

## 2025-07-21 - [Memoized Scenario Filtering and Sorting in ScenarioLibrary]
**Learning:** In interactive lists where users filter and sort elements via an input (like searchQuery), expensive computations on each element (such as parsing backstory and personality to extract genres and vibe tags via multiple string operations) should be memoized separately from the filtering/sorting logic itself. Performing in-JSX sorting and repeated element-parsing inside render loops causes high CPU overhead and typing latency, which scales poorly as the list size grows.
**Action:** Use dual-level memoization. First, pre-compute and memoize expensive metadata (e.g., tags) for all source list items, dependent only on the items array. Second, filter and sort the pre-computed items, dependent on search queries or filter selectors. Avoid calling metadata extractors and in-JSX sorting inside render mapping/JSX entirely.

## 2025-07-22 - [Optimized Storage Cleanup of Stale Scenario Data]
**Learning:** Frequent UI list state modifications (such as scenario additions, updates, or message synchronizations) that trigger automatic hooks (like IndexedDB stale data cleanup) will cause severe CPU and main thread lag if they repeatedly scan all database keys and do $O(N)$ linear scans in render/effect loops.
**Action:** Use `useRef` to track dynamic query arguments (like the `scenarios` list) inside effects to isolate dynamic updates, and introduce a session/ready ref (`hasCleanedRef`) to execute database sweeps exactly once per session. Pre-compute Map and Set lookup structures to transform inner $O(N)$ array searches into fast $O(1)$ lookups.

## 2026-07-26 - [Debounced Browser Storage Writes During Message Streaming]
**Learning:** Real-time updates like streaming AI response chunks trigger frequent state changes. Writing to IndexedDB and synchronously to `localStorage` on every character/chunk update creates heavy main thread overhead, micro-stutters, and high disk I/O.
**Action:** Debounce storage saves to a 1000ms delay. Store the latest state in a `useRef` tracker and flush the pending save immediately on component unmount or context change (e.g., `scenarioId` changes) to avoid any data loss.
