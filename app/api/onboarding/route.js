import { NextResponse } from "next/server";
import { addInterest } from "../../../lib/interests.js";
import { getSetting, setSetting } from "../../../lib/settings.js";
import { runPrefetch } from "../../../lib/prefetch.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ onboarded: getSetting("ONBOARDED", "false") === "true" });
}

// Pick interests on first launch, then kick off an initial prefetch so the
// feed isn't empty on first open.
export async function POST(req) {
  const { interests = [] } = await req.json();
  for (const name of interests) {
    if (name && name.trim()) addInterest(name);
  }
  setSetting("ONBOARDED", "true");

  // Fire the first prefetch (await so the first feed load has content).
  let prefetch = null;
  try {
    prefetch = await runPrefetch({ force: true });
  } catch (e) {
    prefetch = { error: e.message };
  }
  return NextResponse.json({ ok: true, prefetch });
}
