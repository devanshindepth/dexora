# Dexora Cognee Service

FastAPI microservice powering the three-tier self-improving memory layer for Dexora.

## Requirements

- Python 3.11+
- The `.env` file in this directory (already configured)

## Setup

```bash
cd cognee-service

# Create virtual environment (recommended)
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Start the service
uvicorn main:app --port 8001 --reload
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Service health check |
| `POST` | `/recall` | Query all memory tiers for suggestion cards |
| `POST` | `/ingest` | Ingest a completed session transcript |
| `POST` | `/improve` | Reinforce/downgrade patterns based on outcome |
| `GET` | `/graph` | Fetch entity graph for visualization |
| `POST` | `/seed` | Re-seed global knowledge base |
| `DELETE` | `/forget` | Remove company or person memory |

## Memory Tiers

| Tier | Dataset Key | Contents |
|------|-------------|----------|
| Global | `global` | Product facts, pricing, objection rebuttals, competitor intel |
| Company | `company:{id}` | Account history, deal stage, past objections per org |
| Person | `person:{id}` | Stakeholder role, concerns, communication style |

## Test Recall

```bash
curl -X POST http://localhost:8001/recall \
  -H 'Content-Type: application/json' \
  -d '{"query": "pricing is too high", "company_id": "acme-corp"}'
```

## Run Order (all three must be running)

1. `uvicorn main:app --port 8001` (this service)
2. `bun run server.ts` (Bun WS server, port 8080)
3. `npm run dev` (Next.js, port 3000)
