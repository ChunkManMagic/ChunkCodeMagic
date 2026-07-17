# Bolt's Journal

## 2026-07-17 - Client-Side Bundle Bloat & Code Splitting
**Learning:** In interactive web-based narrative engines, loading heavy dependencies such as markdown renderers, speech APIs, and complex visual components synchronously during the initial application load results in massive bundle sizes (over 1.2MB for a single JS chunk). This significantly degrades page load time, Time to Interactive (TTI), and initial user experience, even though many views like the Chat Interface, Character Creator, or Settings Modal are only rendered conditionally on-demand.
**Action:** Always identify major routes or conditionally-rendered views in the main application flow and code-split them using dynamic `import()`, `React.lazy()`, and `Suspense` fallback rendering. This moves non-critical chunks and their specific large dependencies into separate, lazy-loaded bundles, drastically reducing the initial page payload and accelerating early render performance.
