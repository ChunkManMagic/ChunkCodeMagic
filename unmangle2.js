import fs from 'fs';
let code = fs.readFileSync('src/lib/gemini.ts', 'utf-8');

// The file starts with the suffix for some reason, or an empty match at the start.
// Let's just find all characters!
// It seems the structure is:
// [suffix] + (prefix + char + suffix) + (prefix + char + suffix) ...

const prefix = "\n    if (retries > 0 && (status === 429 || status === 500";
const suffix = "if (errorMessage.includes('limit: 0') || errorMessage.includes('free_tier')) {\n      throw error;\n    }\n    ";

let chunks = code.split(prefix);
let restored = "";

// The first chunk is just the suffix, so we skip it.
for (let i = 1; i < chunks.length; i++) {
  let chunk = chunks[i];
  // chunk should be `char + suffix`
  // so the char is chunk.substring(0, chunk.length - suffix.length)
  // wait, the suffix at the end might have different newlines or spacing if it's the end of file?
  // Let's just grab the first character! 
  // Wait, is it always 1 character? Yes, if it matched every empty string.
  restored += chunk.charAt(0);
}

fs.writeFileSync('src/lib/gemini.ts.restored', restored);
console.log("Restored length:", restored.length);
console.log("First 100 chars:", JSON.stringify(restored.substring(0, 100)));
