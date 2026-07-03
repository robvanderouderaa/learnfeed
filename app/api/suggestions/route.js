import { NextResponse } from "next/server";
import { suggestedTopics } from "../../../lib/personalization.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ suggestions: suggestedTopics() });
}
