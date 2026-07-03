import { getDb } from "./db.js";
import { listInterests } from "./interests.js";
import { unwatchedCount } from "./videos.js";

const LOW_WATERMARK = 5;

// Build the personalized rotation feed from the LOCAL cache only.
// Mixes videos across active interests in weighted round-robin order
// (higher-priority topics surface more often). Never calls an external API.
export function buildFeed({ limit = 20 } = {}) {
  const db = getDb();
  const interests = listInterests({ activeOnly: true });
  if (interests.length === 0) return { videos: [], needTopics: true };

  // Candidate pool per active topic (unwatched, unskipped, not search rows).
  const pools = [];
  for (const it of interests) {
    const rows = db
      .prepare(
        `SELECT * FROM videos
         WHERE topic_id = ? AND watched = 0 AND skipped = 0 AND is_search = 0
         ORDER BY fetched_at DESC`
      )
      .all(it.id);
    if (rows.length) pools.push({ interest: it, rows, idx: 0 });
  }

  const out = [];
  if (pools.length === 0) {
    return { videos: [], empty: true, lowTopics: lowTopicList(interests) };
  }

  // Weighted round-robin: give each pool a running credit equal to its
  // priority; draw from the pool with the most accumulated credit.
  const credits = pools.map(() => 0);
  while (out.length < limit) {
    let anyLeft = false;
    for (let i = 0; i < pools.length; i++) {
      if (pools[i].idx < pools[i].rows.length) {
        credits[i] += pools[i].interest.priority;
        anyLeft = true;
      }
    }
    if (!anyLeft) break;
    // pick highest-credit pool that still has rows
    let pick = -1;
    for (let i = 0; i < pools.length; i++) {
      if (pools[i].idx >= pools[i].rows.length) continue;
      if (pick === -1 || credits[i] > credits[pick]) pick = i;
    }
    if (pick === -1) break;
    credits[pick] -= 1;
    out.push(shape(pools[pick].rows[pools[pick].idx]));
    pools[pick].idx++;
  }

  return {
    videos: out,
    lowTopics: lowTopicList(interests), // client/route uses this to trigger prefetch
  };
}

function lowTopicList(interests) {
  return interests
    .filter((it) => unwatchedCount(it.id) < LOW_WATERMARK)
    .map((it) => ({ id: it.id, name: it.name }));
}

// Shape a DB row into the client video contract.
export function shape(row) {
  return {
    id: row.id,
    source: row.source,
    url: row.url,
    title: row.title,
    description: row.description,
    thumbnail: row.thumbnail_url,
    duration: row.duration_sec,
    topic: row.topic_name,
    hasCaptions: !!row.has_captions,
  };
}
