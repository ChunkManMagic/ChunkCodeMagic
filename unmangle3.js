import fs from 'fs';
let code = fs.readFileSync('src/lib/gemini.ts', 'utf-8');

const prefix = "\n    if (retries > 0 && (status === 429 || status === 500";

let chunks = code.split(prefix);
let restored = "";

for (let j = 1; j < chunks.length; j++) {
  let chunk = chunks[j];
  // If the chunk starts with ' (', it was originally 'iif (' which became ' (' after sed + splitting by prefix!
  // Wait! prefix ends with "500".
  // If original was "500iif (", then sed replaced "500iif" with "500".
  // So the text became "500 (".
  // When we split by "500", the chunk is " (".
  // If the original was "500 if (", the text remains "500 if (".
  // When we split by "500", the chunk is " if (".
  if (chunk.startsWith(" (errorMessage.includes")) {
    restored += "i";
  } else {
    restored += chunk.charAt(0);
  }
}

fs.writeFileSync('src/lib/gemini.ts.restored3', restored);
