# Dexora — Self-Improving AI Sales Agent

A real-time voice sales training simulator with **persistent long-term memory**. Dave Miller remembers every conversation. The AI gets smarter after every session.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     DEXORA                              │
│                                                         │
│  ┌──────────────┐    ┌─────────────────────────────┐   │
│  │  Next.js UI  │    │     Bun WebSocket Server     │   │
│  │              │    │                              │   │
│  │ MemoryPanel  │◄───│  ConversationAgent (Dave)    │   │
│  │ ChatInterface│    │  EvaluatorAgent (scores)     │   │
│  │ Meter        │    │  MemoryAgent (post-session)  │   │
│  └──────────────┘    │                              │   │
│                      │  Cartesia STT + TTS          │   │
│                      │  Groq LLaMA (fast LLM)       │   │
│                      │  Gemini Flash (extraction)   │   │
│                      └─────────────────────────────┘   │
│                                                         │
│  Memory Layers (persisted to .memory/customers.json):   │
│  • Episodic   — every session stored                    │
│  • Semantic   — stable facts (tech stack, objections)   │
│  • Procedural — what sales strategies worked/failed     │
│  • Reflection — lessons learned after each call         │
│  • Predictions — close probability, next objection      │
└─────────────────────────────────────────────────────────┘
```

## Memory System

After every call, the **Memory Agent** automatically:
1. Extracts new facts from the transcript (semantic memory)
2. Detects contradictions with existing memory
3. Generates reflections — actionable lessons for next time
4. Updates procedural memory (what worked, what failed)
5. Recalculates predictions (close probability, churn risk, next objection)

Dave uses this memory on the next call — he'll reference things you discussed before.

## Getting Started

### 1. Install dependencies
```bash
bun install
```

### 2. Set up environment variables
Copy `.env.example` to `.env` and fill in your API keys:
```
GOOGLE_GENERATIVE_AI_API_KEY=...
GROQ_API_KEY=...
CARTESIA_API_KEY=...
```

### 3. Start the voice server
```bash
bun run start:ws
```

### 4. Start the Next.js UI (separate terminal)
```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Memory API

The voice server exposes a REST endpoint:
- `GET http://localhost:8080/memory` — full customer memory JSON

The Next.js API also exposes:
- `GET /api/memory` — same data via Next.js
- `DELETE /api/memory` — reset memory (demo resets)

## Project Structure

```
src/
  agents/
    conversation-agent.ts   # Builds Dave's memory-aware system prompt
    memory-agent.ts         # Extracts facts, reflections, predictions post-session
  lib/
    memory/
      types.ts              # Memory type definitions
      store.ts              # File-based persistence (JSON)
    tts/                    # TTS provider abstraction (Gemini, OpenAI)
    utils.ts
  components/
    chat-interface.tsx      # Main UI — call interface + panels
    memory-panel.tsx        # Customer Digital Twin panel
    meter.tsx               # Animated trust/value meters
  app/
    api/
      chat/route.ts         # Memory-aware Dave (text mode fallback)
      evaluate/route.ts     # Evaluator agent
      memory/route.ts       # Memory read/reset API
      tts/route.ts          # TTS endpoint
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 + React 19 |
| Voice Server | Bun WebSocket |
| LLM (fast) | Groq LLaMA 3.1 8B |
| LLM (extraction) | Gemini 2.0 Flash |
| STT | Cartesia ink-2 |
| TTS | Cartesia sonic-3.5 |
| Memory Store | JSON file (demo) → Vector DB + Knowledge Graph (production) |
| UI | Tailwind CSS v4 + Framer Motion |
