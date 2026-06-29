// ─── In-memory store for the hackathon demo ────────────────────────────────────
// In production this would be a vector DB + knowledge graph (e.g. Pinecone + Neo4j).
// For the demo we persist to a JSON file so memory survives page refreshes.

import fs from "fs";
import path from "path";
import type { CustomerMemory, SemanticMemory, RelationshipMemory } from "./types";

const DATA_DIR = path.join(process.cwd(), ".memory");
const STORE_FILE = path.join(DATA_DIR, "customers.json");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readStore(): Record<string, CustomerMemory> {
  ensureDir();
  if (!fs.existsSync(STORE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function writeStore(data: Record<string, CustomerMemory>) {
  ensureDir();
  fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), "utf-8");
}

const defaultSemantic: SemanticMemory = {
  customerProfile: {
    name: "Dave Miller",
    role: "IT Director",
    company: "FreightCore",
    industry: "Logistics",
    teamSize: "500-person company",
  },
  technicalStack: [],
  competitors: [],
  complianceRequirements: [],
  budget: "unknown",
  decisionMakers: ["Dave Miller"],
  buyingStage: "unknown",
  objections: [],
  unmetNeeds: [],
  productInterests: [],
  expansionOpportunities: [],
  churnRisks: [],
};

const defaultRelationship: RelationshipMemory = {
  stakeholders: [
    {
      name: "Dave Miller",
      role: "IT Director",
      influence: "high",
      sentiment: "neutral",
      meetingsAttended: 0,
      lastContacted: 0,
    },
  ],
  previousDeals: [],
  competitorMentions: [],
};

export function getCustomerMemory(customerId: string): CustomerMemory {
  const store = readStore();
  if (store[customerId]) return store[customerId];

  // Bootstrap default memory for Dave Miller (the demo prospect)
  const fresh: CustomerMemory = {
    customerId,
    lastUpdated: Date.now(),
    episodic: [],
    semantic: defaultSemantic,
    procedural: [],
    relationship: defaultRelationship,
    reflections: [],
    predictions: {
      closeProbability: 20,
      churnRisk: 60,
      nextLikelyObjection: "Too busy / not interested",
      recommendedNextAction: "Build rapport before pitching",
      estimatedDecisionTimeline: "Unknown",
    },
  };

  store[customerId] = fresh;
  writeStore(store);
  return fresh;
}

export function saveCustomerMemory(memory: CustomerMemory): void {
  const store = readStore();
  memory.lastUpdated = Date.now();
  store[memory.customerId] = memory;
  writeStore(store);
}

export function getAllCustomers(): CustomerMemory[] {
  return Object.values(readStore());
}

export function resetCustomerMemory(customerId: string): void {
  const store = readStore();
  delete store[customerId];
  writeStore(store);
}
