import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));

  app.post("/api/gemini/generate", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: { message: "GEMINI_API_KEY is not set on the server." } });
      }

      const ai = new GoogleGenAI({ apiKey });
      const { model, contents, config } = req.body;
      
      const response = await ai.models.generateContent({
        model,
        contents,
        config
      });
      
      res.json(response);
    } catch (err: any) {
      if (err?.status === 429 || String(err).includes('429')) {
        console.warn("Gemini API rate limit (429) hit.");
      } else {
        console.error("Gemini generate error:", err);
      }
      res.status(500).json({ error: { message: err.message } });
    }
  });

  app.post("/api/gemini/generate/stream", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        res.status(500).json({ error: { message: "GEMINI_API_KEY is not set on the server." } });
        return;
      }

      const ai = new GoogleGenAI({ apiKey });
      const { model, contents, config } = req.body;
      
      const stream = await ai.models.generateContentStream({
        model,
        contents,
        config
      });
      
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      for await (const chunk of stream) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
      res.write(`data: [DONE]\n\n`);
      res.end();
    } catch (err: any) {
      console.error("Gemini generate stream error:", err);
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  });

  // Replace old proxy with custom API routes that use the Interactions API
  app.post("/api/gemini/interact", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: { message: "GEMINI_API_KEY is not set on the server." } });
      }

      const ai = new GoogleGenAI({ apiKey });
      const { model, input, system_instruction, response_format, generation_config, response_modalities, tools, previous_interaction_id } = req.body;
      
      const interaction = await ai.interactions.create({
        model,
        input,
        system_instruction,
        response_format,
        generation_config,
        response_modalities,
        tools,
        previous_interaction_id
      });
      
      res.json(interaction);
    } catch (err: any) {
      if (err?.status === 429 || String(err).includes('429')) {
        console.warn("Gemini API rate limit (429) hit.");
      } else {
        console.error("Gemini interact error:", err);
      }
      res.status(500).json({ error: { message: err.message } });
    }
  });

  app.post("/api/gemini/interact/stream", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        res.status(500).json({ error: { message: "GEMINI_API_KEY is not set on the server." } });
        return;
      }

      const ai = new GoogleGenAI({ apiKey });
      const { model, input, system_instruction, response_format, generation_config, response_modalities, tools, previous_interaction_id } = req.body;
      
      const stream = await ai.interactions.create({
        model,
        input,
        system_instruction,
        response_format,
        generation_config,
        response_modalities,
        tools,
        previous_interaction_id,
        stream: true
      });
      
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      for await (const chunk of stream) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
      res.write(`data: [DONE]\n\n`);
      res.end();
    } catch (err: any) {
      if (err?.status === 429 || String(err).includes('429')) {
        console.warn("Gemini API rate limit (429) hit.");
      } else {
        console.error("Gemini stream error:", err);
      }
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
