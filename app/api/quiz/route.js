import { NextResponse } from "next/server";
import { getQuestionForVideo, answerQuestion } from "../../../lib/quiz.js";
import { quizEnabled } from "../../../lib/settings.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Quiz is fully built but gated by QUIZ_ENABLED (off by default).
export async function GET(req) {
  if (!quizEnabled()) {
    return NextResponse.json({ enabled: false }, { status: 409 });
  }
  const videoId = new URL(req.url).searchParams.get("videoId");
  if (!videoId) return NextResponse.json({ error: "videoId required" }, { status: 400 });
  try {
    const q = await getQuestionForVideo(videoId);
    return NextResponse.json({ enabled: true, ...q });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req) {
  if (!quizEnabled()) {
    return NextResponse.json({ enabled: false }, { status: 409 });
  }
  const { videoId, choice } = await req.json();
  if (!videoId || choice == null) {
    return NextResponse.json({ error: "videoId and choice required" }, { status: 400 });
  }
  try {
    return NextResponse.json(answerQuestion(videoId, choice));
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
