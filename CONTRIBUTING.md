# Contributing to ChunkCodeMagic (PersonaForge)

Thank you for your interest in contributing!

## Getting Started

1. Clone the repository
2. Copy `.env.example` to `.env` and add your Gemini API key
3. Copy `firebase-applet-config.example.json` to `firebase-applet-config.json` and fill in your Firebase project details
4. Install dependencies: `npm install`
5. Run the dev server: `npm run dev`

## Development Guidelines

- Write TypeScript — no plain JS
- Follow the existing ESLint rules: `npm run lint`
- Ensure types are correct: `npx tsc --noEmit`
- Keep commits focused; one feature or fix per PR
- Update documentation if you change user-facing behavior

## Pull Request Process

1. Fork the repo and create a feature branch
2. Make your changes
3. Ensure lint and typecheck pass
4. Open a PR with a clear description

## Reporting Issues

Use the GitHub issue tracker with:
- Steps to reproduce
- Expected vs actual behavior
- Environment (browser, Node version)
