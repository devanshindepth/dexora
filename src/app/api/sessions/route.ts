import { NextResponse } from "next/server";

const WS_SERVER = "http://localhost:8080";

export async function GET() {
  try {
    const res = await fetch(`${WS_SERVER}/sessions`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      return NextResponse.json([], { status: 200 });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
