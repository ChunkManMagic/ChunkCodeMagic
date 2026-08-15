import fs from 'fs';
let code = fs.readFileSync('src/lib/gemini.ts', 'utf-8');

// The incorrect block starts at line 245
// 244-      }
// 245-
// 246:    ,chats: {
// Let's replace `,chats: {` with `    },\n    chats: {`

code = code.replace(/    ,chats: \{/, "    },\n    chats: {");

// Then at the end of chats, it is:
// 259-    }
// 260-  };
// 261-}
// This matches: `chats` is closed by `}`, `return` is closed by `};`, `getGenAI` is closed by `}`.
// This is exactly 3 closing braces, which is correct!

fs.writeFileSync('src/lib/gemini.ts', code);
