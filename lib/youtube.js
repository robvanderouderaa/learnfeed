import { COST, canSpend, spendQuota } from "./quota.js";
import { recordSource } from "./sources.js";

const API = "https://www.googleapis.com/youtube/v3";

class QuotaError extends Error {}
export { QuotaError };

function key() {
  const k = process.env.YOUTUBE_API_KEY;
  if (!k) throw new Error("YOUTUBE_API_KEY is not set");
  return k;
}

// PT1M5S -> 65
export function parseISODuration(iso) {
  if (!iso) return 0;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  const [, h, min, s] = m;
  return (Number(h || 0) * 3600) + (Number(min || 0) * 60) + Number(s || 0);
}

async function get(path, params, units) {
  if (!canSpend(units)) {
    throw new QuotaError(`Daily YouTube quota would be exceeded (needs ${units}u)`);
  }
  const qs = new URLSearchParams({ ...params, key: key() });
  const res = await fetch(`${API}/${path}?${qs}`);
  // Only charge quota once the request actually left; 4xx quota errors from
  // Google still consumed units, so we spend regardless of ok-ness here.
  spendQuota(units);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 403 && /quota/i.test(body)) {
      throw new QuotaError("YouTube API returned quotaExceeded");
    }
    throw new Error(`YouTube ${path} failed: ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json();
}

// Search short-form videos, then hydrate durations and keep only <=60s.
// Returns normalized video rows (not yet persisted).
export async function searchShorts(query, { max = 25, topicName = null } = {}) {
  try {
    const search = await get(
      "search",
      {
        part: "snippet",
        q: query,
        type: "video",
        videoDuration: "short", // YouTube "short" = <4min; we hard-filter <=60s below
        maxResults: String(Math.min(50, max)),
        order: "relevance",
        safeSearch: "moderate",
      },
      COST.search
    );

    const ids = (search.items || [])
      .map((it) => it.id?.videoId)
      .filter(Boolean);
    if (ids.length === 0) {
      recordSource("youtube", true);
      return [];
    }

    const details = await get(
      "videos",
      {
        part: "contentDetails,snippet",
        id: ids.join(","),
        maxResults: String(ids.length),
      },
      COST.videos
    );

    const rows = [];
    for (const it of details.items || []) {
      const dur = parseISODuration(it.contentDetails?.duration);
      if (dur === 0 || dur > 60) continue; // enforce true short-form (<=60s)
      const sn = it.snippet || {};
      rows.push({
        id: it.id,
        source: "youtube",
        url: `https://www.youtube.com/watch?v=${it.id}`,
        title: sn.title || "",
        description: sn.description || "",
        thumbnail_url:
          sn.thumbnails?.medium?.url || sn.thumbnails?.default?.url || "",
        duration_sec: dur,
        topic_name: topicName || query,
        has_captions: it.contentDetails?.caption === "true" ? 1 : 0,
        tags: sn.tags || [],
      });
    }
    recordSource("youtube", true);
    return rows;
  } catch (err) {
    if (!(err instanceof QuotaError)) recordSource("youtube", false, err.message);
    throw err;
  }
}
