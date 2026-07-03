import { getDb } from "./db.js";

// Persist a batch of normalized video rows. Ignores dupes (same id).
// Also bumps keyword_stats from tags so "Suggested for you" can surface
// heavily-watched-but-unadded topics later.
export function upsertVideos(rows, { topicId = null, isSearch = false, searchQuery = null } = {}) {
  const db = getDb();
  const ins = db.prepare(
    `INSERT INTO videos
       (id, source, url, title, description, thumbnail_url, duration_sec,
        topic_id, topic_name, has_captions, tags, is_search, search_query, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       -- refresh volatile metadata but keep watched/skipped state
       title = excluded.title,
       thumbnail_url = excluded.thumbnail_url,
       fetched_at = excluded.fetched_at`
  );
  let n = 0;
  for (const r of rows) {
    ins.run(
      r.id,
      r.source || "youtube",
      r.url || null,
      r.title || "",
      r.description || "",
      r.thumbnail_url || "",
      r.duration_sec || 0,
      topicId,
      r.topic_name || null,
      r.has_captions ? 1 : 0,
      JSON.stringify(Array.isArray(r.tags) ? r.tags : []),
      isSearch ? 1 : 0,
      searchQuery
    );
    n++;
  }
  return n;
}

// Count unwatched, unskipped rotation videos for a topic.
export function unwatchedCount(topicId) {
  const row = getDb()
    .prepare(
      "SELECT COUNT(*) n FROM videos WHERE topic_id = ? AND watched = 0 AND skipped = 0 AND is_search = 0"
    )
    .get(topicId);
  return row.n;
}

export function getVideo(id) {
  return getDb().prepare("SELECT * FROM videos WHERE id = ?").get(id);
}

export function markWatched(id) {
  getDb().prepare("UPDATE videos SET watched = 1 WHERE id = ?").run(id);
}

export function markSkipped(id) {
  getDb().prepare("UPDATE videos SET skipped = 1 WHERE id = ?").run(id);
}
