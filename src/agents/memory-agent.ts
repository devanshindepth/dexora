// ─── Memory Agent ──────────────────────────────────────────────────────────────
// After every session this agent:
// 1. Extracts new facts (semantic memory)
// 2. Detects contradictions with existing memory
// 3. Generates reflections (lessons learned)
// 4. Updates procedural memory (what strategies worked)
// 5. Updates predictions for next session

import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import type {
  CustomerMemory,
  MemoryUpdateRequest,
  MemoryUpdateResult,
  ProceduralMemory,
  ReflectionMemory,
  EpisodicMemory,
} from "@/lib/memory/types";

const groqProvider = createGroq({ apiKey: process.env.GROQ_API_KEY });

// Use Gemini for complex extraction tasks, Groq for fast tasks
const extractionModel = google("gemini-2.0-flash");
const fastModel = groqProvider("llama-3.1-8b-instant");

const EXTRACTION_PROMPT = `You are a Memory Agent for a self-improving AI Sales system.

Analyze the sales conversation transcript and the existing customer memory.

Extract a JSON object with these fields:
{
  "newFacts": string[],           // New stable facts learned (tech stack, budget, requirements, etc.)
  "contradictions": string[],     // Facts that contradict existing memory
  "buyingStage": "awareness" | "consideration" | "decision" | "unknown",
  "newObjections": string[],      // New objections raised
  "unmetNeeds": string[],         // Pain points or unmet needs discovered
  "productInterests": string[],   // Specific features/products they showed interest in
  "competitors": string[],        // Competitor names mentioned
  "technicalStack": string[],     // Technologies they use
  "complianceRequirements": string[], // Security/compliance mentioned
  "budget": string,               // Budget signals ("tight", "approved", "$50k range", "unknown")
  "sentimentChange": "improved" | "worsened" | "neutral",
  "decisionMakers": string[],     // People mentioned who have authority
  "churnRisks": string[],         // Signals that suggest they might not buy
  "expansionOpportunities": string[] // Upsell/expansion signals
}

Respond with ONLY valid JSON. No markdown, no explanation.`;

const REFLECTION_PROMPT = `You are a Reflection Agent for a self-improving AI Sales system.

After reviewing this sales call, generate 1-3 lessons that a sales rep should learn.

Each lesson should:
- Be specific to what happened in THIS call
- Be actionable (what to do differently next time)
- Reference the actual trust/value scores

Respond with ONLY valid JSON:
{
  "lessons": [
    {
      "lesson": "What went wrong or right",
      "actionableInsight": "What to do next time",
      "appliesTo": ["objection-handling" | "rapport" | "pricing" | "discovery" | "follow-up" | "timing"]
    }
  ]
}`;

const PREDICTION_PROMPT = `You are a Predictive Intelligence Agent for an AI Sales system.

Based on all available customer memory, predict future outcomes.

Respond with ONLY valid JSON:
{
  "closeProbability": number (0-100),
  "churnRisk": number (0-100),
  "nextLikelyObjection": string,
  "recommendedNextAction": string,
  "estimatedDecisionTimeline": string
}`;

export async function runMemoryAgent(
  request: MemoryUpdateRequest,
  currentMemory: CustomerMemory
): Promise<{ updatedMemory: CustomerMemory; result: MemoryUpdateResult }> {
  const transcriptText = request.transcript
    .map((m) => `${m.role === "user" ? "Sales Rep" : "Dave (Customer)"}: ${m.content}`)
    .join("\n");

  const existingMemorySummary = JSON.stringify(
    {
      semantic: currentMemory.semantic,
      reflections: currentMemory.reflections.slice(-3), // last 3 lessons
      procedural: currentMemory.procedural.slice(-5),
    },
    null,
    2
  );

  // Run extraction, reflection, and prediction in parallel
  const [extractionRaw, reflectionRaw, predictionRaw] = await Promise.allSettled([
    generateText({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      model: extractionModel as any,
      system: EXTRACTION_PROMPT,
      prompt: `EXISTING MEMORY:\n${existingMemorySummary}\n\nTRANSCRIPT:\n${transcriptText}\n\nFinal state: Trust=${request.finalTrust}/100, Value=${request.finalValue}/100, Outcome=${request.outcome}`,
    }),
    generateText({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      model: fastModel as any,
      system: REFLECTION_PROMPT,
      prompt: `TRANSCRIPT:\n${transcriptText}\n\nOutcome: ${request.outcome}, Final Trust: ${request.finalTrust}/100, Final Value: ${request.finalValue}/100`,
    }),
    generateText({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      model: fastModel as any,
      system: PREDICTION_PROMPT,
      prompt: `CUSTOMER MEMORY:\n${existingMemorySummary}\n\nLATEST SESSION: Trust=${request.finalTrust}, Value=${request.finalValue}, Outcome=${request.outcome}, Turns=${request.transcript.length / 2}`,
    }),
  ]);

  // Parse extraction
  let extracted: any = {};
  if (extractionRaw.status === "fulfilled") {
    try {
      const cleaned = extractionRaw.value.text.replace(/```(?:json)?\n?/g, "").trim();
      extracted = JSON.parse(cleaned);
    } catch (e) {
      console.error("[MemoryAgent] Extraction parse error:", e);
    }
  }

  // Parse reflection
  let reflections: Array<{ lesson: string; actionableInsight: string; appliesTo: string[] }> = [];
  if (reflectionRaw.status === "fulfilled") {
    try {
      const cleaned = reflectionRaw.value.text.replace(/```(?:json)?\n?/g, "").trim();
      const parsed = JSON.parse(cleaned);
      reflections = parsed.lessons || [];
    } catch (e) {
      console.error("[MemoryAgent] Reflection parse error:", e);
    }
  }

  // Parse predictions
  let predictions = currentMemory.predictions;
  if (predictionRaw.status === "fulfilled") {
    try {
      const cleaned = predictionRaw.value.text.replace(/```(?:json)?\n?/g, "").trim();
      predictions = JSON.parse(cleaned);
    } catch (e) {
      console.error("[MemoryAgent] Prediction parse error:", e);
    }
  }

  // Build the updated memory
  const updated = { ...currentMemory };
  const now = Date.now();

  // 1. Episodic: store this session
  const episodic: EpisodicMemory = {
    id: `${request.sessionId}-${now}`,
    sessionId: request.sessionId,
    timestamp: now,
    outcome: request.outcome,
    trust: request.finalTrust,
    value: request.finalValue,
    turnCount: Math.floor(request.transcript.length / 2),
    summary: extracted.newFacts?.[0] || "Session completed.",
    keyMoments: extracted.newFacts?.slice(0, 3) || [],
    transcript: request.transcript,
  };
  updated.episodic = [...updated.episodic, episodic].slice(-20); // keep last 20 sessions

  // 2. Semantic: merge new facts
  const sem = { ...updated.semantic };
  if (extracted.buyingStage) sem.buyingStage = extracted.buyingStage;
  if (extracted.budget && extracted.budget !== "unknown") sem.budget = extracted.budget;
  if (extracted.newObjections?.length)
    sem.objections = [...new Set([...sem.objections, ...extracted.newObjections])];
  if (extracted.unmetNeeds?.length)
    sem.unmetNeeds = [...new Set([...sem.unmetNeeds, ...extracted.unmetNeeds])];
  if (extracted.productInterests?.length)
    sem.productInterests = [...new Set([...sem.productInterests, ...extracted.productInterests])];
  if (extracted.competitors?.length)
    sem.competitors = [...new Set([...sem.competitors, ...extracted.competitors])];
  if (extracted.technicalStack?.length)
    sem.technicalStack = [...new Set([...sem.technicalStack, ...extracted.technicalStack])];
  if (extracted.complianceRequirements?.length)
    sem.complianceRequirements = [
      ...new Set([...sem.complianceRequirements, ...extracted.complianceRequirements]),
    ];
  if (extracted.decisionMakers?.length)
    sem.decisionMakers = [...new Set([...sem.decisionMakers, ...extracted.decisionMakers])];
  if (extracted.churnRisks?.length)
    sem.churnRisks = [...new Set([...sem.churnRisks, ...extracted.churnRisks])];
  if (extracted.expansionOpportunities?.length)
    sem.expansionOpportunities = [
      ...new Set([...sem.expansionOpportunities, ...extracted.expansionOpportunities]),
    ];
  updated.semantic = sem;

  // 3. Procedural: record what worked/failed
  if (request.outcome === "success" || request.outcome === "failure") {
    const proc: ProceduralMemory = {
      id: `proc-${now}`,
      pattern:
        request.outcome === "success"
          ? `Approach that reached T=${request.finalTrust},V=${request.finalValue} (success)`
          : `Approach that failed: T=${request.finalTrust}, V=${request.finalValue}`,
      context: extracted.newFacts?.slice(0, 2).join("; ") || "General sales approach",
      outcome: request.outcome === "success" ? "positive" : "negative",
      confidence: request.outcome === "success" ? 0.8 : 0.7,
      timesObserved: 1,
      lastUpdated: now,
    };
    // Merge with existing similar patterns or add new
    updated.procedural = [...updated.procedural, proc].slice(-10);
  }

  // 4. Reflections
  const newReflections: ReflectionMemory[] = reflections.map((r, i) => ({
    id: `ref-${now}-${i}`,
    sessionId: request.sessionId,
    timestamp: now,
    lesson: r.lesson,
    actionableInsight: r.actionableInsight,
    appliesTo: r.appliesTo || [],
  }));
  updated.reflections = [...updated.reflections, ...newReflections].slice(-15);

  // 5. Update relationship memory (Dave attended another meeting)
  const daveStakeholder = updated.relationship.stakeholders.find((s) => s.name === "Dave Miller");
  if (daveStakeholder) {
    daveStakeholder.meetingsAttended += 1;
    daveStakeholder.lastContacted = now;
    daveStakeholder.sentiment =
      request.finalTrust >= 70
        ? "positive"
        : request.finalTrust <= 30
        ? "negative"
        : "neutral";
  }

  // 6. Update predictions
  updated.predictions = predictions;

  const result: MemoryUpdateResult = {
    newFacts: extracted.newFacts || [],
    contradictions: extracted.contradictions || [],
    updatedStage: extracted.buyingStage || currentMemory.semantic.buyingStage,
    newObjections: extracted.newObjections || [],
    reflections: newReflections.map((r) => r.lesson),
    predictions,
  };

  return { updatedMemory: updated, result };
}
