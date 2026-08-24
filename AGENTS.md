# AGENTS.md

PersonaForge — an AI interactive-fiction app (ROLEPLAY / SCENARIO / GAME modes) bootstrapped from Google AI Studio. Vite + React 18 + TypeScript + Tailwind 4 + Firebase (optional) + idb-keyval (offline-first).

## Commands

- `npm run dev` — runs `tsx server.ts`: an Express server (port 3000) with Vite middleware embedded. **Use this to develop.** Running `npx vite` directly starts the app but there is no `/api/gemini/*` proxy, so all AI features break.
- `npm run build` — `vite build && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --outfile=dist/server.cjs`. The Express server is bundled separately to `dist/server.cjs`.
- `npm run start` — `node dist/server.cjs` (production server, serves `dist/`).
- Typecheck: `npm run typecheck` (runs `tsc --noEmit`; what CI runs via `npx tsc --noEmit`).
- `npm run lint` — `eslint .`
- No test framework; no test suite.
- CI order (`.github/workflows/ci.yml`): `npm ci` → `npx tsc --noEmit` → `npm run lint` → `npm run build`.

## Environment

- `.env` is required and gitignored. The server reads `GEMINI_API_KEY` at runtime; if unset, all `/api/gemini/*` endpoints return 500. `.env.example` is the committed template (also `VITE_ELEVENLABS_*`, `VITE_OPENAI_API_KEY` for TTS).
- Never commit `.env` / API keys. Firebase web config in `firebase-applet-config.json` is intentionally public.
- On this Termux box, `/usr/bin` doesn't exist, so `node_modules/.bin/*` shebangs (`#!/usr/bin/env node`) fail with "bad interpreter" / "command not found". Run tools via node directly instead: `node node_modules/typescript/bin/tsc --noEmit`, `node node_modules/vite/bin/vite.js build`, `node node_modules/esbuild/bin/esbuild …`, `node node_modules/eslint/bin/eslint.js …`. `npm run dev`/`build` only work where `/usr/bin/env` resolves.

## Architecture

- The client never calls Gemini directly. `getGenAI()` in `src/lib/gemini.ts` is a shim that POSTs to Express endpoints `/api/gemini/generate[/stream]` and `/api/gemini/interact[/stream]` (implemented in `server.ts`). The shim routes agent models (`antigravity*`, `deep-research*`) and omni models through the interactions API, everything else through generateContent. OpenRouter is an alternative text provider.
- `server.ts` implements retry/backoff plus a model fallback chain (e.g. `gemini-3.5-flash` → `gemini-3.1-flash-lite` → `gemini-2.5-flash-lite`). Keep this chain consistent with models listed in the UI.
- Firestore is optional: without Firebase config or an authenticated user the app runs purely on IndexedDB. Storage keys are the `personaforge_*` constants in `src/constants.ts` (`STORAGE_KEYS`); `useStaleDataCleanup` in `src/hooks/useStorage.ts` prunes stale keys after 90 days.
- Firestore layout: `users/{uid}/scenarios/{scenarioId}` with subcollections `messages`, `codex`, `inventory`, plus `summary/current`. `profile.inventory` is stripped before saving to avoid document-size bloat (inventory lives in its own subcollection). Writes are batched at 500-doc Firestore limits (`src/hooks/useFirestoreSync.ts`).

## Gotchas

- ESLint turns off `@typescript-eslint/no-unused-vars`, `no-explicit-any`, and `no-empty` — `any` is used liberally; don't add unused-vars cleanup.
- `tsconfig.json` sets `allowImportingTsExtensions` — imports use explicit `.ts`/`.tsx` extensions.
- `Message.isPinned`, `Message.versions`/`activeVersionIndex` are persisted by spreading the whole message object in `useChatState`/`useFirestoreSync` — any new message fields propagate automatically.
- Chat message rendering lives in `src/components/chat/MessageBubble.tsx`; `parseMessageContent` lives in `src/components/chat/messageContent.ts` and is reused by `ChatInterface` and `PinnedMessagesPanel` — don't duplicate it, and don't re-export it from a component file (breaks react-refresh).
