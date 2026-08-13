import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI({});
ai.interactions.create({
  model: "foo",
  input: "bar",
});
