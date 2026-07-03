import { NextResponse } from "next/server";
import { listInterests, addInterest, setActive } from "../../../lib/interests.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ interests: listInterests() });
}

export async function POST(req) {
  const { name } = await req.json();
  if (!name || !name.trim()) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  const interest = addInterest(name);
  return NextResponse.json({ interest });
}

export async function PATCH(req) {
  const { id, active } = await req.json();
  if (id == null) return NextResponse.json({ error: "id required" }, { status: 400 });
  setActive(id, !!active);
  return NextResponse.json({ ok: true });
}
