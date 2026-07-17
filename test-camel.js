import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI({ apiKey: "fake" });
try {
  ai.interactions.create({
    model: "gemini-3.5-flash",
    input: "Hi",
    generation_config: { temperature: 0.5 }
  });
} catch(e) {
  console.log("Error:", e.message);
}
