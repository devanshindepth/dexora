import { NextRequest, NextResponse } from "next/server";

const COGNEE_SERVICE = "http://localhost:8001";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const res = await fetch(`${COGNEE_SERVICE}/seed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000), // seeding can take a while
    });

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: "Cognee service unavailable", detail: String(err) },
      { status: 503 }
    );
  }
}
