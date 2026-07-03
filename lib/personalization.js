import { getDb } from "./db.js";
import { getVideo, markWatched, markSkipped } from "./videos.js";
import { adjustPriority, listInterests } from "./interests.js";

const FULL_WATCH_RATIO = 0.9; // >=90% of duration counts as a full watch
const SKIP_THRESHOLD_SEC = 3; // <3s viewed counts as a skip (negative signal)
const SKIP_STREAK_LIMIT = 3; // 3 skips in a row on a topic -> deprioritize now

// Record a watch event and immediately fold it into personalization signals.
// Returns a small summary the client can use (e.g. to know a topic cooled off).
export function recordWatch({ videoId, watchSeconds = 0, completed = false }) {
  const db = getDb();
  const video = getVideo(videoId);
  const topicId = video?.topic_id ?? null;
  const duration = video?.duration_sec || 0;

  db.prepare(
    `INSERT INTO watch_events (video_id, watch_seconds, completed, topic_id)
     VALUES (?, ?, ?, ?)`
  ).run(videoId, watchSeconds, completed ? 1 : 0, topicId);

  const isFull =
    completed || (duration > 0 && watchSeconds >= duration * FULL_WATCH_RATIO);
  const isSkip = !isFull && watchSeconds < SKIP_THRESHOLD_SEC;

  let deprioritized = false;

  if (isFull) {
    markWatched(videoId);
    if (topicId) {
      adjustPriority(topicId, +0.15);
      resetStreak(topicId);
    }
    bumpKeywordsFromVideo(video); // powers "Suggested for you"
  } else if (isSkip) {
    markSkipped(videoId);
    if (topicId) {
      const streak = bumpStreak(topicId);
      if (streak >= SKIP_STREAK_LIMIT) {
        // Immediate deprioritization — don't wait for session end.
        adjustPriority(topicId, -0.5);
        resetStreak(topicId);
        deprioritized = true;
      } else {
        adjustPriority(topicId, -0.05);
      }
    }
  }

  return { isFull, isSkip, deprioritized, topicId };
}

function bumpStreak(topicId) {
  const db = getDb();
  db.prepare(
    `INSERT INTO skip_streaks (topic_id, streak) VALUES (?, 1)
     ON CONFLICT(topic_id) DO UPDATE SET streak = streak + 1`
  ).run(topicId);
  return db
    .prepare("SELECT streak FROM skip_streaks WHERE topic_id = ?")
    .get(topicId).streak;
}

function resetStreak(topicId) {
  getDb()
    .prepare(
      `INSERT INTO skip_streaks (topic_id, streak) VALUES (?, 0)
       ON CONFLICT(topic_id) DO UPDATE SET streak = 0`
    )
    .run(topicId);
}

function bumpKeywordsFromVideo(video) {
  if (!video) return;
  let tags = [];
  try {
    tags = JSON.parse(video.tags || "[]");
  } catch {
    tags = [];
  }
  const db = getDb();
  const up = db.prepare(
    `INSERT INTO keyword_stats (keyword, count) VALUES (?, 1)
     ON CONFLICT(keyword) DO UPDATE SET count = count + 1`
  );
  for (const t of tags) {
    const k = String(t).toLowerCase().trim();
    if (k && k.length <= 40) up.run(k);
  }
}

// Watch seconds accumulated per topic (used for stats / quiz cadence).
export function watchTimeByTopic() {
  return getDb()
    .prepare(
      `SELECT topic_id, SUM(watch_seconds) AS seconds, COUNT(*) AS events
       FROM watch_events WHERE topic_id IS NOT NULL GROUP BY topic_id`
    )
    .all();
}

// Topics the user watches a lot (by tag frequency) but hasn't added yet.
export function suggestedTopics(limit = 5) {
  const existing = new Set(
    listInterests().map((i) => i.name.toLowerCase())
  );
  const rows = getDb()
    .prepare("SELECT keyword, count FROM keyword_stats ORDER BY count DESC LIMIT 50")
    .all();
  return rows
    .filter((r) => r.count >= 2 && !existing.has(r.keyword))
    .slice(0, limit)
    .map((r) => ({ name: r.keyword, count: r.count }));
}
