# Bolt's Journal - PersonaForge Performance Optimization

## 2026-07-17 - Context Token Usage & Token Estimation Memoization
**Learning:** Helper LLM operations like `suggestNextAction` and `refineInput` were sending the entire un-summarized or even fully accumulated conversation history, causing massive token waste on long chats. Additionally, the token estimator recalculated string manipulation across the entire history on every single render/frame.
**Action:** Limit the history passed to helper prompt utilities (`suggestNextAction` to 15, `refineInput` to 8) to optimize token efficiency and stay within user rate limits, and memoize the token estimation calculation in `ChatInterface.tsx`.
