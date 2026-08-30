<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/30699cb5-6622-4069-b8d3-cd216ea612fe

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Deployment & Live Voice Configuration (e.g. Render)

When deploying via `render.yaml` or any cloud host, configure the following environment variables:

- **`GEMINI_API_KEY`** (Required): Master Gemini API key used for text completions, summaries, and translations.
- **`GEMINI_LIVE_API_KEY`** (Required for Live Voice): Dedicated Gemini API key used to mint ephemeral tokens for the bidirectional Gemini Live WebSocket (`/api/gemini/live/token`). Isolating this key prevents real-time audio sessions from burning your text chat quota.
  - *Alternative*: If you wish to share your main key's quota with Live Voice, set **`LIVE_ALLOW_MAIN_KEY_FALLBACK=true`**.
- **`API_ACCESS_TOKEN`** (Recommended): Secret token passed via `x-api-token` to protect backend proxy endpoints.

