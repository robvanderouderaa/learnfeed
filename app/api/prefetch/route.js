import { NextResponse } from "next/server";
import { runPrefetch } from "../../../lib/prefetch.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Background pre-fetch endpoint. Point a cron (every few hours) at this.
// Optionally protect with PREFETCH_SECRET via ?secret= or x-prefetch-secret.
export async function POST(req) {
  const secret = process.env.PREFETCH_SECRET;
  if (secret) {
    const url = new URL(req.url);
    const provided = url.searchParams.get("secret") || req.headers.get("x-prefetch-secret");
    if (provided !== secret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  const force = new URL(req.url).searchParams.get("force") === "1";
  const result = await runPrefetch({ force });
  return NextResponse.json(result);
}
