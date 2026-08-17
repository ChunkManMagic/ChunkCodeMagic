import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

function getFallbackModel(currentModel: string): string | null {
  if (currentModel === 'gemini-3.1-pro-preview' || currentModel === 'gemini-2.5-pro') {
    return 'gemini-3.5-flash';
  }
  if (currentModel === 'gemini-3.5-flash' || currentModel === 'gemini-2.5-flash') {
    return 'gemini-3.1-flash-lite';
  }
  if (currentModel === 'gemini-3.1-flash-lite') {
    return 'gemini-2.5-flash-lite';
  }
  // Avoid going below 2.5
  if (currentModel !== 'gemini-3.5-flash' && !currentModel.startsWith('antigravity') && !currentModel.startsWith('deep-research')) {
    return 'gemini-3.5-flash';
  }
  return null;
}

function isTransientError(err: any): boolean {
  const errMsg = String(err?.message || err || '');
  const status = err?.status || err?.code;
  return (
    status === 429 ||
    status === 503 ||
    status === 500 ||
    errMsg.includes('429') ||
    errMsg.includes('503') ||
    errMsg.includes('500') ||
    errMsg.includes('UNAVAILABLE') ||
    errMsg.includes('RESOURCE_EXHAUSTED') ||
    errMsg.includes('quota') ||
    errMsg.includes('limit') ||
    errMsg.includes('exhausted') ||
    errMsg.includes('high demand') ||
    errMsg.includes('temporary') ||
    errMsg.includes('overloaded') ||
    errMsg.includes('Service Unavailable')
  );
}

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
      const { contents, config } = req.body;
      let model = req.body.model;

      let attempt = 0;
      const maxAttempts = 3;
      let response: any = null;
      let delay = 2000;

      while (attempt < maxAttempts) {
        try {
          response = await ai.models.generateContent({
            model,
            contents,
            config
          });
          break; // Success!
        } catch (err: any) {
          attempt++;
          const isTransient = isTransientError(err);
          console.error(`Gemini generate error on model ${model} (attempt ${attempt}/${maxAttempts}):`, err.message || err);
          
          if (attempt >= maxAttempts || !isTransient) {
            // Try fallback model if we have one and it's a transient/overload error
            if (isTransient) {
              const fallback = getFallbackModel(model);
              if (fallback) {
                console.warn(`Falling back from ${model} to ${fallback} due to demand/quota issues.`);
                model = fallback;
                attempt = 0; // Reset attempts for the fallback model
                continue;
              }
            }
            throw err;
          }
          
          const waitTime = delay + Math.random() * 2000;
          console.warn(`Retrying in ${Math.round(waitTime)}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          delay *= 2; // Exponential backoff
        }
      }
      
      res.json(response);
    } catch (err: any) {
      res.status(500).json({ error: { message: err.message || String(err) } });
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
      const { contents, config } = req.body;
      let model = req.body.model;

      let attempt = 0;
      const maxAttempts = 3;
      let stream: any = null;
      let delay = 1500;

      while (attempt < maxAttempts) {
        try {
          stream = await ai.models.generateContentStream({
            model,
            contents,
            config
          });
          break; // Success starting the stream!
        } catch (err: any) {
          attempt++;
          const isTransient = isTransientError(err);
          console.error(`Gemini generate stream error on model ${model} (attempt ${attempt}/${maxAttempts}):`, err.message || err);
          
          if (attempt >= maxAttempts || !isTransient) {
            if (isTransient) {
              const fallback = getFallbackModel(model);
              if (fallback) {
                console.warn(`Falling back stream from ${model} to ${fallback} due to demand/quota issues.`);
                model = fallback;
                attempt = 0; // Reset attempts for fallback model
                continue;
              }
            }
            throw err;
          }

          const waitTime = delay + Math.random() * 1500;
          console.warn(`Retrying stream start in ${Math.round(waitTime)}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          delay *= 2;
        }
      }
      
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      for await (const chunk of stream) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
      res.write(`data: [DONE]\n\n`);
      res.end();
    } catch (err: any) {
      console.error("Gemini generate stream final failure:", err);
      res.write(`data: ${JSON.stringify({ error: err.message || String(err) })}\n\n`);
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
      const { input, system_instruction, response_format, generation_config, response_modalities, tools, previous_interaction_id } = req.body;
      let model = req.body.model;

      let attempt = 0;
      const maxAttempts = 3;
      let interaction: any = null;
      let delay = 2000;

      while (attempt < maxAttempts) {
        try {
          interaction = await ai.interactions.create({
            model,
            input,
            system_instruction,
            response_format,
            generation_config,
            response_modalities,
            tools,
            previous_interaction_id
          });
          break;
        } catch (err: any) {
          attempt++;
          const isTransient = isTransientError(err);
          console.error(`Gemini interact error on model ${model} (attempt ${attempt}/${maxAttempts}):`, err.message || err);
          
          if (attempt >= maxAttempts || !isTransient) {
            if (isTransient) {
              const fallback = getFallbackModel(model);
              if (fallback) {
                console.warn(`Falling back interact from ${model} to ${fallback} due to demand/quota issues.`);
                model = fallback;
                attempt = 0;
                continue;
              }
            }
            throw err;
          }

          const waitTime = delay + Math.random() * 2000;
          console.warn(`Retrying interact in ${Math.round(waitTime)}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          delay *= 2;
        }
      }
      
      res.json(interaction);
    } catch (err: any) {
      res.status(500).json({ error: { message: err.message || String(err) } });
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
      const { input, system_instruction, response_format, generation_config, response_modalities, tools, previous_interaction_id } = req.body;
      let model = req.body.model;

      let attempt = 0;
      const maxAttempts = 3;
      let stream: any = null;
      let delay = 1500;

      while (attempt < maxAttempts) {
        try {
          stream = await ai.interactions.create({
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
          break;
        } catch (err: any) {
          attempt++;
          const isTransient = isTransientError(err);
          console.error(`Gemini interact stream error on model ${model} (attempt ${attempt}/${maxAttempts}):`, err.message || err);
          
          if (attempt >= maxAttempts || !isTransient) {
            if (isTransient) {
              const fallback = getFallbackModel(model);
              if (fallback) {
                console.warn(`Falling back interact stream from ${model} to ${fallback} due to demand/quota issues.`);
                model = fallback;
                attempt = 0;
                continue;
              }
            }
            throw err;
          }

          const waitTime = delay + Math.random() * 1500;
          console.warn(`Retrying interact stream start in ${Math.round(waitTime)}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          delay *= 2;
        }
      }
      
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      for await (const chunk of stream) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
      res.write(`data: [DONE]\n\n`);
      res.end();
    } catch (err: any) {
      console.error("Gemini interact stream final failure:", err);
      res.write(`data: ${JSON.stringify({ error: err.message || String(err) })}\n\n`);
      res.end();
    }
  });

  // Mint a short-lived ephemeral token for the Gemini Live API (real-time voice).
  // The master GEMINI_LIVE_API_KEY stays server-side; the browser only ever holds
  // this scoped, expiring token. Falls back to GEMINI_API_KEY when the dedicated
  // key is not set.
  app.post("/api/gemini/live/token", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_LIVE_API_KEY || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: { message: "GEMINI_LIVE_API_KEY is not set on the server." } });
      }

      const ai = new GoogleGenAI({ apiKey });
      const { model, config } = req.body || {};

      const token = await ai.authTokens.create({
        config: {
          uses: 10,
          expireTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          newSessionExpireTime: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          liveConnectConstraints: {
            model,
            config,
          },
        },
      });

      res.json({ token: token.name });
    } catch (err: any) {
      res.status(500).json({ error: { message: err.message || String(err) } });
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
