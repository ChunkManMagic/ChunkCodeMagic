# Bolt's Performance Optimization Journal

This journal tracks critical codebase-specific performance patterns, bottlenecks, and optimization findings.

## 2025-03-01 - React Component Re-render Storms in ChatInterface
**Learning:** During real-time AI message streaming, `ChatInterface` re-renders on almost every token. Heavy sidebar components (`CodexSidebar` and `InventorySidebar`) that render complex lists with dynamic imagery and text formatting are fully re-rendered on every state update, wasting CPU cycles and degrading UI responsiveness.
**Action:** Memoize sidebars using `React.memo` and optimize message parsing/rendering to avoid redundant CPU-intensive tasks on each stream update.
