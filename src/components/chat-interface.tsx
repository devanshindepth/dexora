"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, MicOff, Phone, PhoneOff, Terminal, Brain } from "lucide-react";
import { Meter } from "./meter";
import { MemoryPanel } from "./memory-panel";
import type { CustomerMemory } from "@/lib/memory/types";

// ── Types ─────────────────────────────────────────────────────────────────────
interface LogEntry {
  id: string;
  time: string;
  type: "user" | "dave" | "eval" | "system" | "memory";
  text: string;
}

type CallState = "idle" | "connecting" | "connected" | "ended";

// ── PCM Audio Queue ───────────────────────────────────────────────────────────
class PCMAudioQueue {
  private ctx: AudioContext;
  private nextStartTime = 0;
  private sampleRate: number;

  constructor(ctx: AudioContext, sampleRate = 16000) {
    this.ctx = ctx;
    this.sampleRate = sampleRate;
    this.nextStartTime = ctx.currentTime;
  }

  enqueue(pcmF32: Float32Array) {
    const buffer = this.ctx.createBuffer(1, pcmF32.length, this.sampleRate);
    buffer.copyToChannel(pcmF32 as Float32Array<ArrayBuffer>, 0);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.ctx.destination);

    const startAt = Math.max(this.ctx.currentTime, this.nextStartTime);
    src.start(startAt);
    this.nextStartTime = startAt + buffer.duration;
    return src;
  }

  reset() {
    this.nextStartTime = this.ctx.currentTime;
  }

  get scheduledUntil() {
    return this.nextStartTime;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ChatInterface() {
  const [callState, setCallState] = useState<CallState>("idle");
  const [isListening, setIsListening] = useState(false);
  const [isDaveSpeaking, setIsDaveSpeaking] = useState(false);
  const [trust, setTrust] = useState(50);
  const [value, setValue] = useState(50);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [outcomeMsg, setOutcomeMsg] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<"logs" | "memory">("logs");
  const [memory, setMemory] = useState<CustomerMemory | null>(null);
  const [isMemoryUpdating, setIsMemoryUpdating] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<PCMAudioQueue | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<AudioWorkletNode | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const daveSpeakingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load memory on mount
  useEffect(() => {
    fetch("/api/memory")
      .then((r) => r.json())
      .then((m: CustomerMemory) => {
        setMemory(m);
        setSessionCount(m.episodic.length);
      })
      .catch(() => {});
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    if (activePanel === "logs") {
      logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, activePanel]);

  const addLog = useCallback(
    (type: LogEntry["type"], text: string) => {
      const time = new Date().toLocaleTimeString([], {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      setLogs((prev) => [
        ...prev,
        { id: `${Date.now()}-${Math.random()}`, time, type, text },
      ]);
    },
    []
  );

  // ── Hang up / cleanup ──────────────────────────────────────────────────────
  const hangUp = useCallback(() => {
    setIsListening(false);
    setIsDaveSpeaking(false);

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    processorRef.current?.disconnect();
    processorRef.current = null;

    if (audioCtxRef.current?.state !== "closed") {
      audioCtxRef.current?.close();
    }
    audioCtxRef.current = null;
    audioQueueRef.current = null;

    wsRef.current?.close();
    wsRef.current = null;

    setCallState("ended");
  }, []);

  // ── Reset memory ──────────────────────────────────────────────────────────
  const resetMemory = useCallback(async () => {
    if (!confirm("Reset all memory for Dave Miller? This clears all session history and learned facts.")) return;
    await fetch("/api/memory", { method: "DELETE" });
    const fresh = await fetch("/api/memory").then((r) => r.json());
    setMemory(fresh);
    setSessionCount(0);
    addLog("memory", "Memory reset — starting fresh with Dave.");
  }, [addLog]);

  // ── Poll memory after session ends ─────────────────────────────────────────
  const pollMemoryUpdate = useCallback(() => {
    setIsMemoryUpdating(true);
    let attempts = 0;
    const MAX = 12;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const updated: CustomerMemory = await fetch("/api/memory").then((r) => r.json());
        // Check if memory was updated (new session in episodic)
        if (updated.episodic.length > sessionCount) {
          setMemory(updated);
          setSessionCount(updated.episodic.length);
          setIsMemoryUpdating(false);
          clearInterval(interval);
          addLog("memory", `Memory updated — ${updated.episodic.length} sessions, ${updated.reflections.length} lessons learned.`);
          if (updated.reflections.length > 0) {
            const latest = updated.reflections[updated.reflections.length - 1];
            addLog("memory", `Lesson: "${latest.lesson}"`);
          }
        }
      } catch {
        // ignore
      }
      if (attempts >= MAX) {
        setIsMemoryUpdating(false);
        clearInterval(interval);
      }
    }, 3000);
  }, [sessionCount, addLog]);

  // ── Start call ─────────────────────────────────────────────────────────────
  const startCall = useCallback(async () => {
    setErrorMsg(null);
    setCallState("connecting");
    setLogs([]);

    const returning = sessionCount > 0;
    addLog("system", returning
      ? `Calling Dave Miller... (${sessionCount} previous session${sessionCount > 1 ? "s" : ""} in memory)`
      : "Dialing Dave Miller...");

    // 1. Mic permission
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
    } catch (err) {
      setErrorMsg("Microphone access denied. Please allow mic and try again.");
      setCallState("idle");
      return;
    }

    // 2. Audio context + worklet
    let audioCtx: AudioContext;
    try {
      audioCtx = new AudioContext({ sampleRate: 16000 });
      audioCtxRef.current = audioCtx;
      audioQueueRef.current = new PCMAudioQueue(audioCtx, 16000);
      await audioCtx.audioWorklet.addModule("/audio-processor.js");
    } catch (err) {
      setErrorMsg("Failed to initialize audio engine. Try refreshing.");
      stream.getTracks().forEach((t) => t.stop());
      setCallState("idle");
      return;
    }

    // 3. WebSocket
    const wsUrl = `ws://${window.location.hostname}:8080`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;
    } catch (err) {
      setErrorMsg(`Cannot connect to voice server at ${wsUrl}.`);
      stream.getTracks().forEach((t) => t.stop());
      audioCtx.close();
      setCallState("idle");
      return;
    }

    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      console.log("[WS] Connected");
      ws.send(JSON.stringify({ type: "init", trust: 50, value: 50 }));
      setCallState("connected");
      addLog("system", "Call connected. Dave picked up.");
    };

    ws.onerror = (err) => {
      console.error("[WS] Error", err);
      setErrorMsg(
        `Cannot connect to voice server (${wsUrl}). Make sure to run: bun run start:ws`
      );
      hangUp();
    };

    ws.onclose = () => {
      console.log("[WS] Closed");
    };

    ws.onmessage = async (event) => {
      // Binary = PCM audio from Dave (Cartesia)
      if (event.data instanceof ArrayBuffer) {
        if (event.data.byteLength === 0) return;
        const f32 = new Float32Array(event.data);
        if (audioQueueRef.current) {
          setIsDaveSpeaking(true);
          audioQueueRef.current.enqueue(f32);
        }
        return;
      }

      // String = JSON control messages
      try {
        const msg = JSON.parse(event.data as string);

        if (msg.type === "memory_snapshot") {
          // Server sends memory on connect so UI is immediately in sync
          setMemory(msg.memory as CustomerMemory);
          setSessionCount((msg.memory as CustomerMemory).episodic.length);
        } else if (msg.type === "ready") {
          setIsListening(true);
          streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = true; });
          addLog("system", "Mic is live — Dave is listening. Speak now.");
        } else if (msg.type === "transcript") {
          addLog("user", msg.text);
        } else if (msg.type === "assistant") {
          addLog("dave", msg.text);
        } else if (msg.type === "dave_done") {
          if (audioQueueRef.current && audioCtxRef.current) {
            const delay =
              Math.max(0, audioQueueRef.current.scheduledUntil - audioCtxRef.current.currentTime) * 1000 + 200;
            if (daveSpeakingTimerRef.current) clearTimeout(daveSpeakingTimerRef.current);
            daveSpeakingTimerRef.current = setTimeout(() => {
              setIsDaveSpeaking(false);
              setIsListening(true);
              streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = true; });
            }, delay);
          } else {
            setIsDaveSpeaking(false);
            setIsListening(true);
            streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = true; });
          }
        } else if (msg.type === "eval") {
          setTrust(msg.trust);
          setValue(msg.value);
          const sign = (n: number) => (n > 0 ? "+" : "");
          addLog(
            "eval",
            `${msg.reasoning} (T: ${sign(msg.trustDelta)}${msg.trustDelta}, V: ${sign(msg.valueDelta)}${msg.valueDelta})`
          );
        } else if (msg.type === "simulation_end") {
          if (msg.outcome === "success") {
            setOutcomeMsg("✅ SUCCESS — Dave agreed to a follow-up meeting!");
          } else {
            setOutcomeMsg("❌ FAILURE — Dave hung up the phone.");
          }
          addLog("memory", "Memory agent is updating customer profile...");
          hangUp();
          pollMemoryUpdate();
          // Switch to memory panel to show what was learned
          setTimeout(() => setActivePanel("memory"), 1500);
        }
      } catch (e) {
        console.error("[WS message parse error]", e);
      }
    };

    // 4. Set up mic → worklet → WebSocket pipeline
    const source = audioCtx.createMediaStreamSource(stream);
    const processor = new AudioWorkletNode(audioCtx, "audio-processor");
    processorRef.current = processor;
    source.connect(processor);

    stream.getAudioTracks().forEach((t) => { t.enabled = false; });

    processor.port.onmessage = (e) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(e.data);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addLog, hangUp, sessionCount, pollMemoryUpdate]);

  // ── Toggle mic ─────────────────────────────────────────────────────────────
  const toggleMic = useCallback(() => {
    if (callState !== "connected") return;
    setIsListening((prev) => {
      const next = !prev;
      streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = next; });
      return next;
    });
  }, [callState]);

  const isSimulationEnded = callState === "ended";

  const daveStatusText = isDaveSpeaking
    ? "Speaking..."
    : callState === "connecting"
    ? "Ringing..."
    : callState === "connected"
    ? isListening
      ? "Listening..."
      : "On the line"
    : "";

  return (
    <div className="flex w-full h-screen bg-[var(--background)] text-[var(--foreground)] font-sans text-sm selection:bg-[var(--accent)] selection:text-white">
      {/* ── Left Panel: Call Interface ──────────────────────────────────────── */}
      <div className="flex flex-col w-2/3 border-r border-[var(--border-dark)] bg-[var(--panel-bg)]">
        {/* Header */}
        <div className="flex items-center justify-between h-12 px-4 border-b border-[var(--border-color)] bg-[var(--surface-bg)] shadow-sm z-10">
          <div className="flex items-center gap-3">
            <div className="text-xs font-semibold tracking-wide uppercase text-[var(--foreground-muted)]">
              Dexora — Dave Miller (IT Director, FreightCore)
            </div>
            {sessionCount > 0 && (
              <span className="text-[9px] font-mono bg-[#1a2030] text-[#569cd6] border border-[#569cd6] px-2 py-0.5 rounded">
                {sessionCount} session{sessionCount > 1 ? "s" : ""} in memory
              </span>
            )}
          </div>
          {callState === "connected" && (
            <div className="flex items-center gap-2 text-[10px] font-mono text-[var(--success)]">
              <span className="w-2 h-2 rounded-full bg-[var(--success)] animate-pulse" />
              LIVE CALL
            </div>
          )}
        </div>

        {/* Call Area */}
        <div className="flex-1 flex flex-col items-center justify-center bg-[var(--panel-bg)] relative">
          {/* Error */}
          {errorMsg && (
            <div className="absolute top-6 left-6 right-6 bg-[#2a1111] border border-[var(--danger)] text-[var(--danger)] text-xs font-mono p-4 rounded-sm">
              {errorMsg}
            </div>
          )}

          {/* Outcome */}
          {outcomeMsg && (
            <div
              className={`p-6 text-center max-w-md font-mono text-sm border ${
                outcomeMsg.startsWith("✅")
                  ? "border-[var(--success)] text-[var(--success)] bg-[#112211]"
                  : "border-[var(--danger)] text-[var(--danger)] bg-[#221111]"
              }`}
            >
              {outcomeMsg}
              {isMemoryUpdating && (
                <div className="mt-3 text-[10px] text-[var(--warning)] animate-pulse">
                  ● Memory agent is processing this session...
                </div>
              )}
              <div className="mt-4">
                <button
                  onClick={() => {
                    setCallState("idle");
                    setTrust(50);
                    setValue(50);
                    setLogs([]);
                    setOutcomeMsg(null);
                  }}
                  className="text-[10px] underline text-[var(--foreground-muted)] hover:text-white transition-colors"
                >
                  Start new call
                </button>
              </div>
            </div>
          )}

          {!outcomeMsg && (
            <>
              {/* Avatar */}
              <div className="mb-10 flex flex-col items-center">
                <div
                  className={`w-32 h-32 rounded-full flex items-center justify-center border-4 transition-all duration-300 ${
                    isDaveSpeaking
                      ? "border-[var(--accent)] bg-[#223344] shadow-[0_0_50px_rgba(59,130,246,0.4)] scale-105"
                      : callState === "connected"
                      ? "border-[#444] bg-[#1e1e1e]"
                      : callState === "connecting"
                      ? "border-[#333] bg-[#1a1a1a] animate-pulse"
                      : "border-[#333] bg-[#1a1a1a]"
                  }`}
                >
                  <span className="text-4xl font-bold text-[#888]">DM</span>
                </div>
                <div className="mt-5 text-lg font-semibold tracking-wide text-[#e5e5e5]">
                  Dave Miller
                </div>
                <div className="text-xs font-mono text-[#666] mt-1 h-4 transition-all">
                  {daveStatusText}
                </div>
              </div>

              {/* Call controls */}
              <div className="flex items-center gap-8">
                {callState === "idle" || callState === "ended" ? (
                  <div className="flex flex-col items-center gap-3">
                    <button
                      onClick={startCall}
                      id="start-call-btn"
                      className="w-20 h-20 rounded-full flex items-center justify-center bg-[var(--success)] hover:brightness-110 shadow-[0_0_30px_rgba(34,197,94,0.3)] text-white transition-all active:scale-95"
                    >
                      <Phone size={30} />
                    </button>
                    <span className="text-[10px] font-mono text-[#555] uppercase tracking-widest">
                      {sessionCount > 0 ? "Call Again" : "Call Dave"}
                    </span>
                  </div>
                ) : callState === "connecting" ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-20 h-20 rounded-full flex items-center justify-center border border-[#333] text-[#555] animate-pulse">
                      <Phone size={30} />
                    </div>
                    <span className="text-[10px] font-mono text-[#555] uppercase tracking-widest">
                      Connecting...
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col items-center gap-3">
                      <button
                        id="mic-toggle-btn"
                        onClick={toggleMic}
                        disabled={isDaveSpeaking}
                        className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
                          isListening
                            ? "bg-[var(--danger)] shadow-[0_0_25px_rgba(239,68,68,0.35)] text-white animate-pulse"
                            : "bg-[var(--surface-bg)] border border-[var(--border-color)] text-[#888] hover:text-white hover:border-[#555]"
                        } disabled:opacity-40 disabled:cursor-not-allowed`}
                      >
                        {isListening ? <Mic size={26} /> : <MicOff size={26} />}
                      </button>
                      <span className="text-[10px] font-mono text-[#555] uppercase tracking-widest">
                        {isListening ? "Listening" : "Muted"}
                      </span>
                    </div>

                    <div className="flex flex-col items-center gap-3">
                      <button
                        id="hang-up-btn"
                        onClick={hangUp}
                        className="w-16 h-16 rounded-full flex items-center justify-center bg-[var(--danger)] hover:brightness-110 shadow-[0_0_25px_rgba(239,68,68,0.3)] text-white transition-all active:scale-95"
                      >
                        <PhoneOff size={26} />
                      </button>
                      <span className="text-[10px] font-mono text-[#555] uppercase tracking-widest">
                        Hang Up
                      </span>
                    </div>
                  </>
                )}
              </div>

              {callState === "connected" && !isDaveSpeaking && (
                <div className="mt-8 text-[10px] font-mono text-[#444] text-center">
                  {isListening
                    ? "Dave can hear you — speak naturally"
                    : "Tap the mic to unmute and speak"}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Right Panel: Metrics / Memory ──────────────────────────────────── */}
      <div className="flex flex-col w-1/3 bg-[var(--surface-bg)]">
        {/* Tab headers */}
        <div className="flex h-12 border-b border-[var(--border-dark)] bg-[var(--panel-bg)] shadow-sm">
          <button
            onClick={() => setActivePanel("logs")}
            className={`flex-1 flex items-center justify-center gap-2 text-[10px] font-mono font-semibold uppercase tracking-wider transition-colors ${
              activePanel === "logs"
                ? "text-white border-b-2 border-[var(--accent-hover)]"
                : "text-[var(--foreground-muted)] hover:text-white"
            }`}
          >
            <Terminal size={11} />
            Evaluator
          </button>
          <button
            onClick={() => setActivePanel("memory")}
            className={`flex-1 flex items-center justify-center gap-2 text-[10px] font-mono font-semibold uppercase tracking-wider transition-colors ${
              activePanel === "memory"
                ? "text-white border-b-2 border-[var(--accent-hover)]"
                : "text-[var(--foreground-muted)] hover:text-white"
            }`}
          >
            <Brain size={11} />
            Memory
            {isMemoryUpdating && <span className="text-[var(--warning)] text-[8px] animate-pulse">●</span>}
          </button>
        </div>

        {/* Evaluator tab */}
        {activePanel === "logs" && (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Meters */}
            <div className="p-6 border-b border-[var(--border-dark)] bg-[var(--panel-bg)]">
              <Meter
                label="Trust Level"
                value={trust}
                colorClass={
                  trust > 60
                    ? "bg-[var(--success)]"
                    : trust < 40
                    ? "bg-[var(--danger)]"
                    : "bg-[var(--accent)]"
                }
              />
              <Meter
                label="Perceived Value"
                value={value}
                colorClass={
                  value > 60
                    ? "bg-[var(--success)]"
                    : value < 40
                    ? "bg-[var(--danger)]"
                    : "bg-[var(--warning)]"
                }
              />
              <div className="mt-4 flex gap-2 justify-between text-[10px] font-mono text-[var(--foreground-muted)]">
                <span>WIN: T≥70, V≥70</span>
                <span>LOSS: T≤0 OR V≤0</span>
              </div>
            </div>

            {/* Call log */}
            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="px-4 py-2 text-[10px] font-mono text-[var(--foreground-muted)] border-b border-[var(--border-color)]">
                CALL LOG
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-[11px] bg-[#1e1e1e] border-t-8 border-[var(--border-dark)]">
                {logs.length === 0 ? (
                  <div className="text-[#555] italic">Waiting for call to start...</div>
                ) : (
                  logs.map((log) => (
                    <div
                      key={log.id}
                      className="flex gap-3 leading-tight border-b border-[#2a2a2a] pb-2 last:border-0"
                    >
                      <span className="text-[#555] shrink-0">[{log.time}]</span>
                      <span
                        className={
                          log.type === "dave"
                            ? "text-[var(--accent-hover)]"
                            : log.type === "user"
                            ? "text-[#e5e5e5]"
                            : log.type === "eval"
                            ? "text-[var(--warning)]"
                            : log.type === "memory"
                            ? "text-[#569cd6]"
                            : "text-[#555]"
                        }
                      >
                        {log.type === "dave"
                          ? "[Dave] "
                          : log.type === "user"
                          ? "[You] "
                          : log.type === "eval"
                          ? "[Eval] "
                          : log.type === "memory"
                          ? "[Memory] "
                          : ""}
                        {log.text}
                      </span>
                    </div>
                  ))
                )}
                <div ref={logsEndRef} />
              </div>
            </div>
          </div>
        )}

        {/* Memory tab */}
        {activePanel === "memory" && (
          <div className="flex-1 overflow-hidden">
            <MemoryPanel
              memory={memory}
              isUpdating={isMemoryUpdating}
              onReset={resetMemory}
            />
          </div>
        )}
      </div>
    </div>
  );
}
