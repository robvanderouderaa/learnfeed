import { NextResponse } from "next/server";
import { getAllSettings, setSetting } from "../../../lib/settings.js";
import { quotaStatus } from "../../../lib/quota.js";
import { sourceStats } from "../../../lib/sources.js";
import { getRank, tierForRank } from "../../../lib/quiz.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set(["QUIZ_ENABLED", "ONBOARDED"]);

export async function GET() {
  const rank = getRank();
  return NextResponse.json({
    settings: getAllSettings(),
    quota: quotaStatus(),
    sources: sourceStats(),
    rank,
    tier: tierForRank(rank),
  });
}

export async function PATCH(req) {
  const body = await req.json();
  for (const [k, v] of Object.entries(body)) {
    if (ALLOWED.has(k)) setSetting(k, String(v));
  }
  return NextResponse.json({ settings: getAllSettings() });
}
