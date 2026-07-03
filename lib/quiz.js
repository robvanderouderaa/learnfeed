import { getDb } from "./db.js";
import { getSetting, setSetting, quizEnabled } from "./settings.js";
import { getVideo } from "./videos.js";
import { generateQuestion } from "./gemini.js";

// ---- Rank & tiers -----------------------------------------------------------
// Tiers every 200 pts. NOTE: spec starts the user at rank 1000 (Diamond).
const TIERS = [
  { name: "Bronze", min: 0 },
  { name: "Silver", min: 200 },
  { name: "Gold", min: 400 },
  { name: "Platinum", min: 600 },
  { name: "Diamond", min: 800 },
];

export function tierForRank(rank) {
  let t = TIERS[0];
  for (const tier of TIERS) if (rank >= tier.min) t = tier;
  return t.name;
}

export function getRank() {
  return Number(getSetting("rank", "1000"));
}

function setRank(r) {
  setSetting("rank", Math.max(0, Math.round(r)));
}

// Difficulty (1..5) scales with rank once re-enabled.
export function difficultyForRank(rank = getRank()) {
  return Math.min(5, Math.max(1, Math.floor(rank / 200) + 1));
}

// ---- Quiz trigger -----------------------------------------------------------
// Would pause + quiz every 5 min of watch time, ONLY at a natural video-end.
// Hard OFF unless QUIZ_ENABLED is true. This is the single gate the rest of
// the app checks; flipping the flag is all it takes to turn the system on.
const QUIZ_INTERVAL_SEC = 5 * 60;

export function shouldTriggerQuiz({ atVideoEnd = false } = {}) {
  if (!quizEnabled()) return false; // <-- disabled by default
  if (!atVideoEnd) return false; // never mid-video

  const db = getDb();
  const lastAt = getSetting("last_quiz_at", null);
  const clause = lastAt ? "AND timestamp > ?" : "";
  const args = lastAt ? [lastAt] : [];
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(watch_seconds),0) s FROM watch_events WHERE 1=1 ${clause}`
    )
    .get(...args);
  return row.s >= QUIZ_INTERVAL_SEC;
}

export function markQuizShown() {
  setSetting("last_quiz_at", new Date().toISOString());
}

// ---- Question generation & caching -----------------------------------------
export async function getQuestionForVideo(videoId) {
  const db = getDb();
  const cached = db
    .prepare("SELECT * FROM quiz_cache WHERE video_id = ?")
    .get(videoId);
  if (cached) {
    return {
      videoId,
      question: cached.question,
      choices: JSON.parse(cached.choices),
      difficulty: cached.difficulty,
      cached: true,
    };
  }
  if (!quizEnabled()) throw new Error("quiz disabled");

  const video = getVideo(videoId);
  if (!video) throw new Error("unknown video");

  // Prefer captions; fall back to title + description so we never skip a video.
  const source = (await fetchCaptions(video)) || `${video.title}\n\n${video.description}`;
  const difficulty = difficultyForRank();
  const q = await generateQuestion(source, difficulty);

  db.prepare(
    `INSERT OR REPLACE INTO quiz_cache
       (video_id, question, choices, correct_answer, difficulty)
     VALUES (?, ?, ?, ?, ?)`
  ).run(videoId, q.question, JSON.stringify(q.choices), q.correct_answer, difficulty);

  return { videoId, question: q.question, choices: q.choices, difficulty };
}

// Best-effort public caption fetch (no OAuth). Returns text or null.
async function fetchCaptions(video) {
  if (video.source !== "youtube" || !video.has_captions) return null;
  try {
    const res = await fetch(
      `https://video.google.com/timedtext?lang=en&v=${video.id}`
    );
    if (!res.ok) return null;
    const xml = await res.text();
    const text = xml
      .replace(/<[^>]+>/g, " ")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
    return text.length > 40 ? text : null;
  } catch {
    return null;
  }
}

// ---- Scoring ----------------------------------------------------------------
// Correct +15, wrong -15. Returns new rank/tier.
export function answerQuestion(videoId, choice) {
  const row = getDb()
    .prepare("SELECT correct_answer FROM quiz_cache WHERE video_id = ?")
    .get(videoId);
  if (!row) throw new Error("no cached question for video");
  const correct = choice === row.correct_answer;
  const rank = getRank() + (correct ? 15 : -15);
  setRank(rank);
  markQuizShown();
  return {
    correct,
    correctAnswer: row.correct_answer,
    rank: getRank(),
    tier: tierForRank(getRank()),
  };
}
