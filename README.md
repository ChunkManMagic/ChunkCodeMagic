# PersonaForge

Generate and bring conversational AI personas to life with the Gemini API — a React + Express + Firebase web app by **ChunkManMagic**.

## Features

- Create, edit, and iterate on AI personas with structured prompts
- Chat with personas backed by the Gemini API
- Persist personas and chat history with Firebase (Firestore)
- Responsive UI built with React, Tailwind CSS v4, and Vite

## Prerequisites

- Node.js 20+
- A [Gemini API key](https://aistudio.google.com/apikey)
- (Optional) A Firebase project for persistence

## Getting Started

1. Install dependencies:

   ```sh
   npm install
   ```

2. Configure environment variables:

   ```sh
   cp .env.example .env.local
   ```

   Set `GEMINI_API_KEY` to your Gemini API key.

3. (Optional) Configure Firebase:

   ```sh
   cp firebase-applet-config.example.json firebase-applet-config.json
   ```

   Fill in your Firebase project credentials. The app runs without Firebase —
   personas are then kept in browser storage only.

4. Start the dev server:

   ```sh
   npm run dev
   ```

## Scripts

| Command           | Description                               |
| ----------------- | ----------------------------------------- |
| `npm run dev`     | Start the dev server with hot reload      |
| `npm run build`   | Build the web app and server bundle       |
| `npm run start`   | Serve the production build                |
| `npm run preview` | Preview the built web app                 |
| `npm run lint`    | Run ESLint against the codebase           |

## Project Structure

```
.
├── src/            # React frontend source
├── server.ts       # Express + Gemini API server
├── firestore.rules # Firestore security rules
└── vite.config.ts  # Vite configuration
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines and [CODEOWNERS](.github/CODEOWNERS) for ownership.

## License

[MIT](LICENSE) © 2026 ChunkManMagic
