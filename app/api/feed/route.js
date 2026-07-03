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
  ensureSeed(); // zero-config: seed default interests on first run
  const limit = Number(new URL(req.url).searchParams.get("limit") || 20);
  let feed = buildFeed({ limit });

  // Cold start (no cached videos yet): populate synchronously so the first
  // load isn't blank. runPrefetch tries TikTok (no key) → YouTube → demo.
  if ((feed.empty || feed.videos.length === 0) && !feed.needTopics) {
    await runPrefetch({ force: true }).catch(() => {});
    feed = buildFeed({ limit });
  } else if (feed.lowTopics && feed.lowTopics.length > 0) {
    // Warm cache running low → background top-up (fine for a local app).
    runPrefetch().catch(() => {});
  }

  return NextResponse.json(feed);
}
