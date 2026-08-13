import fs from 'fs';
const code = fs.readFileSync('src/lib/gemini.ts', 'utf-8');
const match = code.match(/export async function generateCharacterProfile([\s\S]*?)const schemaConfig = /m);
if (match) {
  console.log(match[1]);
}
