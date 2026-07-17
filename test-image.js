import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI({});
async function run() {
  try {
    const res = await ai.models.generateContent({
      model: "gemini-3.1-flash-image-preview",
      contents: "A picture of a cat"
    });
    console.log(res.candidates?.length ? "success" : res);
  } catch (e) {
    console.log(e.message);
  }
}
run();
