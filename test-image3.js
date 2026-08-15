import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI({});
async function run() {
  try {
    const res = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents: "A picture of a cat",
      config: { imageConfig: { aspectRatio: "1:1" } }
    });
    console.log(res.candidates?.length ? "success" : res);
  } catch (e) {
    console.log(e.message);
  }
}
run();
