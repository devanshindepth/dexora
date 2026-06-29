// ─── Chat API Route (memory-aware fallback for non-WebSocket mode) ────────────
import { streamText } from "ai";
import { google } from "@ai-sdk/google";
import { getCustomerMemory } from "@/lib/memory/store";
import { buildDaveSystemPrompt } from "@/agents/conversation-agent";

export const maxDuration = 30;

const DEFAULT_CUSTOMER_ID = "dave-miller-freightcore";

export async function POST(req: Request) {
  const { messages, trust = 50, value = 50, customerId = DEFAULT_CUSTOMER_ID } = await req.json();

  // Load persistent memory and build context-aware Dave prompt
  const memory = getCustomerMemory(customerId);
  const systemPrompt = buildDaveSystemPrompt(memory, trust, value);

  const result = await streamText({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: google("gemini-2.0-flash-lite") as any,
    system: systemPrompt,
    messages,
  });

  return result.toTextStreamResponse();
}
