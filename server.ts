import { serve } from "bun";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import Cartesia from "@cartesia/cartesia-js";
import "dotenv/config";

// Memory system
import { getCustomerMemory, saveCustomerMemory, resetCustomerMemory } from "./src/lib/memory/store";
import { runMemoryAgent } from "./src/agents/memory-agent";
import { buildDaveSystemPrompt, buildEvaluatorPrompt } from "./src/agents/conversation-agent";

// -- Config -------------------------------------------------------------------
const CARTESIA_API_KEY = process.env.CARTESIA_API_KEY!.trim();
const VOICE_ID = "a0e99841-438c-4a64-b679-ae501e7d6091";
const CUSTOMER_ID = "dave-miller-freightcore"; // Single demo prospect

const cartesia = new Cartesia({ apiKey: CARTESIA_API_KEY });
const groq = createGroq({ apiKey: process.env.GROQ_API_KEY });

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
  sessionId: string;
  memoryUpdateTriggered: boolean;
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
      model: groq("llama-3.1-8b-instant"),
      system: buildEvaluatorPrompt(),
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

// -- Memory update (async, fires after session ends) --------------------------
async function triggerMemoryUpdate(data: WsData, outcome: "success" | "failure"): Promise<void> {
  if (data.memoryUpdateTriggered) return;
  data.memoryUpdateTriggered = true;

  console.log(`[MemoryAgent] Updating memory for session ${data.sessionId} (${outcome})...`);
  try {
    const currentMemory = getCustomerMemory(CUSTOMER_ID);
    const { updatedMemory, result } = await runMemoryAgent(
      {
        customerId: CUSTOMER_ID,
        sessionId: data.sessionId,
        transcript: data.conversation,
        finalTrust: data.trust,
        finalValue: data.value,
        outcome,
      },
      currentMemory
    );

    saveCustomerMemory(updatedMemory);
    console.log(`[MemoryAgent] Memory updated. New facts: ${result.newFacts.length}, Reflections: ${result.reflections.length}`);
    if (result.newFacts.length) console.log(`[MemoryAgent] Facts: ${result.newFacts.join("; ")}`);
    if (result.reflections.length) console.log(`[MemoryAgent] Reflections: ${result.reflections.join("; ")}`);
  } catch (err) {
    console.error("[MemoryAgent] Error:", err);
  }
}

// -- Dave respond (memory-aware) ----------------------------------------------
async function daveRespond(ws: any, data: WsData): Promise<void> {
  if (data.isDaveSpeaking || data.isProcessing) return;
  data.isProcessing = true;

  try {
    // Load current memory and build context-aware prompt
    const memory = getCustomerMemory(CUSTOMER_ID);
    const systemPrompt = buildDaveSystemPrompt(memory, data.trust, data.value);

    const { text } = await generateText({
      model: groq("llama-3.1-8b-instant"),
      system: systemPrompt,
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
      if (clientWs.readyState === 1) {
        clientWs.send(JSON.stringify({ type: "simulation_end", outcome: "success" }));
      }
      // Fire memory agent asynchronously — don't block
      triggerMemoryUpdate(data, "success").catch(console.error);
    } else if (data.trust <= 0 || data.value <= 0) {
      console.log("[Game] Simulation ended - FAILURE");
      if (clientWs.readyState === 1) {
        clientWs.send(JSON.stringify({ type: "simulation_end", outcome: "failure" }));
      }
      triggerMemoryUpdate(data, "failure").catch(console.error);
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

      if (data.audioBuffer.length > 0) {
        console.log(`[Cartesia STT] Flushing ${data.audioBuffer.length} buffered chunks`);
        for (const chunk of data.audioBuffer) {
          try { sttWs.sendRaw(chunk); } catch (_) {}
        }
        data.audioBuffer = [];
      }
    });

    sttWs.on("turn.start", () => {
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

    // REST endpoint: get current memory (for the UI memory panel)
    const url = new URL(req.url);
    if (url.pathname === "/memory" && req.method === "GET") {
      const memory = getCustomerMemory(CUSTOMER_ID);
      return new Response(JSON.stringify(memory), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // REST endpoint: reset memory (for demo resets)
    if (url.pathname === "/memory/reset" && req.method === "POST") {
      resetCustomerMemory(CUSTOMER_ID);
      return new Response(JSON.stringify({ ok: true }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
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
        sessionId: `session-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        memoryUpdateTriggered: false,
      } satisfies WsData,
    });

    if (upgraded) return;
    return new Response("Dexora Sales Simulator — connect via WebSocket");
  },

  websocket: {
    async open(ws) {
      console.log("[WS] Client connected");
      const data = ws.data as WsData;

      // Load memory to log context
      const memory = getCustomerMemory(CUSTOMER_ID);
      const sessions = memory.episodic.length;
      console.log(
        `[Memory] Customer has ${sessions} previous session(s). Buying stage: ${memory.semantic.buyingStage}. Predictions: close=${memory.predictions.closeProbability}%`
      );

      // Send memory snapshot to client for the memory panel
      ws.send(JSON.stringify({ type: "memory_snapshot", memory }));

      // Start Cartesia STT connection
      connectCartesiaSTT(ws, data);

      // Dave greets — context-aware if returning customer
      setTimeout(async () => {
        if (ws.readyState !== 1) return;

        const greeting =
          sessions > 0
            ? `Yeah? Dave Miller. ...Oh, it's you again.`
            : "Yeah? Dave Miller.";

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

      // If session ended without a win/loss, still save memory (in_progress)
      if (!data.memoryUpdateTriggered && data.conversation.length > 2) {
        console.log("[Memory] Session ended mid-call — saving in-progress memory");
        triggerMemoryUpdate(data, "in_progress" as any).catch(console.error);
      }

      if (data.sttSocket) {
        try {
          data.sttSocket.close();
        } catch (_) {}
      }
    },
  },
});

console.log("Dexora Sales Simulator server running on ws://localhost:8080");
console.log("Memory REST API available at http://localhost:8080/memory");
