import { listInterests, queryForInterest } from "./interests.js";
import { unwatchedCount, upsertVideos } from "./videos.js";
import { searchTikTok } from "./tiktok.js";
import { searchShorts, QuotaError } from "./youtube.js";
import { quotaLow, quotaStatus } from "./quota.js";
import { DEMO_MODE, demoVideos } from "./demo.js";

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

    // --- 0. Demo mode: no keys configured → fill with sample clips. ---
    if (DEMO_MODE) {
      const rows = demoVideos(interest.name, { max: need });
      entry.demo = rows.length;
      entry.stored = upsertVideos(rows, { topicId: interest.id });
      result.topics.push(entry);
      continue;
    }

    // --- 1. TikTok first (best-effort) ---
    let rows = [];
    try {
      rows = await searchTikTok(query, { max: need, topicName: interest.name });
      entry.tiktok = rows.length;
    } catch (err) {
      entry.errors.push(`tiktok: ${err.message}`);
      rows = [];
    }

    // --- 2. YouTube top-up if TikTok came up short ---
    if (rows.length < need) {
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

    if (rows.length) {
      entry.stored = upsertVideos(rows, { topicId: interest.id });
    } else {
      entry.stored = 0;
    }
    result.topics.push(entry);
  }

  result.quota = quotaStatus();
  result.finished = new Date().toISOString();
  return result;
}
