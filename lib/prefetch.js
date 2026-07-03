import { listInterests, queryForInterest } from "./interests.js";
import { unwatchedCount, upsertVideos } from "./videos.js";
import { searchTikTok } from "./tiktok.js";
import { searchShorts, QuotaError } from "./youtube.js";
import { quotaLow, quotaStatus } from "./quota.js";
import { demoVideos } from "./demo.js";

const HAS_YOUTUBE = () => !!process.env.YOUTUBE_API_KEY;

const TARGET_PER_TOPIC = 25; // aim to keep ~20-30 unwatched per interest
const LOW_WATERMARK = 5; // only refill a topic when it drops below this

// Prefetch loop. For each active interest whose cache is running low:
//   1. try TikTok (unofficial scraper) first
//   2. top up with YouTube if TikTok returned too few
// Skips the whole run if we're already near the daily quota ceiling.
export async function runPrefetch({ force = false } = {}) {
  const result = { started: new Date().toISOString(), topics: [], skipped: false };

  if (quotaLow() && !force) {
    result.skipped = true;
    result.reason = "quota near daily limit — skipping prefetch";
    result.quota = quotaStatus();
    return result;
  }

  const interests = listInterests({ activeOnly: true });
  for (const interest of interests) {
    const have = unwatchedCount(interest.id);
    if (have >= LOW_WATERMARK && !force) {
      result.topics.push({ topic: interest.name, skipped: true, have });
      continue;
    }

    const need = TARGET_PER_TOPIC;
    const query = queryForInterest(interest.name);
    const entry = { topic: interest.name, query, have, tiktok: 0, youtube: 0, demo: 0, errors: [] };

    // --- 1. TikTok first (needs NO API key; unofficial scraper) ---
    let rows = [];
    try {
      rows = await searchTikTok(query, { max: need, topicName: interest.name });
      entry.tiktok = rows.length;
    } catch (err) {
      entry.errors.push(`tiktok: ${err.message}`);
      rows = [];
    }

    // --- 2. YouTube top-up if TikTok came up short (only if a key is set) ---
    if (rows.length < need && HAS_YOUTUBE()) {
      try {
        const yt = await searchShorts(query, {
          max: need - rows.length,
          topicName: interest.name,
        });
        entry.youtube = yt.length;
        rows = rows.concat(yt);
      } catch (err) {
        entry.errors.push(
          err instanceof QuotaError ? "youtube: quota exhausted" : `youtube: ${err.message}`
        );
      }
    }

    // --- 3. Demo fallback ONLY if both real sources produced nothing, so the
    //        feed is never blank on a fresh machine with no keys/scraper. ---
    if (rows.length === 0) {
      rows = demoVideos(interest.name, { max: need });
      entry.demo = rows.length;
    }

    entry.stored = rows.length ? upsertVideos(rows, { topicId: interest.id }) : 0;
    result.topics.push(entry);
  }

  result.quota = quotaStatus();
  result.finished = new Date().toISOString();
  return result;
}
