import { NextResponse } from "next/server";
import { recordWatch } from "../../../lib/personalization.js";
import { shouldTriggerQuiz } from "../../../lib/quiz.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Record a watch/skip event, fold in personalization signals, and report
// whether a quiz would trigger (always false while QUIZ_ENABLED is off).
export async function POST(req) {
  const { videoId, watchSeconds = 0, completed = false, atVideoEnd = false } =
    await req.json();
  if (!videoId) return NextResponse.json({ error: "videoId required" }, { status: 400 });

  const signal = recordWatch({ videoId, watchSeconds, completed });
  const quiz = shouldTriggerQuiz({ atVideoEnd });
  return NextResponse.json({ ...signal, quiz });
}
