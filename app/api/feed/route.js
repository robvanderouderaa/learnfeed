import { NextResponse } from "next/server";
import { buildFeed } from "../../../lib/feed.js";
import { runPrefetch } from "../../../lib/prefetch.js";
import { ensureSeed } from "../../../lib/bootstrap.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Feed reads from the LOCAL cache. If any active topic's cache is running low
// (<5 unwatched), it kicks a background top-up — but only then, never on every
// load, to protect the 10k/day YouTube quota.
export async function GET(req) {
  ensureSeed(); // zero-config: seed defaults + demo content on first run
  const limit = Number(new URL(req.url).searchParams.get("limit") || 20);
  const feed = buildFeed({ limit });

  if (feed.lowTopics && feed.lowTopics.length > 0) {
    // Fire-and-forget top-up (fine for a local single-user app).
    runPrefetch().catch(() => {});
  }

  return NextResponse.json(feed);
}
