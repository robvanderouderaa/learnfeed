import { getDb } from "./db.js";
import { searchShorts, QuotaError } from "./youtube.js";
import { upsertVideos } from "./videos.js";
import { shape } from "./feed.js";

const CACHE_HOURS = 24;

// One-off keyword search. Cached per query for 24h so repeating a search
// doesn't burn quota again. Does NOT add the term as a saved interest.
// Note: TikTok scraping is reserved for the background rotation prefetch;
// live search goes straight to YouTube (infrequent, user-initiated).
export async function searchFeed(rawQuery) {
  const query = (rawQuery || "").trim();
  if (query.length < 3) {
    return { videos: [], error: "min 3 characters", tooShort: true };
  }

  const cached = readCache(query);
  if (cached.length > 0) {
    return { videos: cached.map(shape), cached: true, query };
  }

  try {
    const rows = await searchShorts(query, { max: 25, topicName: query });
    upsertVideos(rows, { isSearch: true, searchQuery: query });
    return { videos: rows.map((r) => shape(toRowLike(r, query))), query };
  } catch (err) {
    // Quota exhausted / API down → serve whatever we already cached (even if
    // older than 24h) rather than an error screen.
    const stale = readCache(query, { ignoreAge: true });
    if (stale.length) {
      return { videos: stale.map(shape), cached: true, stale: true, query };
    }
    return {
      videos: [],
      error: err instanceof QuotaError ? "quota" : "search_failed",
      query,
    };
  }
}

function readCache(query, { ignoreAge = false } = {}) {
  const ageClause = ignoreAge
    ? ""
    : `AND fetched_at >= datetime('now', '-${CACHE_HOURS} hours')`;
  return getDb()
    .prepare(
      `SELECT * FROM videos
       WHERE is_search = 1 AND search_query = ? ${ageClause}
       ORDER BY fetched_at DESC`
    )
    .all(query);
}

// searchShorts returns pre-persist objects; map to the row column names shape() expects.
function toRowLike(r, query) {
  return {
    id: r.id,
    source: r.source,
    url: r.url,
    title: r.title,
    description: r.description,
    thumbnail_url: r.thumbnail_url,
    duration_sec: r.duration_sec,
    topic_name: r.topic_name || query,
    has_captions: r.has_captions,
  };
}
