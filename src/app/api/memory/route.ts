// ─── Memory API Route ─────────────────────────────────────────────────────────
// GET  /api/memory?customerId=dave-miller-freightcore  → returns full memory
// POST /api/memory/reset                              → resets memory for demo

import { NextRequest } from "next/server";
import { getCustomerMemory, saveCustomerMemory, resetCustomerMemory } from "@/lib/memory/store";

const DEFAULT_CUSTOMER_ID = "dave-miller-freightcore";

export async function GET(req: NextRequest) {
  const customerId = req.nextUrl.searchParams.get("customerId") || DEFAULT_CUSTOMER_ID;
  const memory = getCustomerMemory(customerId);
  return Response.json(memory);
}

export async function DELETE(req: NextRequest) {
  const customerId = req.nextUrl.searchParams.get("customerId") || DEFAULT_CUSTOMER_ID;
  resetCustomerMemory(customerId);
  return Response.json({ ok: true, message: `Memory reset for ${customerId}` });
}
