import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI({});
async function run() {
  try {
    const res = await ai.models.generateContent({
      model: "gemini-2.0-pro-exp",
      contents: "A picture of a cat"
    });
    console.log(res.candidates?.length ? "success" : res);
  } catch (e) {
    console.log(e.message);
  }
}
run();
