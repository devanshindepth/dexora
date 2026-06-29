import { NextRequest, NextResponse } from "next/server";

const COGNEE_SERVICE = "http://localhost:8001";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("company_id");
  const personId = searchParams.get("person_id");

  try {
    const params = new URLSearchParams();
    if (companyId) params.set("company_id", companyId);
    if (personId) params.set("person_id", personId);

    const res = await fetch(`${COGNEE_SERVICE}/graph?${params.toString()}`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return NextResponse.json({ nodes: [], edges: [], datasets: [] }, { status: 200 });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ nodes: [], edges: [], datasets: [] }, { status: 200 });
  }
}
