// ─── Memory Layer Types ────────────────────────────────────────────────────────
// Implements the multi-layer memory architecture from the PDF:
// Episodic, Semantic, Procedural, Relationship, and Reflection memory.

export interface EpisodicMemory {
  id: string;
  sessionId: string;
  timestamp: number;
  outcome: "success" | "failure" | "in_progress";
  trust: number;
  value: number;
  turnCount: number;
  summary: string; // AI-generated summary of what happened
  keyMoments: string[]; // Important moments extracted
  transcript: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface SemanticMemory {
  // Stable facts extracted about the customer/company
  customerProfile: {
    name: string;
    role: string;
    company: string;
    industry: string;
    teamSize: string;
  };
  technicalStack: string[];
  competitors: string[];
  complianceRequirements: string[];
  budget: string;
  decisionMakers: string[];
  buyingStage: "awareness" | "consideration" | "decision" | "unknown";
  objections: string[];
  unmetNeeds: string[];
  productInterests: string[];
  expansionOpportunities: string[];
  churnRisks: string[];
}

export interface ProceduralMemory {
  // Successful sales strategies and patterns discovered
  id: string;
  pattern: string; // What worked or failed
  context: string; // When this applies
  outcome: "positive" | "negative";
  confidence: number; // 0-1, how certain we are
  timesObserved: number;
  lastUpdated: number;
}

export interface RelationshipMemory {
  // Connections between entities
  stakeholders: Array<{
    name: string;
    role: string;
    influence: "high" | "medium" | "low";
    sentiment: "positive" | "neutral" | "negative";
    meetingsAttended: number;
    lastContacted: number;
  }>;
  previousDeals: Array<{
    outcome: "won" | "lost" | "pending";
    value: string;
    reason: string;
  }>;
  competitorMentions: Array<{
    name: string;
    context: string;
    threat: "high" | "medium" | "low";
  }>;
}

export interface ReflectionMemory {
  // Lessons learned after each session
  id: string;
  sessionId: string;
  timestamp: number;
  lesson: string;
  actionableInsight: string; // What to do differently next time
  appliesTo: string[]; // Tags: "objection-handling", "pricing", etc.
}

export interface CustomerMemory {
  customerId: string;
  lastUpdated: number;
  episodic: EpisodicMemory[];
  semantic: SemanticMemory;
  procedural: ProceduralMemory[];
  relationship: RelationshipMemory;
  reflections: ReflectionMemory[];
  // Predictive signals
  predictions: {
    closeProbability: number; // 0-100
    churnRisk: number; // 0-100
    nextLikelyObjection: string;
    recommendedNextAction: string;
    estimatedDecisionTimeline: string;
  };
}

export interface MemoryUpdateRequest {
  customerId: string;
  sessionId: string;
  transcript: Array<{ role: "user" | "assistant"; content: string }>;
  finalTrust: number;
  finalValue: number;
  outcome: "success" | "failure" | "in_progress";
}

export interface MemoryUpdateResult {
  newFacts: string[];
  contradictions: string[];
  updatedStage: string;
  newObjections: string[];
  reflections: string[];
  predictions: CustomerMemory["predictions"];
}
