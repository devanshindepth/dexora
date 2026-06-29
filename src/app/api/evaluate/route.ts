import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = await generateObject({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: google("gemini-2.5-flash-lite") as any,
    system: `
You are an expert sales coach and evaluator.
Analyze the latest message from the user (the sales rep) in the context of the conversation with Dave Miller (IT Director, skeptical, hard persona).

Your job is to adjust two metrics based on the sales rep's performance in the latest turn:
1. Trust (T): How much Dave trusts the rep. (-20 to +20). Drops if rep is pushy, ignores his objections, or pitches too early. Rises if rep shows empathy, builds rapport, or listens.
2. Value (V): How much Dave values the product/solution. (-20 to +20). Drops if rep talks about irrelevant features. Rises if rep uncovers a relevant pain point or explains ROI well.

Provide the exact delta for each metric, and a 1-sentence reasoning for the scores.
`,
    messages,
    schema: z.object({
      trustDelta: z.number().min(-20).max(20).describe("Adjustment to the Trust metric based on the latest user message."),
      valueDelta: z.number().min(-20).max(20).describe("Adjustment to the Value metric based on the latest user message."),
      reasoning: z.string().describe("A concise 1-sentence explanation of why the scores changed."),
    }),
  });

  return Response.json(result.object);
}
