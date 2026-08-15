import { getGenAI } from './dist/server.cjs';
// We can't easily import from dist/server.cjs since it's commonjs and might need init.
// Actually we can run `npm run dev` or similar, but the user is complaining about the generated output in the app.
