# Bolt's Performance Journal - Critical Learnings Only

## 2026-07-19 - [Memoizing Render-Path Calculations in React Inputs]
**Learning:** In React applications, calling heavy text processing or array filtering functions (such as regex splitting for token estimation or string scanning for tag generation) directly inside the render block causes noticeable input/typing latency. This happens because every keystroke triggers a component re-render, forcing the heavy computation to run synchronously on the main thread.
**Action:** Always identify calculations that depend solely on props or data models (like `messages` or `scenarios`) and memoize them using `useMemo` so that state changes inside input controls (like `input` or `searchQuery`) can re-render cleanly at 60fps.
