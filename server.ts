import express from "express";
import fs from "fs";
import path from "path";
import { timingSafeEqual } from "crypto";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

// tsx does not auto-load .env, and shell env vars (e.g. a stale key exported in
// ~/.bashrc) take precedence over Node's --env-file / loadEnvFile. Load .env
// here explicitly so the repo's key always wins regardless of the shell.
function loadEnvFile(filePath: string): void {
  const fullPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(fullPath)) return;
  const lines = fs.readFileSync(fullPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(".env");

// Models clients may request. Exact names cover everything the UI offers plus
// legacy names still persisted in old settings; the patterns cover the
// agent/research families and the omni/tts/live/native-audio variants that the
// client routes by substring.
const ALLOWED_MODELS = new Set([
  "gemini-3-flash-preview",
  "gemini-3.1-pro-preview",
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.6-flash",
  "gemini-3.1-flash-live-preview",
  "gemini-2.5-flash-native-audio-preview-12-2025",
  "gemini-3.1-flash-tts-preview",
  "gemini-pro-latest",
  // Legacy models accepted for older cached clients
  "gemini-1.5-flash",
  "gemini-1.5-pro",
  "gemini-2.0-flash-exp",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
]);

const ALLOWED_AGENT_PATTERN = /^(antigravity|deep-research)-[a-z0-9._-]+$/i;
const ALLOWED_MODEL_PATTERNS = [
  /^antigravity-[a-z0-9._-]+$/i,
  /^deep-research-[a-z0-9._-]+$/i,
  /^lyria-[a-z0-9._-]+$/i,
  /^gemini-[a-z0-9.-]*(omni|tts|live|native-audio)[a-z0-9.-]*$/i,
];

function isAllowedModel(model: unknown): boolean {
  if (typeof model !== "string") return false;
  const m = model.trim();
  if (!m || m.length > 128) return false;
  return ALLOWED_MODELS.has(m) || ALLOWED_MODEL_PATTERNS.some((p) => p.test(m));
}

function isAllowedAgent(agent: unknown): boolean {
  return typeof agent === "string" && agent.length <= 128 && ALLOWED_AGENT_PATTERN.test(agent.trim());
}

function safeTokenEqual(provided: string, required: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(required);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 40;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function geminiGuard(req: express.Request, res: express.Response, next: express.NextFunction) {
  const requiredToken = (process.env.API_ACCESS_TOKEN || "").trim();
  if (requiredToken) {
    const provided =
      String(req.headers["x-api-token"] || "").trim() ||
      String(req.headers["authorization"] || "").replace(/^Bearer\s+/i, "").trim();
    if (!provided || !safeTokenEqual(provided, requiredToken)) {
      return res.status(401).json({ error: { message: "Unauthorized." } });
    }
  } else {
    // No token configured: enforce same-origin so third-party websites can't
    // drive this server's paid API from a visitor's browser (CSRF).
    const origin = req.headers.origin;
    const host = req.headers.host;
    if (origin && host) {
      try {
        if (new URL(origin).host !== host) {
          return res.status(403).json({ error: { message: "Cross-origin requests are not allowed." } });
        }
      } catch {
        return res.status(403).json({ error: { message: "Invalid Origin header." } });
      }
    }
  }

  const key = req.ip || "unknown";
  const now = Date.now();
  let bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    rateBuckets.set(key, bucket);
  }
  bucket.count++;
  if (rateBuckets.size > 5000) {
    for (const [k, v] of rateBuckets) {
      if (v.resetAt <= now) rateBuckets.delete(k);
    }
  }
  if (bucket.count > RATE_LIMIT_MAX_REQUESTS) {
    res.setHeader("Retry-After", Math.ceil((bucket.resetAt - now) / 1000));
    return res.status(429).json({ error: { message: "Too many requests. Please slow down." } });
  }

  next();
}

function getFallbackModel(currentModel: string): string | null {
  if (currentModel === 'gemini-3.1-pro-preview') {
    return 'gemini-3.5-flash';
  }
  if (currentModel === 'gemini-3.6-flash' || currentModel === 'gemini-3.5-flash' || currentModel === 'gemini-3-flash-preview') {
    return 'gemini-3.1-flash-lite';
  }
  if (currentModel === 'gemini-3.1-flash-lite') {
    return 'gemini-3.5-flash-lite';
  }
  // Avoid falling back below the lite tier or from agent/research models
  if (currentModel !== 'gemini-3.5-flash-lite' && !currentModel.startsWith('antigravity') && !currentModel.startsWith('deep-research')) {
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

  app.use(express.json({ limit: "2mb" }));

  // Auth + rate limiting for every AI proxy endpoint. Applied before the
  // routes so rejected requests never reach the Gemini SDK.
  app.use("/api/gemini", geminiGuard);

  const rejectModel = (res: express.Response, model: unknown, agent?: unknown) => {
    if (isAllowedModel(model) || isAllowedAgent(agent)) return false;
    res.status(400).json({ error: { message: `Model not allowed: ${String(model ?? agent)}` } });
    return true;
  };

  app.post("/api/gemini/generate", async (req, res) => {
    try {
      if (rejectModel(res, req.body?.model)) return;
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
    // Everything after this point speaks SSE — including errors — so commit to
    // the stream headers up front and never fall back to JSON mid-flight.
    let clientGone = false;
    req.on("close", () => { clientGone = true; });
    const sendEvent = (payload: unknown) => {
      if (!clientGone && !res.destroyed) res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };
    try {
      if (rejectModel(res, req.body?.model)) return;
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        res.status(500).json({ error: { message: "GEMINI_API_KEY is not set on the server." } });
        return;
      }

      res.status(200);
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      const ai = new GoogleGenAI({ apiKey });
      const { contents, config } = req.body;
      let model = req.body.model;

      let attempt = 0;
      const maxAttempts = 3;
      let stream: any = null;
      let delay = 1500;

      while (attempt < maxAttempts) {
        if (clientGone) return;
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

          if (clientGone) return;
          const waitTime = delay + Math.random() * 1500;
          console.warn(`Retrying stream start in ${Math.round(waitTime)}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          delay *= 2;
        }
      }
      if (clientGone) return;
      
      for await (const chunk of stream) {
        // Stop draining the paid upstream stream as soon as the client goes
        // away (tab closed, navigation, aborted fetch) — otherwise the server
        // keeps generating tokens nobody will ever read.
        if (clientGone) break;
        sendEvent(chunk);
      }
      if (!clientGone) {
        sendEvent("[DONE]");
        res.end();
      } else {
        res.end();
      }
    } catch (err: any) {
      console.error("Gemini generate stream final failure:", err);
      sendEvent({ error: err.message || String(err) });
      res.end();
    }
  });

  // Replace old proxy with custom API routes that use the Interactions API
  app.post("/api/gemini/interact", async (req, res) => {
    try {
      if (rejectModel(res, req.body?.model, req.body?.agent)) return;
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
    // Same SSE contract as /generate/stream: headers up front, errors as data
    // events, and upstream generation abandoned when the client disconnects.
    let clientGone = false;
    req.on("close", () => { clientGone = true; });
    const sendEvent = (payload: unknown) => {
      if (!clientGone && !res.destroyed) res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };
    try {
      if (rejectModel(res, req.body?.model, req.body?.agent)) return;
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        res.status(500).json({ error: { message: "GEMINI_API_KEY is not set on the server." } });
        return;
      }

      res.status(200);
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      const ai = new GoogleGenAI({ apiKey });
      const { input, system_instruction, response_format, generation_config, response_modalities, tools, previous_interaction_id } = req.body;
      let model = req.body.model;

      let attempt = 0;
      const maxAttempts = 3;
      let stream: any = null;
      let delay = 1500;

      while (attempt < maxAttempts) {
        if (clientGone) return;
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

          if (clientGone) return;
          const waitTime = delay + Math.random() * 1500;
          console.warn(`Retrying interact stream start in ${Math.round(waitTime)}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          delay *= 2;
        }
      }
      if (clientGone) return;
      
      for await (const chunk of stream) {
        if (clientGone) break;
        sendEvent(chunk);
      }
      if (!clientGone) {
        sendEvent("[DONE]");
      }
      res.end();
    } catch (err: any) {
      console.error("Gemini interact stream final failure:", err);
      sendEvent({ error: err.message || String(err) });
      res.end();
    }
  });

  // Mint a short-lived ephemeral token for the Gemini Live API (real-time voice).
  // The master GEMINI_LIVE_API_KEY stays server-side; the browser only ever holds
  // this scoped, expiring token. Falling back to the main GEMINI_API_KEY is
  // opt-in (LIVE_ALLOW_MAIN_KEY_FALLBACK=true) so Live sessions can never
  // silently burn the main text-model quota.
  app.post("/api/gemini/live/token", async (req, res) => {
    try {
      if (rejectModel(res, req.body?.model)) return;
      const dedicatedKey = (process.env.GEMINI_LIVE_API_KEY || "").trim();
      const allowMainFallback = process.env.LIVE_ALLOW_MAIN_KEY_FALLBACK === "true";
      const apiKey = dedicatedKey || (allowMainFallback ? process.env.GEMINI_API_KEY : undefined);
      if (!apiKey) {
        return res.status(500).json({
          error: {
            message:
              "GEMINI_LIVE_API_KEY is not set on the server. Set a dedicated Live key, or opt into sharing the main key's quota with LIVE_ALLOW_MAIN_KEY_FALLBACK=true.",
          },
        });
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
