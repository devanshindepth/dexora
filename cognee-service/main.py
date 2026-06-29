"""
Dexora — Cognee Intelligence Microservice
FastAPI service exposing three-tier memory (Global / Company / Person)
via Cognee's remember() + recall() + improve() pipeline.

Cognee v1.2.2 compatible. Runs on port 8001.
"""

import os
import json
import uuid
import logging
from pathlib import Path
from typing import Optional, List, Literal
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import cognee
from dotenv import load_dotenv

load_dotenv()

# Disable Cognee's multi-tenant auth for local dev
os.environ.setdefault("ENABLE_BACKEND_ACCESS_CONTROL", "false")
os.environ.setdefault("CACHING", "false")

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("dexora-cognee")

# ── Constants ──────────────────────────────────────────────────────────────────
SEED_FILE  = Path(__file__).parent / "seed_data.json"
SEED_FLAG  = Path(__file__).parent / ".seeded"
GLOBAL_DATASET = "global"

# ── Cognee Setup ───────────────────────────────────────────────────────────────
def configure_cognee():
    """
    Configure Cognee LLM for local hackathon use.
    LLM: Groq (llama-3.1-8b-instant) via OpenAI-compatible endpoint.
    
    NOTE: Embedding is left at default (OpenAI). For Cognee memory to work
    you need a real OpenAI key set as OPENAI_API_KEY, OR use the service
    in LLM-fallback mode (server.ts generates suggestions directly via Groq).
    The co-pilot works without Cognee memory — it just won't persist across sessions.
    """
    groq_key = os.getenv("GROQ_API_KEY", "")
    if not groq_key:
        log.warning("GROQ_API_KEY not set — Cognee will use default LLM config")
        return

    os.environ["OPENAI_API_KEY"] = groq_key  # litellm picks this up
    cognee.config.set_llm_config({
        "llm_provider": "openai",
        "llm_model": "openai/llama-3.1-8b-instant",
        "llm_api_key": groq_key,
        "llm_endpoint": "https://api.groq.com/openai/v1",
    })
    log.info("Cognee LLM: openai-compat → Groq / llama-3.1-8b-instant")




async def seed_global_knowledge():
    """One-time seed of global product/objection knowledge."""
    if SEED_FLAG.exists():
        log.info("Global knowledge already seeded — skipping")
        return
    if not SEED_FILE.exists():
        log.warning("seed_data.json not found — skipping seed")
        return

    log.info("Seeding global knowledge base...")
    data = json.loads(SEED_FILE.read_text())
    items = data.get("global_knowledge", [])

    doc_parts = []
    for item in items:
        cat = item.get("category", "general")
        content = item.get("content", "")
        doc_parts.append(f"[{cat.upper()}]\n{content}")

    document = "\n\n---\n\n".join(doc_parts)

    try:
        await cognee.remember(document, dataset_name=GLOBAL_DATASET)
        SEED_FLAG.write_text("seeded")
        log.info(f"Seeded {len(items)} items into '{GLOBAL_DATASET}'")
    except Exception as e:
        log.error(f"Seed failed: {e}")


# ── Lifespan ───────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_cognee()
    await seed_global_knowledge()
    log.info("Dexora Cognee service ready on port 8001")
    yield
    log.info("Dexora Cognee service shutting down")


# ── App ────────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Dexora Cognee Service",
    description="Three-tier self-improving memory for the Dexora sales co-pilot",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Pydantic Models ────────────────────────────────────────────────────────────
class RecallRequest(BaseModel):
    query: str
    company_id: Optional[str] = None
    person_id: Optional[str] = None
    max_results: int = 6


class SuggestionCard(BaseModel):
    id: str
    type: Literal["objection", "fact", "question", "memory"]
    content: str
    source: str
    confidence: float


class Turn(BaseModel):
    speaker: Literal["rep", "customer"]
    text: str
    timestamp: str
    suggestions_shown: Optional[List[str]] = []


class IngestRequest(BaseModel):
    session_id: str
    company_id: Optional[str] = None
    company_name: Optional[str] = None
    person_id: Optional[str] = None
    person_name: Optional[str] = None
    mode: Literal["sales", "support"] = "sales"
    outcome: Optional[Literal["converted", "lost", "escalated", "resolved"]] = None
    duration_seconds: int = 0
    turns: List[Turn]


class ImproveRequest(BaseModel):
    session_id: str
    outcome: Literal["converted", "lost", "escalated", "resolved"]
    company_id: Optional[str] = None
    person_id: Optional[str] = None
    notes: Optional[str] = None


class SeedRequest(BaseModel):
    force: bool = False


# ── Helpers ────────────────────────────────────────────────────────────────────
def tier_datasets(company_id: Optional[str], person_id: Optional[str]) -> List[str]:
    """Return the Cognee dataset names to query for a given session context."""
    datasets = [GLOBAL_DATASET]
    if company_id:
        datasets.append(f"company:{company_id.lower().replace(' ', '-')}")
    if person_id:
        datasets.append(f"person:{person_id.lower().replace(' ', '-')}")
    return datasets


def classify_suggestion(content: str, source: str) -> Literal["objection", "fact", "question", "memory"]:
    """Heuristic card type classification."""
    lower = content.lower()
    if "company:" in source or "person:" in source:
        return "memory"
    if any(w in lower for w in ["rebuttal", "objection", "too expensive", "budget",
                                  "already have", "need to think", "tried before"]):
        return "objection"
    if any(w in lower for w in ["discovery question", "ask:", "walk me through",
                                  "what happens", "how long", "what would"]):
        return "question"
    return "fact"


def extract_text_from_recall_result(result: object) -> str:
    """Extract text string from whatever Cognee recall returns (type varies by version)."""
    if isinstance(result, str):
        return result
    if isinstance(result, dict):
        for key in ("text", "content", "answer", "summary"):
            if key in result and result[key]:
                return str(result[key])
        return str(result)
    # Pydantic model or dataclass
    for attr in ("text", "content", "answer", "summary"):
        val = getattr(result, attr, None)
        if val:
            return str(val)
    return str(result)


def build_transcript_document(req: IngestRequest) -> str:
    lines = [
        f"SESSION: {req.session_id}",
        f"Mode: {req.mode}",
        f"Outcome: {req.outcome or 'unknown'}",
        f"Company: {req.company_name or req.company_id or 'unknown'}",
        f"Person: {req.person_name or req.person_id or 'unknown'}",
        "",
        "TRANSCRIPT:",
    ]
    for turn in req.turns:
        speaker = "REP" if turn.speaker == "rep" else "CUSTOMER"
        lines.append(f"[{turn.timestamp}] {speaker}: {turn.text}")

    if req.outcome:
        outcome_note = (
            f"This call ended with outcome '{req.outcome}'. "
            f"{'Reinforce patterns from this successful interaction.' if req.outcome in ('converted', 'resolved') else 'Note patterns from this unsuccessful interaction for future improvement.'}"
        )
        lines += ["", f"OUTCOME: {req.outcome.upper()}", outcome_note]

    return "\n".join(lines)


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "service": "dexora-cognee", "version": "1.0.0"}


@app.post("/recall", response_model=List[SuggestionCard])
async def recall(req: RecallRequest):
    """
    Query all relevant memory tiers for a given customer utterance.
    Returns ranked suggestion cards for the rep sidebar.
    """
    datasets = tier_datasets(req.company_id, req.person_id)
    all_cards: List[SuggestionCard] = []

    # Cognee v1.2.2: recall accepts `datasets` as a list of dataset names
    for dataset in datasets:
        try:
            results = await cognee.recall(
                req.query,
                datasets=[dataset],
                top_k=req.max_results,
                only_context=True,  # return context chunks, not a synthesized answer
            )

            for i, result in enumerate(results or []):
                text = extract_text_from_recall_result(result)
                if not text or len(text.strip()) < 10:
                    continue

                card_type = classify_suggestion(text, dataset)
                confidence = max(0.4, 1.0 - i * 0.08)

                all_cards.append(SuggestionCard(
                    id=str(uuid.uuid4()),
                    type=card_type,
                    content=text.strip()[:500],  # cap length
                    source=dataset,
                    confidence=confidence,
                ))
        except Exception as e:
            log.warning(f"Recall failed for dataset '{dataset}': {e}")
            continue

    # Deduplicate + sort by confidence
    seen: set[str] = set()
    deduped: List[SuggestionCard] = []
    for card in sorted(all_cards, key=lambda c: c.confidence, reverse=True):
        key = card.content[:60].lower()
        if key not in seen:
            seen.add(key)
            deduped.append(card)
        if len(deduped) >= req.max_results:
            break

    log.info(f"Recall '{req.query[:50]}' -> {len(deduped)} cards from {datasets}")
    return deduped


@app.post("/ingest")
async def ingest(req: IngestRequest):
    """Ingest a completed session transcript into all relevant memory tiers."""
    datasets = tier_datasets(req.company_id, req.person_id)
    document = build_transcript_document(req)
    ingested, errors = [], []

    for dataset in datasets:
        try:
            await cognee.remember(document, dataset_name=dataset)
            ingested.append(dataset)
            log.info(f"Ingested session {req.session_id} into '{dataset}'")
        except Exception as e:
            log.error(f"Ingest failed for '{dataset}': {e}")
            errors.append(f"{dataset}: {e}")

    return {
        "session_id": req.session_id,
        "ingested_into": ingested,
        "errors": errors,
        "status": "ok" if not errors else "partial",
    }


@app.post("/improve")
async def improve(req: ImproveRequest):
    """Run Cognee's improve() to reinforce/downgrade patterns based on outcome."""
    datasets = tier_datasets(req.company_id, req.person_id)
    improved, errors = [], []

    feedback = (
        f"Session {req.session_id} outcome: {req.outcome.upper()}. "
        f"{'Reinforce these patterns — they led to success.' if req.outcome in ('converted', 'resolved') else 'These patterns did not succeed — identify what to change.'}"
        + (f" Notes: {req.notes}" if req.notes else "")
    )

    for dataset in datasets:
        try:
            if hasattr(cognee, "improve"):
                await cognee.improve(feedback, dataset_name=dataset)
            improved.append(dataset)
            log.info(f"Improved '{dataset}' with outcome '{req.outcome}'")
        except Exception as e:
            log.warning(f"Improve skipped for '{dataset}': {e}")
            errors.append(f"{dataset}: {e}")

    return {
        "session_id": req.session_id,
        "outcome": req.outcome,
        "improved_datasets": improved,
        "errors": errors,
    }


@app.get("/graph")
async def graph(company_id: Optional[str] = None, person_id: Optional[str] = None):
    """Return entity graph data for dashboard visualization."""
    datasets = tier_datasets(company_id, person_id)
    graph_data = {"nodes": [], "edges": [], "datasets": datasets}

    for dataset in datasets:
        try:
            if hasattr(cognee, "get_graph"):
                g = await cognee.get_graph(dataset_name=dataset)
                if g:
                    nodes = getattr(g, "nodes", [])
                    edges = getattr(g, "edges", [])
                    for node in nodes:
                        graph_data["nodes"].append({
                            "id": str(getattr(node, "id", uuid.uuid4())),
                            "label": getattr(node, "name", getattr(node, "id", "?")),
                            "dataset": dataset,
                        })
                    for edge in edges:
                        graph_data["edges"].append({
                            "source": str(getattr(edge, "source", "")),
                            "target": str(getattr(edge, "target", "")),
                            "label": getattr(edge, "type", "related"),
                        })
        except Exception as e:
            log.warning(f"Graph fetch failed for '{dataset}': {e}")

    return graph_data


@app.post("/seed")
async def seed(req: SeedRequest):
    """Force re-seed of the global knowledge base."""
    if req.force and SEED_FLAG.exists():
        SEED_FLAG.unlink()
        log.info("Seed flag removed — re-seeding")
    await seed_global_knowledge()
    return {"status": "seeded", "dataset": GLOBAL_DATASET}


@app.delete("/forget")
async def forget(company_id: Optional[str] = None, person_id: Optional[str] = None):
    """Remove a specific company or person dataset from Cognee memory."""
    datasets = []
    if company_id:
        datasets.append(f"company:{company_id.lower().replace(' ', '-')}")
    if person_id:
        datasets.append(f"person:{person_id.lower().replace(' ', '-')}")

    forgotten, errors = [], []
    for dataset in datasets:
        try:
            await cognee.forget(dataset_name=dataset)
            forgotten.append(dataset)
        except Exception as e:
            errors.append(f"{dataset}: {e}")

    return {"forgotten": forgotten, "errors": errors}
