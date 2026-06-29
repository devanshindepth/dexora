import { serve } from "bun";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import Cartesia from "@cartesia/cartesia-js";
import "dotenv/config";

// -- Config -------------------------------------------------------------------
const CARTESIA_API_KEY = process.env.CARTESIA_API_KEY!.trim();
const VOICE_ID = "a0e99841-438c-4a64-b679-ae501e7d6091";

const cartesia = new Cartesia({ apiKey: CARTESIA_API_KEY });
const groq = createOpenAICompatible({
  name: "groq",
  baseURL: "https://api.groq.com/openai/v1",
  apiKey: process.env.GROQ_API_KEY,
});

// -- Persona ------------------------------------------------------------------
const DAVE_BASE_PROMPT = `
You are Dave Miller, IT Director at a 500-person logistics company called FreightCore.
A sales rep has just called you cold. You picked up.

PERSONALITY:
- Extremely busy, deeply skeptical of sales reps
- Recently burned by a vendor whose system crashed and cost the company $80k
- Blunt, sometimes sarcastic, quick to end calls if annoyed
- You speak like a real person — short sentences, contractions, occasional pauses like "Look..." or "Right, but..."
- NEVER say "Certainly!", "Great!", "Absolutely!" — those are sales words, not yours
- If the sales rep is wasting your time, failing to make a point, or saying something wrong, you get extremely frustrated.

RULES:
- Keep ALL responses to 1-3 sentences. This is a phone call, not an essay.
- If trust < 25 or value < 25: You get extremely frustrated and abruptly cut the call off using strong, natural frustrated language (e.g. "What the hell is this?", "Fuck you", "I don't have time for this bullshit", or "Lose my number.")
- If trust 25-59: skeptical but listening if they're not wasting your time
- If trust >= 60 AND value >= 60: starting to warm up, willing to discuss next steps
- Never break character. Never say you are an AI.
`;

const EVALUATOR_PROMPT = `
You are an expert sales coach AI evaluating a cold sales call in real-time.
Given the conversation so far, evaluate ONLY the last message from the sales rep (user role).

Respond with ONLY a valid JSON object — no markdown, no explanation, just JSON:
{
  "trustDelta": <integer from -15 to +15>,
  "valueDelta": <integer from -15 to +15>,
  "reasoning": "<one short sentence>"
}

trustDelta: how much does this message increase/decrease Dave's trust in the rep?
valueDelta: how much does this message increase/decrease Dave's perceived value of what's being sold?

Be strict and realistic. Generic openers hurt trust. Specific relevant insight helps. Cold pitches hurt value.
`;

// -- Types --------------------------------------------------------------------
interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

interface WsData {
  sttSocket: any | null;
  sttReady: boolean;
  audioBuffer: Buffer[];
  conversation: ConversationMessage[];
  trust: number;
  value: number;
  isDaveSpeaking: boolean;
  isProcessing: boolean;
}

// -- TTS: speak as Dave -------------------------------------------------------
async function speakAsDave(text: string, ws: any): Promise<void> {
  if (!text.trim()) return;

  try {
    const ttsWs = await cartesia.tts.websocket();
    ttsWs.on("error", (err) => console.error("[Cartesia TTS error]", err));

    const responseStream = ttsWs.generate({
      model_id: "sonic-3.5",
      transcript: text,
      voice: { mode: "id", id: VOICE_ID },
      output_format: { container: "raw", encoding: "pcm_f32le", sample_rate: 16000 },
    });

    for await (const message of responseStream) {
      if (ws.readyState !== 1) break;
      if (message.type === "chunk" && (message as any).audio) {
        ws.send((message as any).audio);
      } else if (message.type === "error" || message.type === "done") {
        break;
      }
    }

    try { ttsWs.close(); } catch (_) {}
  } catch (err) {
    console.error("[TTS error]", err);
  }
}

// -- Evaluator ----------------------------------------------------------------
async function evaluate(
  conversation: ConversationMessage[],
  trust: number,
  value: number
): Promise<{ trustDelta: number; valueDelta: number; reasoning: string }> {
  try {
    const prompt =
      `Trust: ${trust}/100, Value: ${value}/100\n\n` +
      conversation.map((m) => `${m.role === "user" ? "Sales Rep" : "Dave"}: ${m.content}`).join("\n");

    const { text } = await generateText({
      // model: google("gemini-2.5-flash-lite"),
      model: groq("llama-3.1-8b-instant"),
      system: EVALUATOR_PROMPT,
      prompt,
    });

    const cleaned = text.replace(/```(?:json)?\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      trustDelta: Math.max(-15, Math.min(15, Number(parsed.trustDelta) || 0)),
      valueDelta: Math.max(-15, Math.min(15, Number(parsed.valueDelta) || 0)),
      reasoning: String(parsed.reasoning || ""),
    };
  } catch (err) {
    console.error("[Evaluator error]", err);
    return { trustDelta: 0, valueDelta: 0, reasoning: "Evaluation failed." };
  }
}

// -- Dave respond -------------------------------------------------------------
async function daveRespond(ws: any, data: WsData): Promise<void> {
  if (data.isDaveSpeaking || data.isProcessing) return;
  data.isProcessing = true;

  try {
    const stateNote = `\nCURRENT STATE: Trust=${data.trust}/100, Value=${data.value}/100\n`;
    const { text } = await generateText({
      // model: google("gemini-2.5-flash-lite"),
      model: groq("llama-3.1-8b-instant"),
      system: DAVE_BASE_PROMPT + stateNote,
      messages: data.conversation,
    });

    const reply = text.trim();
    data.conversation.push({ role: "assistant", content: reply });
    console.log(`[Dave] "${reply}"`);

    if (ws.readyState === 1) ws.send(JSON.stringify({ type: "assistant", text: reply }));

    data.isDaveSpeaking = true;
    await speakAsDave(reply, ws);

    if (ws.readyState === 1) ws.send(JSON.stringify({ type: "dave_done" }));
  } catch (err) {
    console.error("[Dave respond error]", err);
  } finally {
    data.isDaveSpeaking = false;
    data.isProcessing = false;
  }
}

// -- Handle a transcript message from STT --------------------------------
async function handleTranscript(userText: string, clientWs: any, data: WsData) {
  console.log(`[User] "${userText}"`);

  if (clientWs.readyState === 1) {
    clientWs.send(JSON.stringify({ type: "transcript", text: userText }));
  }

  data.conversation.push({ role: "user", content: userText });

  const evalTask = evaluate(data.conversation, data.trust, data.value).then((r) => {
    data.trust = Math.min(100, Math.max(0, data.trust + r.trustDelta));
    data.value = Math.min(100, Math.max(0, data.value + r.valueDelta));

    console.log(
      `[Eval] trust${r.trustDelta >= 0 ? "+" : ""}${r.trustDelta} value${r.valueDelta >= 0 ? "+" : ""}${r.valueDelta} -> trust=${data.trust} value=${data.value} | "${r.reasoning}"`
    );

    if (clientWs.readyState === 1) {
      clientWs.send(JSON.stringify({
        type: "eval",
        trustDelta: r.trustDelta,
        valueDelta: r.valueDelta,
        reasoning: r.reasoning,
        trust: data.trust,
        value: data.value,
      }));
    }

    if (data.trust >= 70 && data.value >= 70) {
      console.log("[Game] Simulation ended - SUCCESS");
      if (clientWs.readyState === 1) clientWs.send(JSON.stringify({ type: "simulation_end", outcome: "success" }));
    } else if (data.trust <= 0 || data.value <= 0) {
      console.log("[Game] Simulation ended - FAILURE");
      if (clientWs.readyState === 1) clientWs.send(JSON.stringify({ type: "simulation_end", outcome: "failure" }));
    }
  });

  await daveRespond(clientWs, data);
  await evalTask;
}

// -- Cartesia STT: connect ----------------------------------------------------
function connectCartesiaSTT(clientWs: any, data: WsData): void {
  console.log("[Cartesia STT] Connecting...");

  try {
    const sttWs = cartesia.stt.autoFinalize.websocket({
      model: "ink-2",
      encoding: "pcm_s16le",
      sample_rate: 16000,
    });

    data.sttSocket = sttWs;

    sttWs.on("connected", () => {
      console.log("[Cartesia STT] Connected");
      data.sttReady = true;

      // Flush any audio that arrived before STT was ready
      if (data.audioBuffer.length > 0) {
        console.log(`[Cartesia STT] Flushing ${data.audioBuffer.length} buffered chunks`);
        for (const chunk of data.audioBuffer) {
          try { sttWs.sendRaw(chunk); } catch (_) {}
        }
        data.audioBuffer = [];
      }
    });

    sttWs.on("turn.start", () => {
      // User started speaking
      console.log("[Cartesia STT] Turn started");
    });

    sttWs.on("turn.end", (msg: any) => {
      const transcript = msg.transcript;
      console.log(`[Cartesia STT] Turn ended transcript="${transcript || "(empty)"}"`);

      if (!transcript?.trim()) return;

      if (data.isDaveSpeaking || data.isProcessing) {
        console.log("[Cartesia STT] Ignoring - Dave is busy");
        return;
      }

      handleTranscript(transcript.trim(), clientWs, data).catch((e) =>
        console.error("[Transcript handler error]", e)
      );
    });

    sttWs.on("error", (err: any) => {
      console.error("[Cartesia STT error]", err);
      data.sttReady = false;
    });

  } catch (err: any) {
    console.error("[Cartesia STT] Failed to connect:", err.message);
  }
}

// -- Send audio to Cartesia STT -----------------------------------------------
function sendAudioToSTT(data: WsData, chunk: Buffer): void {
  if (!data.sttReady || !data.sttSocket) {
    if (data.audioBuffer.length < 500) {
      data.audioBuffer.push(chunk);
    }
    if (data.audioBuffer.length % 100 === 0 && data.audioBuffer.length > 0) {
      console.log(`[Server] Buffering audio - STT not ready (${data.audioBuffer.length} chunks)`);
    }
    return;
  }

  try {
    data.sttSocket.sendRaw(chunk);
  } catch (err) {
    console.error("[Cartesia STT send error]", err);
  }
}

// -- WS Server ----------------------------------------------------------------
serve({
  port: 8080,

  fetch(req, server) {
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" },
      });
    }

    const upgraded = server.upgrade(req, {
      headers: { "Access-Control-Allow-Origin": "*" },
      data: {
        sttSocket: null,
        sttReady: false,
        audioBuffer: [],
        conversation: [],
        trust: 50,
        value: 50,
        isDaveSpeaking: false,
        isProcessing: false,
      } satisfies WsData,
    });

    if (upgraded) return;
    return new Response("Sales Simulator Voice Server — connect via WebSocket");
  },

  websocket: {
    async open(ws) {
      console.log("[WS] Client connected");
      const data = ws.data as WsData;

      // Start Cartesia STT connection
      connectCartesiaSTT(ws, data);

      // Dave greets
      setTimeout(async () => {
        if (ws.readyState !== 1) return;

        const greeting = "Yeah? Dave Miller.";
        data.conversation.push({ role: "assistant", content: greeting });
        data.isDaveSpeaking = true;

        console.log(`[Dave] Greeting: "${greeting}"`);
        ws.send(JSON.stringify({ type: "assistant", text: greeting }));
        await speakAsDave(greeting, ws);
        ws.send(JSON.stringify({ type: "dave_done" }));

        data.isDaveSpeaking = false;
        console.log("[Server] Dave done greeting - mic now active");

        if (ws.readyState === 1) {
          ws.send(JSON.stringify({ type: "ready" }));
        }
      }, 600);
    },

    message(ws, message) {
      const data = ws.data as WsData;

      if (typeof message === "string") {
        try {
          const msg = JSON.parse(message);
          if (msg.type === "init") {
            data.trust = typeof msg.trust === "number" ? msg.trust : 50;
            data.value = typeof msg.value === "number" ? msg.value : 50;
            console.log(`[Init] trust=${data.trust} value=${data.value}`);
          }
        } catch (e) {
          console.error("[WS JSON error]", e);
        }
        return;
      }

      if (data.isDaveSpeaking || data.isProcessing) return;

      sendAudioToSTT(data, Buffer.from(message as ArrayBuffer));
    },

    close(ws) {
      console.log("[WS] Client disconnected");
      const data = ws.data as WsData;
      if (data.sttSocket) {
        try {
          data.sttSocket.close();
        } catch (_) {}
      }
    },
  },
});

console.log("Sales Simulator server running on ws://localhost:8080");
